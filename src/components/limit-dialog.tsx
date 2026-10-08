import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission } from '@/lib/attention'
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
import { useDiscardGuard } from '@/components/discard-dialog'
import { formatNumber, parseNumber } from '@/lib/format'
import { MINUTE_MS } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Time left before the time limit (ms, may be negative); undefined = not set.
  timeRemaining: number | undefined
  // Amount left before the cost limit (toman, may be negative); undefined = not set.
  costRemaining: number | undefined
  onSaveTime: (minutes: number) => void
  onSaveCost: (amount: number) => void
  onRemoveTime: () => void
  onRemoveCost: () => void
  // Opened over the limit alarm.
  raised?: boolean
}

// Starts from the remaining minutes: with 15 min left, enter 45 to give 30 more.
const initialMinutes = (remainingMs: number | undefined) =>
  remainingMs === undefined ? '' : String(Math.max(0, Math.ceil(remainingMs / MINUTE_MS)))

const initialCost = (remaining: number | undefined) =>
  remaining === undefined ? '' : String(Math.max(0, Math.ceil(remaining)))

export function LimitDialog({
  open,
  onOpenChange,
  timeRemaining,
  costRemaining,
  onSaveTime,
  onSaveCost,
  onRemoveTime,
  onRemoveCost,
  raised,
}: Props) {
  const [timeText, setTimeText] = useState('')
  const [costText, setCostText] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<'time' | 'cost' | null>(null)

  // Start from the current limits every time the dialog opens (snapshot: the remaining amounts
  // keep changing while it is open).
  const [initial, setInitial] = useState({ time: '', cost: '' })
  useEffect(() => {
    if (!open) return
    const time = initialMinutes(timeRemaining)
    const cost = initialCost(costRemaining)
    setTimeText(time)
    setCostText(cost)
    setInitial({ time, cost })
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const timeMinutes = Math.floor(parseNumber(timeText))
  const costAmount = Math.floor(parseNumber(costText))
  const hasTime = timeRemaining !== undefined
  const hasCost = costRemaining !== undefined
  const timeChanged = timeText !== initial.time
  const costChanged = costText !== initial.cost

  const dirty = timeChanged || costChanged
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false), raised)

  const save = () => {
    if (!timeChanged && !costChanged) return
    requestNotificationPermission()
    if (timeChanged && timeMinutes > 0) onSaveTime(timeMinutes)
    if (costChanged && costAmount > 0) onSaveCost(costAmount)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent className="sm:max-w-sm" raised={raised}>
          <DialogHeader>
            <DialogTitle>محدودیت</DialogTitle>
            <DialogDescription>
              زمان یا هزینه‌ی باقی‌مانده تا پایان هر محدودیت را وارد کنید؛ هر دو مستقل از هم کار می‌کنند.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="limit-time">زمانی (دقیقه باقی‌مانده)</Label>
              {hasTime && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  onClick={() => setConfirmRemove('time')}
                >
                  <Trash2 /> حذف
                </Button>
              )}
            </div>
            <Input
              id="limit-time"
              dir="ltr"
              inputMode="numeric"
              placeholder="بدون محدودیت"
              value={timeMinutes > 0 ? formatNumber(timeMinutes) : timeText}
              onChange={(e) => setTimeText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="limit-cost">هزینه‌ای (تومان باقی‌مانده)</Label>
              {hasCost && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  onClick={() => setConfirmRemove('cost')}
                >
                  <Trash2 /> حذف
                </Button>
              )}
            </div>
            <Input
              id="limit-cost"
              dir="ltr"
              inputMode="numeric"
              placeholder="بدون محدودیت"
              value={costAmount > 0 ? formatNumber(costAmount) : costText}
              onChange={(e) => setCostText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!timeChanged && !costChanged} onClick={save}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent raised={raised}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              حذف محدودیت {confirmRemove === 'time' ? 'زمانی' : 'هزینه'}؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              این محدودیت حذف می‌شود و دیگر هشداری برای پایان آن نمایش داده نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const kind = confirmRemove
                setConfirmRemove(null)
                if (kind === 'time') {
                  onRemoveTime()
                  setTimeText('')
                  setInitial((i) => ({ ...i, time: '' }))
                } else if (kind === 'cost') {
                  onRemoveCost()
                  setCostText('')
                  setInitial((i) => ({ ...i, cost: '' }))
                }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dialog}
    </>
  )
}
