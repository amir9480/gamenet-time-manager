import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Accent } from '@/lib/accents'
import { DEFAULT_ICON, type AppIconValue } from '@/lib/app-icon'
import {
  DEFAULT_QUICK_EXTEND,
  DEFAULT_ROUNDING,
  prefKey,
  useLocalStorage,
  type QuickExtend,
  type Rounding,
} from '@/lib/store'

export type Theme = 'light' | 'dark'

// Unsaved look settings shown live while Settings is open; cleared when it closes.
export type LookPreview = { theme: Theme; accent: Accent; uiScale: number; fontScale: number }

export type ViewMode = 'detailed' | 'compact'

export const DEFAULT_TITLE = 'نرم افزار مدیریت زمان گیم نت'

export const SCALE_MIN = 70
export const SCALE_MAX = 200

const clampScale = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) : 100

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
  setPreview: (p: LookPreview | null) => void
  // Main list layout (toggled on the main page).
  view: ViewMode
  setView: (v: ViewMode) => void
  // Group / filter timers by device type (edited in Settings).
  grouping: boolean
  setGrouping: (g: boolean) => void
  // Whole-interface scale and text-only scale, in percent (Settings > عمومی).
  uiScale: number
  setUiScale: (n: number) => void
  fontScale: number
  setFontScale: (n: number) => void
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
  setPreview: () => {},
  view: 'compact',
  setView: () => {},
  grouping: true,
  setGrouping: () => {},
  uiScale: 100,
  setUiScale: () => {},
  fontScale: 100,
  setFontScale: () => {},
  rounding: DEFAULT_ROUNDING,
  setRounding: () => {},
  quickExtend: DEFAULT_QUICK_EXTEND,
  setQuickExtend: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>(prefKey('theme'), () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  const [accent, setAccent] = useLocalStorage<Accent>(prefKey('accent'), () => 'teal')

  const [storedTitle, setTitle] = useLocalStorage<string>(prefKey('title'), () => DEFAULT_TITLE)
  const title = storedTitle.trim() || DEFAULT_TITLE
  const [icon, setIcon] = useLocalStorage<AppIconValue>(prefKey('icon'), () => DEFAULT_ICON)

  const [view, setView] = useLocalStorage<ViewMode>(prefKey('view'), () => 'compact')
  const [grouping, setGrouping] = useLocalStorage<boolean>(prefKey('grouping'), () => true)

  const [storedRounding, setRounding] = useLocalStorage<Rounding>(prefKey('rounding'), () => DEFAULT_ROUNDING)
  // Older saved values have no `auto`: fall back to the defaults.
  const rounding = { ...DEFAULT_ROUNDING, ...storedRounding }

  // Percent values; older installs have none, so they get 100.
  const [storedUiScale, setUiScale] = useLocalStorage<number>(prefKey('ui-scale'), () => 100)
  const uiScale = clampScale(storedUiScale)
  const [storedFontScale, setFontScale] = useLocalStorage<number>(prefKey('font-scale'), () => 100)
  const fontScale = clampScale(storedFontScale)

  const [storedQuickExtend, setQuickExtend] = useLocalStorage<QuickExtend>(prefKey('quick-extend'), () => DEFAULT_QUICK_EXTEND)
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

  const [preview, setPreview] = useState<LookPreview | null>(null)
  const shownUiScale = preview ? clampScale(preview.uiScale) : uiScale
  const shownFontScale = preview ? clampScale(preview.fontScale) : fontScale
  const shownAccent = preview?.accent ?? accent
  const shownTheme = preview?.theme ?? theme

  useEffect(() => {
    document.documentElement.style.fontSize = `${shownUiScale}%`
  }, [shownUiScale])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(shownFontScale / 100))
  }, [shownFontScale])

  useEffect(() => {
    document.documentElement.dataset.accent = shownAccent
  }, [shownAccent])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', shownTheme === 'dark')
  }, [shownTheme])

  return <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent, title, setTitle, icon, setIcon, setPreview, view, setView, grouping, setGrouping, uiScale, setUiScale, fontScale, setFontScale, rounding, setRounding, quickExtend, setQuickExtend }}>{children}</ThemeContext.Provider>
}
