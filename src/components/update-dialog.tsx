import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { APP_VERSION, isTauri } from '@/lib/platform'
import { useUpdate } from '@/lib/update'

// Offers a new version (desktop: downloads the installer from GitHub; web: reloads into the new
// service worker). «رد کردن این نسخه» silences this version until a newer one appears.
export function UpdateDialog({ enabled }: { enabled: boolean }) {
  const { available, release, busy, progress, error, apply, skip, later } = useUpdate()
  const desktop = isTauri()

  return (
    <Dialog open={enabled && available} onOpenChange={(o) => !o && !busy && later()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" /> نسخه‌ی جدید برنامه
          </DialogTitle>
          <DialogDescription>
            {release ? (
              <>
                نسخه‌ی <span dir="ltr">{release.version}</span> منتشر شده است (نسخه‌ی شما:{' '}
                <span dir="ltr">{APP_VERSION}</span>).
              </>
            ) : (
              'نسخه‌ی تازه‌ای از برنامه آماده‌ی نصب است.'
            )}
          </DialogDescription>
        </DialogHeader>

        {release?.notes && (
          <div className="flex flex-col gap-1 rounded-lg bg-primary/5 p-3 text-sm">
            <b>تغییرات</b>
            <p className="line-clamp-8 whitespace-pre-line" dir="auto">
              {release.notes}
            </p>
          </div>
        )}

        {desktop && busy && (
          <div className="flex flex-col gap-1 text-sm">
            <div className="h-2 overflow-hidden rounded-full bg-muted" dir="ltr">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </div>
            <span className="text-muted-foreground">
              در حال دانلود نصب‌کننده؛ پس از آن برنامه بسته می‌شود و نصب‌کننده اجرا می‌شود…
            </span>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {desktop && (
            <Button variant="ghost" disabled={busy} onClick={skip}>
              رد کردن این نسخه
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={later}>
            بعداً
          </Button>
          <Button disabled={busy} onClick={apply}>
            <Download /> {desktop ? 'دانلود و نصب' : 'به‌روزرسانی'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
