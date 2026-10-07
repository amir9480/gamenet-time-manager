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
    (a, b) => (a.segments[0]?.from ?? 0) - (b.segments[0]?.from ?? 0),
  )

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

export const addSessionRow = (s: Session) => db.sessions.add(s)

export const updateSessionRow = (id: string, fn: (s: Session) => Session) =>
  db.transaction('rw', db.sessions, async () => {
    const cur = await db.sessions.get(id)
    if (cur) await db.sessions.put(fn(cur))
  })

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

export const deleteCustomer = (id: string) => db.customers.update(id, { deletedAt: Date.now() })

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
