import { uid, type Settings } from '@/lib/store'

// Offered by the onboarding dialog; the user ticks what applies to their shop.

export type DeviceSample = {
  id: string
  name: string // category name
  prefix: string // device name prefix: «پی‌سی 1», «پی‌سی 2», …
  priceNames?: string[] // suggested price names; default is a single «نرخ <type>»
  checked: boolean
}

export const DEVICE_SAMPLES: DeviceSample[] = [
  { id: 'pc', name: 'پی‌سی', prefix: 'پی‌سی', priceNames: ['اقتصادی', 'گیمینگ', 'آنلاین'], checked: true },
  { id: 'ps3', name: 'پلی‌استیشن 3', prefix: 'پلی‌استیشن 3 شماره', priceNames: ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'], checked: false },
  { id: 'ps4', name: 'پلی‌استیشن 4', prefix: 'پلی‌استیشن 4 شماره', priceNames: ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'], checked: true },
  { id: 'ps5', name: 'پلی‌استیشن 5', prefix: 'پلی‌استیشن 5 شماره', priceNames: ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'], checked: true },
  { id: 'xbox360', name: 'ایکس‌باکس 360', prefix: 'ایکس‌باکس 360 شماره', priceNames: ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'], checked: false },
  { id: 'xboxone', name: 'ایکس‌باکس وان', prefix: 'ایکس‌باکس وان شماره', priceNames: ['یک دسته', 'دو دسته', 'سه دسته', 'چهار دسته'], checked: false },
  { id: 'billiard', name: 'بیلیارد', prefix: 'بیلیارد', checked: true },
  { id: 'pingpong', name: 'پینگ‌پنگ', prefix: 'پینگ‌پنگ', checked: true },
  { id: 'foosball', name: 'فوتبال دستی', prefix: 'فوتبال دستی', checked: false },
  { id: 'airhockey', name: 'ایر هاکی', prefix: 'ایر هاکی', priceNames: ['دو دسته', 'چهار دسته'], checked: false },
  { id: 'vr', name: 'واقعیت مجازی', prefix: 'VR', checked: false },
]

export type ExtraSample = {
  id: string
  name: string // extra category name
  items: string[] // sample item names; prices are entered by the user
  checked: boolean
}

export const EXTRA_SAMPLES: ExtraSample[] = [
  {
    id: 'food',
    name: 'خوراکی',
    checked: true,
    items: [
      'چیپس',
      'پفک',
      'کیک',
      'بیسکویت',
    ],
  },
  {
    id: 'cold',
    name: 'نوشیدنی سرد',
    checked: true,
    items: [
      'نوشابه',
      'لیموناد',
      'آب معدنی',
      'نوشیدنی انرژی‌زا',
    ],
  },
  {
    id: 'hot',
    name: 'نوشیدنی گرم',
    checked: true,
    items: [
      'چای',
      'نسکافه',
      'هات چاکلت',
    ],
  },
  {
    id: 'coffee',
    name: 'قهوه',
    checked: true,
    items: [
      'اسپرسو',
      'کاپوچینو',
      'لاته',
      'قهوه ترک',
    ],
  },
  {
    id: 'hookah',
    name: 'سیگار و قلیان',
    checked: false,
    items: [
      'قلیان',
      'سیگار',
    ],
  },
]

export const DEFAULT_HOURLY_PRICE = 100_000

export type OnboardingItem = { id: string; name: string; price: number }

export type OnboardingChoice = {
  devices: Record<string, { checked: boolean; count: number; prices: OnboardingItem[] }>
  // Which extra categories are used, and their (editable) items.
  extras: Record<string, boolean>
  items: Record<string, OnboardingItem[]>
}

export const defaultChoice = (): OnboardingChoice => ({
  devices: Object.fromEntries(
    DEVICE_SAMPLES.map((d) => [
        d.id,
        {
          checked: d.checked,
          count: 0,
          prices: (d.priceNames ?? [`نرخ ${d.name}`]).map((name) => ({
            id: uid(),
            name,
            price: DEFAULT_HOURLY_PRICE,
          })),
        },
      ]),
  ),
  extras: Object.fromEntries(EXTRA_SAMPLES.map((e) => [e.id, e.checked])),
  items: Object.fromEntries(
    EXTRA_SAMPLES.map((e) => [e.id, e.items.map((name) => ({ id: uid(), name, price: 0 }))]),
  ),
})

// Replaces device categories/devices and extra categories/items with the user's choice;
// customers are kept. Each chosen device type gets its own rate group («نرخ <type>») with one
// list of hourly prices, used by all devices of that type. Without any device type the rate groups stay.
export const settingsFromChoice = (base: Settings, choice: OnboardingChoice): Settings => {
  const rateGroups: Settings['rateGroups'] = []

  const deviceCategories: Settings['deviceCategories'] = []
  const devices: Settings['devices'] = []
  for (const d of DEVICE_SAMPLES) {
    const c = choice.devices[d.id]
    if (!c?.checked || c.count < 1 || c.prices.length < 1) continue
    const category = { id: uid(), name: d.name }
    deviceCategories.push(category)
    const prices = c.prices.map((p) => ({ id: uid(), name: p.name.trim(), price: p.price }))
    const group = { id: uid(), name: `نرخ ${d.name}`, prices }
    rateGroups.push(group)
    for (let n = 1; n <= c.count; n++) {
      devices.push({ id: uid(), categoryId: category.id, name: `${d.prefix} ${n}`, rateIds: [group.id] })
    }
  }

  const extraCategories: Settings['extraCategories'] = []
  const extraItems: Settings['extraItems'] = []
  for (const e of EXTRA_SAMPLES) {
    if (!choice.extras[e.id]) continue
    const category = { id: uid(), name: e.name }
    extraCategories.push(category)
    for (const i of choice.items[e.id] ?? [])
      extraItems.push({ id: uid(), name: i.name.trim(), price: i.price, categoryId: category.id })
  }
  // Settings always needs at least one extra category.
  if (extraCategories.length === 0) extraCategories.push({ id: uid(), name: 'عمومی' })

  return {
    ...base,
    rateGroups: rateGroups.length ? rateGroups : base.rateGroups,
    deviceCategories,
    devices,
    extraCategories,
    extraItems,
  }
}
