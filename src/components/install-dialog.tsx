import { useEffect, useState } from 'react'
import { Globe, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { promptInstall, useInstall } from '@/lib/install'
import { fetchLatestRelease, RELEASES_URL, type ReleaseInfo } from '@/lib/release'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Hides the PWA option (opened from a Windows-only feature such as autostart).
  windowsOnly?: boolean
}

// Web version only: install it as a PWA, or download the Windows desktop app from GitHub releases.
export function InstallDialog({ open, onOpenChange, windowsOnly }: Props) {
  const { canPrompt } = useInstall()
  const [release, setRelease] = useState<ReleaseInfo | null>(null)

  useEffect(() => {
    if (open) fetchLatestRelease().then(setRelease)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>نصب برنامه</DialogTitle>
          <DialogDescription>
            برنامه را یک‌بار نصب کنید تا مثل یک برنامه‌ی معمولی و حتی بدون اینترنت اجرا شود.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!windowsOnly && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <b className="flex items-center gap-2">
              <Globe className="size-4" /> نسخه‌ی وب (PWA)
            </b>
            {canPrompt ? (
              <>
                <p className="text-sm text-muted-foreground">
                  بدون دانلود فایل، مستقیم از مرورگر نصب می‌شود.
                </p>
                <Button
                  className="self-start"
                  onClick={async () => {
                    await promptInstall()
                    onOpenChange(false)
                  }}
                >
                  نصب نسخه‌ی وب
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                از منوی مرورگر گزینه‌ی «Install app» یا «Add to Home screen» را بزنید. اگر آن را
                نمی‌بینید، مرورگر شما نصب را پشتیبانی نمی‌کند یا برنامه از قبل نصب شده است.
              </p>
            )}
          </div>
          )}

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <b className="flex items-center gap-2">
              <Monitor className="size-4" /> نسخه‌ی ویندوز (exe)
            </b>
            <p className="text-sm text-muted-foreground">
              . اطلاعات نسخه‌ی وب و
              ویندوز جدا هستند؛ با پشتیبان‌گیری منتقل کنید.
            </p>
            <p className="text-sm text-muted-foreground">
              نسخه ویندوز قابلیت اجرای برنامه به محض راه اندازی سیستم را دارد.
            </p>
            <Button
              variant="outline"
              className="self-start"
              nativeButton={false}
              render={
                <a
                  href={release?.installerUrl ?? RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              دانلود نسخه‌ی ویندوز
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
