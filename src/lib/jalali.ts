// Jalali (Persian) calendar helpers built on Intl; dates/clock use Persian digits.

export type JDate = { y: number; m: number; d: number }

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

// Saturday-first week, as used in Iran.
export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

const DAY = 86_400_000

export const toFa = (v: string | number) =>
  String(v).replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)))

const pad = (n: number) => String(n).padStart(2, '0')

const partsFormat = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

export const toJalali = (ts: number): JDate => {
  const p = partsFormat.formatToParts(ts)
  const get = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? '0', 10)
  return { y: get('year'), m: get('month'), d: get('day') }
}

const cmp = (a: JDate, b: JDate) => a.y - b.y || a.m - b.m || a.d - b.d

// Local midnight of the given Jalali day. Starts from an estimate and walks to the exact day.
export const jalaliToDate = ({ y, m, d }: JDate): Date => {
  const target = { y, m, d }
  const est = new Date(y + 621, 2, 21, 12)
  est.setDate(est.getDate() + Math.round((m - 1) * 30.44 + (d - 1)))
  for (let i = 0; i < 40; i++) {
    const diff = cmp(toJalali(est.getTime()), target)
    if (diff === 0) break
    est.setDate(est.getDate() + (diff > 0 ? -1 : 1))
  }
  est.setHours(0, 0, 0, 0)
  return est
}

export const daysInJalaliMonth = (y: number, m: number) => {
  const next = m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 }
  return Math.round(
    (jalaliToDate(next).getTime() - jalaliToDate({ y, m, d: 1 }).getTime()) / DAY,
  )
}

// 0 = Saturday … 6 = Friday
export const jalaliWeekday = (date: Date) => (date.getDay() + 1) % 7

export const startOfDay = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Calendar-day shift (to local midnight) that survives DST changes.
export const shiftDays = (ts: number, days: number) => {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return startOfDay(d.getTime())
}

export const endOfDay = (ts: number) => shiftDays(ts, 1) - 1

export const dayKey = (ts: number) => {
  const { y, m, d } = toJalali(ts)
  return `${y}/${pad(m)}/${pad(d)}`
}

export const formatJalaliDate = (ts: number) => toFa(dayKey(ts))

export const formatJalaliClock = (ts: number, seconds = true) => {
  const d = new Date(ts)
  const parts = [d.getHours(), d.getMinutes(), ...(seconds ? [d.getSeconds()] : [])]
  return toFa(parts.map(pad).join(':'))
}

export const WEEKDAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

export const formatJalaliLong = (ts: number) => {
  const { y, m, d } = toJalali(ts)
  return `${WEEKDAY_NAMES[jalaliWeekday(new Date(ts))]} ${toFa(d)} ${JALALI_MONTHS[m - 1]} ${toFa(y)}`
}

export const formatMonthYear = (y: number, m: number) => `${JALALI_MONTHS[m - 1]} ${toFa(y)}`

// ---- ranges used by the history filter ---------------------------------------

export type Range = { from: number; to: number }

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'all'

export const presetRange = (preset: Preset, now = Date.now()): Range => {
  const today = startOfDay(now)
  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) }
    case 'yesterday': {
      const y = shiftDays(today, -1)
      return { from: y, to: endOfDay(y) }
    }
    case 'week':
      return { from: shiftDays(today, -jalaliWeekday(new Date(today))), to: endOfDay(now) }
    case 'month': {
      const { y, m } = toJalali(now)
      return { from: jalaliToDate({ y, m, d: 1 }).getTime(), to: endOfDay(now) }
    }
    case 'all':
      return { from: 0, to: Number.MAX_SAFE_INTEGER }
  }
}

export const formatJalaliDateTime = (ts: number) =>
  `${formatJalaliDate(ts)} ${formatJalaliClock(ts)}`
