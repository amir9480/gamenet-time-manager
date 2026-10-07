import { resetSecurity } from '@/lib/security'
import Dexie, { type Table } from 'dexie'
import {
  applyDevices,
  applyExtraItems,
  applyPrices,
  defaultSettings,
  uid,
  type CatalogItem,
  type Customer,
  type Device,
  type DeviceCategory,
  type ExtraCategory,
  type HistoryEntry,
  type Payment,
  type RateGroup,
  type Session,
  type Settings,
} from '@/lib/store'

// Catalog rows are never removed: deleting sets `deletedAt` (soft delete) so ids stay stable
// for history, and recreating a deleted entry with the same name restores the old row.
type Ordered<T> = T & { order: number; deletedAt?: number }

class GamenetDB extends Dexie {
  rateGroups!: Table<Ordered<RateGroup>, string>
  deviceCategories!: Table<Ordered<DeviceCategory>, string>
  devices!: Table<Ordered<Device>, string>
  extraCategories!: Table<Ordered<ExtraCategory>, string>
  extraItems!: Table<Ordered<CatalogItem>, string>
  customers!: Table<Ordered<Customer>, string>
  meta!: Table<{ key: string; value: string }, string>
  sessions!: Table<Session, string>
  history!: Table<HistoryEntry, string>
  payments!: Table<Payment, string>

  constructor() {
    super('gamenet-timer-manager')
    // Schema changes: add a new `version(n)` with `.upgrade()` instead of editing this one.
    this.version(1).stores({
      rateGroups: 'id, order',
      deviceCategories: 'id, order',
      devices: 'id, order',
      extraCategories: 'id, order',
      extraItems: 'id, order',
      customers: 'id, order',
      sessions: 'id',
      history: 'id, endedAt',
    })
    // v2: key/value flags (onboarding).
    this.version(2).stores({ meta: 'key' })
    // v3: debt (نسیه) payments, and a customer index on history for the debt ledger.
    this.version(3).stores({ payments: 'id, customerId, paidAt', history: 'id, endedAt, customerId' })
    this.on('populate', (tx) => {
      const d = defaultSettings()
      const seed = (table: string, rows: object[]) =>
        tx.table(table).bulkAdd(rows.map((r, order) => ({ ...r, order })))
      seed('rateGroups', d.rateGroups)
      seed('deviceCategories', d.deviceCategories)
      seed('extraCategories', d.extraCategories)
      seed('extraItems', d.extraItems)
    })
  }
}

export const db = new GamenetDB()

const strip = <T extends { order: number; deletedAt?: number }>({
  order: _order,
  deletedAt: _deletedAt,
  ...rest
}: T) => rest

// Active (not soft-deleted) rows in user order.
const readOrdered = async <T extends { order: number; deletedAt?: number }>(table: Table<T, string>) =>
  (await table.orderBy('order').toArray()).filter((r) => r.deletedAt === undefined).map(strip)

export const readSettings = async (): Promise<Settings> => {
  const [rateGroups, deviceCategories, devices, extraCategories, extraItems, customers] =
    await Promise.all([
      readOrdered(db.rateGroups),
      readOrdered(db.deviceCategories),
      readOrdered(db.devices),
      readOrdered(db.extraCategories),
      readOrdered(db.extraItems),
      readOrdered(db.customers),
    ])
  return {
    rateGroups: rateGroups as RateGroup[],
    deviceCategories: deviceCategories as DeviceCategory[],
    devices: devices as Device[],
    extraCategories: extraCategories as ExtraCategory[],
    extraItems: extraItems as CatalogItem[],
    customers: customers as Customer[],
  }
}

export const readSessions = async (): Promise<Session[]> =>
  (await db.sessions.toArray()).sort(
    (a, b) => (a.segments[0]?.from ?? a.reservedAt ?? 0) - (b.segments[0]?.from ?? b.reservedAt ?? 0),
  )

// Latest ended sessions, newest first (enough to cover the current shift).
export const readRecentHistory = (): Promise<HistoryEntry[]> =>
  db.history.orderBy('endedAt').reverse().limit(300).toArray()

const norm = (name: string) => name.trim().toLowerCase()

// Writes `rows` as the active list of `table`:
//  - existing active rows missing from `rows` are soft-deleted;
//  - a new row whose key matches a soft-deleted row takes over that row's id (restore);
//  - everything is re-ordered. Returns the final rows and the new-id → restored-id map.
const syncTable = async <T extends { id: string }>(
  table: Table<Ordered<T>, string>,
  rows: T[],
  keyOf: (x: T) => string,
) => {
  const existing = await table.toArray()
  const activeIds = new Set(existing.filter((r) => r.deletedAt === undefined).map((r) => r.id))
  const trash = new Map<string, Ordered<T>>()
  for (const r of existing) if (r.deletedAt !== undefined && !trash.has(keyOf(r))) trash.set(keyOf(r), r)

  const idMap = new Map<string, string>()
  const claimed = new Set<string>()
  const final = rows.map((r) => {
    if (activeIds.has(r.id)) return r
    const old = trash.get(keyOf(r))
    if (!old || claimed.has(old.id)) return r
    claimed.add(old.id)
    idMap.set(r.id, old.id)
    return { ...r, id: old.id }
  })

  const keep = new Set(final.map((r) => r.id))
  const now = Date.now()
  await table.bulkPut(
    existing.filter((r) => activeIds.has(r.id) && !keep.has(r.id)).map((r) => ({ ...r, deletedAt: now })),
  )
  await table.bulkPut(final.map((r, order) => ({ ...r, order }) as Ordered<T>))
  return { rows: final, idMap }
}

// Saves the catalogs and rewrites price/device/item mirrors on every live session,
// atomically. History rows are snapshots and are never touched.
export const saveSettings = (next: Omit<Settings, 'customers'>) =>
  db.transaction(
    'rw',
    [
      db.rateGroups,
      db.deviceCategories,
      db.devices,
      db.extraCategories,
      db.extraItems,
      db.sessions,
    ],
    async () => {
      const groups = await syncTable(db.rateGroups, next.rateGroups, (g) => norm(g.name))
      const cats = await syncTable(db.deviceCategories, next.deviceCategories, (c) => norm(c.name))
      const extraCats = await syncTable(db.extraCategories, next.extraCategories, (c) => norm(c.name))
      // Restored groups/categories keep their old ids, so devices and items follow them.
      const remap = (id: string, m: Map<string, string>) => m.get(id) ?? id
      const devices = await syncTable(
        db.devices,
        next.devices.map((d) => ({
          ...d,
          categoryId: remap(d.categoryId, cats.idMap),
          rateIds: d.rateIds.map((id) => remap(id, groups.idMap)),
        })),
        (d) => norm(d.name) + '|' + d.categoryId,
      )
      const items = await syncTable(
        db.extraItems,
        next.extraItems.map((i) => ({ ...i, categoryId: remap(i.categoryId, extraCats.idMap) })),
        (i) => norm(i.name) + '|' + i.categoryId,
      )

      await db.sessions.bulkPut(
        applyExtraItems(
          applyDevices(
            applyPrices(await db.sessions.toArray(), groups.rows),
            devices.rows,
            cats.rows,
          ),
          items.rows,
        ),
      )
    },
  )

// Adds one item to the extra items catalog (optionally creating its category first) and returns
// the stored row (its id may be a restored soft-deleted one).
export const addCatalogItem = async (
  settings: Settings,
  item: { name: string; price: number; categoryId?: string; newCategoryName?: string },
): Promise<CatalogItem | undefined> => {
  const { customers: _customers, ...rest } = settings
  const newCategory = item.newCategoryName ? { id: uid(), name: item.newCategoryName.trim() } : undefined
  const categoryId = newCategory?.id ?? item.categoryId ?? ''
  await saveSettings({
    ...rest,
    extraCategories: newCategory ? [...settings.extraCategories, newCategory] : settings.extraCategories,
    extraItems: [
      ...settings.extraItems,
      { id: uid(), name: item.name.trim(), price: item.price, categoryId },
    ],
  })
  const fresh = await readSettings()
  const catId = newCategory
    ? fresh.extraCategories.find((c) => norm(c.name) === norm(newCategory.name))?.id
    : categoryId
  return fresh.extraItems.find((i) => norm(i.name) === norm(item.name) && i.categoryId === catId)
}

export const addSessionRow =(s: Session) => db.sessions.add(s)

export const updateSessionRow = (id: string, fn: (s: Session) => Session) =>
  db.transaction('rw', db.sessions, async () => {
    const cur = await db.sessions.get(id)
    if (cur) await db.sessions.put(fn(cur))
  })

// Cancels a reservation: removed without a history entry.
export const deleteSessionRow = (id: string) => db.sessions.delete(id)

export const endSessionRow = (entry: HistoryEntry) =>
  db.transaction('rw', [db.sessions, db.history], async () => {
    await db.history.add(entry)
    await db.sessions.delete(entry.sessionId)
  })

// Saved immediately (from the session flow), outside the Settings draft. A soft-deleted
// customer with the same name is restored instead of creating a duplicate.
export const addCustomer = async (name: string, phone: string): Promise<Customer> => {
  const clean = name.trim()
  const customer: Customer = { id: uid(), name: clean, ...(phone.trim() ? { phone: phone.trim() } : {}) }
  const old = (await db.customers.toArray()).find(
    (c) => c.deletedAt !== undefined && norm(c.name) === norm(clean),
  )
  if (old) customer.id = old.id
  await db.customers.put({ ...customer, order: Date.now() })
  return customer
}

export const updateCustomer = (id: string, name: string, phone: string) =>
  db.customers.update(id, { name: name.trim(), phone: phone.trim() || undefined })

// Total spent per customer over all history (the final income of each ended session). History has
// no customer index, so this scans it once; callers load it after the customer list.
export const readCustomerSpend = async (): Promise<Map<string, number>> => {
  const spend = new Map<string, number>()
  await db.history.each((h) => {
    if (h.customerId) spend.set(h.customerId, (spend.get(h.customerId) ?? 0) + h.total)
  })
  return spend
}

export const deleteCustomer = (id: string) => db.customers.update(id, { deletedAt: Date.now() })

// ---- debts (نسیه) ----------------------------------------------------------------

export type DebtInfo = { debt: number; paid: number; balance: number }

// Debt, payments and what is still owed per customer. Scans history once (like the spend totals),
// so callers load it after the customer list.
export const readDebts = async (): Promise<Map<string, DebtInfo>> => {
  const out = new Map<string, DebtInfo>()
  const at = (id: string) => {
    let d = out.get(id)
    if (!d) out.set(id, (d = { debt: 0, paid: 0, balance: 0 }))
    return d
  }
  await db.history.each((h) => {
    if (h.onAccount && h.customerId) at(h.customerId).debt += h.total
  })
  await db.payments.each((p) => {
    at(p.customerId).paid += p.amount
  })
  out.forEach((d) => (d.balance = d.debt - d.paid))
  return out
}

// Every on-account session and payment of one customer, newest first.
export const readCustomerLedger = async (customerId: string) => {
  const [entries, payments] = await Promise.all([
    db.history.where('customerId').equals(customerId).toArray(),
    db.payments.where('customerId').equals(customerId).toArray(),
  ])
  return {
    debts: entries.filter((e) => e.onAccount).sort((a, b) => b.endedAt - a.endedAt),
    payments: payments.sort((a, b) => b.paidAt - a.paidAt),
  }
}

export const addPayment = (customerId: string, amount: number) =>
  db.payments.add({ id: uid(), customerId, amount, paidAt: Date.now() })

// ---- onboarding ---------------------------------------------------------------

// True only for a brand-new database. A database that already has devices, sessions or
// history (e.g. created before onboarding existed) is flagged as done silently.
export const needsOnboarding = async (): Promise<boolean> => {
  if (await db.meta.get('onboarded')) return false
  const [devices, sessions, history] = await Promise.all([
    db.devices.count(),
    db.sessions.count(),
    db.history.count(),
  ])
  if (devices + sessions + history > 0) {
    await markOnboarded()
    return false
  }
  return true
}

export const markOnboarded = () => db.meta.put({ key: 'onboarded', value: '1' })

// ---- backup: export / import / clear ----------------------------------------------

const BACKUP_APP = 'gamenet-timer-manager'
const PREF_PREFIX = 'gamenet-'

// Every table, soft-deleted catalog rows included, so ids stay linked to history.
const BACKUP_TABLE_NAMES = [
  'rateGroups',
  'deviceCategories',
  'devices',
  'extraCategories',
  'extraItems',
  'customers',
  'meta',
  'sessions',
  'history',
  'payments',
] as const

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backupTables = (): Record<BackupTableName, Table<any, string>> =>
  ({
    rateGroups: db.rateGroups,
    deviceCategories: db.deviceCategories,
    devices: db.devices,
    extraCategories: db.extraCategories,
    extraItems: db.extraItems,
    customers: db.customers,
    meta: db.meta,
    sessions: db.sessions,
    history: db.history,
    payments: db.payments,
  })

export type Backup = {
  app: typeof BACKUP_APP
  version: 1
  exportedAt: number
  tables: Record<BackupTableName, object[]>
  // Per-viewer settings from localStorage (theme, accent, title, icon, view, grouping, rounding).
  prefs: Record<string, string>
}

const readPrefs = (): Record<string, string> => {
  const prefs: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREF_PREFIX)) prefs[key] = localStorage.getItem(key) ?? ''
    }
  } catch {
    // storage unavailable: export the data without preferences
  }
  return prefs
}

const clearPrefs = () => {
  try {
    Object.keys(readPrefs()).forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

export const exportBackup = async (): Promise<Backup> => {
  const tables = backupTables()
  const names = [...BACKUP_TABLE_NAMES]
  const rows = await Promise.all(names.map((n) => tables[n].toArray()))
  return {
    app: BACKUP_APP,
    version: 1,
    exportedAt: Date.now(),
    tables: Object.fromEntries(names.map((n, i) => [n, rows[i]])) as Backup['tables'],
    prefs: readPrefs(),
  }
}

// Checks the shape of a parsed file; throws Error('invalid') when it is not one of our backups.
export const parseBackup = (value: unknown): Backup => {
  const b = value as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || b.version !== 1) throw new Error('invalid')
  const names = [...BACKUP_TABLE_NAMES]
  const tables = {} as Backup['tables']
  for (const n of names) {
    const rows = b.tables?.[n]
    if (rows === undefined) {
      tables[n] = []
      continue
    }
    const keyOf = n === 'meta' ? 'key' : 'id'
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof (r as Record<string, unknown>)[keyOf] !== 'string'))
      throw new Error('invalid')
    tables[n] = rows
  }
  const prefs = b.prefs && typeof b.prefs === 'object' ? b.prefs : {}
  return { app: BACKUP_APP, version: 1, exportedAt: Number(b.exportedAt) || 0, tables, prefs }
}

// Replaces everything (data and preferences) with the backup's content in one transaction.
export const importBackup = async (backup: Backup) => {
  const tables = backupTables()
  const names = [...BACKUP_TABLE_NAMES]
  await db.transaction('rw', names.map((n) => tables[n]), async () => {
    for (const n of names) {
      await tables[n].clear()
      await tables[n].bulkAdd(backup.tables[n] as never[])
    }
    await db.meta.put({ key: 'onboarded', value: '1' })
  })
  clearPrefs()
  try {
    for (const [k, v] of Object.entries(backup.prefs))
      if (k.startsWith(PREF_PREFIX) && typeof v === 'string') localStorage.setItem(k, v)
  } catch {
    // preferences are optional
  }
}

export const clearHistory = () => db.history.clear()

// Factory reset: drops the database (it is re-created with the default catalog on reload) and
// the saved preferences.
export const resetAllData = async () => {
  clearPrefs()
  await resetSecurity()
  await db.delete()
}
