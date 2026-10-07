import { useEffect, useState } from 'react'

export type PriceType = { id: string; name: string; price: number }

export type CatalogItem = { id: string; name: string; price: number }

export type Settings = {
  priceTypes: PriceType[]
  defaultTypeId: string
  extraItems: CatalogItem[]
}

// One continuous run at a single rate. `typeName`/`price` mirror the price type
// `typeId`; editing a price type in Settings rewrites them everywhere
// (see `applyPriceTypes`). If the type was deleted the last values are kept.
export type Segment = {
  from: number
  to: number | null
  typeId: string
  typeName: string
  price: number
}

// `catalogId` links an item to its catalog entry so Settings edits propagate to live
// sessions (see `applyExtraItems`); absent for the free-form «موارد دیگر».
export type ExtraItem = {
  id: string
  catalogId?: string
  name: string
  price: number
  qty: number
  description?: string
}

// Manually added minutes, billed at the price type chosen when added.
export type ExtraTime = {
  id: string
  name: string
  minutes: number
  typeId: string
  typeName: string
  price: number
}

export type Session = {
  id: string
  // Number used for the default name «دستگاه N»; `name` overrides it when set.
  number: number
  name: string
  status: 'running' | 'paused'
  typeId: string
  segments: Segment[]
  extraTimes: ExtraTime[]
  extraItems: ExtraItem[]
}

export const OTHER_ITEM_NAME = 'موارد دیگر'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const defaultPriceTypes = (): { types: PriceType[]; defaultId: string } => {
  const names = ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته']
  const types = names.map((name, i) => ({ id: uid(), name, price: (i + 1) * 1000 }))
  return { types, defaultId: types[1].id }
}

export const defaultExtraItems = (): CatalogItem[] => [
  { id: uid(), name: 'نوشابه', price: 1000 },
  { id: uid(), name: 'چیپس', price: 2000 },
  { id: uid(), name: 'کیک', price: 500 },
]

export const defaultSettings = (): Settings => {
  const { types, defaultId } = defaultPriceTypes()
  return { priceTypes: types, defaultTypeId: defaultId, extraItems: defaultExtraItems() }
}

export const defaultType = (settings: Settings): PriceType =>
  settings.priceTypes.find((t) => t.id === settings.defaultTypeId) ?? settings.priceTypes[0]

// Falls back to the default type if the session's type was deleted in Settings.
export const selectedType = (settings: Settings, s: Session): PriceType =>
  settings.priceTypes.find((t) => t.id === s.typeId) ?? defaultType(settings)

// ---- sessions list ----------------------------------------------------------

export const defaultSessionName = (number: number) => `دستگاه ${number}`

export const displayName = (s: Session) => s.name.trim() || defaultSessionName(s.number)

// Smallest positive number not used by a session currently on screen.
export const nextFreeNumber = (sessions: Session[]) => {
  const used = new Set(sessions.map((s) => s.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

export const createSession = (
  sessions: Session[],
  type: PriceType,
  name: string,
  now: number,
): Session => ({
  id: uid(),
  number: nextFreeNumber(sessions),
  name: name.trim(),
  status: 'running',
  typeId: type.id,
  segments: [{ from: now, to: null, typeId: type.id, typeName: type.name, price: type.price }],
  extraTimes: [],
  extraItems: [],
})

// ---- session transitions ----------------------------------------------

const closeOpen = (segments: Segment[], now: number): Segment[] =>
  segments.map((seg) => (seg.to === null ? { ...seg, to: now } : seg))

const openSegment = (type: PriceType, now: number): Segment => ({
  from: now,
  to: null,
  typeId: type.id,
  typeName: type.name,
  price: type.price,
})

export const resumeSession = (settings: Settings, s: Session, now: number): Session => {
  const type = selectedType(settings, s)
  return {
    ...s,
    status: 'running',
    typeId: type.id,
    segments: [...s.segments, openSegment(type, now)],
  }
}

export const pauseSession = (s: Session, now: number): Session => ({
  ...s,
  status: 'paused',
  segments: closeOpen(s.segments, now),
})

export const changeType = (
  settings: Settings,
  s: Session,
  typeId: string,
  now: number,
): Session => {
  const type = settings.priceTypes.find((t) => t.id === typeId)
  if (!type) return s
  if (s.status !== 'running') return { ...s, typeId }
  return {
    ...s,
    typeId,
    segments: [...closeOpen(s.segments, now), openSegment(type, now)],
  }
}

// ---- cost -----------------------------------------------------------------

export const segmentMs = (seg: Segment, now: number) => Math.max(0, (seg.to ?? now) - seg.from)

export const elapsedMs = (s: Session, now: number) =>
  s.segments.reduce((sum, seg) => sum + segmentMs(seg, now), 0)

// Billed per whole second; any started toman counts (rounded up).
export const segmentCost = (seg: Segment, now: number) =>
  Math.ceil((Math.floor(segmentMs(seg, now) / 1000) * seg.price) / 3600)

export const extraTimeCost = (t: ExtraTime) => Math.ceil((t.minutes * t.price) / 60)

export const extraTimesCost = (s: Session) =>
  s.extraTimes.reduce((sum, t) => sum + extraTimeCost(t), 0)

export const extraItemsCost = (s: Session) =>
  s.extraItems.reduce((sum, i) => sum + i.price * i.qty, 0)

export const computeCost = (s: Session, now: number) =>
  s.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0) +
  extraTimesCost(s) +
  extraItemsCost(s)

// Propagate edited price types to every existing session (past segments, the
// running one and extra-time entries). Sessions of deleted types keep their values.
export const applyPriceTypes = (sessions: Session[], types: PriceType[]): Session[] => {
  const byId = new Map(types.map((t) => [t.id, t]))
  const sync = <T extends { typeId: string; typeName: string; price: number }>(x: T): T => {
    const t = byId.get(x.typeId)
    return t ? { ...x, typeName: t.name, price: t.price } : x
  }
  return sessions.map((s) => ({
    ...s,
    segments: s.segments.map(sync),
    extraTimes: s.extraTimes.map(sync),
  }))
}

// Propagate edited catalog items (name/price) to extra items on existing sessions.
// Items whose catalog entry was deleted keep their last values.
export const applyExtraItems = (sessions: Session[], catalog: CatalogItem[]): Session[] => {
  const byId = new Map(catalog.map((c) => [c.id, c]))
  return sessions.map((s) => ({
    ...s,
    extraItems: s.extraItems.map((i) => {
      const c = i.catalogId ? byId.get(i.catalogId) : undefined
      return c ? { ...i, name: c.name, price: c.price } : i
    }),
  }))
}

export const addExtraTime = (s: Session, time: Omit<ExtraTime, 'id'>): Session => ({
  ...s,
  extraTimes: [...s.extraTimes, { ...time, id: uid() }],
})

export const addExtraItem = (s: Session, item: Omit<ExtraItem, 'id'>): Session => {
  const existing = s.extraItems.find((i) =>
    item.catalogId
      ? i.catalogId === item.catalogId
      : !i.catalogId &&
        i.name === item.name &&
        i.price === item.price &&
        (i.description ?? '') === (item.description ?? ''),
  )
  if (existing) {
    return {
      ...s,
      extraItems: s.extraItems.map((i) =>
        i === existing ? { ...i, qty: i.qty + item.qty } : i,
      ),
    }
  }
  return { ...s, extraItems: [...s.extraItems, { ...item, id: uid() }] }
}

// ---- persistence ----------------------------------------------------------

const readRaw = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useLocalStorage<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    const raw = readRaw(key)
    return raw !== null ? (raw as T) : initial()
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage unavailable
    }
  }, [key, value])

  return [value, setValue] as const
}

// ---- history --------------------------------------------------------------

// Immutable snapshot of an ended session (costs frozen at the moment of ending).
export type HistoryEntry = {
  id: string
  sessionId: string
  name: string
  startedAt: number
  endedAt: number
  durationMs: number
  segments: Segment[]
  extraTimes: ExtraTime[]
  extraItems: ExtraItem[]
  timeCost: number
  extraTimesCost: number
  extraItemsCost: number
  total: number
}

export const buildHistoryEntry = (s: Session, now: number): HistoryEntry => {
  const closed = pauseSession(s, now)
  const timeCost = closed.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const timesCost = extraTimesCost(closed)
  const itemsCost = extraItemsCost(closed)
  return {
    id: uid(),
    sessionId: s.id,
    name: displayName(s),
    startedAt: closed.segments[0]?.from ?? now,
    endedAt: now,
    durationMs: elapsedMs(closed, now),
    segments: closed.segments,
    extraTimes: closed.extraTimes,
    extraItems: closed.extraItems,
    timeCost,
    extraTimesCost: timesCost,
    extraItemsCost: itemsCost,
    total: timeCost + timesCost + itemsCost,
  }
}

export const isDefaultName = (name: string) => /^دستگاه \d+$/.test(name)
