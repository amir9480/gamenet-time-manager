import { groupByDay, summarize, type Summary } from '@/lib/history'
import {
  dayKey,
  jalaliWeekday,
  shiftDays,
  startOfDay,
  toFa,
  toJalali,
  type Range,
} from '@/lib/jalali'
import { extraTimeCost, segmentCost, type HistoryEntry } from '@/lib/store'

const extrasOf = (e: HistoryEntry) => e.extraTimesCost + e.extraItemsCost

// ---- KPIs -------------------------------------------------------------------

export type Kpis = Summary & {
  avgIncome: number
  avgDurationMs: number
  best: { key: string; total: number } | null
  peak: { hour: number; sessions: number } | null
}

export const kpis = (entries: HistoryEntry[]): Kpis => {
  const s = summarize(entries)
  const best = groupByDay(entries).reduce<Kpis['best']>(
    (b, g) => (!b || g.total > b.total ? { key: g.key, total: g.total } : b),
    null,
  )
  const peak = hourlySeries(entries).reduce<Kpis['peak']>(
    (p, h) => (h.sessions > 0 && (!p || h.sessions > p.sessions) ? h : p),
    null,
  )
  return {
    ...s,
    avgIncome: s.count ? s.total / s.count : 0,
    avgDurationMs: s.count ? s.durationMs / s.count : 0,
    best,
    peak: peak && { hour: peak.hour, sessions: peak.sessions },
  }
}

// % change, or null when there is nothing to compare against.
export const pctChange = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null

// The equally long range right before `range` (null for «all»).
export const previousRange = (range: Range): Range | null => {
  if (range.from <= 0) return null
  const days = Math.max(1, Math.round((startOfDay(range.to) - startOfDay(range.from)) / 86_400_000) + 1)
  const from = shiftDays(range.from, -days)
  return { from, to: range.from - 1 }
}

// ---- series -----------------------------------------------------------------

export type DayPoint = { key: string; label: string; time: number; extras: number }

const MAX_POINTS = 120

// One point per Jalali day (zero-filled); long ranges collapse to one point per Jalali month.
export const dailySeries = (entries: HistoryEntry[], range: Range): DayPoint[] => {
  if (!entries.length) return []
  const times = entries.map((e) => e.endedAt)
  const first = Math.max(range.from, Math.min(...times))
  const last = Math.min(range.to, Math.max(...times))

  const days: number[] = []
  for (let d = startOfDay(first); d <= last; d = shiftDays(d, 1)) days.push(d)

  const byMonth = days.length > MAX_POINTS
  const keyOf = (ts: number) => {
    if (!byMonth) return dayKey(ts)
    const { y, m } = toJalali(ts)
    return `${y}/${String(m).padStart(2, '0')}`
  }
  const points = new Map<string, DayPoint>()
  for (const d of days) {
    const key = keyOf(d)
    if (!points.has(key)) {
      const { m, d: day } = toJalali(d)
      points.set(key, {
        key,
        label: toFa(byMonth ? key : `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`),
        time: 0,
        extras: 0,
      })
    }
  }
  for (const e of entries) {
    const p = points.get(keyOf(e.endedAt))
    if (!p) continue
    p.time += e.timeCost
    p.extras += extrasOf(e)
  }
  return [...points.values()]
}

export type HourPoint = { hour: number; label: string; sessions: number; income: number }

export const hourlySeries = (entries: HistoryEntry[]): HourPoint[] => {
  const hours: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: toFa(String(hour).padStart(2, '0')),
    sessions: 0,
    income: 0,
  }))
  for (const e of entries) {
    const h = hours[new Date(e.startedAt).getHours()]
    h.sessions += 1
    h.income += e.total
  }
  return hours
}

const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

export type WeekdayPoint = { name: string; sessions: number; income: number }

export const weekdaySeries = (entries: HistoryEntry[]): WeekdayPoint[] => {
  const days: WeekdayPoint[] = WEEKDAYS.map((name) => ({ name, sessions: 0, income: 0 }))
  for (const e of entries) {
    const d = days[jalaliWeekday(new Date(startOfDay(e.endedAt)))]
    d.sessions += 1
    d.income += e.total
  }
  return days
}

export type NamePoint = { name: string; sessions: number; income: number }

export const NO_CUSTOMER = 'مشتری مهمان'

export const topCustomers = (entries: HistoryEntry[], limit = 10): NamePoint[] => {
  const map = new Map<string, NamePoint>()
  for (const e of entries) {
    const key = e.customerId ?? ''
    const p = map.get(key) ?? { name: e.customerName ?? NO_CUSTOMER, sessions: 0, income: 0 }
    p.sessions += 1
    p.income += e.total
    map.set(key, p)
  }
  return [...map.values()].sort((a, b) => b.income - a.income).slice(0, limit)
}

// Income per device category or device: each segment's time cost goes to its own device;
// extras (extra time + items) go to the session's last device.
const bySegment = (entries: HistoryEntry[], key: (seg: HistoryEntry['segments'][number]) => string) => {
  const map = new Map<string, NamePoint>()
  const add = (name: string, income: number, sessions = 0) => {
    const p = map.get(name) ?? { name, sessions: 0, income: 0 }
    p.income += income
    p.sessions += sessions
    map.set(name, p)
  }
  for (const e of entries) {
    const seen = new Set<string>()
    for (const seg of e.segments) {
      const k = key(seg)
      add(k, segmentCost(seg, e.endedAt), seen.has(k) ? 0 : 1)
      seen.add(k)
    }
    const last = e.segments[e.segments.length - 1]
    if (last) add(key(last), extrasOf(e))
  }
  return [...map.values()].filter((p) => p.income > 0).sort((a, b) => b.income - a.income)
}

export const byCategory = (entries: HistoryEntry[]) =>
  bySegment(entries, (seg) => seg.categoryName || '—')

export const byDevice = (entries: HistoryEntry[], limit = 12) =>
  bySegment(entries, (seg) => seg.deviceName || '—').slice(0, limit)

export type RatePoint = { name: string; income: number }

export const rateUsage = (entries: HistoryEntry[]): RatePoint[] => {
  const map = new Map<string, number>()
  const add = (name: string, v: number) => map.set(name, (map.get(name) ?? 0) + v)
  for (const e of entries) {
    for (const seg of e.segments) add(seg.typeName, segmentCost(seg, e.endedAt))
    for (const t of e.extraTimes) add(t.typeName, extraTimeCost(t))
  }
  return [...map.entries()]
    .map(([name, income]) => ({ name, income }))
    .filter((p) => p.income > 0)
    .sort((a, b) => b.income - a.income)
}

export type ItemPoint = { name: string; qty: number; income: number }

export const itemsSold = (entries: HistoryEntry[], limit = 10): ItemPoint[] => {
  const map = new Map<string, ItemPoint>()
  for (const e of entries) {
    for (const i of e.extraItems) {
      const p = map.get(i.name) ?? { name: i.name, qty: 0, income: 0 }
      p.qty += i.qty
      p.income += i.price * i.qty
      map.set(i.name, p)
    }
  }
  return [...map.values()].sort((a, b) => b.income - a.income).slice(0, limit)
}

