import { useEffect, useState } from 'react'
import type { Field } from '@/lib/search'
import { jalaliWeekday, startOfDay } from '@/lib/jalali'

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

// Time-of-day/weekday priced window that fully replaces whichever price is active (by price id)
// while it matches. `weekday` follows `jalaliWeekday` (0 = شنبه … 6 = جمعه). `endMin <= startMin`
// means the window crosses into the next day (e.g. 20:00 → 02:00). Order in `Settings.priceOverrides`
// is priority: the first matching override wins. Live sessions are cut at window edges and the
// price is stored on the segments (`splitByOverrides`), so history keeps what was charged.
export type PriceOverride = {
  id: string
  name?: string
  weekdays: number[]
  startMin: number
  endMin: number
  prices: Record<string, number>
}

export type Settings = {
  rateGroups: RateGroup[]
  deviceCategories: DeviceCategory[]
  devices: Device[]
  extraCategories: ExtraCategory[]
  extraItems: CatalogItem[]
  customers: Customer[]
  priceOverrides: PriceOverride[]
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
  // Set while this run falls inside a price override (see `splitByOverrides`): `price` is then
  // the override's price and `basePrice` the catalog price it replaced. Absent on older rows.
  overrideId?: string
  overrideName?: string
  basePrice?: number
}

// `catalogId` links an item to its catalog entry so Settings edits propagate to live
// sessions (see `applyExtraItems`); absent for the free-form «سایر هزینه‌ها».
export type ExtraItem = {
  id: string
  catalogId?: string
  name: string
  price: number
  qty: number
  description?: string
}

export type SessionPrepay = {
  id: string
  amount: number
  at: number
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
  extraItems: ExtraItem[]
  // Session-scoped prepay amounts collected before ending. For customer sessions this can be
  // turned into wallet credit/debit during settlement; for guests it is only session-local.
  prepayEntries?: SessionPrepay[]
  // Optional limits: independent of each other, either or both may be set. `limitMs` is a total
  // running-time budget (ms); the countdown is `limitMs - elapsedMs`, so pausing freezes it.
  // `costLimit` is a total cost budget (toman); the countdown is `costLimit - computeCost`.
  limitMs?: number
  costLimit?: number
  // Set for a reservation (created paused, no segments); orders it among the running sessions.
  reservedAt?: number
}

export const OTHER_ITEM_NAME = 'سایر هزینه‌ها'

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
    priceOverrides: [],
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
// Placeholder for when a device has no price at all (e.g. no rate group assigned).
export const EMPTY_PRICE: FlatPrice = { id: '', name: '—', price: 0, groupId: '', groupName: '' }

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
  // Both may be set at once; each works independently (see "limits" below).
  limit?: { minutes?: number; cost?: number },
  // Reserve the device: the session starts paused with an empty timer.
  reserve = false,
  // Money received before ending this session.
  prepayAmount?: number,
): Session => ({
  id: uid(),
  deviceId: device.id,
  deviceName: device.name,
  categoryName: category,
  customerId,
  status: reserve ? 'paused' : 'running',
  typeId: price.id,
  segments: reserve ? [] : [openSegment(price, device.id, device.name, category, now)],
  ...(reserve ? { reservedAt: now } : {}),
  extraItems: [],
  ...(prepayAmount && prepayAmount > 0
    ? { prepayEntries: [{ id: uid(), amount: prepayAmount, at: now }] }
    : {}),
  ...(limit?.minutes && limit.minutes > 0 ? { limitMs: limit.minutes * MINUTE_MS } : {}),
  ...(limit?.cost && limit.cost > 0 ? { costLimit: limit.cost } : {}),
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

// A paused session whose timer never ran (or is still at zero) counts as a reservation.
export const isReserved = (s: Session) =>
  s.status === 'paused' && s.segments.every((seg) => seg.to !== null && seg.to <= seg.from)

// Forgotten sessions: paused this long, or reserved this long without being started.
export const PAUSE_WARN_MS = 3_600_000
export const RESERVE_WARN_MS = 2 * 3_600_000

// How long the session has been idle (reserved, or paused since its last segment ended);
// undefined while running.
export const idleMs = (s: Session, now: number): number | undefined => {
  if (s.status !== 'paused') return undefined
  const since = isReserved(s) ? s.reservedAt : s.segments[s.segments.length - 1]?.to
  return since == null ? undefined : Math.max(0, now - since)
}

// The idle time when it passed the warning threshold, otherwise undefined.
export const forgottenMs = (s: Session, now: number): number | undefined => {
  const idle = idleMs(s, now)
  return idle !== undefined && idle >= (isReserved(s) ? RESERVE_WARN_MS : PAUSE_WARN_MS)
    ? idle
    : undefined
}

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

// ---- manual segment edits (correcting a mistake, not a timed transition) -----------

// Direct in-place correction of one segment's fields (start/end/price/device); unlike
// `changeType`/`switchDevice`, this never splits into a new segment.
export const updateSegment = (s: Session, index: number, patch: Partial<Segment>): Session => ({
  ...s,
  segments: s.segments.map((seg, i) => (i === index ? { ...seg, ...patch } : seg)),
})

// Appended at the end; never auto-sorted (editing from/to doesn't reorder the list).
export const addSegment = (s: Session, seg: Segment): Session => ({
  ...s,
  segments: [...s.segments, seg],
})

export const removeSegment = (s: Session, index: number): Session => ({
  ...s,
  segments: s.segments.filter((_, i) => i !== index),
})

// Adds backdated minutes before anything already recorded. Compares `device` against the
// OLDEST segment's device (not the running one, so this works the same whether the session is
// running or paused): same device just pushes that segment's start back; a different device
// prepends a new segment ending exactly where the old oldest segment began (no gap/overlap),
// billed at `price`. Using it again walks further into the past each time, since it always
// re-reads whatever the current oldest segment is.
export const addBackdatedTime = (
  s: Session,
  device: Device,
  category: string,
  price: FlatPrice,
  minutes: number,
): Session => {
  if (minutes <= 0 || s.segments.length === 0) return s
  const ms = minutes * MINUTE_MS
  const oldest = s.segments.reduce((min, seg) => (seg.from < min.from ? seg : min))
  if (device.id === oldest.deviceId) {
    return {
      ...s,
      segments: s.segments.map((seg) => (seg === oldest ? { ...seg, from: seg.from - ms } : seg)),
    }
  }
  const seg: Segment = {
    from: oldest.from - ms,
    to: oldest.from,
    typeId: price.id,
    typeName: price.name,
    price: price.price,
    deviceId: device.id,
    deviceName: device.name,
    categoryName: category,
  }
  return { ...s, segments: [seg, ...s.segments] }
}

// ---- cost -----------------------------------------------------------------

export const segmentMs = (seg: Segment, now: number) => Math.max(0, (seg.to ?? now) - seg.from)

export const elapsedMs = (s: Session, now: number) =>
  s.segments.reduce((sum, seg) => sum + segmentMs(seg, now), 0)

// Segments under this are ignored (billed as free): almost always a rapid price/device-switch
// artifact, not real usage.
export const MIN_BILLABLE_MS = 3_000

// ---- price overrides (weekday/time-of-day) ---------------------------------------
// Overrides are materialized into the segments themselves (see `splitByOverrides`): a segment
// never crosses an override boundary, and one that runs inside an override carries its price,
// `overrideId`/`overrideName` and the catalog `basePrice`. So every cost helper below just bills
// `seg.price`, the summary lists one line per price, and history snapshots stay correct.

const minutesOfDay = (ts: number) => (ts - startOfDay(ts)) / 60_000

const overrideMatches = (o: PriceOverride, ts: number): boolean => {
  const w = jalaliWeekday(new Date(ts))
  const m = minutesOfDay(ts)
  if (o.endMin > o.startMin) return o.weekdays.includes(w) && m >= o.startMin && m < o.endMin
  // Wraps past midnight: active from `startMin` to end of a picked weekday, then from 00:00 to
  // `endMin` on the following day.
  return (
    (o.weekdays.includes(w) && m >= o.startMin) ||
    (o.weekdays.includes((w + 6) % 7) && m < o.endMin)
  )
}

// First override (in priority order) with a price set for `typeId` whose window contains `ts`.
// An empty/zero price means "not overridden"; a price equal to `basePrice` counts as no override,
// so it never splits a line for nothing.
export const overrideAt = (
  overrides: PriceOverride[],
  typeId: string,
  basePrice: number,
  ts: number,
): { price: number; override: PriceOverride } | undefined => {
  for (const o of overrides) {
    const price = o.prices?.[typeId]
    if (!price || price <= 0 || !Array.isArray(o.weekdays)) continue
    if (overrideMatches(o, ts)) return price === basePrice ? undefined : { price, override: o }
  }
  return undefined
}

// The price charged for `typeId` at `ts` (the active override's, else `basePrice`). For showing
// a price "right now" (price pickers, add-session).
export const currentPrice = (
  typeId: string,
  basePrice: number,
  overrides: PriceOverride[],
  ts: number,
): number => overrideAt(overrides, typeId, basePrice, ts)?.price ?? basePrice

const DAY_MS = 86_400_000

// The next instant after `now` where any override starts or ends (undefined without overrides).
export const nextOverrideBoundary = (overrides: PriceOverride[], now: number): number | undefined => {
  let next: number | undefined
  for (let day = startOfDay(now), i = 0; i < 2; i++, day += DAY_MS) {
    for (const o of overrides) {
      for (const m of [o.startMin, o.endMin]) {
        const t = day + m * 60_000
        if (t > now && (next === undefined || t < next)) next = t
      }
    }
  }
  return next
}

type PriceSlice = { from: number; to: number; price: number; override?: PriceOverride }

// Splits [from, to) into contiguous slices of constant effective price. Candidate cuts are every
// override's start/end minute on every calendar day touched; each piece is resolved at its middle.
const priceSlices = (
  from: number,
  to: number,
  typeId: string,
  basePrice: number,
  overrides: PriceOverride[],
): PriceSlice[] => {
  const bounds = new Set<number>([from, to])
  for (let day = startOfDay(from); day < to; day += DAY_MS) {
    for (const o of overrides) {
      for (const m of [o.startMin, o.endMin]) {
        const t = day + m * 60_000
        if (t > from && t < to) bounds.add(t)
      }
    }
  }
  const sorted = [...bounds].sort((a, b) => a - b)
  const slices: PriceSlice[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const hit = overrideAt(overrides, typeId, basePrice, (a + b) / 2)
    const price = hit?.price ?? basePrice
    const last = slices[slices.length - 1]
    if (last && last.price === price && last.override?.id === hit?.override.id) last.to = b
    else slices.push({ from: a, to: b, price, override: hit?.override })
  }
  // A sliver under the billable minimum (e.g. started 2 s before a window opened) is absorbed by
  // the following slice instead of becoming its own free line.
  for (let i = 0; i < slices.length - 1; i++) {
    if (slices[i].to - slices[i].from < MIN_BILLABLE_MS) {
      slices[i + 1].from = slices[i].from
      slices.splice(i, 1)
      i--
    }
  }
  return slices
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const minToClock = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

export const overrideLabel = (o: PriceOverride) =>
  o.name?.trim() || `${minToClock(o.startMin)}–${minToClock(o.endMin)}`

// An override must change at least one price (an override equal to every catalog price, or with
// every price left empty, does nothing).
export const overrideChangesPrice = (o: PriceOverride, groups: RateGroup[]) =>
  flatPrices(groups).some((p) => {
    const price = o.prices[p.id]
    return !!price && price > 0 && price !== p.price
  })

const priced = (
  seg: Segment,
  from: number,
  to: number | null,
  price: number,
  override: PriceOverride | undefined,
  basePrice: number,
): Segment => {
  const { overrideId: _id, overrideName: _name, basePrice: _base, ...rest } = seg
  return {
    ...rest,
    from,
    to,
    price,
    ...(override ? { overrideId: override.id, overrideName: overrideLabel(override), basePrice } : {}),
  }
}

// Two lines that are really one: same device, price type, price and override, and at most 3
// seconds apart (compared in whole seconds, as the clock shows them; a small overlap from an
// edited time counts too). The gap is billed as part of the joined line.
const MERGE_GAP_S = MIN_BILLABLE_MS / 1000
const sameLine = (a: Segment, b: Segment) =>
  a.to !== null &&
  Math.abs(Math.floor(b.from / 1000) - Math.floor(a.to / 1000)) <= MERGE_GAP_S &&
  a.deviceId === b.deviceId &&
  a.typeId === b.typeId &&
  a.price === b.price &&
  a.overrideId === b.overrideId

// A closed piece too short to be billed (e.g. a quick price/device switch that was undone).
const isSliver = (seg: Segment) => seg.to !== null && seg.to - seg.from < MIN_BILLABLE_MS

// Smart splitter + joiner for live sessions. Every segment is cut at override boundaries and
// re-priced (catalog price outside overrides, the override's price inside), then neighbours that
// ended up identical (same device, price type, price and override, at most 3 s apart) are joined
// back into one line, e.g. after an override is deleted/edited or a window no longer applies.
// Pure and idempotent: returns `s` itself when nothing changes, so callers write only on change.
// History snapshots are never passed through it.
export const splitByOverrides = (
  s: Session,
  settings: Pick<Settings, 'rateGroups' | 'priceOverrides'>,
  now: number,
): Session => {
  if (s.segments.length === 0) return s
  const overrides = settings.priceOverrides ?? []
  const catalog = new Map(flatPrices(settings.rateGroups).map((p) => [p.id, p.price]))
  const split: Segment[] = []
  for (const seg of s.segments) {
    const base = catalog.get(seg.typeId) ?? seg.basePrice ?? seg.price
    const end = seg.to ?? now
    if (end <= seg.from) {
      const hit = overrideAt(overrides, seg.typeId, base, seg.from)
      split.push(priced(seg, seg.from, seg.to, hit?.price ?? base, hit?.override, base))
      continue
    }
    const slices = priceSlices(seg.from, end, seg.typeId, base, overrides)
    slices.forEach((sl, i) => {
      const to = i === slices.length - 1 ? seg.to : sl.to
      split.push(priced(seg, sl.from, to, sl.price, sl.override, base))
    })
  }
  const joined: Segment[] = []
  for (const seg of split) {
    // The last real line, looking past any unbilled slivers right before `seg` (A → tiny B →
    // tiny C → A: the slivers are dropped and both A lines become one).
    let i = joined.length - 1
    while (i >= 0 && isSliver(joined[i]) && !sameLine(joined[i], seg)) i--
    const prev = joined[i]
    if (prev && sameLine(prev, seg)) {
      const to = seg.to === null || prev.to === null ? null : Math.max(prev.to, seg.to)
      joined.splice(i, joined.length - i, { ...prev, to })
    } else {
      joined.push(seg)
    }
  }
  return JSON.stringify(joined) === JSON.stringify(s.segments) ? s : { ...s, segments: joined }
}

// Billed per whole second; any started toman counts (rounded up).
export const segmentCost = (seg: Segment, now: number) => {
  const ms = segmentMs(seg, now)
  if (ms < MIN_BILLABLE_MS) return 0
  return Math.ceil((Math.floor(ms / 1000) * seg.price) / 3600)
}

export const extraItemsCost = (s: Session) =>
  s.extraItems.reduce((sum, i) => sum + i.price * i.qty, 0)

export const computeCost = (s: Session, now: number) =>
  s.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0) + extraItemsCost(s)

// Time cost split into the normal-price part and one entry per override (from the override
// stored on each segment), for the end-session summary.
export type CostBreakdown = { base: number; overrides: { id: string; label: string; cost: number }[] }

export const sessionCostBreakdown = (s: Session, now: number): CostBreakdown => {
  const byOverride = new Map<string, { id: string; label: string; cost: number }>()
  let base = 0
  for (const seg of s.segments) {
    const cost = segmentCost(seg, now)
    if (!seg.overrideId) {
      base += cost
      continue
    }
    const row = byOverride.get(seg.overrideId) ?? { id: seg.overrideId, label: seg.overrideName ?? '', cost: 0 }
    row.cost += cost
    byOverride.set(seg.overrideId, row)
  }
  return { base, overrides: [...byOverride.values()].filter((x) => x.cost > 0) }
}

// ---- limits -----------------------------------------------------------------
// A session may have a time limit and a cost limit at once; each works independently of the
// other. Both freeze while paused (see `elapsedMs` / `computeCost`).

export const MINUTE_MS = 60_000

export type LimitKind = 'time' | 'cost'

// How much more to give a session with one click of «کمی بیشتر» on the alarm (configurable in
// Settings > عمومی, after the rounding settings).
export type QuickExtend = { minutes: number; cost: number }
export const DEFAULT_QUICK_EXTEND: QuickExtend = { minutes: 5, cost: 10_000 }

// Time left before the time limit (negative once exceeded); undefined without one.
export const remainingMs = (s: Session, now: number): number | undefined =>
  s.limitMs === undefined ? undefined : s.limitMs - elapsedMs(s, now)

// Amount left before the cost limit (negative once exceeded); undefined without one.
export const remainingCost = (s: Session, now: number): number | undefined =>
  s.costLimit === undefined ? undefined : s.costLimit - computeCost(s, now)

// Estimated running time left until the cost limit is reached. Walks forward minute by minute
// from `now`, charging each minute at the price it will have then (the catalog price, or the
// price override active in that minute), so an upcoming override window is accounted for.
// Negative once exceeded (overdue time at the current price); undefined without a cost limit,
// while not running, at a free price, or when the limit is more than 7 days away.
export const costLimitEtaMs = (
  s: Session,
  settings: Pick<Settings, 'rateGroups' | 'priceOverrides'>,
  now: number,
): number | undefined => {
  const remaining = remainingCost(s, now)
  const last = s.segments[s.segments.length - 1]
  if (remaining === undefined || s.status !== 'running' || !last || last.to !== null) return undefined
  if (remaining <= 0) return last.price > 0 ? (remaining / last.price) * 3_600_000 : undefined
  const base =
    flatPrices(settings.rateGroups).find((p) => p.id === last.typeId)?.price ??
    last.basePrice ??
    last.price
  const overrides = settings.priceOverrides ?? []
  const end = now + 7 * DAY_MS
  let left = remaining
  for (let t = now; t < end; ) {
    const next = Math.min(end, (Math.floor(t / MINUTE_MS) + 1) * MINUTE_MS)
    const rate = currentPrice(last.typeId, base, overrides, t)
    const cost = (rate * (next - t)) / 3_600_000
    if (rate > 0 && cost >= left) return t + (left / rate) * 3_600_000 - now
    left -= cost
    t = next
  }
  return undefined
}

// Sets the time limit so that `minutes` remain from now (the edit dialog shows the remaining
// time); the cost limit, if any, is untouched.
export const setTimeLimit = (s: Session, minutes: number, now: number): Session => ({
  ...s,
  limitMs: elapsedMs(s, now) + minutes * MINUTE_MS,
})

// Sets the cost limit so that `amount` toman remain from now; the time limit, if any, is
// untouched.
export const setCostLimit = (s: Session, amount: number, now: number): Session => ({
  ...s,
  costLimit: computeCost(s, now) + amount,
})

// Adds minutes to the time limit; an already exceeded limit extends from now, not from when it
// ended.
export const extendTimeLimit = (s: Session, minutes: number, now: number): Session => {
  if (s.limitMs === undefined) return s
  return { ...s, limitMs: Math.max(s.limitMs, elapsedMs(s, now)) + minutes * MINUTE_MS }
}

// Adds toman to the cost limit; an already exceeded limit extends from now.
export const extendCostLimit = (s: Session, amount: number, now: number): Session => {
  if (s.costLimit === undefined) return s
  return { ...s, costLimit: Math.max(s.costLimit, computeCost(s, now)) + amount }
}

export const clearTimeLimit = ({ limitMs: _limitMs, ...s }: Session): Session => s
export const clearCostLimit = ({ costLimit: _costLimit, ...s }: Session): Session => s

// ---- settings → live sessions ----------------------------------------------------

// Propagate edited prices to every live session's segments. Segments of deleted prices keep
// their values.
export const applyPrices = (sessions: Session[], groups: RateGroup[]): Session[] => {
  const byId = new Map(flatPrices(groups).map((t) => [t.id, t]))
  const sync = <T extends { typeId: string; typeName: string; price: number }>(x: T): T => {
    const t = byId.get(x.typeId)
    return t ? { ...x, typeName: t.name, price: t.price } : x
  }
  return sessions.map((s) => ({
    ...s,
    segments: s.segments.map(sync),
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

// `qty <= 0` removes the row (same as deleting it).
export const setExtraItemQty = (s: Session, id: string, qty: number): Session => ({
  ...s,
  extraItems:
    qty > 0
      ? s.extraItems.map((i) => (i.id === id ? { ...i, qty } : i))
      : s.extraItems.filter((i) => i.id !== id),
})

export const removeExtraItem = (s: Session, id: string): Session => ({
  ...s,
  extraItems: s.extraItems.filter((i) => i.id !== id),
})

export const prepayTotal = (s: Session) =>
  (s.prepayEntries ?? []).reduce((sum, x) => sum + x.amount, 0)

export const addSessionPrepay = (s: Session, amount: number, at: number): Session => {
  if (amount <= 0) return s
  return {
    ...s,
    prepayEntries: [...(s.prepayEntries ?? []), { id: uid(), amount, at }],
  }
}

export const removeSessionPrepay = (s: Session, id: string): Session => ({
  ...s,
  prepayEntries: (s.prepayEntries ?? []).filter((x) => x.id !== id),
})

// ---- what a live session still references (blocks deletion in Settings) -----------

export type Usage = {
  deviceIds: Set<string>
  customerIds: Set<string>
  priceIds: Set<string>
  extraItemIds: Set<string>
}

export const STORAGE_PREFIX = 'gamenet-time-manager:'

export const prefKey = (name: string) => `${STORAGE_PREFIX}${name}`

export const usageOf = (sessions: Session[]): Usage => ({
  deviceIds: new Set(sessions.map((s) => s.deviceId)),
  customerIds: new Set(sessions.flatMap((s) => (s.customerId ? [s.customerId] : []))),
  priceIds: new Set(sessions.map((s) => s.typeId)),
  extraItemIds: new Set(
    sessions.flatMap((s) => s.extraItems.flatMap((i) => (i.catalogId ? [i.catalogId] : []))),
  ),
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
  extraItems: ExtraItem[]
  timeCost: number
  extraItemsCost: number
  // Final income (what stats sum up). Equals the calculated cost unless it was edited when ending.
  total: number
  // The cost as calculated before an edit; only set when `total` differs from it.
  calculatedTotal?: number
  // نسیه: the customer did not pay when the session ended; `total` was added to their debt.
  onAccount?: boolean
  // Session-level prepay, for audit and guest settlement visibility.
  prepayTotal?: number
  prepayUsed?: number
  prepayReturned?: number
  // Wallet/credit usage at settlement.
  creditUsed?: number
  cashPaid?: number
}

// What a نسیه entry still left owed after the credit and prepay used at settlement (0 if paid).
export const historyDebt = (e: HistoryEntry) =>
  e.onAccount ? Math.max(0, e.total - (e.creditUsed ?? 0) - (e.prepayUsed ?? 0)) : 0

// Money a customer paid towards their debt (any amount, any time).
export type Payment = { id: string; customerId: string; amount: number; paidAt: number }

export type WalletTransactionKind =
  | 'legacy-debt'
  | 'legacy-payment'
  | 'session-debt'
  | 'session-credit-leftover'
  | 'manual-adjustment'

export type WalletTransaction = {
  id: string
  customerId: string
  amount: number
  at: number
  kind: WalletTransactionKind
  sessionId?: string
  note?: string
}

export type SessionSettlement = {
  total: number
  walletCreditUsed: number
  prepayUsed: number
  payableNow: number
  prepayReturned: number
}

export const settleSessionAmount = (
  total: number,
  walletBalance: number,
  sessionPrepay: number,
): SessionSettlement => {
  const walletCredit = Math.max(0, walletBalance)
  const walletCreditUsed = Math.min(walletCredit, Math.max(0, total))
  const afterWallet = Math.max(0, total - walletCreditUsed)
  const prepayUsed = Math.min(Math.max(0, sessionPrepay), afterWallet)
  return {
    total,
    walletCreditUsed,
    prepayUsed,
    payableNow: Math.max(0, total - walletCreditUsed - prepayUsed),
    prepayReturned: Math.max(0, sessionPrepay - prepayUsed),
  }
}

const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))]

export const buildHistoryEntry = (
  s: Session,
  customer: Customer | undefined,
  now: number,
  // Final amount typed by the user when ending; overrides the calculated cost.
  finalTotal?: number,
  // Put the amount on the customer's account instead of being paid now (needs a customer).
  onAccount?: boolean,
  // Optional settlement details for payment/credit/prepay visibility.
  settlement?: Partial<Pick<HistoryEntry, 'prepayUsed' | 'prepayReturned' | 'creditUsed' | 'cashPaid'>>,
): HistoryEntry => {
  const closed = pauseSession(s, now)
  const timeCost = closed.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const itemsCost = extraItemsCost(closed)
  const calculated = timeCost + itemsCost
  const total = finalTotal ?? calculated
  const prepay = prepayTotal(closed)
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
    extraItems: closed.extraItems,
    timeCost,
    extraItemsCost: itemsCost,
    total,
    ...(prepay > 0 ? { prepayTotal: prepay } : {}),
    ...(total !== calculated ? { calculatedTotal: calculated } : {}),
    ...(onAccount && customer ? { onAccount: true } : {}),
    ...(settlement?.prepayUsed !== undefined ? { prepayUsed: settlement.prepayUsed } : {}),
    ...(settlement?.prepayReturned !== undefined
      ? { prepayReturned: settlement.prepayReturned }
      : {}),
    ...(settlement?.creditUsed !== undefined ? { creditUsed: settlement.creditUsed } : {}),
    ...(settlement?.cashPaid !== undefined ? { cashPaid: settlement.cashPaid } : {}),
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
  s.status === 'running' ? 'در حال بازی' : isReserved(s) ? 'رزرو' : 'متوقف',
  ...s.segments.map((x) => `${x.typeName} ${x.price}`),
  ...s.extraItems.map((i) => `${i.name} ${i.description ?? ''} ${i.price}`),
  String(computeCost(s, now)),
]

// ---- final-amount rounding ----------------------------------------------------

export type RoundMode = 'round' | 'floor' | 'ceil'
// `auto`: ending a session pre-fills the final amount already rounded.
export type Rounding = { step: number; mode: RoundMode; auto: boolean }

export const DEFAULT_ROUNDING: Rounding = { step: 1000, mode: 'round', auto: true }

export const ROUND_MODE_LABELS: Record<RoundMode, string> = {
  round: 'نزدیک‌ترین',
  floor: 'رو به پایین',
  ceil: 'رو به بالا',
}

// Rounds an amount to a multiple of `step` toman.
export const roundAmount = (amount: number, { step, mode }: Rounding) =>
  step > 0 ? Math[mode](amount / step) * step : amount
