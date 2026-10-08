import { dayKey } from '@/lib/jalali'
import type { HistoryEntry } from '@/lib/store'

export type DayGroup = {
  key: string
  entries: HistoryEntry[]
  total: number
  durationMs: number
}

export type Summary = {
  count: number
  durationMs: number
  total: number
  timeCost: number
  extrasCost: number
}

// Entries must already be sorted newest first.
export const groupByDay = (entries: HistoryEntry[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>()
  for (const e of entries) {
    const key = dayKey(e.endedAt)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, entries: [], total: 0, durationMs: 0 }))
    g.entries.push(e)
    g.total += e.total
    g.durationMs += e.durationMs
  }
  return [...groups.values()]
}

export const summarize = (entries: HistoryEntry[]): Summary =>
  entries.reduce<Summary>(
    (s, e) => ({
      count: s.count + 1,
      durationMs: s.durationMs + e.durationMs,
      total: s.total + e.total,
      timeCost: s.timeCost + e.timeCost,
      extrasCost: s.extrasCost + e.extraItemsCost,
    }),
    { count: 0, durationMs: 0, total: 0, timeCost: 0, extrasCost: 0 },
  )

export const DAYS_PER_PAGE = 7

export const pageCount = (groups: DayGroup[]) => Math.max(1, Math.ceil(groups.length / DAYS_PER_PAGE))

export const pageGroups = (groups: DayGroup[], page: number) =>
  groups.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE)

// ---- shift ------------------------------------------------------------------

// The shift summary replaces the welcome page while the last ended session is this recent.
export const SHIFT_VISIBLE_MS = 2 * 3_600_000
// A longer pause between two ended sessions starts a new shift.
const SHIFT_GAP_MS = 4 * 3_600_000

// The current shift: the run of ended sessions up to the latest one, or null when the latest
// ended more than `visibleMs` ago. `entries` must be sorted newest first.
export const currentShift = (
  entries: HistoryEntry[],
  now: number,
  visibleMs = SHIFT_VISIBLE_MS,
): HistoryEntry[] | null => {
  if (!entries.length || entries[0].endedAt < now - visibleMs) return null
  const shift = [entries[0]]
  let start = entries[0].startedAt
  for (const e of entries.slice(1)) {
    if (e.endedAt < start - SHIFT_GAP_MS) break
    shift.push(e)
    start = Math.min(start, e.startedAt)
  }
  return shift
}
