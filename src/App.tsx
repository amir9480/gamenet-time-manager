import { useState } from 'react'
import { Moon, Plus, Sun } from 'lucide-react'
import { AddSessionDialog } from '@/components/AddSessionDialog'
import { SessionCard } from '@/components/SessionCard'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  applyPriceTypes,
  createSession,
  defaultSettings,
  useLocalStorage,
  type PriceType,
  type Session,
  type Settings,
} from '@/lib/store'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="تغییر تم"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

function Main() {
  const [settings, setSettings] = useLocalStorage<Settings>('gamenet-settings-v5', defaultSettings)
  const [sessions, setSessions] = useLocalStorage<Session[]>('gamenet-sessions-v6', () => [])
  const [addOpen, setAddOpen] = useState(false)

  const updateSession = (id: string, fn: (s: Session) => Session) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)))

  const applySettings = (next: Settings) => {
    setSettings(next)
    setSessions((prev) => applyPriceTypes(prev, next.priceTypes))
  }

  const endSession = (id: string) => setSessions((prev) => prev.filter((s) => s.id !== id))

  const addSession = (type: PriceType, name: string) =>
    setSessions((prev) => [...prev, createSession(prev, type, name, Date.now())])

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <h1 className="text-2xl font-bold">گیم نت رضا</h1>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <SettingsDialog settings={settings} onChange={applySettings} />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {sessions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
            <img src="/favicon.svg" alt="" className="size-20 opacity-80" />
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">نشستی در جریان نیست</h2>
              <p className="text-sm text-muted-foreground">
                هنوز هیچ نشستی ثبت نشده است. برای شروع، یک نشست جدید اضافه کنید.
              </p>
            </div>
            <Button size="lg" onClick={() => setAddOpen(true)}>
              <Plus /> افزودن نشست
            </Button>
          </div>
        ) : (
          <>
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                settings={settings}
                onUpdate={(fn) => updateSession(session.id, fn)}
                onEnd={() => endSession(session.id)}
              />
            ))}
            <Button
              variant="outline"
              size="lg"
              className="h-14 w-full border-dashed"
              onClick={() => setAddOpen(true)}
            >
              <Plus /> افزودن نشست
            </Button>
          </>
        )}
      </main>

      <AddSessionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        settings={settings}
        sessions={sessions}
        onCreate={addSession}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Main />
    </ThemeProvider>
  )
}
