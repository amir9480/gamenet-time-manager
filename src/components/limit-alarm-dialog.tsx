import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
import { ALARM_INTERVAL_MS, playAlarm } from '@/lib/alarm'
import { alertLimitReached } from '@/lib/attention'
import { readSessions, readSettings } from '@/lib/db'
import { formatDuration, formatNumber } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import {
  clearLimit,
  extendLimit,
  limitReached,
  pauseSession,
  remainingMs,
  setLimit,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  sessions: Session[]
  settings: Settings
  onUpdate: (id: string, fn: (s: Session) => Session) => void
}

export const QUICK_EXTEND_MINUTES = 5

function AlarmBody({
  session,
  settings,
  waiting,
  now,
  onUpdate,
}: {
  session: Session
  settings: Settings
  waiting: number
  now: number
  onUpdate: (fn: (s: Session) => Session) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const customer = settings.customers.find((c) => c.id === session.customerId)
  const over = -(remainingMs(session, now) ?? 0)

  return (
    <>
      <DialogHeader className="items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlarmClock className="size-8 animate-pulse" />
        </span>
        <DialogTitle className="text-lg">
          محدودیت زمانی {session.deviceName}
          {customer && <> ({customer.name})</>} تمام شد
        </DialogTitle>
        <DialogDescription>
          برای ادامه، محدودیت را افزایش دهید یا تایم را متوقف کنید.
        </DialogDescription>
      </DialogHeader>

      <div className="text-center text-sm text-muted-foreground">
        {over >= 1000 ? (
          <>
            <span dir="ltr" className="font-mono font-bold text-destructive">
              {formatDuration(over)}
            </span>{' '}
            از محدودیت گذشته است
          </>
        ) : (
          'همین الان تمام شد'
        )}
        {waiting > 0 && <div className="mt-1">{formatNumber(waiting)} تایم دیگر هم منتظر است</div>}
      </div>

      <DialogFooter className="sm:flex-col sm:justify-stretch">
        <Button
          size="lg"
          onClick={() => onUpdate((s) => extendLimit(s, QUICK_EXTEND_MINUTES, Date.now()))}
        >
          <Plus /> {formatNumber(QUICK_EXTEND_MINUTES)} دقیقه بیشتر
        </Button>
        <Button size="lg" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil /> ویرایش محدودیت
        </Button>
        <Button
          size="lg"
          variant="destructive"
          onClick={() => onUpdate((s) => pauseSession(s, Date.now()))}
        >
          <Pause /> توقف تایم
        </Button>
      </DialogFooter>

      <LimitDialog
        raised
        open={editOpen}
        onOpenChange={setEditOpen}
        remainingMs={remainingMs(session, now)}
        onSave={(minutes) => onUpdate((s) => setLimit(s, minutes, Date.now()))}
        onRemove={() => onUpdate(clearLimit)}
      />
    </>
  )
}

// Sessions whose time limit ran out (most overdue first; the order stays stable over time)
// plus the alarm: it sounds right away and then every ALARM_INTERVAL_MS while any is waiting.
// Each newly expired session also calls the operator back to the app (window focus or a
// system notification, see attention.ts).
function useExpired(sessions: Session[]) {
  const watching = sessions.some((s) => s.status === 'running' && s.limitMs !== undefined)
  const now = useNow(watching)
  const expired = sessions
    .filter((s) => limitReached(s, now))
    .sort((a, b) => (remainingMs(a, now) ?? 0) - (remainingMs(b, now) ?? 0))
  const alarming = expired.length > 0

  useEffect(() => {
    if (!alarming) return
    playAlarm()
    const id = setInterval(playAlarm, ALARM_INTERVAL_MS)
    return () => clearInterval(id)
  }, [alarming])

  const alerted = useRef(new Set<string>())
  useEffect(() => {
    const ids = new Set(expired.map((s) => s.id))
    // Forget sessions that are no longer expired so a later expiry alerts again.
    for (const id of alerted.current) if (!ids.has(id)) alerted.current.delete(id)
    for (const s of expired) {
      if (alerted.current.has(s.id)) continue
      alerted.current.add(s.id)
      alertLimitReached(s.deviceName, s.id)
    }
  })

  return { expired, now }
}

// One top-most blocking dialog for the sessions whose time limit ran out. Normally it cannot
// be dismissed: the admin has to pause the session or extend/remove the limit. While any
// session is waiting, an alarm sounds right away and then every 15 seconds.
//
// `locked`: the app lock is on top of this dialog (it still shows, so a running session isn't
// hidden from view), so every button here must re-ask for the PIN before it takes effect —
// otherwise the dialog would be a way to act on the app without unlocking it. It can be
// dismissed in this case though, so the lock screen underneath stays reachable to unlock
// normally; it reappears for a newly-overdue session, or the same one if nothing changed by
// the next render it's shown for.
export function LimitAlarmDialog({ sessions, settings, onUpdate, locked }: Props & { locked?: boolean }) {
  const { expired, now } = useExpired(sessions)
  const current = expired[0]
  const alarming = current !== undefined
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  const guardedUpdate = (id: string, fn: (s: Session) => Session) => {
    if (locked) setPending(() => () => onUpdate(id, fn))
    else onUpdate(id, fn)
  }

  const open = locked ? alarming && current?.id !== dismissedId : alarming

  return (
    <>
      <Dialog
        open={open}
        disablePointerDismissal={!locked}
        onOpenChange={(o) => {
          if (!o && locked) setDismissedId(current?.id ?? null)
        }}
      >
        <DialogContent raised showCloseButton={!!locked} className="sm:max-w-sm">
          {current && (
            <AlarmBody
              key={current.id}
              session={current}
              settings={settings}
              waiting={expired.length - 1}
              now={now}
              onUpdate={(fn) => guardedUpdate(current.id, fn)}
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
// queries it would otherwise come from) isn't mounted while locked.
export function LockedLimitAlarmDialog({ onUpdate }: { onUpdate: Props['onUpdate'] }) {
  const sessions = useLiveQuery(readSessions)
  const settings = useLiveQuery(readSettings)
  if (!sessions || !settings) return null
  return <LimitAlarmDialog sessions={sessions} settings={settings} onUpdate={onUpdate} locked />
}
