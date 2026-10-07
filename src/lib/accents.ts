export type Accent = 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose' | 'neutral'

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'neutral', label: 'خنثی', swatch: 'oklch(0.205 0 0)' },
  { id: 'red', label: 'قرمز', swatch: 'oklch(63.7% 0.237 25.331)' },
  { id: 'orange', label: 'نارنجی', swatch: 'oklch(70.5% 0.213 47.604)' },
  { id: 'amber', label: 'کهربایی', swatch: 'oklch(76.9% 0.188 70.08)' },
  { id: 'yellow', label: 'زرد', swatch: 'oklch(79.5% 0.184 86.047)' },
  { id: 'lime', label: 'لیمویی', swatch: 'oklch(76.8% 0.233 130.85)' },
  { id: 'green', label: 'سبز', swatch: 'oklch(72.3% 0.219 149.579)' },
  { id: 'emerald', label: 'زمردی', swatch: 'oklch(69.6% 0.17 162.48)' },
  { id: 'teal', label: 'سبزآبی', swatch: 'oklch(70.4% 0.14 182.503)' },
  { id: 'cyan', label: 'فیروزه‌ای', swatch: 'oklch(71.5% 0.143 215.221)' },
  { id: 'sky', label: 'آسمانی', swatch: 'oklch(68.5% 0.169 237.323)' },
  { id: 'blue', label: 'آبی', swatch: 'oklch(62.3% 0.214 259.815)' },
  { id: 'indigo', label: 'نیلی', swatch: 'oklch(58.5% 0.233 277.117)' },
  { id: 'violet', label: 'بنفش', swatch: 'oklch(60.6% 0.25 292.717)' },
  { id: 'purple', label: 'ارغوانی', swatch: 'oklch(62.7% 0.265 303.9)' },
  { id: 'fuchsia', label: 'سرخابی', swatch: 'oklch(66.7% 0.295 322.15)' },
  { id: 'pink', label: 'صورتی', swatch: 'oklch(65.6% 0.241 354.308)' },
  { id: 'rose', label: 'گلی', swatch: 'oklch(64.5% 0.246 16.439)' },
]
