import { useEffect, useState } from 'react'
import type { DriveStep } from 'driver.js'
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
import { MinutesInput } from '@/components/ui/minutes-input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { useDiscardGuard } from '@/components/discard-dialog'
import { TourHelpButton } from '@/components/tour-help-button'
import { formatNumber, parseNumber } from '@/lib/format'
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
import { MINUTE_MS } from '@/lib/store'

// Guide of this dialog (opens by itself the first time, or F1 / the «?» button). The steps point at
// the `data-tour` attributes below, so keep the two in sync when the markup changes.
export const limitTour: TourDef = {
  id: 'limit',
  present: tourSel('limit-time'),
  priority: 40,
  steps: (): DriveStep[] => [
    {
      element: tourSel('limit-time'),
      waitForElement: 2000,
      disableActiveInteraction: true,
      popover: {
        title: 'محدودیت زمانی',
        description:
          'تعداد دقیقه‌هایی را بنویسید که از همین لحظه تا پایان محدودیت باقی می‌ماند؛ مثلاً ۳۰ یعنی نیم ساعت دیگر هشدار می‌گیرید. مدت توقف تایم حساب نمی‌شود. اگر قبلاً محدودیتی گذاشته‌اید، مقدار باقی‌مانده‌ی آن را می‌بینید و می‌توانید تغییرش دهید.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('limit-cost'),
      disableActiveInteraction: true,
      popover: {
        title: 'محدودیت هزینه‌ای',
        description:
          'مبلغی (به تومان) که از همین لحظه تا رسیدن به سقف هزینه باقی می‌ماند. وقتی هزینه‌ی تایم به آن برسد هشدار می‌گیرید. محدودیت زمانی و هزینه‌ای مستقل از هم‌اند؛ می‌توانید یکی یا هر دو را بگذارید.',
        side: 'top',
      },
    },
    {
      element: '[data-tour^="limit-remove"]',
      skipMissingElement: true,
      disableActiveInteraction: true,
      popover: {
        title: 'حذف محدودیت',
        description: 'محدودیتی که قبلاً گذاشته‌اید را با این دکمه کاملاً برمی‌دارید تا دیگر هشداری نمایش داده نشود.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('limit-save'),
      disableActiveInteraction: true,
      popover: {
        title: 'ذخیره',
        description:
          'محدودیت دقیقاً از لحظه‌ای شروع می‌شود که «ذخیره» را می‌زنید، نه از شروع تایم. مثلاً اگر تایم یک ساعت است و الان ۱۵ دقیقه‌ی زمانی می‌گذارید، ۱۵ دقیقه‌ی دیگر هشدار می‌گیرید.',
        side: 'top',
      },
    },
  ],
}

registerTour(limitTour)

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

  // The first time the dialog opens, the guide starts by itself (unless guides were skipped).
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (tourSkipped() || tourSeen('limit-seen') || isTourActive()) return
      markTourSeen('limit-seen')
      startTour(limitTour, () => {})
    }, 400)
    return () => window.clearTimeout(t)
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
      <Dialog
        open={open}
        onOpenChange={(o, details) => {
          if (o) onOpenChange(true)
          // The guide's popover lives outside the dialog; clicking it must not close the dialog.
          else if (isTourActive() && details.reason === 'outside-press') return
          else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-sm" raised={raised}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1">
              محدودیت
              <TourHelpButton tour="limit" />
            </DialogTitle>
            <DialogDescription>
              زمان یا هزینه‌ی باقی‌مانده تا پایان هر محدودیت را وارد کنید؛ هر دو مستقل از هم کار می‌کنند.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5" data-tour="limit-time">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="limit-time">زمانی (دقیقه باقی‌مانده)</Label>
              {hasTime && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  data-tour="limit-remove-time"
                  onClick={() => setConfirmRemove('time')}
                >
                  <Trash2 /> حذف
                </Button>
              )}
            </div>
            <MinutesInput
              id="limit-time"
              placeholder="بدون محدودیت زمانی"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <div className="flex flex-col gap-1.5" data-tour="limit-cost">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="limit-cost">هزینه‌ای (تومان باقی‌مانده)</Label>
              {hasCost && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  data-tour="limit-remove-cost"
                  onClick={() => setConfirmRemove('cost')}
                >
                  <Trash2 /> حذف
                </Button>
              )}
            </div>
            <MoneyInput
              id="limit-cost"
              placeholder="بدون محدودیت هزینه"
              value={costAmount > 0 ? formatNumber(costAmount) : costText}
              onChange={(e) => setCostText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button data-tour="limit-save" disabled={!timeChanged && !costChanged} onClick={save}>
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
