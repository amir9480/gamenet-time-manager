import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DriveStep } from 'driver.js'
import { AlarmClock, Pause, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LimitDialog } from '@/components/limit-dialog'
import { PinConfirmDialog } from '@/components/pin-confirm-dialog'
import { useTheme } from '@/components/theme-provider'
import { TourHelpButton } from '@/components/tour-help-button'
import { ALARM_INTERVAL_MS, playAlarm } from '@/lib/alarm'
import { alertLimitReached } from '@/lib/attention'
import { readSessions, readSettings } from '@/lib/db'
import { formatDuration, formatNumber } from '@/lib/format'
import {
  isTourActive,
  markTourSeen,
  registerTour,
  startTour,
  tourSeen,
  tourSel,
  tourSkipped,
  type TourDef,
} from '@/lib/tour'
import { useNow } from '@/lib/use-now'
import { useOverrideSplitter } from '@/lib/use-override-splitter'
import {
  clearCostLimit,
  clearTimeLimit,
  extendCostLimit,
  extendTimeLimit,
  pauseSession,
  remainingCost,
  remainingMs,
  setCostLimit,
  setTimeLimit,
  type LimitKind,
  type Session,
  type Settings,
} from '@/lib/store'

// Guide of this dialog (opens by itself the first time, or F1 / the «?» button). The steps point at
// the `data-tour` attributes below, so keep the two in sync when the markup changes.
export const limitAlarmTour: TourDef = {
  id: 'limit-alarm',
  present: tourSel('alarm-extend'),
  priority: 50,
  steps: (): DriveStep[] => [
    {
      element: tourSel('alarm-info'),
      waitForElement: 2000,
      disableActiveInteraction: true,
      popover: {
        title: 'محدودیت تمام شد',
        description:
          'یکی از محدودیت‌های زمانی یا هزینه‌ای یک تایم به پایان رسیده و هشدار می‌دهد. تا یکی از گزینه‌های زیر را انتخاب نکنید، این پنجره بسته نمی‌شود و تایم همچنان در حال اجراست. اگر چند محدودیت منتظر باشند، یکی‌یکی نشان داده می‌شوند.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('alarm-extend'),
      disableActiveInteraction: true,
      popover: {
        title: 'افزایش سریع',
        description:
          'محدودیت را با یک کلیک به اندازه‌ی مقدار آماده افزایش می‌دهد (دقیقه برای محدودیت زمانی، تومان برای هزینه‌ای) و تایم ادامه پیدا می‌کند. این مقدارها را در تنظیمات > عمومی می‌توانید تغییر دهید.',
        side: 'top',
      },
    },
    {
      element: tourSel('alarm-edit'),
      disableActiveInteraction: true,
      popover: {
        title: 'ویرایش محدودیت',
        description:
          'اگر مقدار دلخواه دیگری می‌خواهید، پنجره‌ی محدودیت باز می‌شود تا مقدار جدید را وارد کنید یا محدودیت را کاملاً بردارید.',
        side: 'top',
      },
    },
    {
      element: tourSel('alarm-stop'),
      disableActiveInteraction: true,
      popover: {
        title: 'توقف تایم',
        description:
          'اگر مشتری بازی را تمام کرده یا باید منتظر بماند، تایم متوقف می‌شود و هزینه‌ای حساب نمی‌شود. بعداً از روی کارت می‌توانید آن را ادامه دهید یا پایان دهید.',
        side: 'top',
      },
    },
  ],
}

registerTour(limitAlarmTour)

type Props = {
  sessions: Session[]
  settings: Settings
  onUpdate: (id: string, fn: (s: Session) => Session) => void
}

// A session's time limit and its cost limit are independent, so each can run out on its own
// and gets its own alarm entry.
type Entry = { session: Session; kind: LimitKind; overdueMs: number }

function AlarmBody({
  session,
  kind,
  settings,
  waiting,
  now,
  onUpdate,
}: {
  session: Session
  kind: LimitKind
  settings: Settings
  waiting: number
  now: number
  onUpdate: (fn: (s: Session) => Session) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const { quickExtend } = useTheme()
  const customer = settings.customers.find((c) => c.id === session.customerId)
  const isCost = kind === 'cost'
  const timeRemaining = remainingMs(session, now)
  const costRemaining = remainingCost(session, now)
  const over = -((isCost ? costRemaining : timeRemaining) ?? 0)

  // The first time a limit runs out, the guide starts by itself (unless guides were skipped).
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (tourSkipped() || tourSeen('limit-alarm-seen') || isTourActive()) return
      markTourSeen('limit-alarm-seen')
      startTour(limitAlarmTour, () => {})
    }, 500)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <>
      <DialogHeader className="items-center text-center" data-tour="alarm-info">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlarmClock className="size-8 animate-pulse" />
        </span>
        <DialogTitle className="text-lg">
          محدودیت {isCost ? 'هزینه' : 'زمانی'} {session.deviceName}
          {customer && <> ({customer.name})</>} تمام شد
          <TourHelpButton tour="limit-alarm" />
        </DialogTitle>
        <DialogDescription>
          برای ادامه، محدودیت را افزایش دهید یا تایم را متوقف کنید.
        </DialogDescription>
      </DialogHeader>

      <div className="text-center text-sm text-muted-foreground">
        {over > (isCost ? 0 : 1000) ? (
          <>
            <span dir="ltr" className="font-mono font-bold text-destructive">
              {isCost ? formatNumber(over) : formatDuration(over)}
            </span>{' '}
            {isCost ? 'تومان ' : ''}از محدودیت گذشته است
          </>
        ) : (
          'همین الان تمام شد'
        )}
        {waiting > 0 && <div className="mt-1">{formatNumber(waiting)} محدودیت دیگر هم منتظر است</div>}
      </div>

      <DialogFooter className="sm:flex-col sm:justify-stretch">
        <Button
          size="lg"
          data-tour="alarm-extend"
          onClick={() =>
            onUpdate((s) =>
              isCost
                ? extendCostLimit(s, quickExtend.cost, Date.now())
                : extendTimeLimit(s, quickExtend.minutes, Date.now()),
            )
          }
        >
          <Plus />{' '}
          {isCost ? `${formatNumber(quickExtend.cost)} تومان` : `${formatNumber(quickExtend.minutes)} دقیقه`}{' '}
          بیشتر
        </Button>
        <Button size="lg" variant="outline" data-tour="alarm-edit" onClick={() => setEditOpen(true)}>
          <Pencil /> ویرایش محدودیت
        </Button>
        <Button
          size="lg"
          variant="destructive"
          data-tour="alarm-stop"
          onClick={() => onUpdate((s) => pauseSession(s, Date.now()))}
        >
          <Pause /> توقف تایم
        </Button>
      </DialogFooter>

      <LimitDialog
        raised
        open={editOpen}
        onOpenChange={setEditOpen}
        timeRemaining={timeRemaining}
        costRemaining={costRemaining}
        onSaveTime={(minutes) => onUpdate((s) => setTimeLimit(s, minutes, Date.now()))}
        onSaveCost={(amount) => onUpdate((s) => setCostLimit(s, amount, Date.now()))}
        onRemoveTime={() => onUpdate(clearTimeLimit)}
        onRemoveCost={() => onUpdate(clearCostLimit)}
      />
    </>
  )
}

// Every limit (time and/or cost, independent of each other) that ran out, most overdue first
// (the order stays stable over time); plus the alarm: it sounds right away and then every
// ALARM_INTERVAL_MS while any is waiting. Each newly expired limit also calls the operator
// back to the app (window focus or a system notification, see attention.ts).
//
// Cost overdue amounts (toman) are converted to an equivalent overdue duration using the
// session's current price, so they sort consistently alongside time overdue amounts (ms).
function useExpired(sessions: Session[]) {
  const watching = sessions.some(
    (s) => s.status === 'running' && (s.limitMs !== undefined || s.costLimit !== undefined),
  )
  const now = useNow(watching)

  const expired: Entry[] = []
  for (const s of sessions) {
    if (s.status !== 'running') continue
    if (s.limitMs !== undefined) {
      const remaining = remainingMs(s, now)!
      if (remaining <= 0) expired.push({ session: s, kind: 'time', overdueMs: -remaining })
    }
    if (s.costLimit !== undefined) {
      const remaining = remainingCost(s, now)!
      if (remaining <= 0) {
        const last = s.segments[s.segments.length - 1]
        const ratePerMs = last && last.price > 0 ? last.price / 3_600_000 : 0
        expired.push({ session: s, kind: 'cost', overdueMs: ratePerMs > 0 ? -remaining / ratePerMs : 0 })
      }
    }
  }
  expired.sort((a, b) => b.overdueMs - a.overdueMs)
  const alarming = expired.length > 0

  useEffect(() => {
    if (!alarming) return
    playAlarm()
    const id = setInterval(playAlarm, ALARM_INTERVAL_MS)
    return () => clearInterval(id)
  }, [alarming])

  const alerted = useRef(new Set<string>())
  useEffect(() => {
    const keyOf = (e: Entry) => `${e.session.id}-${e.kind}`
    const keys = new Set(expired.map(keyOf))
    // Forget limits that are no longer expired so a later expiry alerts again.
    for (const key of alerted.current) if (!keys.has(key)) alerted.current.delete(key)
    for (const e of expired) {
      const key = keyOf(e)
      if (alerted.current.has(key)) continue
      alerted.current.add(key)
      alertLimitReached(e.session.deviceName, key)
    }
  })

  return { expired, now }
}

// One top-most blocking dialog for the limits (time or cost) that ran out. Normally it cannot
// be dismissed: the admin has to pause the session or extend/remove the limit. While any
// session is waiting, an alarm sounds right away and then every 15 seconds.
//
// `locked`: the app lock is on top of this dialog (it still shows, so a running session isn't
// hidden from view), so every button here must re-ask for the PIN before it takes effect —
// otherwise the dialog would be a way to act on the app without unlocking it. It can be
// dismissed in this case though, so the lock screen underneath stays reachable to unlock
// normally; it reappears for a newly-overdue limit, or the same one if nothing changed by
// the next render it's shown for.
export function LimitAlarmDialog({ sessions, settings, onUpdate, locked }: Props & { locked?: boolean }) {
  const { expired, now } = useExpired(sessions)
  const current = expired[0]
  const currentKey = current ? `${current.session.id}-${current.kind}` : null
  const alarming = current !== undefined
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const guardedUpdate = (id: string, fn: (s: Session) => Session) => {
    if (locked) setPending(() => () => onUpdate(id, fn))
    else onUpdate(id, fn)
  }

  const open = locked ? alarming && currentKey !== dismissedKey : alarming

  return (
    <>
      <Dialog
        open={open}
        disablePointerDismissal={!locked}
        onOpenChange={(o) => {
          if (!o && locked) setDismissedKey(currentKey)
        }}
      >
        <DialogContent raised showCloseButton={!!locked} className="sm:max-w-sm">
          {current && (
            <AlarmBody
              key={currentKey}
              session={current.session}
              kind={current.kind}
              settings={settings}
              waiting={expired.length - 1}
              now={now}
              onUpdate={(fn) => guardedUpdate(current.session.id, fn)}
            />
          )}
        </DialogContent>
      </Dialog>
      <PinConfirmDialog
        open={pending !== null}
        onConfirm={() => {
          pending?.()
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}

// Same dialog, shown over the lock screen: it reads its own data since `Main` (and the live
// queries it would otherwise come from) isn't mounted while locked. It also keeps sessions cut at
// price-override edges (normally done in `Main`), so cost limits stay exact while locked.
export function LockedLimitAlarmDialog({ onUpdate }: { onUpdate: Props['onUpdate'] }) {
  const sessions = useLiveQuery(readSessions)
  const settings = useLiveQuery(readSettings)
  useOverrideSplitter(settings, sessions)
  if (!sessions || !settings) return null
  return <LimitAlarmDialog sessions={sessions} settings={settings} onUpdate={onUpdate} locked />
}
