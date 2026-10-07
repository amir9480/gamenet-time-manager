import { useState } from 'react'
import { Info, KeyRound, ShieldCheck, ShieldOff, Timer } from 'lucide-react'
import { PinInput } from '@/components/pin-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import {
  isValidPin,
  PIN_MAX,
  PIN_MIN,
  removePin,
  setPin,
  setTimeoutMin,
  TIMEOUT_OPTIONS,
  useSecurity,
  verifyPin,
} from '@/lib/security'

const TIMEOUT_ITEMS = TIMEOUT_OPTIONS.map((m) => ({
  value: String(m),
  label: m === 0 ? 'هرگز' : `${formatNumber(m)} دقیقه`,
}))

function PinField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <PinInput id={id} value={value} onChange={onChange} />
    </div>
  )
}

type Mode = 'idle' | 'set' | 'change' | 'remove'

const FORM_TITLES: Record<Exclude<Mode, 'idle'>, string> = {
  set: 'تعیین رمز',
  change: 'تغییر رمز',
  remove: 'حذف رمز',
}

// Acts immediately (not part of the Settings draft): set / change / remove the PIN and the
// auto-lock timeout.
export function SecuritySettings() {
  const { hasPin, record } = useSecurity()
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setMode('idle')
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
  }

  const submit = async () => {
    setError('')
    if (mode !== 'remove') {
      if (!isValidPin(next)) return setError(`رمز باید ${PIN_MIN} تا ${PIN_MAX} رقم باشد.`)
      if (next !== confirm) return setError('تکرار رمز با رمز جدید یکسان نیست.')
    }
    setBusy(true)
    try {
      if (mode !== 'set') {
        const res = mode === 'remove' ? await removePin(current) : await verifyPin(current)
        if (!res.ok) {
          setError(
            res.reason === 'wait'
              ? 'تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره امتحان کنید.'
              : 'رمز فعلی اشتباه است.',
          )
          return
        }
      }
      if (mode !== 'remove') await setPin(next)
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        تغییرات این بخش بلافاصله اعمال می‌شود و نیازی به دکمه‌ی ذخیره ندارد.
      </p>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
            hasPin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {hasPin ? <ShieldCheck className="size-6" /> : <ShieldOff className="size-6" />}
        </span>
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <h3 className="font-bold">{hasPin ? 'قفل برنامه فعال است' : 'قفل برنامه غیرفعال است'}</h3>
          <p className="text-sm text-muted-foreground">
            {hasPin
              ? 'برنامه هنگام باز شدن و پس از بی‌کاری قفل می‌شود؛ با دکمه‌ی قفل بالای صفحه هم می‌توانید فوراً قفلش کنید.'
              : 'با تعیین رمز، دسترسی به تایم‌ها، تاریخچه و تنظیمات فقط با وارد کردن رمز ممکن می‌شود.'}
          </p>
        </div>
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {hasPin ? (
              <>
                <Button variant="outline" onClick={() => setMode('change')}>
                  <KeyRound /> تغییر رمز
                </Button>
                <Button variant="outline" onClick={() => setMode('remove')}>
                  حذف رمز
                </Button>
              </>
            ) : (
              <Button onClick={() => setMode('set')}>
                <KeyRound /> تعیین رمز
              </Button>
            )}
          </div>
        )}
      </section>

      {mode !== 'idle' && (
        <form
          className="flex flex-col gap-4 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <h3 className="font-bold">{FORM_TITLES[mode]}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {mode !== 'set' && (
              <PinField id="pin-current" label="رمز فعلی" value={current} onChange={setCurrent} />
            )}
            {mode !== 'remove' && (
              <>
                <PinField id="pin-new" label="رمز جدید" value={next} onChange={setNext} />
                <PinField id="pin-confirm" label="تکرار رمز" value={confirm} onChange={setConfirm} />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'remove'
              ? 'برای حذف قفل، رمز فعلی را وارد کنید. اطلاعات برنامه حفظ می‌شود.'
              : `رمز باید ${formatNumber(PIN_MIN)} تا ${formatNumber(PIN_MAX)} رقم (فقط عدد) باشد.`}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={mode === 'remove' ? 'destructive' : 'default'}
              disabled={busy}
            >
              {mode === 'remove' ? 'حذف رمز' : 'ذخیره رمز'}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              انصراف
            </Button>
          </div>
        </form>
      )}

      {hasPin && record && (
        <section className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Timer className="size-6" />
          </span>
          <div className="flex min-w-48 flex-1 flex-col gap-0.5">
            <h3 className="font-bold">قفل خودکار</h3>
            <p className="text-sm text-muted-foreground">
              اگر این مدت به برنامه دست نزنید، دوباره قفل می‌شود.
            </p>
          </div>
          <Select
            items={TIMEOUT_ITEMS}
            value={String(record.timeoutMin)}
            onValueChange={(v) => void setTimeoutMin(Number(v))}
          >
            <SelectTrigger className="w-40" aria-label="مدت قفل خودکار">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEOUT_ITEMS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          رمز به‌صورت هش‌شده روی همین مرورگر نگهداری می‌شود و در پشتیبان‌گیری قرار نمی‌گیرد. اگر رمز را
          فراموش کردید، در صفحه‌ی قفل گزینه‌ی «فراموشی رمز» را بزنید؛ حذف رمز ۲۴ ساعت بعد ممکن است.
        </span>
      </p>
    </div>
  )
}
