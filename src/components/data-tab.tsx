import { useRef, useState, type ReactNode } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  clearHistory,
  exportBackup,
  importBackup,
  parseBackup,
  resetAllData,
  type Backup,
} from '@/lib/db'
import { saveFile } from '@/lib/download'
import { formatNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/jalali'
import { useSecurity, verifyPin } from '@/lib/security'

const RESET_WORD = 'حذف'

// The data is replaced under the running app, so the page reloads to start from a clean state.
const reload = () => window.location.reload()

function Row({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      {children}
    </div>
  )
}

// Confirmation for a data operation: asks for the app PIN when one is set, and optionally the
// word «حذف». The body only mounts while open, so the inputs start empty every time.
function GuardedBody({
  title,
  description,
  needWord,
  actionLabel,
  destructive,
  onConfirm,
}: {
  title: string
  description: ReactNode
  needWord?: boolean
  actionLabel: string
  destructive: boolean
  onConfirm: () => void
}) {
  const { hasPin } = useSecurity()
  const [word, setWord] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const ready = (!needWord || word.trim() === RESET_WORD) && (!hasPin || pin.length > 0)

  const confirm = async () => {
    if (!hasPin) return onConfirm()
    setChecking(true)
    const res = await verifyPin(pin)
    setChecking(false)
    if (res.ok) return onConfirm()
    setPin('')
    if (res.reason === 'forgot') setError('فرایند فراموشی رمز در جریان است؛ ابتدا آن را لغو کنید.')
    else if (res.reason === 'wait') setError('تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره تلاش کنید.')
    else if (res.until) setError('رمز اشتباه است. تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره تلاش کنید.')
    else setError('رمز اشتباه است.')
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {description}
          {needWord && <> برای تایید، کلمه‌ی «{RESET_WORD}» را بنویسید.</>}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {needWord && (
        <Input
          aria-label="تایید پاک کردن"
          placeholder={RESET_WORD}
          value={word}
          onChange={(e) => setWord(e.target.value)}
        />
      )}
      {hasPin && (
        <Input
          type="password"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          aria-label="رمز برنامه"
          placeholder="رمز برنامه"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setError('')
          }}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel>انصراف</AlertDialogCancel>
        <AlertDialogAction
          variant={destructive ? 'destructive' : 'default'}
          disabled={!ready || checking}
          onClick={(e) => {
            e.preventDefault()
            void confirm()
          }}
        >
          {actionLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

function GuardedDialog({
  open,
  onClose,
  destructive = true,
  ...body
}: {
  open: boolean
  onClose: () => void
  title: string
  description: ReactNode
  needWord?: boolean
  actionLabel: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <GuardedBody {...body} destructive={destructive} />
    </AlertDialog>
  )
}

// Backup and cleanup. Unlike the other tabs these act immediately (not part of the draft).
export function DataTab({ activeSessions }: { activeSessions: number }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Backup | null>(null)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { hasPin } = useSecurity()

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch {
      setError('عملیات انجام نشد. دوباره تلاش کنید.')
    } finally {
      setBusy(false)
    }
  }

  const exportData = () =>
    run(async () => {
      const backup = await exportBackup()
      await saveFile(
        `gamenet-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup),
        'application/json',
      )
    })

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      setPending(parseBackup(JSON.parse(await file.text())))
    } catch {
      setError('فایل انتخاب‌شده یک فایل پشتیبان معتبر این برنامه نیست.')
    }
  }

  const count = (b: Backup, table: 'customers' | 'history' | 'sessions' | 'devices') =>
    b.tables[table].filter((r) => !(r as { deletedAt?: number }).deletedAt).length

  return (
    <div className="flex flex-col gap-3">
      <Row
        title="خروجی گرفتن"
        description="همه‌ی اطلاعات (نرخ‌ها، دستگاه‌ها، بوفه، مشتریان، تایم‌های در جریان، تاریخچه، نسیه‌ها و پرداخت‌ها) و تنظیمات ظاهری در یک فایل پشتیبان ذخیره می‌شود."
      >
        <Button variant="outline" disabled={busy} onClick={() => (hasPin ? setExporting(true) : exportData())}>
          <Download /> خروجی گرفتن
        </Button>
      </Row>

      <Row
        title="وارد کردن"
        description="اطلاعات فعلی با محتوای فایل پشتیبان جایگزین می‌شود. حتماً قبل از آن خروجی بگیرید."
      >
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload /> انتخاب فایل
        </Button>
        <Input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Row>

      <Row
        title="پاک کردن تاریخچه"
        description="فقط تایم‌های پایان‌یافته و آمار پاک می‌شوند؛ تنظیمات، مشتریان و تایم‌های در جریان می‌مانند."
      >
        <Button variant="destructive" disabled={busy} onClick={() => setClearingHistory(true)}>
          <Trash2 /> پاک کردن تاریخچه
        </Button>
      </Row>

      <Row
        title="پاک کردن همه‌ی داده‌ها"
        description="همه چیز (از جمله تایم‌های در جریان) پاک می‌شود و برنامه مثل بار اول، با تنظیمات پیش‌فرض شروع می‌کند."
      >
        <Button variant="destructive" disabled={busy} onClick={() => setResetting(true)}>
          <Trash2 /> پاک کردن همه
        </Button>
      </Row>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <GuardedDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="جایگزینی اطلاعات با فایل پشتیبان؟"
        description={
          pending && (
            <>
              فایل پشتیبان
              {pending.exportedAt > 0 && <> ({formatJalaliDateTime(pending.exportedAt)})</>} شامل{' '}
              {formatNumber(count(pending, 'devices'))} دستگاه،{' '}
              {formatNumber(count(pending, 'customers'))} مشتری،{' '}
              {formatNumber(count(pending, 'history'))} تایم در تاریخچه و{' '}
              {formatNumber(count(pending, 'sessions'))} تایم در جریان است. همه‌ی اطلاعات فعلی
              {activeSessions > 0 && <> (از جمله {formatNumber(activeSessions)} تایم در جریان)</>}{' '}
              حذف و با آن جایگزین می‌شود.
            </>
          )
        }
        needWord
        actionLabel="جایگزین کن"
        onConfirm={() => {
          const backup = pending
          setPending(null)
          if (backup)
            run(async () => {
              await importBackup(backup)
              reload()
            })
        }}
      />

      <GuardedDialog
        open={clearingHistory}
        onClose={() => setClearingHistory(false)}
        title="پاک کردن تاریخچه؟"
        description="همه‌ی تایم‌های پایان‌یافته و آمار آن‌ها برای همیشه پاک می‌شوند؛ نسیه‌های ثبت‌شده‌ی مشتریان (که از تاریخچه محاسبه می‌شوند) هم از بین می‌روند. این کار قابل بازگشت نیست؛ در صورت نیاز ابتدا خروجی بگیرید."
        actionLabel="پاک کن"
        onConfirm={() => {
          setClearingHistory(false)
          run(async () => {
            await clearHistory()
          })
        }}
      />

      <GuardedDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="پاک کردن همه‌ی داده‌ها؟"
        description={
          <>
            نرخ‌ها، دستگاه‌ها، بوفه، مشتریان، تاریخچه
            {activeSessions > 0 && <> و {formatNumber(activeSessions)} تایم در جریان</>} برای همیشه
            پاک می‌شوند و برنامه با تنظیمات پیش‌فرض دوباره شروع می‌شود.
          </>
        }
        needWord
        actionLabel="پاک کردن همه"
        onConfirm={() => {
          setResetting(false)
          run(async () => {
            await resetAllData()
            reload()
          })
        }}
      />

      <GuardedDialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="خروجی گرفتن"
        description="برای خروجی گرفتن از اطلاعات، رمز برنامه را وارد کنید."
        actionLabel="خروجی بگیر"
        destructive={false}
        onConfirm={() => {
          setExporting(false)
          exportData()
        }}
      />
    </div>
  )
}
