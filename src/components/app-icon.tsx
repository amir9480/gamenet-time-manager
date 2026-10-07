import { lazy, Suspense } from 'react'
import { DEFAULT_ICON_SRC, type AppIconValue } from '@/lib/app-icon'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

// Loaded only when a Lucide icon is chosen, so the default build stays small.
const AppIconLucide = lazy(() => import('@/components/app-icon-lucide'))

// The app icon in the header / empty state; configurable in Settings.
export function AppIcon({ className, value }: { className?: string; value?: AppIconValue }) {
  const { icon } = useTheme()
  const v = value ?? icon

  if (v.kind === 'lucide') {
    return (
      <Suspense fallback={<span className={className} />}>
        <AppIconLucide name={v.name} className={cn('text-primary', className)} />
      </Suspense>
    )
  }
  const src = v.kind === 'custom' ? v.src : DEFAULT_ICON_SRC
  return <img src={src} alt="" className={cn('object-contain', className)} />
}
