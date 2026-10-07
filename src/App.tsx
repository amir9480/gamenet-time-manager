import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, LayoutGrid, Moon, Plus, Rows3, Sun, Users } from 'lucide-react'
import { AddSessionDialog } from '@/components/AddSessionDialog'
import { AppIcon } from '@/components/AppIcon'
import { HistoryDialog } from '@/components/HistoryDialog'
import { LiveClock } from '@/components/LiveClock'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { SessionCard } from '@/components/SessionCard'
import { CustomersDialog } from '@/components/CustomersDialog'
import { SettingsDialog, type SettingsTab } from '@/components/SettingsDialog'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tip } from '@/components/Tip'
import {
  addSessionRow,
  endSessionRow,
  markOnboarded,
  needsOnboarding,
  readSessions,
  readSettings,
  saveSettings,
  updateSessionRow,
} from '@/lib/db'
import {
  buildHistoryEntry,
  createSession,
  usageOf,
  type Device,
  type FlatPrice,
} from '@/lib/store'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Tip label={theme === 'dark' ? 'تم روشن' : 'تم تیره'}>
      <Button
        variant="outline"
        size="icon"
        aria-label="تغییر تم"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  )
}

function Main() {
  const { title, view, setView, grouping } = useTheme()
  const settings = useLiveQuery(readSettings)
  const sessions = useLiveQuery(readSessions)
  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customersOpen, setCustomersOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  // Device-type filter (category name); null = all types.
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Only a brand-new database gets the onboarding dialog.
  useEffect(() => {
    needsOnboarding().then(setOnboarding)
  }, [])
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')

  // Wait for IndexedDB so the empty state / default settings never flash.
  if (!settings || !sessions) return null

  const endSession = (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    const customer = settings.customers.find((c) => c.id === session.customerId)
    endSessionRow(buildHistoryEntry(session, customer, Date.now()))
  }

  const addSession = (device: Device, category: string, price: FlatPrice, customerId?: string) =>
    addSessionRow(createSession(device, category, price, customerId, Date.now()))

  // Device types that have devices; the filter / grouping UI needs more than one.
  const typeNames = settings.deviceCategories
    .filter((c) => settings.devices.some((d) => d.categoryId === c.id))
    .map((c) => c.name)
  const showTypes = grouping && typeNames.length > 1
  const activeType = showTypes && typeFilter && typeNames.includes(typeFilter) ? typeFilter : null
  // Grouped: one section per type (settings order); otherwise a single flat list.
  const sections: { name?: string; items: typeof sessions }[] = !showTypes
    ? [{ items: sessions }]
    : activeType
      ? [{ items: sessions.filter((x) => x.categoryName === activeType) }]
      : [...typeNames, ...new Set(sessions.map((x) => x.categoryName).filter((n) => !typeNames.includes(n)))]
          .map((name) => ({ name, items: sessions.filter((x) => x.categoryName === name) }))
          .filter((g) => g.items.length > 0)

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppIcon className="size-10" />
          <h1 className="text-2xl font-bold">{title}</h1>
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
            <Tip label="مشتریان">
              <Button
                variant="outline"
                size="icon"
                aria-label="مشتریان"
                onClick={() => setCustomersOpen(true)}
              >
                <Users />
              </Button>
            </Tip>
            <ThemeToggle />
            <SettingsDialog
              settings={settings}
              usage={usageOf(sessions)}
              onChange={saveSettings}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              initialTab={settingsTab}
            />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {sessions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed p-10 text-center">
            <LiveClock size="large" />
            <AppIcon className="size-20 opacity-80" />
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">تایمی در جریان نیست</h2>
              <p className="text-sm text-muted-foreground">
                {settings.devices.length === 0
                  ? 'هنوز دستگاهی تعریف نشده است. ابتدا دستگاه‌های خود را در تنظیمات اضافه کنید.'
                  : 'هنوز هیچ تایمی ثبت نشده است. برای شروع، یک تایم جدید اضافه کنید.'}
              </p>
            </div>
            {settings.devices.length === 0 ? (
              <Button size="lg" onClick={() => openSettings('devices')}>
                <Plus /> افزودن دستگاه
              </Button>
            ) : (
              <Button size="lg" onClick={() => setAddOpen(true)}>
                <Plus /> افزودن تایم
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {showTypes && (
                  <>
                    <Button
                      size="sm"
                      variant={activeType === null ? 'default' : 'outline'}
                      aria-pressed={activeType === null}
                      onClick={() => setTypeFilter(null)}
                    >
                      همه ({sessions.length})
                    </Button>
                    {typeNames.map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant={activeType === t ? 'default' : 'outline'}
                        aria-pressed={activeType === t}
                        onClick={() => setTypeFilter(activeType === t ? null : t)}
                      >
                        {t} ({sessions.filter((x) => x.categoryName === t).length})
                      </Button>
                    ))}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tip label="نمای کامل">
                  <Button
                    size="icon-sm"
                    variant={view === 'detailed' ? 'secondary' : 'ghost'}
                    aria-label="نمای کامل"
                    aria-pressed={view === 'detailed'}
                    onClick={() => setView('detailed')}
                  >
                    <Rows3 />
                  </Button>
                </Tip>
                <Tip label="نمای فشرده">
                  <Button
                    size="icon-sm"
                    variant={view === 'compact' ? 'secondary' : 'ghost'}
                    aria-label="نمای فشرده"
                    aria-pressed={view === 'compact'}
                    onClick={() => setView('compact')}
                  >
                    <LayoutGrid />
                  </Button>
                </Tip>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus /> افزودن تایم
                </Button>
              </div>
            </div>
            {sections.map((sec) => (
              <section key={sec.name ?? 'all'} className="flex flex-col gap-2">
                {sec.name && (
                  <h2 className="text-sm font-bold text-muted-foreground">
                    {sec.name} ({sec.items.length})
                  </h2>
                )}
                <div
                  className={
                    view === 'compact'
                      ? 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3'
                      : 'flex flex-col gap-3'
                  }
                >
                  {sec.items.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      sessions={sessions}
                      settings={settings}
                      compact={view === 'compact'}
                      onUpdate={(fn) => updateSessionRow(session.id, fn)}
                      onEnd={() => endSession(session.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      <OnboardingDialog
        open={onboarding}
        settings={settings}
        onFinish={async (next) => {
          await saveSettings(next)
          await markOnboarded()
          setOnboarding(false)
        }}
      />

      <CustomersDialog
        open={customersOpen}
        onOpenChange={setCustomersOpen}
        customers={settings.customers}
        usage={usageOf(sessions)}
      />

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
