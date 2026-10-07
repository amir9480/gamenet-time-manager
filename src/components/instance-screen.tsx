import { AppWindow } from 'lucide-react'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { takeOver } from '@/lib/single-instance'

// The only thing rendered in a window that is not the active instance (see single-instance.ts).
export function InstanceScreen() {
  const { title } = useTheme()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <AppIcon className="size-16 opacity-80" />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            برنامه در پنجره‌ی دیگری باز است. برای جلوگیری از تداخل، برنامه فقط در یک پنجره اجرا
            می‌شود.
          </p>
        </div>
        <Button size="lg" onClick={takeOver}>
          <AppWindow /> استفاده در این پنجره
        </Button>
        <p className="text-xs text-muted-foreground">
          با این کار، پنجره‌ی دیگر غیرفعال می‌شود.
        </p>
      </div>
    </div>
  )
}
