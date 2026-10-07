import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PinInput } from '@/components/pin-input'
import { formatDuration } from '@/lib/format'
import { FORGOT_WAIT_MS, PIN_MIN, useSecurity, verifyPin } from '@/lib/security'
import { useNow } from '@/lib/use-now'

type Props = {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Re-asks for the PIN before an action taken from on top of the lock screen (the time-limit
// alarm stays visible while the app is locked, but every button on it must be re-authorized).
export function PinConfirmDialog({ open, onConfirm, onCancel }: Props) {
  const { record } = useSecurity()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const now = useNow(open)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setPin('')
    setError('')
    const id = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Mirrors the record directly (verifyPin writes it on every failed try), so the dialog
  // starts out disabled when already rate-limited or mid "forgot PIN", not just after a try.
  const waitLeft = record ? Math.max(0, record.lockedUntil - now) : 0
  const forgotAt = record?.forgotAt ?? null
  const forgotLeft = forgotAt !== null ? Math.max(0, forgotAt + FORGOT_WAIT_MS - now) : 0
  const disabled = busy || waitLeft > 0 || forgotAt !== null

  const submit = async () => {
    if (disabled || pin.length < PIN_MIN) return
    setBusy(true)
    const result = await verifyPin(pin)
    setBusy(false)
    setPin('')
    if (result.ok) return onConfirm()
    if (result.reason === 'wrong' && !result.until) {
      setError(`رمز اشتباه است. ${result.remaining} تلاش دیگر تا قفل موقت باقی مانده است.`)
    } else {
      setError('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent raised className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <DialogTitle>تأیید با رمز</DialogTitle>
          <DialogDescription>
            برنامه قفل است؛ برای انجام این کار رمز را وارد کنید.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <PinInput
            ref={input}
            aria-label="رمز"
            aria-invalid={!!error}
            disabled={disabled}
            value={pin}
            onChange={(v) => {
              setPin(v)
              setError('')
            }}
          />
          {forgotAt !== null ? (
            <p role="alert" className="text-center text-sm text-destructive">
              {forgotLeft > 0 ? (
                <>
                  به دلیل درخواست «فراموشی رمز»، تا{' '}
                  <span dir="ltr" className="font-mono font-bold">
                    {formatDuration(forgotLeft)}
                  </span>{' '}
                  دیگر نمی‌توانید رمز وارد کنید.
                </>
              ) : (
                'زمان انتظار «فراموشی رمز» تمام شده است؛ برای ادامه ابتدا رمز را از صفحه‌ی قفل حذف کنید.'
              )}
            </p>
          ) : waitLeft > 0 ? (
            <p role="alert" className="text-center text-sm text-destructive">
              به دلیل تلاش‌های ناموفق پشت سر هم، تا{' '}
              <span dir="ltr" className="font-mono font-bold">
                {formatDuration(waitLeft)}
              </span>{' '}
              دیگر نمی‌توانید رمز وارد کنید.
            </p>
          ) : error ? (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              انصراف
            </Button>
            <Button type="submit" disabled={disabled || pin.length < PIN_MIN}>
              <ShieldCheck /> تأیید
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
