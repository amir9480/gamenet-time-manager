import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { Accent } from '@/lib/accents'
import { DEFAULT_ICON, type AppIconValue } from '@/lib/app-icon'
import {
  DEFAULT_QUICK_EXTEND,
  DEFAULT_ROUNDING,
  useLocalStorage,
  type QuickExtend,
  type Rounding,
} from '@/lib/store'

export type Theme = 'light' | 'dark'

export type ViewMode = 'detailed' | 'compact'

export const DEFAULT_TITLE = 'نرم افزار مدیریت زمان گیم نت'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  accent: Accent
  setAccent: (a: Accent) => void
  // App title shown in the header / window title; the user can rename it in Settings.
  title: string
  setTitle: (t: string) => void
  // App icon shown in the header / empty state.
  icon: AppIconValue
  setIcon: (i: AppIconValue) => void
  // Main list layout (toggled on the main page).
  view: ViewMode
  setView: (v: ViewMode) => void
  // Group / filter timers by device type (edited in Settings).
  grouping: boolean
  setGrouping: (g: boolean) => void
  // How the «رند کردن» button rounds the final amount when ending a timer.
  rounding: Rounding
  setRounding: (r: Rounding) => void
  // How much a click of «کمی بیشتر» adds on the limit alarm.
  quickExtend: QuickExtend
  setQuickExtend: (q: QuickExtend) => void
}>({
  theme: 'light',
  setTheme: () => {},
  accent: 'teal',
  setAccent: () => {},
  title: DEFAULT_TITLE,
  setTitle: () => {},
  icon: DEFAULT_ICON,
  setIcon: () => {},
  view: 'compact',
  setView: () => {},
  grouping: true,
  setGrouping: () => {},
  rounding: DEFAULT_ROUNDING,
  setRounding: () => {},
  quickExtend: DEFAULT_QUICK_EXTEND,
  setQuickExtend: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>('gamenet-theme', () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  const [accent, setAccent] = useLocalStorage<Accent>('gamenet-accent', () => 'teal')

  const [storedTitle, setTitle] = useLocalStorage<string>('gamenet-title', () => DEFAULT_TITLE)
  const title = storedTitle.trim() || DEFAULT_TITLE
  const [icon, setIcon] = useLocalStorage<AppIconValue>('gamenet-icon', () => DEFAULT_ICON)

  const [view, setView] = useLocalStorage<ViewMode>('gamenet-view', () => 'compact')
  const [grouping, setGrouping] = useLocalStorage<boolean>('gamenet-grouping', () => true)

  const [storedRounding, setRounding] = useLocalStorage<Rounding>('gamenet-rounding', () => DEFAULT_ROUNDING)
  // Older saved values have no `auto`: fall back to the defaults.
  const rounding = { ...DEFAULT_ROUNDING, ...storedRounding }

  const [storedQuickExtend, setQuickExtend] = useLocalStorage<QuickExtend>(
    'gamenet-quick-extend',
    () => DEFAULT_QUICK_EXTEND,
  )
  const quickExtend = { ...DEFAULT_QUICK_EXTEND, ...storedQuickExtend }

  useEffect(() => {
    document.title = title
    // The native window title is separate from document.title in the desktop app.
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/window')
        .then((m) => m.getCurrentWindow().setTitle(title))
        .catch(() => {})
    }
  }, [title])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent, title, setTitle, icon, setIcon, view, setView, grouping, setGrouping, rounding, setRounding, quickExtend, setQuickExtend }}>{children}</ThemeContext.Provider>
}
