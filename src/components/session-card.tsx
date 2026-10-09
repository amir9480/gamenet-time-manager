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
import type { DriveStep } from 'driver.js'
import {
  isTourActive,
  markTourSeen,
  startTour,
  tourSeen,
  tourLatest,
  tourSel,
  tourSkipped,
  type TourDef,
} from '@/lib/tour'
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

// The newest card's part (or the card itself when the part isn't there).
const cardPart = (part?: string) => () =>
  (part && tourLatest('session-card')?.querySelector(tourSel(part))) ||
  tourLatest('session-card') ||
  document.body

// Guide of a session card, run on the newest one (the page guide in App.tsx appends its own steps).
// The steps point at the `data-tour` attributes above, so keep the two in sync when the markup changes.
export const sessionCardSteps = (): DriveStep[] => [
  {
    element: cardPart(),
    waitForElement: 3000,
    disableActiveInteraction: true,
    popover: {
      title: 'کارت تایم',
      description:
        'این کارت، جدیدترین تایمی است که ساخته‌اید. هر تایم در جریان یک کارت جداگانه دارد و همه‌ی کارهای آن تایم از همین‌جا انجام می‌شود.',
      side: 'bottom',
    },
  },
  {
    element: cardPart('card-device'),
    disableActiveInteraction: true,
    popover: {
      title: 'دستگاه',
      description: 'نام دستگاهی که این تایم روی آن در حال اجراست.',
      side: 'bottom',
    },
  },
  {
    element: cardPart('card-customer'),
    disableActiveInteraction: true,
    popover: {
      title: 'مشتری',
      description:
        'با این دکمه می‌توانید مشتری تایم را عوض کنید. اگر مشتری را اشتباه انتخاب کرده‌اید، آن را بردارید تا تایم برای مشتری مهمان ثبت شود.',
      side: 'bottom',
    },
  },
  {
    element: cardPart('card-timer'),
    disableActiveInteraction: true,
    popover: {
      title: 'زمان سپری‌شده',
      description: 'مدت زمانی که از شروع تایم گذشته است. با توقف تایم، این زمان هم می‌ایستد.',
      side: 'bottom',
    },
  },
  {
    element: cardPart('card-cost'),
    disableActiveInteraction: true,
    popover: {
      title: 'هزینه تا این لحظه',
      description:
        'مجموع هزینه‌ی زمان بازی و بوفه تا همین الان. با کلیک روی آن ریز هزینه‌ها را می‌بینید.',
      side: 'top',
    },
  },
  {
    element: cardPart('card-price'),
    disableActiveInteraction: true,
    popover: {
      title: 'نرخ و دستگاه',
      description:
        'از این لیست می‌توانید نرخ ساعتی را عوض کنید یا با «تغییر دستگاه…» تایم را به دستگاه دیگری ببرید. هزینه از همان لحظه‌ی تغییر با نرخ یا دستگاه جدید حساب می‌شود و زمان قبلی با نرخ قبلی می‌ماند.',
      side: 'top',
    },
  },
  {
    element: cardPart('card-pause'),
    disableActiveInteraction: true,
    popover: {
      title: 'توقف',
      description:
        'تایم را موقتاً متوقف می‌کند؛ در این مدت هزینه‌ای حساب نمی‌شود. بعداً با «ادامه» دوباره شروع می‌شود و با «اتمام» صورت‌حساب نهایی را می‌بینید.',
      side: 'top',
    },
  },
  {
    element: cardPart('card-limit'),
    disableActiveInteraction: true,
    popover: {
      title: 'محدودیت',
      description:
        'برای هر تایم می‌توانید محدودیت زمانی یا هزینه تعیین کنید، یا محدودیتی را که قبلاً گذاشته‌اید تغییر دهید و بردارید. با رسیدن به آن، هشدار می‌گیرید.',
      side: 'top',
    },
  },
  {
    element: cardPart('card-backdate'),
    disableActiveInteraction: true,
    popover: {
      title: 'افزودن زمان گذشته',
      description:
        'اگر ثبت تایم را فراموش کرده بودید و مشتری از چند دقیقه‌ی پیش مشغول بازی است، همان دقایق را از اینجا به تایم اضافه کنید.',
      side: 'top',
    },
  },
  {
    element: cardPart('card-extra'),
    disableActiveInteraction: true,
    popover: {
      title: 'بوفه و سایر هزینه‌ها',
      description:
        'خوراکی، نوشیدنی یا هر هزینه‌ی دیگری که مشتری گرفته را از اینجا به همین تایم اضافه کنید تا در صورت‌حساب بیاید.',
      side: 'top',
    },
  },
]

// Shown once, the first time any card is paused (its buttons turn into ادامه / اتمام).

const pausedTour: TourDef = {
  id: 'paused-card',
  present: tourSel('card-resume'),
  priority: 0,
  steps: () => [
    {
      element: tourSel('card-resume'),
      waitForElement: 1500,
      disableActiveInteraction: true,
      popover: {
        title: 'ادامه',
        description:
          'تایم متوقف شد و دیگر هزینه‌ای حساب نمی‌شود. با «ادامه» همین تایم از همان‌جا دوباره شروع می‌شود.',
        side: 'top',
      },
    },
    {
      element: tourSel('card-end'),
      disableActiveInteraction: true,
      popover: {
        title: 'اتمام',
        description:
          'تایم را برای همیشه تمام می‌کند و صورت‌حساب نهایی را نشان می‌دهد؛ همان‌جا مبلغ را می‌توانید ویرایش و پرداخت یا نسیه را ثبت کنید.',
        side: 'top',
      },
    },
  ],
}

// Called after a card is paused: explains the two new buttons, once, unless guides were skipped.
const offerPausedTour = () => {
  if (tourSkipped() || tourSeen('paused-seen') || isTourActive()) return
  markTourSeen('paused-seen')
  window.setTimeout(() => startTour(pausedTour, () => {}), 250)
}

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
  const pause = () => {
    onUpdate((s) => pauseSession(s, Date.now()))
    offerPausedTour()
  }
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
  const flexBtn = 'flex-1'
  // Compact card on a phone: when the card is narrow the action buttons keep only their icon.
  const lbl = (t: string) => (
    <span className={compact ? 'max-md:@max-[30rem]/card:hidden' : undefined}>{t}</span>
  )

  const customerButton = (
    <Tip label={compact ? (customer ? `مشتری: ${customer.name} (تغییر)` : 'انتخاب مشتری') : 'تغییر مشتری'}>
      <Button
        variant="ghost"
        size={compact ? 'xs' : 'sm'}
        className={compact ? 'max-w-32 shrink-0' : undefined}
        aria-label="تغییر مشتری"
        data-tour="card-customer"
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
            className={
              compact ? 'w-full text-xs max-md:data-[size=sm]:h-11' : 'w-full'
            }
            aria-label="نرخ"
            data-tour="card-price"
          >
            <SelectValue />
          </SelectTrigger>
        </Tip>
      }
    />
  )

  // Timer and cost share one tinted panel (two cells) in both layouts.
  const statsPanel = (
    <div
      className={cn(
        'grid rounded-xl bg-muted/50',
        'grid-cols-1 divide-y py-2 md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-x-reverse',
        compact ? 'md:py-2.5' : 'md:py-5 lg:flex-1 lg:basis-0',
      )}
    >
      <Tip label={rangeTitle}>
        <div className="flex min-w-0 flex-col items-center gap-0.5 px-2 max-md:pb-3" data-tour="card-timer">
          <span className="text-xs text-muted-foreground">زمان</span>
          <Timer ms={elapsedMs(session, time)} compact={compact} large={!compact} />
        </div>
      </Tip>
      <Tip label="مشاهده جزئیات هزینه">
        <Button
          type="button"
          variant="ghost"
          data-tour="card-cost"
          onClick={openSummary}
          className="h-auto min-w-0 flex-col gap-0.5 rounded-none px-2 py-0 hover:bg-transparent max-md:h-auto max-md:pt-3"
        >
          <span className="text-xs font-normal text-muted-foreground">هزینه (تومان)</span>
          <span
            className={cn('font-bold leading-tight', compact ? 'text-2xl' : 'text-4xl md:text-5xl lg:text-4xl xl:text-5xl')}
            dir="ltr"
          >
            {displayTotal}
          </span>
        </Button>
      </Tip>
    </div>
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
        data-tour="card-limit"
        onClick={() => setLimitOpen(true)}
      >
        <AlarmClock />
      </Button>
    </Tip>
  ) : (
    <Tip label={limitTip}>
      <Button
        variant={exceeded ? 'destructive' : hasLimit ? 'secondary' : 'outline'}
        data-tour="card-limit"
        onClick={() => setLimitOpen(true)}
      >
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
      <Button size={sm} className={flexBtn} aria-label="توقف" data-tour="card-pause" onClick={pause}>
        <Pause /> {lbl('توقف')}
      </Button>
    </Tip>
  ) : (
    <>
      <Tip label={reserved ? 'شروع تایم' : 'ادامه‌ی تایم'}>
        <Button
          size={sm}
          className={flexBtn}
          aria-label={reserved ? 'شروع' : 'ادامه'}
          data-tour={reserved ? undefined : 'card-resume'}
          onClick={resume}
        >
          <Play /> {lbl(reserved ? 'شروع' : 'ادامه')}
        </Button>
      </Tip>
      {reserved ? (
        <Tip label="لغو رزرو">
          <Button
            size={sm}
            variant="destructive"
            className={flexBtn}
            aria-label="لغو رزرو"
            onClick={() => setCancelOpen(true)}
          >
            <X /> {lbl(compact ? 'لغو' : 'لغو رزرو')}
          </Button>
        </Tip>
      ) : (
        <Tip label="پایان تایم و مشاهده صورت‌حساب">
          <Button
            size={sm}
            variant="destructive"
            className={flexBtn}
            aria-label="اتمام"
            data-tour="card-end"
            onClick={openSummary}
          >
            <Square /> {lbl('اتمام')}
          </Button>
        </Tip>
      )}
    </>
  )

  const statusBadge = (
    <Badge variant={running ? 'default' : 'secondary'} className="shrink-0">
      {statusLabel[statusKey]}
    </Badge>
  )

  const extraBadges =
    session.extraItems.length > 0 &&
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
    ))

  return (
    <Card
      size={sm}
      className={cn('@container/card', forgottenClass, limitClass)}
      data-tour="session-card"
      data-tour-at={first?.from ?? session.reservedAt ?? 0}
    >
      <CardContent className={cn('flex flex-1 flex-col', compact ? 'gap-3' : 'gap-4')}>
        {/* Header: who/where on one side, status + customer on the other. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <Tip label={statusLabel[statusKey]}>
                <span
                  className={`size-2.5 shrink-0 rounded-full ${running ? 'animate-pulse bg-green-500' : reserved ? 'bg-amber-500' : 'bg-muted-foreground/50'}`}
                />
              </Tip>
              <Tip label={name}>
                <span
                  data-tour="card-device"
                  className={cn('truncate font-bold', compact ? 'text-base' : 'text-lg')}
                >
                  {name}
                </span>
              </Tip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {session.categoryName && <Badge variant="outline">{session.categoryName}</Badge>}
              {!running && statusBadge}
              {forgottenBadge}
            </div>
          </div>
          {customerButton}
        </div>

        {compact ? (
          <>
            {statsPanel}
            {priceSelect}
            {extraBadges}
            <div className="mt-auto flex items-center gap-1.5">
              <div className="flex flex-1 gap-1.5">{actionButtons}</div>
              {limitButton}
              {backdateButton}
              {extraPicker}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            {statsPanel}
            <div className="flex min-w-0 flex-col justify-end gap-3 lg:flex-1 lg:basis-0">
              {extraBadges}
              {priceSelect}
              <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1">
                {limitButton}
                {backdateButton}
                {extraPicker}
              </div>
              <div className="flex gap-2">{actionButtons}</div>
            </div>
          </div>
        )}

      </CardContent>
      {dialogs}
    </Card>
  )
}
