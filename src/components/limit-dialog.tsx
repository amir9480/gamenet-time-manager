import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  // Time left before the limit (ms, may be negative); undefined = no limit yet.
  remainingMs: number | undefined
  onSave: (minutes: number) => void
  onRemove: () => void
  // Opened over the limit alarm.
  raised?: boolean
}

// Starts from the remaining minutes: with 15 min left, enter 45 to give 30 more.
export const initialMinutes = (remainingMs: number | undefined) =>
  remainingMs === undefined ? '' : String(Math.max(0, Math.ceil(remainingMs / MINUTE_MS)))

export function LimitDialog({ open, onOpenChange, remainingMs, onSave, onRemove, raised }: Props) {
  const [text, setText] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Start from the current remaining time every time the dialog opens (snapshot: the remaining
  // time keeps changing while it is open).
  const [initial, setInitial] = useState('')
  useEffect(() => {
    if (!open) return
    const start = initialMinutes(remainingMs)
    setInitial(start)
    setText(start)
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const mins = Math.floor(parseNumber(text))
  const hasLimit = remainingMs !== undefined

  const dirty = text !== initial
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false), raised)

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent className="sm:max-w-sm" raised={raised}>
          <DialogHeader>
            <DialogTitle>{hasLimit ? 'ویرایش محدودیت زمانی' : 'محدودیت زمانی'}</DialogTitle>
            <DialogDescription>
              زمان باقی‌مانده تا پایان محدودیت را به دقیقه وارد کنید. با گذشت زمان از آن کم می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="limit-minutes">زمان باقی‌مانده (دقیقه)</Label>
            <Input
              id="limit-minutes"
              dir="ltr"
              inputMode="numeric"
              placeholder="0"
              autoFocus
              value={mins > 0 ? formatNumber(mins) : text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mins > 0) {
                  onSave(mins)
                  onOpenChange(false)
                }
              }}
            />
          </div>

          <DialogFooter className="sm:justify-between">
            {hasLimit ? (
              <Button variant="destructive" onClick={() => setConfirmRemove(true)}>
                <Trash2 /> حذف محدودیت
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={requestClose}>
                انصراف
              </Button>
              <Button
                disabled={mins <= 0}
                onClick={() => {
                  onSave(mins)
                  onOpenChange(false)
                }}
              >
                ذخیره
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent raised={raised}>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف محدودیت زمانی؟</AlertDialogTitle>
            <AlertDialogDescription>
              محدودیت زمانی این تایم حذف می‌شود و دیگر هشداری برای پایان زمان نمایش داده نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmRemove(false)
                onRemove()
                onOpenChange(false)
              }}
            >
              حذف محدودیت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dialog}
    </>
  )
}
