import { useEffect, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { PinInput } from '@/components/pin-input'
import { formatDuration } from '@/lib/format'
import {
  cancelForgot,
  completeForgot,
  FORGOT_WAIT_MS,
  PIN_MIN,
  startForgot,
  unlock,
  useSecurity,
  verifyPin,
} from '@/lib/security'
import { useNow } from '@/lib/use-now'

// The only thing rendered while the app is locked (and until the security db has loaded).
export function LockScreen() {
  const { ready, locked, record } = useSecurity()
  const { title } = useTheme()
  const now = useNow(locked)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const forgotAt = record?.forgotAt ?? null
  const waitLeft = record ? Math.max(0, record.lockedUntil - now) : 0
  const forgotLeft = forgotAt !== null ? Math.max(0, forgotAt + FORGOT_WAIT_MS - now) : 0
  const disabled = busy || waitLeft > 0 || forgotAt !== null

  useEffect(() => {
    if (locked && !disabled) input.current?.focus()
  }, [locked, disabled])

  useEffect(() => {
    if (!locked) {
      setPin('')
      setError('')
    }
  }, [locked])

  if (!locked) return null
  if (!ready) return <div className="min-h-screen bg-background" />

  const submit = async () => {
    if (disabled || pin.length < PIN_MIN) return
    setBusy(true)
    const result = await verifyPin(pin)
    setBusy(false)
    setPin('')
    if (result.ok) return unlock()
    if (result.reason === 'wrong') {
      setError(
        result.until
          ? 'رمز اشتباه است. به دلیل تلاش‌های ناموفق پشت سر هم، موقتاً قفل شد.'
          : `رمز اشتباه است. ${result.remaining} تلاش دیگر تا قفل موقت باقی مانده است.`,
      )
    } else {
      setError('')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <AppIcon className="size-16 opacity-80" />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">برای ادامه، رمز را وارد کنید.</p>
        </div>

        <form
          className="flex w-full flex-col gap-3"
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
          <Button type="submit" size="lg" disabled={disabled || pin.length < PIN_MIN}>
            <LockKeyhole /> باز کردن قفل
          </Button>
        </form>

        {waitLeft > 0 && forgotAt === null && (
          <p role="alert" className="text-sm text-destructive">
            تلاش‌های ناموفق زیاد بود. تا{' '}
            <span dir="ltr" className="font-mono font-bold">
              {formatDuration(waitLeft)}
            </span>{' '}
            دیگر نمی‌توانید رمز وارد کنید.
          </p>
        )}
        {error && waitLeft === 0 && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {forgotAt === null ? (
          <Button type="button" variant="link" size="sm" onClick={() => void startForgot()}>
            فراموشی رمز
          </Button>
        ) : (
          <div className="flex w-full flex-col items-center gap-3 rounded-xl border p-4">
            {forgotLeft > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  حذف رمز تا پایان زمان انتظار ممکن نیست. تا آن زمان ورود با رمز غیرفعال است؛ برای
                  تلاش دوباره، درخواست را لغو کنید.
                </p>
                <span dir="ltr" className="font-mono text-2xl font-bold">
                  {formatDuration(forgotLeft)}
                </span>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  زمان انتظار تمام شد. با حذف رمز، قفل برنامه برداشته می‌شود (اطلاعات حفظ می‌شود).
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    if (await completeForgot()) unlock()
                  }}
                >
                  حذف رمز
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => void cancelForgot()}>
              لغو درخواست
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
