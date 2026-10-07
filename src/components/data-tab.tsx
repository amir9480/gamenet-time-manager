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
import { formatNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/jalali'

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

// Backup and cleanup. Unlike the other tabs these act immediately (not part of the draft).
export function DataTab({ activeSessions }: { activeSessions: number }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Backup | null>(null)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [word, setWord] = useState('')

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
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: 'application/json' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `gamenet-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
        <Button variant="outline" disabled={busy} onClick={exportData}>
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
        <input
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

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>جایگزینی اطلاعات با فایل پشتیبان؟</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  فایل پشتیبان
                  {pending.exportedAt > 0 && <> ({formatJalaliDateTime(pending.exportedAt)})</>}{' '}
                  شامل {formatNumber(count(pending, 'devices'))} دستگاه،{' '}
                  {formatNumber(count(pending, 'customers'))} مشتری،{' '}
                  {formatNumber(count(pending, 'history'))} تایم در تاریخچه و{' '}
                  {formatNumber(count(pending, 'sessions'))} تایم در جریان است. همه‌ی اطلاعات فعلی
                  {activeSessions > 0 && <> (از جمله {formatNumber(activeSessions)} تایم در جریان)</>}{' '}
                  حذف و با آن جایگزین می‌شود.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const backup = pending
                setPending(null)
                if (backup)
                  run(async () => {
                    await importBackup(backup)
                    reload()
                  })
              }}
            >
              جایگزین کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearingHistory} onOpenChange={setClearingHistory}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>پاک کردن تاریخچه؟</AlertDialogTitle>
            <AlertDialogDescription>
              همه‌ی تایم‌های پایان‌یافته و آمار آن‌ها برای همیشه پاک می‌شوند؛ نسیه‌های ثبت‌شده‌ی مشتریان (که از تاریخچه محاسبه می‌شوند) هم از بین می‌روند. این کار قابل بازگشت
              نیست؛ در صورت نیاز ابتدا خروجی بگیرید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setClearingHistory(false)
                run(async () => {
                  await clearHistory()
                })
              }}
            >
              پاک کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetting}
        onOpenChange={(o) => {
          setResetting(o)
          if (!o) setWord('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>پاک کردن همه‌ی داده‌ها؟</AlertDialogTitle>
            <AlertDialogDescription>
              نرخ‌ها، دستگاه‌ها، بوفه، مشتریان، تاریخچه
              {activeSessions > 0 && <> و {formatNumber(activeSessions)} تایم در جریان</>} برای
              همیشه پاک می‌شوند و برنامه با تنظیمات پیش‌فرض دوباره شروع می‌شود. برای تایید، کلمه‌ی «
              {RESET_WORD}» را بنویسید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label="تایید پاک کردن"
            placeholder={RESET_WORD}
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={word.trim() !== RESET_WORD}
              onClick={() => {
                setResetting(false)
                run(async () => {
                  await resetAllData()
                  reload()
                })
              }}
            >
              پاک کردن همه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
