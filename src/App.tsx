import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, LayoutGrid, Moon, Plus, Rows3, Search, Sun, Users, X } from 'lucide-react'
import { AddSessionDialog } from '@/components/add-session-dialog'
import { AppIcon } from '@/components/app-icon'
import { HistoryDialog } from '@/components/history-dialog'
import { LimitAlarmDialog } from '@/components/limit-alarm-dialog'
import { LiveClock } from '@/components/live-clock'
import { OnboardingDialog } from '@/components/onboarding-dialog'
import { SessionCard } from '@/components/session-card'
import { CustomersDialog } from '@/components/customers-dialog'
import { SettingsDialog, type SettingsTab } from '@/components/settings-dialog'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tip } from '@/components/tip'
import { rank } from '@/lib/search'
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
  sessionSearchFields,
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
  const [query, setQuery] = useState('')

  // Only a brand-new database gets the onboarding dialog.
  useEffect(() => {
    needsOnboarding().then(setOnboarding)
  }, [])
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')

  // Wait for IndexedDB so the empty state / default settings never flash.
  if (!settings || !sessions) return null

  const endSession = (id: string, finalTotal?: number, onAccount?: boolean) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    const customer = settings.customers.find((c) => c.id === session.customerId)
    endSessionRow(buildHistoryEntry(session, customer, Date.now(), finalTotal, onAccount))
  }

  const addSession = (
    device: Device,
    category: string,
    price: FlatPrice,
    customerId?: string,
    limitMinutes?: number,
  ) => addSessionRow(createSession(device, category, price, customerId, Date.now(), limitMinutes))

  // Device types that have devices; the filter / grouping UI needs more than one.
  const typeNames = settings.deviceCategories
    .filter((c) => settings.devices.some((d) => d.categoryId === c.id))
    .map((c) => c.name)
  const showTypes = grouping && typeNames.length > 1
  const activeType = showTypes && typeFilter && typeNames.includes(typeFilter) ? typeFilter : null
  // Search over every parameter of the running sessions.
  const needle = query.trim()
  const now = Date.now()
  const found = needle
    ? rank(sessions, needle, (x) =>
        sessionSearchFields(x, settings.customers.find((c) => c.id === x.customerId), now),
      )
    : sessions
  // Grouped: one section per type (settings order). A chosen type is shown alone, or first
  // with the other types dimmed while searching; otherwise a single flat list.
  const allTypes = [
    ...typeNames,
    ...new Set(sessions.map((x) => x.categoryName).filter((n) => !typeNames.includes(n))),
  ]
  // Other types only appear (dimmed) while searching.
  const ordered = !activeType
    ? allTypes
    : needle
      ? [activeType, ...allTypes.filter((t) => t !== activeType)]
      : [activeType]
  const sections: { name?: string; dim?: boolean; items: typeof sessions }[] = !showTypes
    ? [{ items: found }]
    : ordered
        .map((name) => ({
          name,
          dim: activeType !== null && name !== activeType,
          items: found.filter((x) => x.categoryName === name),
        }))
        .filter((g) => g.items.length > 0)

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="sticky top-0 z-40 -mx-4 -mt-4 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:-mt-6 md:px-6">
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
                      همه ({found.length})
                    </Button>
                    {typeNames.map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant={activeType === t ? 'default' : 'outline'}
                        aria-pressed={activeType === t}
                        onClick={() => setTypeFilter(activeType === t ? null : t)}
                      >
                        {t} ({found.filter((x) => x.categoryName === t).length})
                      </Button>
                    ))}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="جستجوی تایم‌ها"
                    placeholder="جستجو در تایم‌ها…"
                    className="h-7 w-44 ps-7 pe-7 text-sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="پاک کردن جستجو"
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setQuery('')}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
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
            {found.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">تایمی پیدا نشد.</p>
            )}
            {sections.map((sec) => (
              <section
                key={sec.name ?? 'all'}
                className={`flex flex-col gap-2 ${sec.dim ? 'opacity-50' : ''}`}
              >
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
                      onEnd={(total, onAccount) => endSession(session.id, total, onAccount)}
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

      <LimitAlarmDialog
        sessions={sessions}
        settings={settings}
        onUpdate={(id, fn) => updateSessionRow(id, fn)}
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
