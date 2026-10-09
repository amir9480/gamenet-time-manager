import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowLeftRight, ArrowRight, CalendarClock, Play } from 'lucide-react'
import { Tip } from '@/components/tip'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CustomerSelect } from '@/components/customer-select'
import { useDiscardGuard } from '@/components/discard-dialog'
import { MinutesInput } from '@/components/ui/minutes-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { MoneyInput } from '@/components/ui/money-input'
import { requestNotificationPermission } from '@/lib/attention'
import { isTourActive, registerTour, tourEl, tourSel, type TourContext, type TourDef } from '@/lib/tour'
import type { DriveStep } from 'driver.js'
import { formatNumber, parseNumber } from '@/lib/format'
import { toFa } from '@/lib/jalali'
import { rank, type Field } from '@/lib/search'
import {
  categoryName,
  currentPrice,
  devicePriceGroups,
  devicePrices,
  flatPrices,
  freeDevices,
  type Device,
  type FlatPrice,
  type Session,
  type Settings,
} from '@/lib/store'
import { cn } from '@/lib/utils'

type StepKey = 'category' | 'device' | 'rate' | 'customer'
const FULL_ORDER: StepKey[] = ['category', 'device', 'rate', 'customer']
const TITLES: Record<StepKey, string> = {
  category: 'نوع دستگاه',
  device: 'دستگاه',
  rate: 'نرخ ساعتی',
  customer: 'مشتری (اختیاری)',
}

export type Pick = { categoryId: string; deviceId: string; priceId: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  sessions: Session[]
} & (
  | {
      // Reserve: the same flow, but the timer is not started (the session is created paused).
      reserve?: boolean
      session?: undefined
      onCreate: (
        device: Device,
        category: string,
        price: FlatPrice,
        customerId?: string,
        limit?: { minutes?: number; cost?: number },
        reserve?: boolean,
        prepay?: number,
      ) => void
      onSwitch?: undefined
    }
  | {
      // Switch-device mode: move `session` to another free device/price (no customer step).
      reserve?: undefined
      session: Session
      onCreate?: undefined
      onSwitch: (device: Device, category: string, price: FlatPrice) => void
    }
)

type SearchItem = {
  key: string
  kind: 'category' | 'device'
  categoryId: string
  deviceId?: string
  priceId?: string // set when the entry stands for one specific price
  label: string
  sub: string
  busy: boolean // device in use (or type with no free device)
  fields: Field[] // everything this entry can be found by, shown or not
}

export const RedDot = () => <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden />

// One selectable card inside a RadioGroup; busy cards stay visible but disabled.
export function RadioCard({
  value,
  checked,
  disabled,
  children,
}: {
  value: string
  checked: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Label
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-3 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50',
        checked && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} />
      {children}
    </Label>
  )
}

// Guide of this dialog (F1 while it is open, or chained from the home page guide). The steps point
// at the `data-tour` attributes below, so keep the two in sync when the markup changes.
export const addSessionTour: TourDef = {
  id: 'add-session',
  present: tourSel('add-search'),
  priority: 10,
  steps: (ctx: TourContext): DriveStep[] => [
    {
      element: tourSel('add-search'),
      waitForElement: 2000,
      popover: {
        title: 'جستجوی سریع',
        description:
          'اگر نام دستگاه یا نوع آن را می‌دانید، همین‌جا جستجو کنید و مستقیم به مرحله‌ی بعد بروید.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('add-picker'),
      skipMissingElement: true,
      onHighlighted: (_el, _step, { driver: d }) => {
        // Moves on by itself once the picked device reaches the customer step.
        ctx.stopWatch()
        ctx.watch(() => {
          if (tourEl(tourSel('add-customer'))) {
            ctx.stopWatch()
            d.moveNext()
          } else d.refresh()
        }, 250)
      },
      onDeselected: ctx.stopWatch,
      popover: {
        title: 'یا مرحله‌به‌مرحله انتخاب کنید',
        description:
          'نوع دستگاه، دستگاه و نرخ ساعتی را انتخاب کنید. با انتخاب هر کارت، خودکار به مرحله‌ی بعد می‌روید. آزاد بودن دستگاه‌ها با نقطه‌ی قرمز مشخص می‌شود.',
        side: 'bottom',
        showButtons: ['close'],
      },
    },
    ctx.forceCustomer
      ? {
          element: tourSel('add-customer-new'),
          waitForElement: 1500,
          advanceOnClick: true,
          data: { id: 'customer' },
          popover: {
            title: 'مشتری جدید',
            description:
              'برای پیگیری مشتریان‌تان باید آن‌ها را ثبت کنید. حالا روی دکمه‌ی «مشتری جدید» کلیک کنید تا یک مشتری بسازیم. بعداً اگر مشتری مهمان بود، این کادر را خالی بگذارید.',
            side: 'bottom',
            showButtons: ['close'],
          },
        }
      : {
          element: tourSel('add-customer'),
          waitForElement: 1500,
          disableActiveInteraction: true,
          data: { id: 'customer' },
          popover: {
            title: 'مشتری (اختیاری)',
            description:
              'اگر می‌خواهید مشتریان‌تان را پیگیری کنید، مشتری‌های ثبت‌شده را از همین کادر انتخاب کنید یا با دکمه‌ی «مشتری جدید» کنار آن مشتری تازه بسازید؛ بلافاصله به همین تایم اضافه می‌شود. این مرحله اختیاری است و اگر مشتری مهمان است، آن را خالی بگذارید.',
            side: 'bottom',
          },
        },
    ...(ctx.forceCustomer
      ? [
          {
            element: tourSel('new-customer'),
            waitForElement: 2000,
            // The target is the customer dialog itself, so it disappearing is expected here.
            data: { id: 'customer-form', keepAlive: true },
            onHighlighted: (_el, _step, { driver: d }) => {
              ctx.stopWatch()
              ctx.watch(() => {
                if (tourEl(tourSel('new-customer'))) return
                ctx.stopWatch()
                const picked = (tourEl(`${tourSel('add-customer')} input[role="combobox"]`) as HTMLInputElement | null)?.value
                // Saved: carry on. Cancelled: back to the forced step.
                if (picked) d.moveNext()
                else d.moveTo(d.getConfig().steps!.findIndex((x) => x.data?.id === 'customer'))
              }, 200)
            },
            onDeselected: ctx.stopWatch,
            popover: {
              title: 'مشخصات مشتری',
              description:
                'نام مشتری را وارد کنید و «ذخیره» را بزنید. شماره‌ی تماس اختیاری است و می‌توانید آن را خالی بگذارید. مشتری بلافاصله به این تایم اضافه می‌شود.',
              side: 'bottom' as const,
              showButtons: [] as [],
            },
          } satisfies DriveStep,
          {
            element: tourSel('add-customer'),
            disableActiveInteraction: true,
            popover: {
              title: 'انتخاب مشتری',
              description:
                'مشتری‌ای که همین الان ساختید در این کادر انتخاب شد. برای تایم‌های بعدی، اگر مشتری از قبل ثبت شده باشد، آن را از همین کادر انتخاب یا جستجو کنید.',
              side: 'bottom' as const,
            },
          } satisfies DriveStep,
        ]
      : []),
    {
      element: tourSel('add-limit-time'),
      popover: {
        title: 'محدودیت زمانی',
        description:
          'اگر تعداد دقیقه‌ای وارد کنید، با تمام شدن آن مدت هشدار پایان تایم برای شما پخش می‌شود. تایم خودکار تمام نمی‌شود؛ فقط هشدار می‌گیرید.',
        side: 'top',
      },
    },
    {
      element: tourSel('add-limit-cost'),
      popover: {
        title: 'محدودیت هزینه',
        description:
          'اگر مبلغی وارد کنید، وقتی هزینه‌ی تایم به آن مبلغ برسد هشدار می‌گیرید. مثلاً برای مشتری که فقط مقدار مشخصی پول دارد.',
        side: 'top',
      },
    },
    {
      element: tourSel('add-prepay'),
      popover: {
        title: 'پیش‌پرداخت',
        description:
          'اگر مشتری پول را پیشاپیش داده است، مبلغ را در «پیش‌پرداخت» وارد کنید. با زدن تیک «تنظیم خودکار محدودیت هزینه»، محدودیت هزینه‌ی تایم همان مبلغ می‌شود تا از پولی که داده بیشتر بازی نکند.',
        side: 'top',
      },
    },
    {
      element: tourSel('add-footer'),
      popover: {
        title: 'شروع تایم',
        description:
          'حالا «شروع تایم» را بزنید. هر زمان با کلید F1 می‌توانید این راهنما را دوباره ببینید.',
        side: 'top',
        doneBtnText: 'پایان',
      },
    },
  ],
}
registerTour(addSessionTour)

export function AddSessionDialog({
  open,
  onOpenChange,
  settings,
  sessions,
  reserve,
  onCreate,
  session,
  onSwitch,
}: Props) {
  const switchMode = !!session
  // Switch-device mode skips the customer step entirely.
  const ORDER = switchMode ? FULL_ORDER.filter((k) => k !== 'customer') : FULL_ORDER
  const busyIds = new Set(sessions.map((s) => s.deviceId))
  const free = freeDevices(settings.devices, sessions)
  const devicesOf = (categoryId: string) => settings.devices.filter((d) => d.categoryId === categoryId)
  const freeIn = (categoryId: string) => devicesOf(categoryId).filter((d) => !busyIds.has(d.id))
  // Only types that actually have devices can start a session.
  const categories = settings.deviceCategories.filter((c) => devicesOf(c.id).length > 0)
  const currentCategory = session
    ? settings.devices.find((d) => d.id === session.deviceId)?.categoryId
    : undefined

  // Steps that need a decision from the user for a given selection.
  const stepsFor = (p: Pick): StepKey[] => {
    const inCategory = devicesOf(p.categoryId)
    const device = settings.devices.find((d) => d.id === p.deviceId)
    const prices = devicePrices(device, settings.rateGroups)
    // Until an earlier step is answered, later steps are assumed to be needed.
    return ORDER.filter(
      (k) =>
        k === 'customer' ||
        (k === 'category' && categories.length > 1) ||
        (k === 'device' &&
          (!p.categoryId ||
            inCategory.length > 1 ||
            (inCategory.length === 1 && busyIds.has(inCategory[0].id)))) ||
        (k === 'rate' && (!p.deviceId || prices.length > 1)),
    )
  }

  // Nothing is preselected; only choices with a single option are filled in (their step is skipped).
  const resolve = (p: Pick): Pick => {
    let { categoryId, deviceId, priceId } = p
    if (!categoryId && categories.length === 1) categoryId = categories[0].id
    if (categoryId && !deviceId) {
      const inCategory = devicesOf(categoryId)
      if (inCategory.length === 1 && !busyIds.has(inCategory[0].id)) deviceId = inCategory[0].id
    }
    if (deviceId && !priceId) {
      const prices = devicePrices(settings.devices.find((d) => d.id === deviceId), settings.rateGroups)
      if (prices.length === 1) priceId = prices[0].id
    }
    return { categoryId, deviceId, priceId }
  }
  const EMPTY: Pick = { categoryId: '', deviceId: '', priceId: '' }
  // In switch mode, default to the category of the device being switched away from.
  const initialPick = (): Pick => resolve({ ...EMPTY, categoryId: currentCategory ?? '' })
  const after = (steps: StepKey[], from: StepKey) =>
    steps.find((k) => ORDER.indexOf(k) > ORDER.indexOf(from)) ?? ORDER[ORDER.length - 1]
  const before = (steps: StepKey[], from: StepKey) =>
    [...steps].reverse().find((k) => ORDER.indexOf(k) < ORDER.indexOf(from))

  const [pick, setPick] = useState<Pick>(() => initialPick())
  const [initial, setInitial] = useState(pick)
  const [step, setStep] = useState<StepKey>(() => stepsFor(pick)[0])
  const [customerId, setCustomerId] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const [timeLimit, setTimeLimit] = useState('')
  const [costLimit, setCostLimit] = useState('')
  const [prepay, setPrepay] = useState('')
  const [prepaySetsLimit, setPrepaySetsLimit] = useState(false)

  // Start from the last used type (or, in switch mode, the current device's type) each time the dialog opens.
  useEffect(() => {
    if (!open) return
    const p = initialPick()
    setPick(p)
    setInitial(p)
    setStep(stepsFor(p)[0])
    setCustomerId(undefined)
    setTimeLimit('')
    setCostLimit('')
    setPrepay('')
    setPrepaySetsLimit(false)
    setQuery('')
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const prepayAmount = Math.floor(parseNumber(prepay))
  const prepayLimitEnabled = prepayAmount > 0

  useEffect(() => {
    if (prepaySetsLimit && prepayLimitEnabled) {
      setCostLimit(String(prepayAmount))
    }
  }, [prepayAmount, prepayLimitEnabled, prepaySetsLimit])

  useEffect(() => {
    if (!prepayLimitEnabled) setPrepaySetsLimit(false)
  }, [prepayLimitEnabled])

  const device = free.find((d) => d.id === pick.deviceId)
  const price = flatPrices(settings.rateGroups).find((p) => p.id === pick.priceId)
  const steps = stepsFor(pick)
  const prevStep = before(steps, step)
  const last = step === ORDER[ORDER.length - 1]

  const dirty =
    JSON.stringify(pick) !== JSON.stringify(initial) ||
    (!switchMode &&
      (customerId !== undefined ||
        timeLimit !== '' ||
        costLimit !== '' ||
        prepay !== '' ||
        prepaySetsLimit))
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const stepValid =
    step === 'category'
      ? !!pick.categoryId && freeIn(pick.categoryId).length > 0
      : step === 'device'
        ? !!device
        : step === 'rate'
          ? !!price
          : !!device && !!price

  const pickCategory = (categoryId: string): Pick => resolve({ categoryId, deviceId: '', priceId: '' })
  const pickDevice = (d: Device): Pick => resolve({ categoryId: d.categoryId, deviceId: d.id, priceId: '' })

  // Choosing a card moves on to the next step that still needs input.
  const choose = (p: Pick, from: StepKey) => {
    setPick(p)
    setStep(after(stepsFor(p), from))
  }

  // Quick search entries. When a device (or a whole type) offers more than one price, there is
  // one entry per price, so the price can be picked straight from the search results.
  const priceNow = (p: { id: string; price: number }) =>
    currentPrice(p.id, p.price, settings.priceOverrides, Date.now())
  const priceText = (p: FlatPrice) => `${p.name} (${formatNumber(priceNow(p))})`
  // Searchable text is independent of what an entry displays: every word of the query may hit
  // the type, device, price name / value, rate group or the free / busy status.
  const priceFields = (p: FlatPrice): Field[] => [
    { text: p.name, weight: 2 },
    String(priceNow(p)),
    p.groupName,
  ]
  const statusField = (busy: boolean) => (busy ? 'در حال استفاده' : 'آزاد')
  const searchItems: SearchItem[] = categories.flatMap((c) => {
    const inCategory = devicesOf(c.id)
    const freeCount = freeIn(c.id).length
    // Distinct prices over the type's devices; a price is usable when a free device offers it.
    const typePrices = new Map<string, FlatPrice>()
    for (const d of inCategory) for (const p of devicePrices(d, settings.rateGroups)) typePrices.set(p.id, p)
    const typeEntries: SearchItem[] =
      typePrices.size > 1
        ? [...typePrices.values()].map((p) => ({
            key: `c-${c.id}-${p.id}`,
            kind: 'category' as const,
            categoryId: c.id,
            priceId: p.id,
            label: c.name,
            sub: `نوع دستگاه · ${priceText(p)}`,
            busy: !freeIn(c.id).some((d) => devicePrices(d, settings.rateGroups).some((x) => x.id === p.id)),
            fields: [{ text: c.name, weight: 3 }, 'نوع دستگاه', ...priceFields(p)],
          }))
        : [
            {
              key: `c-${c.id}`,
              kind: 'category' as const,
              categoryId: c.id,
              label: c.name,
              sub: `نوع دستگاه · ${toFa(freeCount)} آزاد`,
              busy: freeCount === 0,
              fields: [
                { text: c.name, weight: 3 },
                'نوع دستگاه',
                ...[...typePrices.values()].flatMap(priceFields),
                statusField(freeCount === 0),
              ],
            },
          ]
    const deviceEntries = inCategory.flatMap((d): SearchItem[] => {
      const prices = devicePrices(d, settings.rateGroups)
      const base = {
        kind: 'device' as const,
        categoryId: c.id,
        deviceId: d.id,
        label: d.name,
        busy: busyIds.has(d.id),
      }
      const own: Field[] = [{ text: d.name, weight: 3 }, { text: c.name, weight: 2 }, statusField(base.busy)]
      return prices.length > 1
        ? prices.map((p) => ({
            ...base,
            key: `d-${d.id}-${p.id}`,
            priceId: p.id,
            sub: `${c.name} · ${priceText(p)}`,
            fields: [...own, ...priceFields(p)],
          }))
        : [{ ...base, key: `d-${d.id}`, sub: c.name, fields: [...own, ...prices.flatMap(priceFields)] }]
    })
    return [...typeEntries, ...deviceEntries]
  })

  // Choosing an entry jumps ahead to the next step that still needs input.
  const quickSelect = (item: SearchItem | null) => {
    setQuery('')
    if (!item || item.busy) return
    let p: Pick
    if (item.kind === 'category') {
      const d = freeIn(item.categoryId).find(
        (x) => !item.priceId || devicePrices(x, settings.rateGroups).some((y) => y.id === item.priceId),
      )
      if (!d) return
      p = item.priceId ? { ...pickDevice(d), priceId: item.priceId } : pickCategory(item.categoryId)
    } else {
      const d = settings.devices.find((x) => x.id === item.deviceId)
      if (!d) return
      p = { ...pickDevice(d), ...(item.priceId ? { priceId: item.priceId } : {}) }
    }
    setPick(p)
    setStep(after(stepsFor(p), item.priceId ? 'rate' : item.kind === 'category' ? 'category' : 'device'))
  }

  const submit = () => {
    if (!device || !price) return
    if (switchMode) {
      onSwitch!(device, categoryName(settings, device), price)
      onOpenChange(false)
      return
    }
    const minutes = Math.floor(parseNumber(timeLimit))
    const typedCost = Math.floor(parseNumber(costLimit))
    const prepayAmount = Math.floor(parseNumber(prepay))
    const cost = prepaySetsLimit && prepayAmount > 0 ? prepayAmount : typedCost
    if (minutes > 0 || cost > 0) requestNotificationPermission()
    onCreate!(
      device,
      categoryName(settings, device),
      price,
      customerId,
      minutes > 0 || cost > 0 ? { minutes: minutes || undefined, cost: cost || undefined } : undefined,
      reserve,
      prepayAmount > 0 ? prepayAmount : undefined,
    )
    onOpenChange(false)
  }

  const stepIndex = Math.max(0, steps.indexOf(step))

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o, details) => {
          if (o) onOpenChange(true)
          // The guide's popover lives outside the dialog; clicking it must not close the dialog.
          else if (isTourActive() && details.reason === 'outside-press') return
          else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{switchMode ? 'تغییر دستگاه' : reserve ? 'رزرو تایم' : 'افزودن تایم'}</DialogTitle>
            {switchMode && session && (
              <DialogDescription>
                از این لحظه، زمان با دستگاه و نرخ جدید محاسبه می‌شود؛ زمان گذشته با نرخ قبلی می‌ماند و
                دستگاه فعلی ({session.deviceName}) آزاد می‌شود.
              </DialogDescription>
            )}
          </DialogHeader>

          <Combobox
            items={searchItems}
            // Ranked multi-word search instead of the built-in contiguous-substring filter.
            filter={null}
            filteredItems={rank(searchItems, query, (it) => it.fields).sort(
              (a, b) => Number(a.busy) - Number(b.busy),
            )}
            value={null}
            onValueChange={(it) => quickSelect(it as SearchItem | null)}
            inputValue={query}
            onInputValueChange={setQuery}
            itemToStringLabel={(it: SearchItem) => `${it.label} ${it.sub}`}
          >
            <div data-tour="add-search">
              <ComboboxInput
                placeholder="جستجوی سریع نوع دستگاه یا دستگاه…"
                aria-label="جستجوی سریع"
                showTrigger={false}
                className="w-full"
              />
            </div>
            <ComboboxContent>
              <ComboboxEmpty>موردی پیدا نشد</ComboboxEmpty>
              <ComboboxList>
                {(it: SearchItem) => (
                  <ComboboxItem key={it.key} value={it} disabled={it.busy}>
                    <span className="flex flex-1 items-center gap-2">
                      {it.busy && <RedDot />}
                      <span>{it.label}</span>
                      <span className="text-xs text-muted-foreground">{it.sub}</span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          <div className="grid gap-4" data-tour={step !== 'customer' ? 'add-picker' : undefined}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">{TITLES[step]}</h3>
            {steps.length > 1 && (
              <span className="text-xs text-muted-foreground">
                مرحله‌ی {toFa(stepIndex + 1)} از {toFa(steps.length)}
              </span>
            )}
          </div>

          {step === 'category' && (
            <RadioGroup
              className="sm:grid-cols-2"
              value={pick.categoryId}
              onValueChange={(v) => choose(pickCategory(v as string), 'category')}
            >
              {categories.map((c) => {
                const n = freeIn(c.id).length
                return (
                  <RadioCard key={c.id} value={c.id} checked={pick.categoryId === c.id} disabled={n === 0}>
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        {n === 0 && <RedDot />}
                        {c.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n === 0 ? 'همه در حال استفاده' : `${toFa(n)} آزاد`}
                      </span>
                    </span>
                  </RadioCard>
                )
              })}
            </RadioGroup>
          )}

          {step === 'device' && (
            <RadioGroup
              className="sm:grid-cols-2"
              value={pick.deviceId}
              onValueChange={(v) => {
                const d = settings.devices.find((x) => x.id === v)
                if (d) choose(pickDevice(d), 'device')
              }}
            >
              {[...devicesOf(pick.categoryId)]
                .sort((a, b) => Number(busyIds.has(a.id)) - Number(busyIds.has(b.id)))
                .map((d) => {
                const busy = busyIds.has(d.id)
                return (
                  <RadioCard key={d.id} value={d.id} checked={pick.deviceId === d.id} disabled={busy}>
                    <Tip label={busy ? 'در حال استفاده' : undefined}>
                      <span className="flex flex-1 items-center gap-2 font-medium">
                        {busy && <RedDot />}
                        {d.name}
                      </span>
                    </Tip>
                  </RadioCard>
                )
              })}
            </RadioGroup>
          )}

          {step === 'rate' && (
            <RadioGroup
              className="gap-3"
              value={pick.priceId}
              onValueChange={(v) => choose({ ...pick, priceId: v as string }, 'rate')}
            >
              {devicePriceGroups(device, settings.rateGroups).map((g) => (
                <div key={g.id} className="flex flex-col gap-2">
                  {devicePriceGroups(device, settings.rateGroups).length > 1 && (
                    <div className="text-xs text-muted-foreground">{g.name}</div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.prices.map((p) => (
                      <RadioCard key={p.id} value={p.id} checked={pick.priceId === p.id}>
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatNumber(priceNow(p))} تومان
                          </span>
                        </span>
                      </RadioCard>
                    ))}
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          {step === 'customer' && (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg bg-muted/50 p-2.5 text-sm">
                {device ? (
                  <>
                    <b>{device.name}</b>
                    {price && ` · ${price.name} (${formatNumber(priceNow(price))} تومان در ساعت)`}
                  </>
                ) : (
                  'دستگاه آزادی انتخاب نشده است.'
                )}
              </p>
              <div data-tour="add-customer">
                <CustomerSelect
                  customers={settings.customers}
                  value={customerId}
                  onChange={setCustomerId}
                />
              </div>

              <div className="flex flex-col gap-1.5" data-tour="add-prepay">
                <Label htmlFor="new-prepay">پیش‌پرداخت (اختیاری، تومان)</Label>
                <MoneyInput
                  id="new-prepay"
                  placeholder="بدون پیش‌پرداخت"
                  value={prepayAmount > 0 ? formatNumber(prepayAmount) : prepay}
                  onChange={(e) => setPrepay(e.target.value)}
                />
                {prepayLimitEnabled && (
                  <Label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={prepaySetsLimit}
                      onCheckedChange={(v) => setPrepaySetsLimit(v === true)}
                    />
                    تنظیم خودکار محدودیت هزینه بر اساس پیش‌پرداخت
                  </Label>
                )}
              </div>

              <div className="flex flex-col gap-1.5" data-tour="add-limit-time">
                <Label htmlFor="new-limit-time">محدودیت زمانی (اختیاری، دقیقه)</Label>
                <MinutesInput
                  id="new-limit-time"
                  placeholder="بدون محدودیت"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5" data-tour="add-limit-cost">
                <Label htmlFor="new-limit-cost">محدودیت هزینه (اختیاری، تومان)</Label>
                <MoneyInput
                  id="new-limit-cost"
                  placeholder="بدون محدودیت"
                  disabled={prepaySetsLimit && prepayLimitEnabled}
                  value={
                    prepaySetsLimit && prepayLimitEnabled
                      ? formatNumber(prepayAmount)
                      : parseNumber(costLimit) > 0
                        ? formatNumber(Math.floor(parseNumber(costLimit)))
                        : costLimit
                  }
                  onChange={(e) => setCostLimit(e.target.value)}
                />
              </div>
            </div>
          )}
          </div>

          <DialogFooter data-tour="add-footer">
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            {prevStep && (
              <Button variant="outline" onClick={() => setStep(prevStep)}>
                <ArrowRight /> قبلی
              </Button>
            )}
            {last ? (
              <Button disabled={!stepValid} onClick={submit}>
                {switchMode ? <ArrowLeftRight /> : reserve ? <CalendarClock /> : <Play />}{' '}
                {switchMode ? 'تغییر دستگاه' : reserve ? 'ثبت رزرو' : 'شروع تایم'}
              </Button>
            ) : (
              <Button disabled={!stepValid} onClick={() => setStep(after(steps, step))}>
                بعدی <ArrowLeft />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
