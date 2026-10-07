import Dexie, { type Table } from 'dexie'
import {
  applyExtraItems,
  applyPriceTypes,
  defaultExtraItems,
  defaultPriceTypes,
  isDefaultName,
  type CatalogItem,
  type HistoryEntry,
  type PriceType,
  type Session,
  type Settings,
} from '@/lib/store'

type Ordered<T> = T & { order: number }
type MetaRow = { key: string; value: string }

class GamenetDB extends Dexie {
  priceTypes!: Table<Ordered<PriceType>, string>
  extraItems!: Table<Ordered<CatalogItem>, string>
  meta!: Table<MetaRow, string>
  sessions!: Table<Session, string>
  history!: Table<HistoryEntry, string>

  constructor() {
    super('gamenet')
    // Schema changes: add a new `version(n)` with `.upgrade()` instead of editing this one.
    this.version(1).stores({
      priceTypes: 'id',
      extraItems: 'id',
      meta: 'key',
      sessions: 'id',
      history: 'id, endedAt',
    })
    // v2: index `order` so the catalogs can be read in user-defined order.
    this.version(2).stores({
      priceTypes: 'id, order',
      extraItems: 'id, order',
    })
    this.on('populate', (tx) => {
      const { types, defaultId } = defaultPriceTypes()
      tx.table('priceTypes').bulkAdd(types.map((t, order) => ({ ...t, order })))
      tx.table('extraItems').bulkAdd(defaultExtraItems().map((t, order) => ({ ...t, order })))
      tx.table('meta').add({ key: 'defaultTypeId', value: defaultId })
    })
  }
}

export const db = new GamenetDB()

const strip = <T extends { order: number }>({ order: _order, ...rest }: T) => rest

export const readSettings = async (): Promise<Settings> => {
  const [types, items, meta] = await Promise.all([
    db.priceTypes.orderBy('order').toArray(),
    db.extraItems.orderBy('order').toArray(),
    db.meta.get('defaultTypeId'),
  ])
  return {
    priceTypes: types.map(strip) as PriceType[],
    extraItems: items.map(strip) as CatalogItem[],
    defaultTypeId: meta?.value ?? types[0]?.id ?? '',
  }
}

export const readSessions = async (): Promise<Session[]> =>
  (await db.sessions.toArray()).sort(
    (a, b) => (a.segments[0]?.from ?? 0) - (b.segments[0]?.from ?? 0),
  )

// Replaces the catalogs and rewrites price/name mirrors on every live session, atomically.
// History rows are snapshots and are never touched.
export const saveSettings = (next: Settings) =>
  db.transaction('rw', [db.priceTypes, db.extraItems, db.meta, db.sessions], async () => {
    await db.priceTypes.clear()
    await db.priceTypes.bulkAdd(next.priceTypes.map((t, order) => ({ ...t, order })))
    await db.extraItems.clear()
    await db.extraItems.bulkAdd(next.extraItems.map((t, order) => ({ ...t, order })))
    await db.meta.put({ key: 'defaultTypeId', value: next.defaultTypeId })
    await db.sessions.bulkPut(
      applyExtraItems(
        applyPriceTypes(await db.sessions.toArray(), next.priceTypes),
        next.extraItems,
      ),
    )
  })

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

// Distinct custom session names (newest first) for autocomplete; default «دستگاه N» names are skipped.
export const readPreviousNames = async (): Promise<string[]> => {
  const names = new Set<string>()
  await db.history.orderBy('endedAt').reverse().until(() => names.size >= 300).each((e) => {
    const n = e.name.trim()
    if (n && !isDefaultName(n)) names.add(n)
  })
  return [...names]
}
