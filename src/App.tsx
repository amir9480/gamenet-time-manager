import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, Moon, Plus, Sun } from 'lucide-react'
import { AddSessionDialog } from '@/components/AddSessionDialog'
import { HistoryDialog } from '@/components/HistoryDialog'
import { LiveClock } from '@/components/LiveClock'
import { SessionCard } from '@/components/SessionCard'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tip } from '@/components/Tip'
import {
  addSessionRow,
  endSessionRow,
  readSessions,
  readSettings,
  saveSettings,
  updateSessionRow,
} from '@/lib/db'
import { buildHistoryEntry, createSession, type PriceType } from '@/lib/store'

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
  const settings = useLiveQuery(readSettings)
  const sessions = useLiveQuery(readSessions)
  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Wait for IndexedDB so the empty state / default settings never flash.
  if (!settings || !sessions) return null

  const endSession = (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (session) endSessionRow(buildHistoryEntry(session, Date.now()))
  }

  const addSession = (type: PriceType, name: string) =>
    addSessionRow(createSession(sessions, type, name, Date.now()))

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <h1 className="text-2xl font-bold">گیم نت رضا</h1>
        </div>
        <div className="flex items-center gap-3">
          {sessions.length > 0 && <LiveClock size="small" />}
          <div className="flex gap-2">
            <Tip label="تاریخچه">
              <Button
                variant="outline"
                size="icon"
                aria-label="تاریخچه"
                onClick={() => setHistoryOpen(true)}
              >
                <History />
              </Button>
            </Tip>
            <ThemeToggle />
            <SettingsDialog settings={settings} onChange={saveSettings} />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {sessions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed p-10 text-center">
            <LiveClock size="large" />
            <img src="/favicon.svg" alt="" className="size-20 opacity-80" />
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">نشستی در جریان نیست</h2>
              <p className="text-sm text-muted-foreground">
                هنوز هیچ نشستی ثبت نشده است. برای شروع، یک نشست جدید اضافه کنید.
              </p>
            </div>
            <Button size="lg" variant="secondary" onClick={() => setAddOpen(true)}>
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
                onUpdate={(fn) => updateSessionRow(session.id, fn)}
                onEnd={() => endSession(session.id)}
              />
            ))}
            <Button
              variant="secondary"
              size="lg"
              className="h-14 w-full"
              onClick={() => setAddOpen(true)}
            >
              <Plus /> افزودن نشست
            </Button>
          </>
        )}
      </main>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

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
      <TooltipProvider>
        <Main />
      </TooltipProvider>
    </ThemeProvider>
  )
}
