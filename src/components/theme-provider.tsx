import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { Accent } from '@/lib/accents'
import { useLocalStorage } from '@/lib/store'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  accent: Accent
  setAccent: (a: Accent) => void
}>({
  theme: 'light',
  setTheme: () => {},
  accent: 'neutral',
  setAccent: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>('gamenet-theme', () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  const [accent, setAccent] = useLocalStorage<Accent>('gamenet-accent', () => 'neutral')

  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent }}>{children}</ThemeContext.Provider>
}
