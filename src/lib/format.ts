import { toFa } from '@/lib/jalali'

export const formatNumber = (n: number) =>
  Math.round(n).toLocaleString('en-US')

// Accepts Persian/Arabic digits and separators, returns a non-negative number.
export const parseNumber = (value: string) => {
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬\s]/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

// «۱ ساعت و ۵ دقیقه» (Persian digits, minutes precision).
export const formatIdle = (ms: number) => {
  const mins = Math.floor(ms / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const parts = [h > 0 ? `${toFa(h)} ساعت` : '', h === 0 || m > 0 ? `${toFa(m)} دقیقه` : '']
  return parts.filter(Boolean).join(' و ')
}

export const formatClock = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour12: false })
