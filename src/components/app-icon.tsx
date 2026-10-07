import { Component, lazy, Suspense, type ReactNode } from 'react'
import { DEFAULT_ICON_SRC, type AppIconValue } from '@/lib/app-icon'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

// Loaded only when a Lucide icon is chosen, so the default build stays small.
const AppIconLucide = lazy(() => import('@/components/app-icon-lucide'))

// A lazy chunk that fails to load (e.g. offline and not cached) shows the default icon instead
// of unmounting the whole app.
class LoadGuard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// The app icon in the header / empty state; configurable in Settings.
export function AppIcon({ className, value }: { className?: string; value?: AppIconValue }) {
  const { icon } = useTheme()
  const v = value ?? icon
  const img = (src: string) => (
    <img src={src} alt="" className={cn('object-contain', className)} />
  )

  if (v.kind === 'lucide') {
    return (
      <LoadGuard fallback={img(DEFAULT_ICON_SRC)}>
        <Suspense fallback={<span className={className} />}>
          <AppIconLucide name={v.name} className={cn('text-primary', className)} />
        </Suspense>
      </LoadGuard>
    )
  }
  return img(v.kind === 'custom' ? v.src : DEFAULT_ICON_SRC)
}
