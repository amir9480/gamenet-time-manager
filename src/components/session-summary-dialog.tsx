import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Coins, NotebookPen, Pause, Play, Plus, Trash2, Wallet } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BackdateTimeDialog } from '@/components/backdate-time-dialog'
import { CustomerSelect } from '@/components/customer-select'
import { useDiscardGuard } from '@/components/discard-dialog'
import { ExtraItemPicker } from '@/components/extra-item-picker'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { PriceSelect } from '@/components/price-select'
import { useTheme } from '@/components/theme-provider'
import { Tip } from '@/components/tip'
import { readWalletBalance } from '@/lib/db'
import { formatClock, formatDuration, formatNumber, parseNumber } from '@/lib/format'
import { startOfDay } from '@/lib/jalali'
import { onSessionUpdated } from '@/lib/session-events'
import {
  EMPTY_PRICE,
  MIN_BILLABLE_MS,
  ROUND_MODE_LABELS,
  addBackdatedTime,
  addExtraItem,
  categoryName,
  defaultPriceFor,
  devicePriceGroups,
  extraItemsCost,
  flatPrices,
  pauseSession,
  resumeSession,
  prepayTotal,
  removeExtraItem,
  removeSessionPrepay,
  removeSegment,
  roundAmount,
  settleSessionAmount,
  segmentCost,
  segmentMs,
  sessionCostBreakdown,
  splitByOverrides,
  extendCostLimit,
  setExtraItemQty,
  updateSegment,
  addSessionPrepay,
  type Segment,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceName: string
  session: Session
  settings: Settings
  now: number
  onUpdate: (fn: (s: Session) => Session) => void
  // Receives the edited session, the final amount (only when it was edited), and whether it
  // goes on the customer's account.
  onConfirm?: (session: Session, finalTotal?: number, onAccount?: boolean) => void
}

const toman = (n: number) => `${formatNumber(n)} تومان`

// Keeps the existing clock time, moves only the calendar day.
const withDay = (ts: number, dayStart: number) => {
  const d = new Date(ts)
  return new Date(dayStart).setHours(d.getHours(), d.getMinutes(), d.getSeconds(), 0)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Native time input (shadcn's pattern: https://ui.shadcn.com/docs/components/base/date-picker#time-picker) —
// the browser handles typing/stepping; this only converts to/from a full timestamp.
function TimeOfDayInput({ value, onChange }: { value: number; onChange: (ts: number) => void }) {
  const d = new Date(value)
  return (
    <Input
      type="time"
      step="1"
      dir="ltr"
      aria-label="ساعت"
      className="w-28 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      value={`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`}
      onChange={(e) => {
        const [h, m, s] = e.target.value.split(':').map(Number)
        if (Number.isNaN(h) || Number.isNaN(m)) return
        const next = new Date(value)
        next.setHours(h, m, s || 0, 0)
        onChange(next.getTime())
      }}
    />
  )
}

// A plain non-negative count; only commits on blur/Enter so clearing the field to retype a
// value doesn't momentarily commit 0 (which removes the row for items).
function CountInput({
  value,
  onCommit,
  className,
  label,
}: {
  value: number
  onCommit: (n: number) => void
  className?: string
  label: string
}) {
  const [text, setText] = useState(() => (value > 0 ? formatNumber(value) : String(value)))
  useEffect(() => setText(value > 0 ? formatNumber(value) : String(value)), [value])
  const commit = () => onCommit(Math.floor(parseNumber(text)))
  return (
    <Input
      dir="ltr"
      inputMode="numeric"
      aria-label={label}
      className={className}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

export function SessionSummaryDialog({
  open,
  onOpenChange,
  deviceName,
  session,
  settings,
  now,
  onUpdate,
  onConfirm,
}: Props) {
  const { rounding } = useTheme()

  const [draft, setDraftRaw] = useState<Session>(session)
  // Every edit goes through the override splitter/joiner, so the lines below always match how
  // the time is billed (edited times crossing a price-override edge get split, and pieces that
  // became identical are joined).
  const normalize = (s: Session) => splitByOverrides(s, settings, Date.now())
  const setDraft = (next: Session | ((d: Session) => Session)) =>
    setDraftRaw((d) => normalize(typeof next === 'function' ? next(d) : next))
  // What's already committed to the DB (the `session` prop lags behind it until the next
  // live-query render), so "unsaved changes" is judged against this, not the prop directly.
  const [baseline, setBaseline] = useState<Session>(session)
  const [finalText, setFinalText] = useState('')
  const [initialFinalText, setInitialFinalText] = useState('')
  const [onAccount, setOnAccount] = useState(false)
  const [prepayText, setPrepayText] = useState('')
  const [guestChargebackDone, setGuestChargebackDone] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'segment'; index: number }
    | { kind: 'item'; id: string; name: string }
    | { kind: 'prepay'; id: string; amount: number }
    | null
  >(null)

  const pickedCustomer = settings.customers.find((c) => c.id === draft.customerId)

  const walletBalance = useLiveQuery(
    () => (open && pickedCustomer?.id ? readWalletBalance(pickedCustomer.id) : undefined),
    [open, pickedCustomer?.id],
  )

  useEffect(() => {
    if (!open) return
    const seeded = normalize(session)
    setDraftRaw(seeded)
    setBaseline(seeded)
    const seedTotal =
      seeded.segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0) + extraItemsCost(seeded)
    const seedFinal = String(rounding.auto ? roundAmount(seedTotal, rounding) : seedTotal)
    setFinalText(seedFinal)
    setInitialFinalText(seedFinal)
    setPrepayText('')
    setGuestChargebackDone(false)
    setOnAccount(false)
    // Only (re)seed when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The time-limit alarm can extend/clear a limit or pause this exact session while this dialog
  // is open, writing straight to the DB. Without this, `draft` (seeded once on open) wouldn't
  // know, and saving would silently overwrite that change with the stale draft.
  useEffect(() => {
    if (!open) return
    return onSessionUpdated(session.id, (updated) => {
      const patch = {
        limitMs: updated.limitMs,
        costLimit: updated.costLimit,
        ...(updated.status === 'paused' ? { status: updated.status, segments: updated.segments } : {}),
      }
      setDraft((d) => ({ ...d, ...patch }))
      setBaseline((b) => ({ ...b, ...patch }))
    })
  }, [open, session.id])

  // A running session crossing an override edge while the dialog is open: split it here too
  // (the stored session is split by `useOverrideSplitter`).
  useEffect(() => {
    if (!open || draft.status !== 'running') return
    setDraftRaw(normalize)
    setBaseline(normalize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, now, draft.status, settings])

  const { segments, extraItems } = draft
  const start = segments[0]?.from
  const end = segments.length ? (segments[segments.length - 1].to ?? now) : undefined
  const timeTotal = segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const itemsCost = extraItemsCost(draft)
  const total = timeTotal + itemsCost
  const costBreakdown = sessionCostBreakdown(draft, now)

  useEffect(() => {
    if (!open || draft.status !== 'running') return
    const next = String(rounding.auto ? roundAmount(total, rounding) : total)
    setFinalText(next)
    setInitialFinalText(next)
  }, [draft.status, open, rounding, total])

  const finalAmount = parseNumber(finalText)
  const edited = finalAmount !== total
  const finalChanged = finalText !== initialFinalText
  const prepayAmount = prepayTotal(draft)
  const settlement = settleSessionAmount(finalAmount, walletBalance ?? 0, prepayAmount)
  const guestNeedsChargeback = !pickedCustomer && settlement.prepayReturned > 0
  const canConfirm = !guestNeedsChargeback || guestChargebackDone

  const dirty = open && (JSON.stringify(draft) !== JSON.stringify(baseline) || finalChanged || onAccount)
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const confirmEnd = () => {
    if (!canConfirm) return
    onConfirm?.(draft, edited ? finalAmount : undefined, onAccount && !!pickedCustomer)
  }

  useEffect(() => {
    if (!pickedCustomer && onAccount) setOnAccount(false)
  }, [pickedCustomer, onAccount])

  // The attested return amount must track the figure the operator actually confirmed; if editing
  // the final amount or a prepay changes how much is owed back, the attestation no longer applies.
  useEffect(() => {
    setGuestChargebackDone(false)
  }, [settlement.prepayReturned])

  // Closes the open segment in place and switches the dialog into end mode, without closing and
  // reopening it.
  const pauseNow = () => {
    const ts = Date.now()
    const paused = splitByOverrides(pauseSession(draft, ts), settings, ts)
    // Draft only: the stop isn't committed until ذخیره / تایید و اتمام, so cancelling asks first.
    setDraftRaw(paused)
    const seedTotal =
      paused.segments.reduce((sum, seg) => sum + segmentCost(seg, ts), 0) +
      extraItemsCost(paused)
    const seedFinal = String(rounding.auto ? roundAmount(seedTotal, rounding) : seedTotal)
    setFinalText(seedFinal)
    setInitialFinalText(seedFinal)
  }

  // Commits the edited session without ending it.
  const saveChanges = () => {
    onUpdate(() => draft)
    setBaseline(draft)
    onOpenChange(false)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'segment') setDraft((d) => removeSegment(d, pendingDelete.index))
    else if (pendingDelete.kind === 'item') setDraft((d) => removeExtraItem(d, pendingDelete.id))
    else setDraft((d) => removeSessionPrepay(d, pendingDelete.id))
    setPendingDelete(null)
  }

  const addPrepay = () => {
    const amount = Math.floor(parseNumber(prepayText))
    if (amount <= 0) return
    const shouldAdjustLimit =
      draft.status === 'running' &&
      window.confirm('این پیش‌پرداخت به محدودیت هزینه هم اضافه شود؟')
    setDraft((d) => {
      const withPrepay = addSessionPrepay(d, amount, Date.now())
      if (!shouldAdjustLimit) return withPrepay
      return extendCostLimit(withPrepay, amount, Date.now())
    })
    setPrepayText('')
  }

  // The currently open segment (none if the session is paused/ended): its device/price are
  // mirrored onto the session's own fields so the rest of the app stays in sync.
  const activeIndex = draft.status === 'running' ? draft.segments.length - 1 : -1
  const isActive = (i: number) => i === activeIndex && draft.segments[i]?.to === null

  const patchSegment = (index: number, patch: Partial<Segment>) => {
    setDraft((d) => {
      const withSeg = updateSegment(d, index, patch)
      if (!isActive(index)) return withSeg
      return {
        ...withSeg,
        ...(patch.typeId !== undefined ? { typeId: patch.typeId } : {}),
        ...(patch.deviceId !== undefined
          ? { deviceId: patch.deviceId, deviceName: patch.deviceName, categoryName: patch.categoryName }
          : {}),
      }
    })
  }

  const pickSegmentDevice = (index: number, seg: Segment, deviceId: string) => {
    const device = settings.devices.find((x) => x.id === deviceId)
    if (!device) return
    const prices = flatPrices(devicePriceGroups(device, settings.rateGroups))
    const price = prices.find((p) => p.id === seg.typeId) ?? defaultPriceFor(device, settings.rateGroups)
    patchSegment(index, {
      deviceId: device.id,
      deviceName: device.name,
      categoryName: categoryName(settings, device),
      ...(price ? { typeId: price.id, typeName: price.name, price: price.price } : {}),
    })
  }

  const pickSegmentPrice = (index: number, seg: Segment, priceId: string) => {
    const device = settings.devices.find((x) => x.id === seg.deviceId)
    const price = flatPrices(devicePriceGroups(device, settings.rateGroups)).find((p) => p.id === priceId)
    if (!price) return
    patchSegment(index, { typeId: price.id, typeName: price.name, price: price.price })
  }

  // Skipped while closed: the dialog isn't mounted elsewhere, but this component always is
  // (session-card.tsx), re-rendering every second for a running session even when closed.
  const deviceItems = open ? settings.devices.map((d) => ({ value: d.id, label: d.name })) : []
  const devicesByCategory = open
    ? settings.deviceCategories
        .map((c) => ({ category: c, devices: settings.devices.filter((d) => d.categoryId === c.id) }))
        .filter((g) => g.devices.length > 0)
    : []

  const visibleSegments = open
    ? segments
        .map((seg, index) => ({ seg, index }))
        // A start set in the future gives a negative raw span; keep it visible so it can be fixed.
        .filter(({ seg }) => {
          const raw = (seg.to ?? now) - seg.from
          return raw < 0 || raw >= MIN_BILLABLE_MS
        })
    : []

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{`اتمام تایم ${deviceName}`}</DialogTitle>
            <DialogDescription>
              {draft.status === 'running'
                ? 'برای اتمام، ابتدا تایم را متوقف کنید. پس از توقف می‌توانید تایید و اتمام را بزنید.'
                : 'می‌توانید پیش از اتمام مواردی را اصلاح کنید؛ با تایید، تایم پایان می‌یابد و زمان و هزینه‌ها صفر می‌شوند.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 text-sm">
            <div className="flex justify-between gap-4">
              <span>
                شروع: <b dir="ltr">{start ? formatClock(start) : '—'}</b>
              </span>
              <span>
                {draft.status === 'running' ? 'اکنون' : 'پایان'}:{' '}
                <b dir="ltr">{end ? formatClock(end) : '—'}</b>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>بازه‌های زمانی</Label>
                <div className="flex items-center gap-2">
                  <BackdateTimeDialog
                    session={draft}
                    settings={settings}
                    size="sm"
                    onAdd={(device, category, minutes) =>
                      setDraft((d) =>
                        addBackdatedTime(
                          d,
                          device,
                          category,
                          defaultPriceFor(device, settings.rateGroups) ?? EMPTY_PRICE,
                          minutes,
                        ),
                      )
                    }
                  />
                  {draft.status !== 'running' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft((d) => resumeSession(settings, d, Date.now()))}
                    >
                      <Play /> ادامه
                    </Button>
                  )}
                </div>
              </div>

              {visibleSegments.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  بازه‌ای ثبت نشده است.
                </p>
              ) : (
                visibleSegments.map(({ seg, index: i }) => {
                  const device = settings.devices.find((x) => x.id === seg.deviceId)
                  const groups = devicePriceGroups(device, settings.rateGroups)
                  const priceOptions = flatPrices(groups)
                  const priceFallback = priceOptions.some((p) => p.id === seg.typeId)
                    ? undefined
                    : { value: seg.typeId, label: `${seg.typeName} (حذف‌شده)` }
                  const deviceFallback = deviceItems.some((d) => d.value === seg.deviceId)
                    ? undefined
                    : { value: seg.deviceId, label: `${seg.deviceName} (حذف‌شده)` }
                  const open_ = seg.to === null

                  return (
                    <div key={i} className="flex flex-col gap-2 rounded-lg border p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">شروع</span>
                          <JalaliDatePicker
                            label=""
                            value={startOfDay(seg.from)}
                            onChange={(d) => patchSegment(i, { from: withDay(seg.from, d) })}
                          />
                          <TimeOfDayInput value={seg.from} onChange={(ts) => patchSegment(i, { from: ts })} />
                        </div>
                        {open_ ? (
                          <span className="text-xs text-muted-foreground">در حال بازی</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">پایان</span>
                            <JalaliDatePicker
                              label=""
                              value={startOfDay(seg.to!)}
                              onChange={(d) => patchSegment(i, { to: withDay(seg.to!, d) })}
                            />
                            <TimeOfDayInput value={seg.to!} onChange={(ts) => patchSegment(i, { to: ts })} />
                          </div>
                        )}
                        <span className="ms-auto text-xs text-muted-foreground">
                          {formatDuration(segmentMs(seg, now))}
                        </span>
                        {open_ && (
                          <Tip label="توقف موقت تایم">
                            <Button variant="outline" size="icon-sm" aria-label="توقف موقت تایم" onClick={pauseNow}>
                              <Pause />
                            </Button>
                          </Tip>
                        )}
                        <Button
                          variant="destructive"
                          size="icon-sm"
                          aria-label="حذف بازه"
                          onClick={() => setPendingDelete({ kind: 'segment', index: i })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          items={deviceFallback ? [...deviceItems, deviceFallback] : deviceItems}
                          value={seg.deviceId}
                          onValueChange={(v) => pickSegmentDevice(i, seg, v as string)}
                        >
                          <SelectTrigger className="w-auto min-w-36" aria-label="دستگاه">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {devicesByCategory.map(({ category, devices }) => (
                              <SelectGroup key={category.id}>
                                <SelectLabel>{category.name}</SelectLabel>
                                {devices.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                            {deviceFallback && (
                              <SelectItem value={deviceFallback.value} disabled>
                                {deviceFallback.label}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <PriceSelect
                          groups={groups}
                          value={seg.typeId}
                          onChange={(id) => pickSegmentPrice(i, seg, id)}
                          // Labels show the price in effect when this line started, so a line
                          // inside a price override shows the override's price.
                          overrides={settings.priceOverrides}
                          now={seg.from}
                          extraItems={priceFallback ? [priceFallback] : []}
                          extra={
                            priceFallback && (
                              <SelectItem value={priceFallback.value} disabled>
                                {priceFallback.label}
                              </SelectItem>
                            )
                          }
                          className="w-auto min-w-32"
                        />
                        <span className="ms-auto font-bold">
                          {toman(segmentCost(seg, now))}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>بوفه و سایر هزینه‌ها</Label>
                <ExtraItemPicker settings={settings} onAdd={(item) => setDraft((d) => addExtraItem(d, item))} />
              </div>
              {extraItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">موردی ثبت نشده است.</p>
              ) : (
                extraItems.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.name}</div>
                      {i.description && (
                        <div className="truncate text-xs text-muted-foreground">{i.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground">{formatNumber(i.price)} تومان × </div>
                    </div>
                    <CountInput
                      label="تعداد"
                      className="w-20"
                      value={i.qty}
                      onCommit={(qty) => setDraft((d) => setExtraItemQty(d, i.id, qty))}
                    />
                    <span className="ms-auto font-bold">{toman(i.price * i.qty)}</span>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`حذف ${i.name}`}
                      onClick={() => setPendingDelete({ kind: 'item', id: i.id, name: i.name })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-3">
              <Label>پیش‌پرداخت</Label>
              <div className="flex w-full items-center gap-2">
                <MoneyInput
                  className="flex-1"
                  placeholder="مبلغ"
                  value={parseNumber(prepayText) > 0 ? formatNumber(Math.floor(parseNumber(prepayText))) : prepayText}
                  onChange={(e) => setPrepayText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPrepay()}
                />
                <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
                <Button size="sm" variant="outline" onClick={addPrepay}>
                  <Plus /> افزودن
                </Button>
              </div>
              {draft.prepayEntries?.length ? (
                <div className="flex flex-col gap-1">
                  {draft.prepayEntries.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <span className="font-medium" dir="ltr">
                        {formatNumber(p.amount)} تومان
                      </span>
                      <span className="text-xs text-muted-foreground">{formatClock(p.at)}</span>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        aria-label="حذف پیش‌پرداخت"
                        className="ms-auto"
                        onClick={() => setPendingDelete({ kind: 'prepay', id: p.id, amount: p.amount })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">پیش‌پرداختی ثبت نشده است.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t pt-2">
              <Row
                label={costBreakdown.overrides.length ? 'هزینه زمان (نرخ معمول)' : 'جمع هزینه زمان'}
                value={toman(costBreakdown.base)}
              />
              {costBreakdown.overrides.map((o) => (
                <Row key={o.id} label={`هزینه زمان (${o.label})`} value={toman(o.cost)} />
              ))}
              <Row label="جمع بوفه و سایر هزینه‌ها" value={toman(itemsCost)} />
              <Row label="جمع پیش‌پرداخت" value={toman(prepayAmount)} />
            </div>

            <div className="flex flex-col gap-1.5 border-t pt-2">
                <div className="flex items-center justify-between gap-4 text-base font-bold">
                  <Label htmlFor="final-total">مبلغ نهایی</Label>
                  <div className="flex items-center gap-2">
                    {draft.status === 'running' && (
                      <Button onClick={pauseNow}>
                        اتمام برای تسویه حساب
                      </Button>
                    )}
                    {!rounding.auto && (
                      <Tip label={`رند کردن (${ROUND_MODE_LABELS[rounding.mode]} ${formatNumber(rounding.step)} تومان)`}>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="رند کردن"
                          onClick={() => setFinalText(String(roundAmount(finalAmount, rounding)))}
                        >
                          <Coins />
                        </Button>
                      </Tip>
                    )}
                    <MoneyInput
                      id="final-total"
                      className="w-40 font-bold"
                      value={finalAmount > 0 ? formatNumber(finalAmount) : finalText}
                      onChange={(e) => setFinalText(e.target.value)}
                      disabled={draft.status === 'running'}
                    />
                    <span className="text-sm font-normal text-muted-foreground">تومان</span>
                  </div>
                </div>
                {edited && (
                  <span className="text-xs text-muted-foreground">مجموع محاسبه‌شده: {toman(total)}</span>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="end-customer">مشتری</Label>
                  <CustomerSelect
                    id="end-customer"
                    customers={settings.customers}
                    value={draft.customerId}
                    onChange={(customerId) => {
                      setDraft((d) => ({ ...d, customerId }))
                      setGuestChargebackDone(false)
                    }}
                  />
                </div>

                <div className="rounded-lg border bg-muted/30 p-2 text-sm">
                  {!!pickedCustomer && walletBalance !== undefined && (
                    <Row
                      label="اعتبار فعلی مشتری"
                      value={
                        walletBalance >= 0
                          ? `${formatNumber(walletBalance)} تومان`
                          : `بدهی ${formatNumber(Math.abs(walletBalance))} تومان`
                      }
                    />
                  )}
                  <Row label="پوشش از اعتبار" value={toman(settlement.walletCreditUsed)} />
                  <Row label="پوشش از پیش‌پرداخت" value={toman(settlement.prepayUsed)} />
                  <Row
                    label="باقی‌مانده برای تسویه"
                    value={toman(settlement.payableNow)}
                    className={settlement.payableNow === 0 ? 'font-bold text-green-600' : 'font-bold'}
                  />
                  {settlement.prepayReturned > 0 && (
                    <Row
                      label={pickedCustomer ? 'بازگشت به کیف پول مشتری' : 'باقی‌مانده‌ی قابل عودت به مهمان'}
                      value={toman(settlement.prepayReturned)}
                    />
                  )}
                </div>

                {settlement.payableNow > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <span className="text-sm font-normal">نحوه‌ی تسویه‌ی باقی‌مانده</span>
                      <div className="flex gap-1.5" role="group" aria-label="نحوه‌ی پرداخت">
                        <Button
                          size="sm"
                          variant={onAccount ? 'outline' : 'default'}
                          aria-pressed={!onAccount}
                          onClick={() => setOnAccount(false)}
                        >
                          <Wallet /> پرداخت شد
                        </Button>
                        <Tip label={pickedCustomer ? undefined : 'برای نسیه، ابتدا برای تایم مشتری انتخاب کنید'}>
                          <span>
                            <Button
                              size="sm"
                              variant={onAccount ? 'destructive' : 'outline'}
                              aria-pressed={onAccount}
                              disabled={!pickedCustomer}
                              onClick={() => setOnAccount(true)}
                            >
                              <NotebookPen /> نسیه
                            </Button>
                          </span>
                        </Tip>
                      </div>
                    </div>
                    {onAccount && pickedCustomer && (
                      <span className="text-xs text-destructive">
                        {toman(settlement.payableNow)} به بدهی «{pickedCustomer.name}» اضافه می‌شود.
                      </span>
                    )}
                  </>
                )}

                {guestNeedsChargeback && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                    <p className="text-destructive">
                      مشتری مهمان است و {toman(settlement.prepayReturned)} از پیش‌پرداخت اضافه می‌ماند.
                      باید مبلغ را به مشتری برگردانید یا پیش از اتمام، یک مشتری انتخاب کنید تا مبلغ به
                      اعتبار او اضافه شود.
                    </p>
                    <Label className="mt-2 flex items-center gap-2">
                      <Checkbox
                        checked={guestChargebackDone}
                        onCheckedChange={(v) => setGuestChargebackDone(v === true)}
                      />
                      برگشت مبلغ انجام شد
                    </Label>
                  </div>
                )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button onClick={saveChanges}>
              ذخیره
            </Button>
            {draft.status !== 'running' && (
              <Button disabled={!canConfirm} onClick={confirmEnd}>تایید و اتمام تایم</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'segment'
                ? 'حذف بازه‌ی زمانی؟'
                : pendingDelete?.kind === 'prepay'
                  ? 'حذف پیش‌پرداخت؟'
                  : 'حذف این مورد؟'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'segment'
                ? 'این بازه‌ی زمانی حذف می‌شود.'
                : pendingDelete?.kind === 'prepay'
                  ? `پیش‌پرداخت ${formatNumber(pendingDelete.amount)} تومان حذف می‌شود.`
                  : `«${pendingDelete?.name}» حذف می‌شود.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Row({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={`flex justify-between gap-4 ${className ?? ''}`}>
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  )
}
