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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestNotificationPermission } from '@/lib/attention'
import { formatNumber, parseNumber } from '@/lib/format'
import { toFa } from '@/lib/jalali'
import { rank, type Field } from '@/lib/search'
import {
  categoryName,
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
    <label
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-3 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50',
        checked && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} />
      {children}
    </label>
  )
}

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
    setQuery('')
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const device = free.find((d) => d.id === pick.deviceId)
  const price = flatPrices(settings.rateGroups).find((p) => p.id === pick.priceId)
  const steps = stepsFor(pick)
  const prevStep = before(steps, step)
  const last = step === ORDER[ORDER.length - 1]

  const dirty =
    JSON.stringify(pick) !== JSON.stringify(initial) ||
    (!switchMode && (customerId !== undefined || timeLimit !== '' || costLimit !== ''))
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
  const priceText = (p: FlatPrice) => `${p.name} (${formatNumber(p.price)})`
  // Searchable text is independent of what an entry displays: every word of the query may hit
  // the type, device, price name / value, rate group or the free / busy status.
  const priceFields = (p: FlatPrice): Field[] => [
    { text: p.name, weight: 2 },
    String(p.price),
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
    const cost = Math.floor(parseNumber(costLimit))
    if (minutes > 0 || cost > 0) requestNotificationPermission()
    onCreate!(
      device,
      categoryName(settings, device),
      price,
      customerId,
      minutes > 0 || cost > 0 ? { minutes: minutes || undefined, cost: cost || undefined } : undefined,
      reserve,
    )
    onOpenChange(false)
  }

  const stepIndex = Math.max(0, steps.indexOf(step))

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true)
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
            <ComboboxInput
              placeholder="جستجوی سریع نوع دستگاه یا دستگاه…"
              aria-label="جستجوی سریع"
              showTrigger={false}
              className="w-full"
            />
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
                            {formatNumber(p.price)} تومان
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
                    {price && ` · ${price.name} (${formatNumber(price.price)} تومان در ساعت)`}
                  </>
                ) : (
                  'دستگاه آزادی انتخاب نشده است.'
                )}
              </p>
              <CustomerSelect
                customers={settings.customers}
                value={customerId}
                onChange={setCustomerId}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-limit-time">محدودیت زمانی (اختیاری، دقیقه)</Label>
                <Input
                  id="new-limit-time"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="بدون محدودیت"
                  value={
                    parseNumber(timeLimit) > 0
                      ? formatNumber(Math.floor(parseNumber(timeLimit)))
                      : timeLimit
                  }
                  onChange={(e) => setTimeLimit(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-limit-cost">محدودیت هزینه (اختیاری، تومان)</Label>
                <Input
                  id="new-limit-cost"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="بدون محدودیت"
                  value={
                    parseNumber(costLimit) > 0
                      ? formatNumber(Math.floor(parseNumber(costLimit)))
                      : costLimit
                  }
                  onChange={(e) => setCostLimit(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
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
