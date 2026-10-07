import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Play } from 'lucide-react'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CustomerSelect } from '@/components/CustomerSelect'
import { pickFor, type Pick } from '@/components/DevicePicker'
import { useDiscardGuard } from '@/components/DiscardDialog'
import { formatNumber } from '@/lib/format'
import { toFa } from '@/lib/jalali'
import {
  categoryName,
  defaultPriceFor,
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

const LAST_CATEGORY_KEY = 'gamenet-last-category'

const readLastCategory = () => {
  try {
    return localStorage.getItem(LAST_CATEGORY_KEY) ?? undefined
  } catch {
    return undefined
  }
}

type StepKey = 'category' | 'device' | 'rate' | 'customer'
const ORDER: StepKey[] = ['category', 'device', 'rate', 'customer']
const TITLES: Record<StepKey, string> = {
  category: 'نوع دستگاه',
  device: 'دستگاه',
  rate: 'نرخ ساعتی',
  customer: 'مشتری (اختیاری)',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  sessions: Session[]
  onCreate: (device: Device, category: string, price: FlatPrice, customerId?: string) => void
}

type SearchItem = {
  key: string
  kind: 'category' | 'device'
  categoryId: string
  deviceId?: string
  priceId?: string // set when the entry stands for one specific price
  label: string
  sub: string
  busy: boolean // device in use (or type with no free device)
}

const RedDot = () => <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden />

// One selectable card inside a RadioGroup; busy cards stay visible but disabled.
function RadioCard({
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

export function AddSessionDialog({ open, onOpenChange, settings, sessions, onCreate }: Props) {
  const busyIds = new Set(sessions.map((s) => s.deviceId))
  const free = freeDevices(settings.devices, sessions)
  const devicesOf = (categoryId: string) => settings.devices.filter((d) => d.categoryId === categoryId)
  const freeIn = (categoryId: string) => devicesOf(categoryId).filter((d) => !busyIds.has(d.id))
  // Only types that actually have devices can start a session.
  const categories = settings.deviceCategories.filter((c) => devicesOf(c.id).length > 0)

  // Steps that need a decision from the user for a given selection.
  const stepsFor = (p: Pick): StepKey[] => {
    const inCategory = devicesOf(p.categoryId)
    const device = settings.devices.find((d) => d.id === p.deviceId)
    const prices = devicePrices(device, settings.rateGroups)
    return ORDER.filter(
      (k) =>
        k === 'customer' ||
        (k === 'category' && categories.length > 1) ||
        (k === 'device' &&
          (inCategory.length > 1 || (inCategory.length === 1 && busyIds.has(inCategory[0].id)))) ||
        (k === 'rate' && prices.length > 1),
    )
  }
  const after = (steps: StepKey[], from: StepKey) =>
    steps.find((k) => ORDER.indexOf(k) > ORDER.indexOf(from)) ?? 'customer'
  const before = (steps: StepKey[], from: StepKey) =>
    [...steps].reverse().find((k) => ORDER.indexOf(k) < ORDER.indexOf(from))

  const [pick, setPick] = useState<Pick>(() => pickFor(settings, free, readLastCategory()))
  const [initial, setInitial] = useState(pick)
  const [step, setStep] = useState<StepKey>(() => stepsFor(pick)[0])
  const [customerId, setCustomerId] = useState<string | undefined>()
  const [query, setQuery] = useState('')

  // Start from the last used type each time the dialog opens.
  useEffect(() => {
    if (!open) return
    const p = pickFor(settings, free, readLastCategory())
    setPick(p)
    setInitial(p)
    setStep(stepsFor(p)[0])
    setCustomerId(undefined)
    setQuery('')
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const device = free.find((d) => d.id === pick.deviceId)
  const price = flatPrices(settings.rateGroups).find((p) => p.id === pick.priceId)
  const steps = stepsFor(pick)
  const prevStep = before(steps, step)
  const last = step === 'customer'

  const dirty = JSON.stringify(pick) !== JSON.stringify(initial) || customerId !== undefined
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const stepValid =
    step === 'category'
      ? freeIn(pick.categoryId).length > 0
      : step === 'device'
        ? !!device
        : step === 'rate'
          ? !!price
          : !!device && !!price

  const pickCategory = (categoryId: string) => {
    const d = freeIn(categoryId)[0]
    return {
      categoryId,
      deviceId: d?.id ?? '',
      priceId: defaultPriceFor(d, settings.rateGroups)?.id ?? '',
    }
  }
  const pickDevice = (d: Device): Pick => ({
    categoryId: d.categoryId,
    deviceId: d.id,
    priceId: defaultPriceFor(d, settings.rateGroups)?.id ?? '',
  })

  // Quick search entries. When a device (or a whole type) offers more than one price, there is
  // one entry per price, so the price can be picked straight from the search results.
  const priceText = (p: FlatPrice) => `${p.name} (${formatNumber(p.price)})`
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
          }))
        : [
            {
              key: `c-${c.id}`,
              kind: 'category' as const,
              categoryId: c.id,
              label: c.name,
              sub: `نوع دستگاه · ${toFa(freeCount)} آزاد`,
              busy: freeCount === 0,
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
      return prices.length > 1
        ? prices.map((p) => ({ ...base, key: `d-${d.id}-${p.id}`, priceId: p.id, sub: `${c.name} · ${priceText(p)}` }))
        : [{ ...base, key: `d-${d.id}`, sub: c.name }]
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
      p = { ...pickDevice(d), ...(item.priceId ? { priceId: item.priceId } : {}) }
      if (!item.priceId) p = pickCategory(item.categoryId)
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
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, device.categoryId)
    } catch {
      // storage unavailable
    }
    onCreate(device, categoryName(settings, device), price, customerId)
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
            <DialogTitle>افزودن تایم</DialogTitle>
          </DialogHeader>

          <Combobox
            items={searchItems}
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
              onValueChange={(v) => setPick(pickCategory(v as string))}
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
                if (d) setPick(pickDevice(d))
              }}
            >
              {devicesOf(pick.categoryId).map((d) => {
                const busy = busyIds.has(d.id)
                return (
                  <RadioCard key={d.id} value={d.id} checked={pick.deviceId === d.id} disabled={busy}>
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        {busy && <RedDot />}
                        {d.name}
                      </span>
                      {busy && <span className="text-xs text-muted-foreground">در حال استفاده</span>}
                    </span>
                  </RadioCard>
                )
              })}
            </RadioGroup>
          )}

          {step === 'rate' && (
            <RadioGroup
              className="gap-3"
              value={pick.priceId}
              onValueChange={(v) => setPick({ ...pick, priceId: v as string })}
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
                <Play /> شروع تایم
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
