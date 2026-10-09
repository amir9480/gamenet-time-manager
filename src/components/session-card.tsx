import { useEffect, useState } from 'react'
import { AlarmClock, Pause, Pencil, Play, Square, X } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AddSessionDialog } from '@/components/add-session-dialog'
import { CustomerPickerDialog } from '@/components/customer-picker-dialog'
import { PriceSelect } from '@/components/price-select'
import { ExtraItemPicker } from '@/components/extra-item-picker'
import { BackdateTimeDialog } from '@/components/backdate-time-dialog'
import { LimitDialog } from '@/components/limit-dialog'
import { SessionSummaryDialog } from '@/components/session-summary-dialog'
import { Timer } from '@/components/timer'
import { Tip } from '@/components/tip'
import { formatDuration, formatIdle, formatNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/jalali'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import {
  addBackdatedTime,
  addExtraItem,
  changeType,
  clearCostLimit,
  clearTimeLimit,
  computeCost,
  costLimitEtaMs,
  currentPrice,
  EMPTY_PRICE,
  defaultPriceFor,
  deviceOf,
  devicePriceGroups,
  elapsedMs,
  flatPrices,
  forgottenMs,
  isReserved,
  MINUTE_MS,
  pauseSession,
  remainingCost,
  remainingMs,
  resumeSession,
  selectedPrice,
  setCostLimit,
  setTimeLimit,
  switchDevice,
  type Device,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  session: Session
  sessions: Session[]
  settings: Settings
  onUpdate: (fn: (s: Session) => Session) => void
  onEnd: (session: Session, finalTotal?: number, onAccount?: boolean) => void
  // Drops a reservation (no history entry).
  onCancel: () => void
  compact?: boolean
  // Censors the displayed cost with «***» (toggled on the main page).
  costHidden?: boolean
}

const statusLabel = { running: 'در حال بازی', paused: 'متوقف', reserved: 'رزرو' } as const

const SWITCH_DEVICE = '__switch_device__'

// Below this much remaining (time, or cost estimated at the current rate) the card border
// turns yellow as an early warning before the limit alarm fires.
const NEAR_LIMIT_MS = 5 * MINUTE_MS

export function SessionCard({
  session,
  sessions,
  settings,
  onUpdate,
  onEnd,
  onCancel,
  compact,
  costHidden,
}: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryNow, setSummaryNow] = useState(0)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)
  const running = session.status === 'running'
  const reserved = isReserved(session)
  const statusKey = reserved ? 'reserved' : session.status
  const [cancelOpen, setCancelOpen] = useState(false)

  const now = useNow(running)

  // Idle sessions don't tick every second; a coarse tick is enough for the forgotten warning.
  const [idleNow, setIdleNow] = useState(Date.now)
  useEffect(() => {
    if (running) return
    setIdleNow(Date.now())
    const t = setInterval(() => setIdleNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [running])
  const forgotten = running ? undefined : forgottenMs(session, idleNow)
  const forgottenBadge = forgotten !== undefined && (
    <Badge variant="destructive" className="shrink-0">
      {reserved ? 'رزرو‌شده از' : 'متوقف از'} {formatIdle(forgotten)} پیش
    </Badge>
  )
  const forgottenClass = forgotten !== undefined ? 'ring-2 ring-destructive/40' : undefined

  const time = running ? now : Date.now()
  const type = selectedPrice(settings, session)
  const groups = devicePriceGroups(deviceOf(settings, session), settings.rateGroups)
  const customer = settings.customers.find((c) => c.id === session.customerId)
  const total = computeCost(session, time)
  const displayTotal = costHidden ? '***' : formatNumber(total)
  const name = session.deviceName
  const first = session.segments[0]
  const last = session.segments[session.segments.length - 1]
  const timeRemaining = remainingMs(session, time)
  const costRemaining = remainingCost(session, time)
  const hasLimit = timeRemaining !== undefined || costRemaining !== undefined
  const exceeded =
    (timeRemaining !== undefined && timeRemaining <= 0) ||
    (costRemaining !== undefined && costRemaining <= 0)
  // Cost remaining has no natural time unit; estimate it minute by minute (upcoming price
  // overrides included) so it can be shown alongside its toman amount and compared against the
  // same 5-minute warning threshold as the time limit.
  const costRemainingMs = costLimitEtaMs(session, settings, time)
  const limitLines = [
    timeRemaining === undefined
      ? null
      : timeRemaining <= 0
        ? 'محدودیت زمانی تمام شده'
        : `باقی‌مانده تا محدودیت زمانی: ${formatDuration(timeRemaining)}`,
    costRemaining === undefined
      ? null
      : costRemaining <= 0
        ? 'محدودیت هزینه تمام شده'
        : costRemainingMs !== undefined
          ? `باقی‌مانده تا محدودیت هزینه: ${formatDuration(costRemainingMs)} (${formatNumber(costRemaining)} تومان)`
          : `باقی‌مانده تا محدودیت هزینه: ${formatNumber(costRemaining)} تومان`,
  ].filter((x): x is string => x !== null)
  const limitLine = limitLines.length > 0 ? `
${limitLines.join('\n')}` : ''
  const nearLimit =
    (timeRemaining !== undefined && timeRemaining > 0 && timeRemaining <= NEAR_LIMIT_MS) ||
    (costRemainingMs !== undefined && costRemainingMs > 0 && costRemainingMs <= NEAR_LIMIT_MS)
  const limitClass = exceeded
    ? 'ring-2 ring-destructive/40'
    : nearLimit
      ? 'ring-2 ring-yellow-500/60'
      : undefined
  const rangeTitle = first
    ? `شروع: ${formatJalaliDateTime(first.from)}${last.to ? `
پایان: ${formatJalaliDateTime(last.to)}` : ''}${limitLine}`
    : undefined
  // Shown on the limit button in both card layouts, so hovering it gives the same remaining
  // time/cost regardless of which card style is in use.
  const limitTip = `${hasLimit ? 'ویرایش محدودیت' : 'تعیین محدودیت'}${limitLine}`

  const resume = () => onUpdate((s) => resumeSession(settings, s, Date.now()))
  const pause = () => onUpdate((s) => pauseSession(s, Date.now()))
  const requestType = (id: string) => {
    if (id === SWITCH_DEVICE) setSwitchOpen(true)
    else if (id !== type.id) setPendingTypeId(id)
  }
  const confirmType = () => {
    if (!pendingTypeId) return
    onUpdate((s) => changeType(settings, s, pendingTypeId, Date.now()))
    setPendingTypeId(null)
  }
  const pendingType = flatPrices(settings.rateGroups).find((t) => t.id === pendingTypeId)
  useEffect(() => {
    if (!summaryOpen || !running) return
    setSummaryNow(Date.now())
    const t = setInterval(() => setSummaryNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [summaryOpen, running])
  const openSummary = () => {
    setSummaryNow(Date.now())
    setSummaryOpen(true)
  }
  const addBackdated = (device: Device, category: string, minutes: number) => {
    const price = defaultPriceFor(device, settings.rateGroups) ?? EMPTY_PRICE
    onUpdate((s) => addBackdatedTime(s, device, category, price, minutes))
  }


  const dialogs = (
    <>

        <AlertDialog
          open={pendingType !== undefined}
          onOpenChange={(o) => !o && setPendingTypeId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تغییر نوع نرخ؟</AlertDialogTitle>
              <AlertDialogDescription>
                نوع نرخ از «{type.name}» ({formatNumber(currentPrice(type.id, type.price, settings.priceOverrides, Date.now()))} تومان در ساعت) به «
                {pendingType?.name}» ({formatNumber(pendingType ? currentPrice(pendingType.id, pendingType.price, settings.priceOverrides, Date.now()) : 0)} تومان در ساعت) تغییر
                می‌کند.{' '}
                {running
                  ? 'این تغییر از همین لحظه روی ثانیه‌های بعدی اعمال می‌شود؛ زمان گذشته با نرخ قبلی محاسبه می‌ماند.'
                  : 'زمان گذشته با نرخ قبلی محاسبه می‌ماند و نرخ جدید از زمان ادامه‌ی تایم اعمال می‌شود.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={confirmType}>تایید تغییر</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>لغو رزرو؟</AlertDialogTitle>
              <AlertDialogDescription>
                رزرو «{name}» حذف می‌شود و در تاریخچه ثبت نمی‌شود.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={onCancel}>لغو رزرو</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <LimitDialog
          open={limitOpen}
          onOpenChange={setLimitOpen}
          timeRemaining={timeRemaining}
          costRemaining={costRemaining}
          onSaveTime={(minutes) => onUpdate((x) => setTimeLimit(x, minutes, Date.now()))}
          onSaveCost={(amount) => onUpdate((x) => setCostLimit(x, amount, Date.now()))}
          onRemoveTime={() => onUpdate(clearTimeLimit)}
          onRemoveCost={() => onUpdate(clearCostLimit)}
        />

        <CustomerPickerDialog
          open={customerOpen}
          onOpenChange={setCustomerOpen}
          customers={settings.customers}
          value={session.customerId}
          onSave={(customerId) => onUpdate((x) => ({ ...x, customerId }))}
        />

        <AddSessionDialog
          open={switchOpen}
          onOpenChange={setSwitchOpen}
          settings={settings}
          sessions={sessions}
          session={session}
          onSwitch={(device, category, price) =>
            onUpdate((x) => switchDevice(x, device, category, price, Date.now()))
          }
        />

        <SessionSummaryDialog
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          deviceName={customer ? `${name} (${customer.name})` : name}
          session={session}
          settings={settings}
          now={summaryNow}
          onUpdate={onUpdate}
          onConfirm={(editedSession, finalTotal, onAccount) => {
            setSummaryOpen(false)
            onEnd(editedSession, finalTotal, onAccount)
          }}
        />
    </>
  )

  const sm = compact ? 'sm' : undefined
  const flexBtn = compact ? 'sm:flex-1' : 'flex-1'

  const customerButton = (
    <Tip label={compact ? (customer ? `مشتری: ${customer.name} (تغییر)` : 'انتخاب مشتری') : 'تغییر مشتری'}>
      <Button
        variant="ghost"
        size={compact ? 'xs' : 'sm'}
        className={compact ? 'max-w-28 shrink-0' : undefined}
        aria-label="تغییر مشتری"
        onClick={() => setCustomerOpen(true)}
      >
        <Pencil />
        <span className={compact ? 'truncate' : undefined}>
          {customer ? customer.name : compact ? 'مشتری' : 'مشتری مهمان'}
        </span>
      </Button>
    </Tip>
  )

  const priceSelect = (
    <PriceSelect
      groups={groups}
      value={type.id}
      onChange={requestType}
      overrides={settings.priceOverrides}
      now={time}
      extraItems={[{ value: SWITCH_DEVICE, label: 'تغییر دستگاه…' }]}
      extra={<SelectItem value={SWITCH_DEVICE}>تغییر دستگاه…</SelectItem>}
      trigger={
        <Tip label="تغییر نرخ یا دستگاه">
          <SelectTrigger
            size={sm}
            className={compact ? 'w-full text-xs max-md:data-[size=sm]:h-11' : 'w-auto min-w-44'}
            aria-label="نرخ"
          >
            <SelectValue />
          </SelectTrigger>
        </Tip>
      }
    />
  )

  const timer = (
    <Tip label={rangeTitle}>
      <div>
        <Timer ms={elapsedMs(session, time)} compact={compact} />
      </div>
    </Tip>
  )

  const backdateButton = (
    <BackdateTimeDialog compact={compact} session={session} settings={settings} onAdd={addBackdated} />
  )
  const limitButton = compact ? (
    <Tip label={limitTip}>
      <Button
        variant={exceeded ? 'destructive' : hasLimit ? 'secondary' : 'outline'}
        size="icon-sm"
        aria-label="محدودیت"
        onClick={() => setLimitOpen(true)}
      >
        <AlarmClock />
      </Button>
    </Tip>
  ) : (
    <Tip label={limitTip}>
      <Button variant="outline" onClick={() => setLimitOpen(true)}>
        <AlarmClock /> {hasLimit ? 'ویرایش محدودیت' : 'تعیین محدودیت'}
      </Button>
    </Tip>
  )
  const extraPicker = (
    <ExtraItemPicker
      compact={compact}
      settings={settings}
      onAdd={(item) => onUpdate((s) => addExtraItem(s, item))}
    />
  )

  const actionButtons = running ? (
    <Tip label="توقف موقت تایم">
      <Button size={sm} className={flexBtn} onClick={pause}>
        <Pause /> توقف
      </Button>
    </Tip>
  ) : (
    <>
      <Tip label={reserved ? 'شروع تایم' : 'ادامه‌ی تایم'}>
        <Button size={sm} className={flexBtn} onClick={resume}>
          <Play /> {reserved ? 'شروع' : 'ادامه'}
        </Button>
      </Tip>
      {reserved ? (
        <Tip label="لغو رزرو">
          <Button
            size={sm}
            variant="destructive"
            className={flexBtn}
            onClick={() => setCancelOpen(true)}
          >
            <X /> {compact ? 'لغو' : 'لغو رزرو'}
          </Button>
        </Tip>
      ) : (
        <Tip label="پایان تایم و مشاهده صورت‌حساب">
          <Button size={sm} variant="destructive" className={flexBtn} onClick={openSummary}>
            <Square /> اتمام
          </Button>
        </Tip>
      )}
    </>
  )

  return (
    <Card size={sm} className={cn(forgottenClass, limitClass)}>
      <CardContent className={cn('flex flex-col', compact ? 'gap-2.5' : 'gap-4')}>
        <div
          className={cn(
            'flex items-center justify-between',
            compact ? 'gap-2' : 'flex-wrap gap-4',
          )}
        >
          <div
            className={cn('flex items-center', compact ? 'min-w-0 gap-1.5' : 'flex-wrap gap-2')}
          >
            {compact && (
              <Tip label={statusLabel[statusKey]}>
                <span
                  className={`size-2.5 shrink-0 rounded-full ${running ? 'animate-pulse bg-green-500' : reserved ? 'bg-amber-500' : 'bg-muted-foreground/50'}`}
                />
              </Tip>
            )}
            <Tip label={name}>
              <span className={cn('truncate font-bold', compact ? 'text-base' : 'text-lg')}>
                {name}
              </span>
            </Tip>
            {session.categoryName && (
              <Badge variant="outline" className={compact ? 'shrink-0' : undefined}>
                {session.categoryName}
              </Badge>
            )}
            {!compact && (
              <>
                {priceSelect}
                <Badge variant={running ? 'default' : 'secondary'}>{statusLabel[statusKey]}</Badge>
                {forgottenBadge}
                {customerButton}
              </>
            )}
          </div>
          {compact ? customerButton : timer}
        </div>

        {compact && (
          <>
            {forgottenBadge && <div className="flex justify-center">{forgottenBadge}</div>}
            {timer}
          </>
        )}

        {compact ? (
          <>
            <Tip label="مشاهده جزئیات هزینه">
              <Button
                type="button"
                variant="ghost"
                onClick={openSummary}
                className="h-auto items-baseline justify-center gap-1.5 py-0.5 max-md:h-auto"
              >
                <span className="text-2xl font-bold" dir="ltr">
                  {displayTotal}
                </span>
                <span className="text-xs text-muted-foreground">تومان</span>
              </Button>
            </Tip>
            {priceSelect}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1.5 sm:flex-1 sm:flex-row">{actionButtons}</div>
              <div className="flex items-center justify-end gap-1.5">
                {limitButton}
                {backdateButton}
                {extraPicker}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>زمان گذشته</Label>
              {backdateButton}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>محدودیت</Label>
              {limitButton}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>بوفه و سایر هزینه‌ها</Label>
              {extraPicker}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>مجموع هزینه تایم</Label>
              <div className="flex items-center gap-2">
                <Tip label="مشاهده جزئیات هزینه">
                  <Input
                    readOnly
                    dir="ltr"
                    className="cursor-pointer font-bold"
                    value={displayTotal}
                    onClick={openSummary}
                  />
                </Tip>
                <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
              </div>
            </div>
          </div>
        )}

        {session.extraItems.length > 0 &&
          (compact ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              <Tip label="مشاهده و تغییر بوفه و سایر هزینه‌ها">
                <Badge
                  variant="secondary"
                  className="h-auto cursor-pointer py-0.5 hover:bg-secondary/70"
                  render={<button type="button" onClick={openSummary} />}
                >
                  بوفه و سایر هزینه‌ها: {formatNumber(session.extraItems.reduce((n, i) => n + i.qty, 0))}
                </Badge>
              </Tip>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {session.extraItems.map((i) => (
                <Tip key={i.id} label={i.description || 'تغییر'}>
                  <Badge
                    variant="secondary"
                    className="h-auto cursor-pointer py-1 hover:bg-secondary/70"
                    render={<button type="button" onClick={openSummary} />}
                  >
                    {i.name}
                    {i.description ? ` (${i.description})` : ''} × {formatNumber(i.qty)} ={' '}
                    {formatNumber(i.price * i.qty)}
                  </Badge>
                </Tip>
              ))}
            </div>
          ))}

        {!compact && <div className="flex flex-col gap-2 sm:flex-row">{actionButtons}</div>}
      </CardContent>
      {dialogs}
    </Card>
  )
}
