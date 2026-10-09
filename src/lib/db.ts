import { resetSecurity } from '@/lib/security'
import { emitSessionUpdated } from '@/lib/session-events'
import Dexie, { type Table } from 'dexie'
import {
  buildHistoryEntry,
  applyDevices,
  applyExtraItems,
  applyPrices,
  defaultSettings,
  settleSessionAmount,
  splitByOverrides,
  uid,
  type CatalogItem,
  type Customer,
  type Device,
  type DeviceCategory,
  type ExtraCategory,
  type HistoryEntry,
  type Payment,
  type PriceOverride,
  type RateGroup,
  type Session,
  STORAGE_PREFIX,
  type Settings,
  type WalletTransaction,
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
  priceOverrides!: Table<Ordered<PriceOverride>, string>
  meta!: Table<{ key: string; value: string }, string>
  sessions!: Table<Session, string>
  history!: Table<HistoryEntry, string>
  payments!: Table<Payment, string>
  walletTransactions!: Table<WalletTransaction, string>

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
    // v4: signed customer wallet ledger (negative = debt, positive = credit).
    this.version(4)
      .stores({
        payments: 'id, customerId, paidAt',
        history: 'id, endedAt, customerId',
        walletTransactions: 'id, customerId, at, kind, sessionId',
      })
      .upgrade(async (tx) => {
        const wallet = tx.table('walletTransactions')
        const histories = await tx.table('history').toArray()
        const payments = await tx.table('payments').toArray()
        const rows: WalletTransaction[] = []

        for (const h of histories as HistoryEntry[]) {
          if (!h.customerId || !h.onAccount || !Number.isFinite(h.total) || h.total <= 0) continue
          rows.push({
            id: uid(),
            customerId: h.customerId,
            amount: -h.total,
            at: h.endedAt || Date.now(),
            kind: 'legacy-debt',
            sessionId: h.sessionId,
            note: 'واردشده از سابقه‌ی نسیه‌ی قدیمی',
          })
        }
        for (const p of payments as Payment[]) {
          if (!p.customerId || !Number.isFinite(p.amount) || p.amount <= 0) continue
          rows.push({
            id: uid(),
            customerId: p.customerId,
            amount: p.amount,
            at: p.paidAt || Date.now(),
            kind: 'legacy-payment',
            note: 'واردشده از پرداخت‌های قدیمی',
          })
        }
        if (rows.length > 0) await wallet.bulkAdd(rows)
      })
    // v5: time-of-day/weekday price overrides (new optional table, nothing to migrate).
    this.version(5).stores({ priceOverrides: 'id, order' })
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
  const [rateGroups, deviceCategories, devices, extraCategories, extraItems, customers, priceOverrides] =
    await Promise.all([
      readOrdered(db.rateGroups),
      readOrdered(db.deviceCategories),
      readOrdered(db.devices),
      readOrdered(db.extraCategories),
      readOrdered(db.extraItems),
      readOrdered(db.customers),
      readOrdered(db.priceOverrides),
    ])
  return {
    rateGroups: rateGroups as RateGroup[],
    deviceCategories: deviceCategories as DeviceCategory[],
    devices: devices as Device[],
    extraCategories: extraCategories as ExtraCategory[],
    extraItems: extraItems as CatalogItem[],
    customers: customers as Customer[],
    priceOverrides: priceOverrides as PriceOverride[],
  }
}

export const readSessions = async (): Promise<Session[]> =>
  (await db.sessions.toArray())
    .map((s) => (s.prepayEntries ? s : { ...s, prepayEntries: [] }))
    .sort(
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
      db.priceOverrides,
      db.sessions,
    ],
    async () => {
      const overrides = await syncTable(db.priceOverrides, next.priceOverrides, (o) => o.id)
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

      // Prices first, then re-cut at the (possibly edited) price overrides: lines of a deleted
      // override join back, a new/edited one splits them.
      const now = Date.now()
      await db.sessions.bulkPut(
        applyExtraItems(
          applyDevices(
            applyPrices(await db.sessions.toArray(), groups.rows),
            devices.rows,
            cats.rows,
          ),
          items.rows,
        ).map((s) =>
          splitByOverrides(s, { rateGroups: groups.rows, priceOverrides: overrides.rows }, now),
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

export const addSessionRow = (s: Session) => db.sessions.add(s)

export const updateSessionRow = (id: string, fn: (s: Session) => Session) =>
  db.transaction('rw', db.sessions, async () => {
    const cur = await db.sessions.get(id)
    if (!cur) return
    const next = fn(cur)
    await db.sessions.put(next)
    emitSessionUpdated(next)
  })

// Cancels a reservation: removed without a history entry.
export const deleteSessionRow = (id: string) => db.sessions.delete(id)

export const endSessionRow = (entry: HistoryEntry) =>
  db.transaction('rw', [db.sessions, db.history], async () => {
    await db.history.add(entry)
    await db.sessions.delete(entry.sessionId)
  })

// Deletes a history entry and reverses any wallet transactions it created (debt, credit used,
// leftover-prepay credit), so a deleted entry never leaves stray balance behind.
export const deleteHistoryEntry = (entry: HistoryEntry) =>
  db.transaction('rw', [db.history, db.walletTransactions], async () => {
    await db.history.delete(entry.id)
    const linked = await db.walletTransactions.where('sessionId').equals(entry.sessionId).toArray()
    await db.walletTransactions.bulkDelete(linked.map((x) => x.id))
  })

export const readWalletBalance = async (customerId: string): Promise<number> => {
  const rows = await db.walletTransactions.where('customerId').equals(customerId).toArray()
  return rows.reduce((sum, x) => sum + x.amount, 0)
}

export const readWalletBalances = async (): Promise<Map<string, number>> => {
  const out = new Map<string, number>()
  await db.walletTransactions.each((x) => {
    out.set(x.customerId, (out.get(x.customerId) ?? 0) + x.amount)
  })
  return out
}

export const readCustomerWalletTransactions = async (
  customerId: string,
  range?: { from?: number; to?: number },
): Promise<WalletTransaction[]> => {
  const rows = await db.walletTransactions.where('customerId').equals(customerId).toArray()
  const from = range?.from
  const to = range?.to
  return rows
    .filter((x) => (from === undefined || x.at >= from) && (to === undefined || x.at <= to))
    .sort((a, b) => b.at - a.at)
}

export const addWalletTransaction = (
  customerId: string,
  amount: number,
  kind: WalletTransaction['kind'],
  note?: string,
  sessionId?: string,
) =>
  db.walletTransactions.add({
    id: uid(),
    customerId,
    amount,
    at: Date.now(),
    kind,
    ...(note ? { note } : {}),
    ...(sessionId ? { sessionId } : {}),
  })

export const updateWalletTransaction = async (
  id: string,
  patch: Partial<Pick<WalletTransaction, 'amount' | 'note'>>,
) => {
  const cur = await db.walletTransactions.get(id)
  if (!cur || cur.kind !== 'manual-adjustment') return
  const amount =
    patch.amount !== undefined && Number.isFinite(patch.amount) ? Math.floor(patch.amount) : cur.amount
  if (amount <= 0) return
  await db.walletTransactions.update(id, {
    amount,
    ...(patch.note !== undefined ? { note: patch.note } : {}),
  })
}

export const deleteWalletTransaction = async (id: string) => {
  const cur = await db.walletTransactions.get(id)
  if (!cur || cur.kind !== 'manual-adjustment') return
  await db.walletTransactions.delete(id)
}

type EndSessionSettlement = {
  finalTotal?: number
  // Remaining amount after credit/prepay: true = put on debt, false = collected now.
  onAccount?: boolean
}

export const endSessionWithWallet = async (
  session: Session,
  customer: Customer | undefined,
  settlement?: EndSessionSettlement,
) => {
  const now = Date.now()
  const finalTotal = settlement?.finalTotal
  const draft = buildHistoryEntry(session, customer, now, finalTotal)
  const total = draft.total
  const prepay = session.prepayEntries?.reduce((sum, x) => sum + x.amount, 0) ?? 0

  await db.transaction('rw', [db.sessions, db.history, db.walletTransactions], async () => {
    const walletBalance = customer?.id ? await readWalletBalance(customer.id) : 0

    const settle = settleSessionAmount(total, walletBalance, prepay)
    const payableAsDebt = !!customer && !!settlement?.onAccount && settle.payableNow > 0

    const entry = buildHistoryEntry(
      session,
      customer,
      now,
      finalTotal,
      payableAsDebt,
      {
        creditUsed: settle.walletCreditUsed,
        prepayUsed: settle.prepayUsed,
        prepayReturned: settle.prepayReturned,
        // Prepay was cash collected up front; a leftover prepay is only handed back as cash for
        // a guest (a customer's leftover becomes wallet credit instead), so only that case nets out.
        cashPaid: prepay + (payableAsDebt ? 0 : settle.payableNow) - (customer ? 0 : settle.prepayReturned),
      },
    )

    await db.history.add(entry)

    if (customer?.id) {
      if (settle.walletCreditUsed > 0) {
        await db.walletTransactions.add({
          id: uid(),
          customerId: customer.id,
          amount: -settle.walletCreditUsed,
          at: now,
          kind: 'session-debt',
          sessionId: session.id,
          note: 'استفاده خودکار از اعتبار کیف پول برای تایم',
        })
      }
      if (payableAsDebt) {
        await db.walletTransactions.add({
          id: uid(),
          customerId: customer.id,
          amount: -settle.payableNow,
          at: now,
          kind: 'session-debt',
          sessionId: session.id,
          note: 'باقی‌مانده‌ی تایم به بدهی منتقل شد',
        })
      }
      if (settle.prepayReturned > 0) {
        await db.walletTransactions.add({
          id: uid(),
          customerId: customer.id,
          amount: settle.prepayReturned,
          at: now,
          kind: 'session-credit-leftover',
          sessionId: session.id,
          note: 'باقی‌مانده‌ی پیش‌پرداخت به اعتبار منتقل شد',
        })
      }
    }

    await db.sessions.delete(session.id)
  })
}

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

// Signed wallet summary per customer: negative balance means debt, positive means credit.
export const readDebts = async (): Promise<Map<string, DebtInfo>> => {
  const out = new Map<string, DebtInfo>()
  const at = (id: string) => {
    let d = out.get(id)
    if (!d) out.set(id, (d = { debt: 0, paid: 0, balance: 0 }))
    return d
  }
  await db.walletTransactions.each((tx) => {
    const d = at(tx.customerId)
    d.balance += tx.amount
    if (tx.amount < 0) d.debt += -tx.amount
    else d.paid += tx.amount
  })
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
  db.transaction('rw', [db.payments, db.walletTransactions], async () => {
    const at = Date.now()
    await db.payments.add({ id: uid(), customerId, amount, paidAt: at })
    await db.walletTransactions.add({
      id: uid(),
      customerId,
      amount,
      at,
      kind: 'legacy-payment',
      note: 'پرداخت دستی',
    })
  })

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
const PREF_PREFIX = STORAGE_PREFIX

// Every table, soft-deleted catalog rows included, so ids stay linked to history.
const BACKUP_TABLE_NAMES = [
  'rateGroups',
  'deviceCategories',
  'devices',
  'extraCategories',
  'extraItems',
  'customers',
  'priceOverrides',
  'meta',
  'sessions',
  'history',
  'payments',
  'walletTransactions',
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
    priceOverrides: db.priceOverrides,
    meta: db.meta,
    sessions: db.sessions,
    history: db.history,
    payments: db.payments,
    walletTransactions: db.walletTransactions,
  })

export type Backup = {
  app: typeof BACKUP_APP
  version: 1 | 2
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
    version: 2,
    exportedAt: Date.now(),
    tables: Object.fromEntries(names.map((n, i) => [n, rows[i]])) as Backup['tables'],
    prefs: readPrefs(),
  }
}

// Checks the shape of a parsed file; throws Error('invalid') when it is not one of our backups.
export const parseBackup = (value: unknown): Backup => {
  const b = value as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || (b.version !== 1 && b.version !== 2))
    throw new Error('invalid')
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
  return {
    app: BACKUP_APP,
    version: b.version,
    exportedAt: Number(b.exportedAt) || 0,
    tables,
    prefs,
  }
}

// Replaces everything (data and preferences) with the backup's content in one transaction.
export const importBackup = async (backup: Backup) => {
  const tables = backupTables()
  const names = [...BACKUP_TABLE_NAMES]
  await db.transaction('rw', names.map((n) => tables[n]), async () => {
    for (const n of names) {
      await tables[n].clear()
      const rows = backup.tables[n] as never[]
      if (n === 'sessions') {
        const normalized = (rows as Session[]).map((s) => ({ ...s, prepayEntries: s.prepayEntries ?? [] }))
        if (normalized.length > 0) await tables[n].bulkAdd(normalized as never[])
        continue
      }
      if (rows.length > 0) await tables[n].bulkAdd(rows)
    }

    // Backups from old versions can contain no wallet rows. Imports bypass Dexie upgrades,
    // so rebuild wallet transactions from legacy debt/payment data here.
    const walletCount = await db.walletTransactions.count()
    if (walletCount === 0) {
      const [histories, payments] = await Promise.all([db.history.toArray(), db.payments.toArray()])
      const rows: WalletTransaction[] = []
      for (const h of histories) {
        if (!h.customerId || !h.onAccount || !Number.isFinite(h.total) || h.total <= 0) continue
        rows.push({
          id: uid(),
          customerId: h.customerId,
          amount: -h.total,
          at: h.endedAt || Date.now(),
          kind: 'legacy-debt',
          sessionId: h.sessionId,
          note: 'Imported from legacy on-account history',
        })
      }
      for (const p of payments) {
        if (!p.customerId || !Number.isFinite(p.amount) || p.amount <= 0) continue
        rows.push({
          id: uid(),
          customerId: p.customerId,
          amount: p.amount,
          at: p.paidAt || Date.now(),
          kind: 'legacy-payment',
          note: 'Imported from legacy payment rows',
        })
      }
      if (rows.length > 0) await db.walletTransactions.bulkAdd(rows)
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
