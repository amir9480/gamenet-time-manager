import { useEffect, useState } from 'react'
import type { Field } from '@/lib/search'

// ---- catalog types ------------------------------------------------------------

export type Price = { id: string; name: string; price: number }

// A named group of per-hour prices (e.g. «نرخ پی‌سی») with one default price.
export type RateGroup = { id: string; name: string; prices: Price[]; defaultPriceId: string }

// A price flattened out of its group; this is what segments/extra times mirror.
export type FlatPrice = Price & { groupId: string; groupName: string }

export type DeviceCategory = { id: string; name: string }

// A device can be billed with the prices of every rate group in `rateIds`.
export type Device = { id: string; categoryId: string; name: string; rateIds: string[] }

export type ExtraCategory = { id: string; name: string }

export type CatalogItem = { id: string; name: string; price: number; categoryId: string }

export type Customer = { id: string; name: string; phone?: string }

export type Settings = {
  rateGroups: RateGroup[]
  deviceCategories: DeviceCategory[]
  devices: Device[]
  extraCategories: ExtraCategory[]
  extraItems: CatalogItem[]
  customers: Customer[]
}

// ---- session types ----------------------------------------------------------

// One continuous run on one device at a single price. `typeName`/`price` mirror the price
// `typeId`, `deviceName`/`categoryName` mirror the device; editing them in Settings rewrites
// them everywhere (see `applyPrices` / `applyDevices`). If the source was deleted the last
// values are kept.
export type Segment = {
  from: number
  to: number | null
  typeId: string
  typeName: string
  price: number
  deviceId: string
  deviceName: string
  categoryName: string
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

// Manually added minutes, billed at the price chosen when added.
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
  // Current device (snapshots of its name/category are kept in sync by `applyDevices`).
  deviceId: string
  deviceName: string
  categoryName: string
  customerId?: string
  status: 'running' | 'paused'
  typeId: string
  segments: Segment[]
  extraTimes: ExtraTime[]
  extraItems: ExtraItem[]
  // Optional time limit: total running time (ms) the customer may use. The countdown is
  // `limitMs - elapsedMs`, so pausing freezes it.
  limitMs?: number
}

export const OTHER_ITEM_NAME = 'موارد دیگر'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// ---- defaults -----------------------------------------------------------------

export const defaultSettings = (): Settings => {
  const prices: Price[] = ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'].map((name, i) => ({
    id: uid(),
    name,
    price: (i + 1) * 1000,
  }))
  const cat = (name: string) => ({ id: uid(), name })
  const extraCategories = ['خوراکی', 'نوشیدنی سرد', 'نوشیدنی گرم', 'قهوه', 'سیگار و قلیان'].map(cat)
  const byName = (n: string) => extraCategories.find((c) => c.name === n)!.id
  return {
    rateGroups: [{ id: uid(), name: 'نرخ عمومی', prices, defaultPriceId: prices[1].id }],
    deviceCategories: ['پی‌سی', 'پلی‌استیشن', 'بیلیارد', 'پینگ‌پنگ'].map(cat),
    devices: [],
    extraCategories,
    extraItems: [
      { id: uid(), name: 'نوشابه', price: 1000, categoryId: byName('نوشیدنی سرد') },
      { id: uid(), name: 'چیپس', price: 2000, categoryId: byName('خوراکی') },
      { id: uid(), name: 'کیک', price: 500, categoryId: byName('خوراکی') },
    ],
    customers: [],
  }
}

// ---- prices & devices ---------------------------------------------------------

export const flatPrices = (groups: RateGroup[]): FlatPrice[] =>
  groups.flatMap((g) => g.prices.map((p) => ({ ...p, groupId: g.id, groupName: g.name })))

// The device's rate groups (in the order they were assigned) with their prices.
export const devicePriceGroups = (device: Device | undefined, groups: RateGroup[]): RateGroup[] =>
  device
    ? device.rateIds.flatMap((id) => groups.filter((g) => g.id === id && g.prices.length > 0))
    : []

export const devicePrices = (device: Device | undefined, groups: RateGroup[]): FlatPrice[] =>
  flatPrices(devicePriceGroups(device, groups))

// Default price of the device's first rate group.
export const defaultPriceFor = (
  device: Device | undefined,
  groups: RateGroup[],
): FlatPrice | undefined => {
  const prices = devicePrices(device, groups)
  const first = devicePriceGroups(device, groups)[0]
  return prices.find((p) => p.id === first?.defaultPriceId) ?? prices[0]
}

export const deviceOf = (settings: Settings, s: Session) =>
  settings.devices.find((d) => d.id === s.deviceId)

// Falls back to the device default if the session's price was deleted in Settings.
export const selectedPrice = (settings: Settings, s: Session): FlatPrice => {
  const device = deviceOf(settings, s)
  const own = devicePrices(device, settings.rateGroups)
  const pick =
    own.find((p) => p.id === s.typeId) ??
    flatPrices(settings.rateGroups).find((p) => p.id === s.typeId) ??
    defaultPriceFor(device, settings.rateGroups)
  const last = s.segments[s.segments.length - 1]
  return (
    pick ?? {
      id: s.typeId,
      name: last?.typeName ?? '—',
      price: last?.price ?? 0,
      groupId: '',
      groupName: '',
    }
  )
}

export const categoryName = (settings: Settings, device: Device) =>
  settings.deviceCategories.find((c) => c.id === device.categoryId)?.name ?? ''

export const freeDevices = (devices: Device[], sessions: Session[]) => {
  const used = new Set(sessions.map((s) => s.deviceId))
  return devices.filter((d) => !used.has(d.id))
}

// ---- sessions ---------------------------------------------------------------

export const createSession = (
  device: Device,
  category: string,
  price: FlatPrice,
  customerId: string | undefined,
  now: number,
  limitMinutes?: number,
): Session => ({
  id: uid(),
  deviceId: device.id,
  deviceName: device.name,
  categoryName: category,
  customerId,
  status: 'running',
  typeId: price.id,
  segments: [openSegment(price, device.id, device.name, category, now)],
  extraTimes: [],
  extraItems: [],
  ...(limitMinutes && limitMinutes > 0 ? { limitMs: limitMinutes * MINUTE_MS } : {}),
})

const closeOpen = (segments: Segment[], now: number): Segment[] =>
  segments.map((seg) => (seg.to === null ? { ...seg, to: now } : seg))

const openSegment = (
  price: Price,
  deviceId: string,
  deviceName: string,
  categoryName: string,
  now: number,
): Segment => ({
  from: now,
  to: null,
  typeId: price.id,
  typeName: price.name,
  price: price.price,
  deviceId,
  deviceName,
  categoryName,
})

const openOnSession = (s: Session, price: Price, now: number) =>
  openSegment(price, s.deviceId, s.deviceName, s.categoryName, now)

export const resumeSession = (settings: Settings, s: Session, now: number): Session => {
  const price = selectedPrice(settings, s)
  return {
    ...s,
    status: 'running',
    typeId: price.id,
    segments: [...s.segments, openOnSession(s, price, now)],
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
  const price = flatPrices(settings.rateGroups).find((p) => p.id === typeId)
  if (!price) return s
  if (s.status !== 'running') return { ...s, typeId }
  return {
    ...s,
    typeId,
    segments: [...closeOpen(s.segments, now), openOnSession(s, price, now)],
  }
}

// Moves the session to another device: a running session closes its segment and opens a new
// one on the new device; a paused one just remembers the device/price for the next resume.
export const switchDevice = (
  s: Session,
  device: Device,
  category: string,
  price: FlatPrice,
  now: number,
): Session => {
  const next = { ...s, deviceId: device.id, deviceName: device.name, categoryName: category, typeId: price.id }
  if (s.status !== 'running') return next
  return {
    ...next,
    segments: [...closeOpen(s.segments, now), openOnSession(next, price, now)],
  }
}

// ---- cost -----------------------------------------------------------------

export const segmentMs = (seg: Segment, now: number) => Math.max(0, (seg.to ?? now) - seg.from)

export const elapsedMs = (s: Session, now: number) =>
  s.segments.reduce((sum, seg) => sum + segmentMs(seg, now), 0)

// ---- time limit -----------------------------------------------------------------

export const MINUTE_MS = 60_000

// Time left before the limit (negative once exceeded); undefined without a limit.
export const remainingMs = (s: Session, now: number): number | undefined =>
  s.limitMs === undefined ? undefined : s.limitMs - elapsedMs(s, now)

// A running session that used up its limit (a paused one is not alarming).
export const limitReached = (s: Session, now: number) =>
  s.status === 'running' && (remainingMs(s, now) ?? 1) <= 0

// Sets the limit so that `minutes` remain from now (the edit dialog shows the remaining time).
export const setLimit = (s: Session, minutes: number, now: number): Session => ({
  ...s,
  limitMs: elapsedMs(s, now) + minutes * MINUTE_MS,
})

// Adds time to the limit; an already exceeded limit extends from now, not from when it ended.
export const extendLimit = (s: Session, minutes: number, now: number): Session => {
  if (s.limitMs === undefined) return s
  return { ...s, limitMs: Math.max(s.limitMs, elapsedMs(s, now)) + minutes * MINUTE_MS }
}

export const clearLimit = ({ limitMs: _limit, ...s }: Session): Session => s

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

// ---- settings → live sessions ----------------------------------------------------

// Propagate edited prices to every live session (past segments, the running one and
// extra-time entries). Entries of deleted prices keep their values.
export const applyPrices = (sessions: Session[], groups: RateGroup[]): Session[] => {
  const byId = new Map(flatPrices(groups).map((t) => [t.id, t]))
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

// Propagate renamed devices/categories to live sessions.
export const applyDevices = (
  sessions: Session[],
  devices: Device[],
  categories: DeviceCategory[],
): Session[] => {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const catName = (id: string) => categories.find((c) => c.id === id)?.name
  return sessions.map((s) => {
    const sync = <T extends { deviceId: string; deviceName: string; categoryName: string }>(
      x: T,
    ): T => {
      const d = byId.get(x.deviceId)
      return d ? { ...x, deviceName: d.name, categoryName: catName(d.categoryId) ?? x.categoryName } : x
    }
    return { ...sync(s), segments: s.segments.map(sync) }
  })
}

// Propagate edited catalog items (name/price) to extra items on live sessions.
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

// ---- what a live session still references (blocks deletion in Settings) -----------

export type Usage = { deviceIds: Set<string>; customerIds: Set<string>; priceIds: Set<string> }

export const usageOf = (sessions: Session[]): Usage => ({
  deviceIds: new Set(sessions.map((s) => s.deviceId)),
  customerIds: new Set(sessions.flatMap((s) => (s.customerId ? [s.customerId] : []))),
  priceIds: new Set(sessions.map((s) => s.typeId)),
})

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
  deviceNames: string[]
  categoryNames: string[]
  customerId?: string
  customerName?: string
  customerPhone?: string
  startedAt: number
  endedAt: number
  durationMs: number
  segments: Segment[]
  extraTimes: ExtraTime[]
  extraItems: ExtraItem[]
  timeCost: number
  extraTimesCost: number
  extraItemsCost: number
  // Final income (what stats sum up). Equals the calculated cost unless it was edited when ending.
  total: number
  // The cost as calculated before an edit; only set when `total` differs from it.
  calculatedTotal?: number
  // نسیه: the customer did not pay when the session ended; `total` was added to their debt.
  onAccount?: boolean
}

// Money a customer paid towards their debt (any amount, any time).
export type Payment = { id: string; customerId: string; amount: number; paidAt: number }

const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))]

export const buildHistoryEntry = (
  s: Session,
  customer: Customer | undefined,
  now: number,
  // Final amount typed by the user when ending; overrides the calculated cost.
  finalTotal?: number,
  // Put the amount on the customer's account instead of being paid now (needs a customer).
  onAccount?: boolean,
): HistoryEntry => {
  const closed = pauseSession(s, now)
  const timeCost = closed.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const timesCost = extraTimesCost(closed)
  const itemsCost = extraItemsCost(closed)
  const calculated = timeCost + timesCost + itemsCost
  const total = finalTotal ?? calculated
  return {
    id: uid(),
    sessionId: s.id,
    deviceNames: distinct(closed.segments.map((g) => g.deviceName)),
    categoryNames: distinct(closed.segments.map((g) => g.categoryName)),
    customerId: customer?.id,
    customerName: customer?.name,
    customerPhone: customer?.phone,
    startedAt: closed.segments[0]?.from ?? now,
    endedAt: now,
    durationMs: elapsedMs(closed, now),
    segments: closed.segments,
    extraTimes: closed.extraTimes,
    extraItems: closed.extraItems,
    timeCost,
    extraTimesCost: timesCost,
    extraItemsCost: itemsCost,
    total,
    ...(total !== calculated ? { calculatedTotal: calculated } : {}),
    ...(onAccount && customer ? { onAccount: true } : {}),
  }
}

// ---- search -----------------------------------------------------------------

// Everything a running session can be searched by (see `rank` in search.ts): device, type and
// customer weigh most; status, prices, extras and the current total less.
export const sessionSearchFields = (
  s: Session,
  customer: Customer | undefined,
  now: number,
): Field[] => [
  { text: s.deviceName, weight: 3 },
  { text: s.categoryName, weight: 2 },
  { text: customer?.name ?? '', weight: 3 },
  customer?.phone ?? '',
  s.status === 'running' ? 'در حال بازی' : 'متوقف',
  ...s.segments.map((x) => `${x.typeName} ${x.price}`),
  ...s.extraTimes.map((t) => `${t.name} ${t.typeName} ${t.minutes}`),
  ...s.extraItems.map((i) => `${i.name} ${i.description ?? ''} ${i.price}`),
  String(computeCost(s, now)),
]

// ---- final-amount rounding ----------------------------------------------------

export type RoundMode = 'round' | 'floor' | 'ceil'
export type Rounding = { step: number; mode: RoundMode }

export const DEFAULT_ROUNDING: Rounding = { step: 1000, mode: 'round' }

export const ROUND_MODE_LABELS: Record<RoundMode, string> = {
  round: 'نزدیک‌ترین',
  floor: 'رو به پایین',
  ceil: 'رو به بالا',
}

// Rounds an amount to a multiple of `step` toman.
export const roundAmount = (amount: number, { step, mode }: Rounding) =>
  step > 0 ? Math[mode](amount / step) * step : amount
