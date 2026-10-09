import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, ChartNoAxesColumn, Eye, EyeOff, History, LayoutGrid, Moon, Lock, Download, Plus, Rows3, Search, Sun, Users, X } from 'lucide-react'
import { AddSessionDialog, addSessionTour } from '@/components/add-session-dialog'
import { AppIcon } from '@/components/app-icon'
import { InstallDialog } from '@/components/install-dialog'
import { HistoryDialog } from '@/components/history-dialog'
import { LimitAlarmDialog, LockedLimitAlarmDialog } from '@/components/limit-alarm-dialog'
import { InstanceScreen } from '@/components/instance-screen'
import { LiveClock } from '@/components/live-clock'
import { LockScreen } from '@/components/lock-screen'
import { NoticeDialog } from '@/components/notice-dialog'
import { OnboardingDialog } from '@/components/onboarding-dialog'
import { TourPromptDialog } from '@/components/tour-prompt-dialog'
import { SessionCard } from '@/components/session-card'
import { CustomersDialog } from '@/components/customers-dialog'
import { ShiftSummary } from '@/components/shift-summary'
import { SettingsDialog, type SettingsTab } from '@/components/settings-dialog'
import { UpdateDialog } from '@/components/update-dialog'
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tip } from '@/components/tip'
import { currentShift, SHIFT_VISIBLE_MS } from '@/lib/history'
import { acceptedNoticeVersion, acceptNotice, NOTICE_VERSION } from '@/lib/notice'
import { rank } from '@/lib/search'
import { installSeen, markInstallSeen, useInstall } from '@/lib/install'
import { APP_VERSION, REPO_URL } from '@/lib/platform'
import { lockNow, useSecurity } from '@/lib/security'
import { isTourActive, registerTour, skipTours, startGuide, tourSel, tourSkipped, type TourDef } from '@/lib/tour'
import { useInstance } from '@/lib/single-instance'
import { useIdleLock } from '@/lib/use-idle-lock'
import { useOverrideSplitter } from '@/lib/use-override-splitter'
import {
  addSessionRow,
  deleteSessionRow,
  endSessionWithWallet,
  markOnboarded,
  needsOnboarding,
  readRecentHistory,
  readSessions,
  readSettings,
  saveSettings,
  updateSessionRow,
} from '@/lib/db'
import {
  createSession,
  prefKey,
  sessionSearchFields,
  useLocalStorage,
  usageOf,
  type Device,
  type FlatPrice,
  type Session,
} from '@/lib/store'

// Guide of this page: points at «افزودن تایم»; clicking it continues with the add-session guide.
// The `data-tour="add-session"` buttons below are its targets.
const mainTour: TourDef = {
  id: 'main',
  present: tourSel('add-session'),
  priority: 0,
  steps: (ctx) => [
    {
      element: tourSel('add-session'),
      advanceOnClick: true,
      onHighlighted: (el) => el?.addEventListener('click', () => ctx.chainTo(addSessionTour), { once: true }),
      popover: {
        title: 'شروع اولین تایم',
        description: 'برای ساخت یک تایم جدید، روی «افزودن تایم» کلیک کنید.',
        side: 'bottom',
        showButtons: ['close'],
      },
    },
  ],
}
registerTour(mainTour)

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
  const { hasPin } = useSecurity()
  useIdleLock()
  const settings = useLiveQuery(readSettings)
  const sessions = useLiveQuery(readSessions)
  useOverrideSplitter(settings, sessions)
  const [addOpen, setAddOpen] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customersOpen, setCustomersOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  // Notice version accepted before this visit; the notice (shown before onboarding) is open
  // until the current version is accepted.
  const [noticeSince] = useState(acceptedNoticeVersion)
  const [noticeOk, setNoticeOk] = useState(noticeSince >= NOTICE_VERSION)
  // Settings opened from the wizard to import a backup; closing it brings the wizard back.
  const [importing, setImporting] = useState(false)
  // Device-type filter (category name); null = all types.
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showShift, setShowShift] = useState(false)
  const [summaryVisible, setSummaryVisible] = useLocalStorage(prefKey('shift-summary-visible'), () => true)
  const costHidden = !summaryVisible
  const [installOpen, setInstallOpen] = useState(false)
  const { offer: offerInstall } = useInstall()
  // The guide is offered right after onboarding.
  const [tourAsk, setTourAsk] = useState(false)
  const [tourBusy, setTourBusy] = useState(false)
  const ready = noticeOk && !onboarding && !importing
  const hasDevices = settings ? settings.devices.length > 0 : false

  const runTour = (force = false) => {
    if (isTourActive()) return
    setTourBusy(true)
    startGuide(() => setTourBusy(false), { forceCustomer: force })
  }
  // F1 replays the guide (not while another dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F1' || !ready || !hasDevices || isTourActive()) return
      // Only the add-session dialog has a guide; any other open dialog blocks it.
      const dialogs = document.querySelectorAll('[role="dialog"],[role="alertdialog"]')
      const addDialog = document.querySelector('[data-tour="add-search"]')
      if (dialogs.length > (addDialog ? 1 : 0)) return
      e.preventDefault()
      runTour()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Only a brand-new database gets the onboarding dialog.
  useEffect(() => {
    needsOnboarding().then(setOnboarding)
  }, [])
  // The install offer opens once by itself before other startup dialogs; the top-bar button
  // reopens it later.
  useEffect(() => {
    if (!tourBusy && offerInstall && !installSeen()) {
      markInstallSeen()
      setInstallOpen(true)
    }
  }, [tourBusy, offerInstall])
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')

  // Shift summary: shown instead of the welcome page while the last ended session is recent.
  const recent = useLiveQuery(readRecentHistory)
  const [now, setNow] = useState(Date.now)
  const latestEnd = recent?.[0]?.endedAt
  useEffect(() => {
    if (latestEnd === undefined) return
    const left = latestEnd + SHIFT_VISIBLE_MS - Date.now()
    if (left <= 0) return
    // Re-evaluate when the 2 hour window closes (timeouts are capped at ~24 days, far above it).
    const t = setTimeout(() => setNow(Date.now()), left + 50)
    setNow(Date.now())
    return () => clearTimeout(t)
  }, [latestEnd])

  // Wait for IndexedDB so the empty state / default settings never flash.
  if (!settings || !sessions) return null

  // `session` is the (possibly edited in the end-session dialog) session to close, not a
  // lookup by id, so any corrections made right before ending are included in the history.
  const endSession = (session: Session, finalTotal?: number, onAccount?: boolean) => {
    const customer = settings.customers.find((c) => c.id === session.customerId)
    endSessionWithWallet(session, customer, { finalTotal, onAccount })
  }

  const addSession = (
    device: Device,
    category: string,
    price: FlatPrice,
    customerId?: string,
    limit?: { minutes?: number; cost?: number },
    reserve?: boolean,
    prepay?: number,
  ) =>
    addSessionRow(
      createSession(device, category, price, customerId, Date.now(), limit, reserve, prepay),
    )

  // Device types that have devices; the filter / grouping UI needs more than one.
  const typeNames = settings.deviceCategories
    .filter((c) => settings.devices.some((d) => d.categoryId === c.id))
    .map((c) => c.name)
  const showTypes = grouping && typeNames.length > 1
  const activeType = showTypes && typeFilter && typeNames.includes(typeFilter) ? typeFilter : null
  // Search over every parameter of the running sessions.
  const needle = query.trim()
  const found = needle
    ? rank(sessions, needle, (x) =>
        sessionSearchFields(x, settings.customers.find((c) => c.id === x.customerId), Date.now()),
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

  const shift = sessions.length === 0 && recent && settings.devices.length > 0 ? currentShift(recent, now) : null

  // On demand (toolbar button): the latest shift however old it is, next to running sessions.
  const manualShift = recent ? currentShift(recent, now, Infinity) : null
  const summaryOn = showShift && !!manualShift

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="sticky top-0 z-40 -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:-mt-6 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <AppIcon className="size-8 sm:size-10" />
          <h1 className="text-lg font-bold sm:text-2xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {(sessions.length > 0 || shift) && <LiveClock size="small" />}
          <div className="flex flex-wrap gap-2">
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
            {offerInstall && (
              <Tip label="نصب برنامه">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="نصب برنامه"
                  onClick={() => setInstallOpen(true)}
                >
                  <Download />
                </Button>
              </Tip>
            )}
            {hasPin && (
              <Tip label="قفل کردن">
                <Button variant="outline" size="icon" aria-label="قفل کردن" onClick={lockNow}>
                  <Lock />
                </Button>
              </Tip>
            )}
            <ThemeToggle />
            <SettingsDialog
              settings={settings}
              usage={usageOf(sessions)}
              onChange={saveSettings}
              open={settingsOpen}
              onOpenChange={(o) => {
                setSettingsOpen(o)
                if (!o) setImporting(false)
              }}
              initialTab={settingsTab}
            />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {shift ? (
          <ShiftSummary
            entries={shift}
            onAdd={() => setAddOpen(true)}
            onReserve={() => setReserveOpen(true)}
            detailsVisible={summaryVisible}
            onToggleDetails={() => setSummaryVisible((v) => !v)}
          />
        ) : sessions.length === 0 ? (
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
              <div className="flex gap-2">
                <Button size="lg" variant="outline" onClick={() => setReserveOpen(true)}>
                  <CalendarClock /> رزرو
                </Button>
                <Button size="lg" data-tour="add-session" onClick={() => setAddOpen(true)}>
                  <Plus /> افزودن تایم
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Type filters and the controls always sit on separate rows, so the layout doesn't jump
                when the number of device types changes. */}
            <div className="flex flex-col gap-2">
              {showTypes && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="lg"
                    variant={activeType === null ? 'default' : 'outline'}
                    aria-pressed={activeType === null}
                    onClick={() => setTypeFilter(null)}
                  >
                    همه ({found.length})
                  </Button>
                  {typeNames.map((t) => (
                    <Button
                      key={t}
                      size="lg"
                      variant={activeType === t ? 'default' : 'outline'}
                      aria-pressed={activeType === t}
                      onClick={() => setTypeFilter(activeType === t ? null : t)}
                    >
                      {t} ({found.filter((x) => x.categoryName === t).length})
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <div className="relative w-full sm:w-52">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="جستجوی تایم‌ها"
                    placeholder="جستجو در تایم‌ها…"
                    className="h-9 w-full ps-8 pe-8 text-sm max-sm:h-11"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="پاک کردن جستجو"
                      className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setQuery('')}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
                <div role="radiogroup" aria-label="نحوه‌ی نمایش" className="flex items-center gap-1">
                <Tip label="نمای کامل">
                  <Button
                    size="icon-lg"
                    variant={!summaryOn && view === 'detailed' ? 'secondary' : 'ghost'}
                    role="radio"
                    aria-label="نمای کامل"
                    aria-checked={!summaryOn && view === 'detailed'}
                    onClick={() => {
                      setView('detailed')
                      setShowShift(false)
                    }}
                  >
                    <Rows3 />
                  </Button>
                </Tip>
                <Tip label="نمای فشرده">
                  <Button
                    size="icon-lg"
                    variant={!summaryOn && view === 'compact' ? 'secondary' : 'ghost'}
                    role="radio"
                    aria-label="نمای فشرده"
                    aria-checked={!summaryOn && view === 'compact'}
                    onClick={() => {
                      setView('compact')
                      setShowShift(false)
                    }}
                  >
                    <LayoutGrid />
                  </Button>
                </Tip>
                <Tip label="خلاصه‌ی شیفت">
                  <Button
                    size="icon-lg"
                    variant={summaryOn ? 'secondary' : 'ghost'}
                    role="radio"
                    aria-label="خلاصه‌ی شیفت"
                    aria-checked={summaryOn}
                    disabled={!manualShift}
                    onClick={() => setShowShift(true)}
                  >
                    <ChartNoAxesColumn />
                  </Button>
                </Tip>
                </div>
                <Tip label={costHidden ? 'نمایش هزینه' : 'پنهان کردن هزینه'}>
                  <Button
                    size="icon-lg"
                    variant="outline"
                    aria-label={costHidden ? 'نمایش هزینه تایم‌ها' : 'پنهان کردن هزینه تایم‌ها'}
                    aria-pressed={costHidden}
                    onClick={() => setSummaryVisible((v) => !v)}
                  >
                    {costHidden ? <EyeOff /> : <Eye />}
                  </Button>
                </Tip>
                <Button size="lg" variant="outline" onClick={() => setReserveOpen(true)}>
                  <CalendarClock /> رزرو
                </Button>
                <Button size="lg" data-tour="add-session" onClick={() => setAddOpen(true)}>
                  <Plus /> افزودن تایم
                </Button>
              </div>
            </div>
            {summaryOn && manualShift && (
              <ShiftSummary
                entries={manualShift}
                active={sessions.length}
                onAdd={() => setAddOpen(true)}
                onReserve={() => setReserveOpen(true)}
                detailsVisible={summaryVisible}
              />
            )}
            {!summaryOn && found.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">تایمی پیدا نشد.</p>
            )}
            {(summaryOn ? [] : sections).map((sec) => (
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
                      costHidden={costHidden}
                      onUpdate={(fn) => updateSessionRow(session.id, fn)}
                      onEnd={(edited, total, onAccount) => endSession(edited, total, onAccount)}
                      onCancel={() => deleteSessionRow(session.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
        <span dir="ltr">v{APP_VERSION}</span>
        <span aria-hidden>·</span>
        <span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            نرم‌افزار مدیریت زمان گیم‌نت
          </a>
        </span>
      </footer>

      <NoticeDialog
        open={!installOpen && !noticeOk}
        since={noticeSince}
        onAccept={() => {
          acceptNotice()
          setNoticeOk(true)
        }}
      />

      <OnboardingDialog
        open={!installOpen && noticeOk && onboarding && !importing}
        settings={settings}
        onImport={() => {
          setImporting(true)
          openSettings('data')
        }}
        onFinish={async (next) => {
          await saveSettings(next)
          await markOnboarded()
          setOnboarding(false)
          if (!tourSkipped()) setTourAsk(true)
        }}
      />

      <TourPromptDialog
        open={!installOpen && tourAsk}
        onStart={() => {
          setTourAsk(false)
          runTour(true)
        }}
        onSkip={() => {
          skipTours()
          setTourAsk(false)
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

      <AddSessionDialog
        reserve
        open={reserveOpen}
        onOpenChange={setReserveOpen}
        settings={settings}
        sessions={sessions}
        onCreate={addSession}
      />

      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} />
      <UpdateDialog enabled={ready} />

      <LimitAlarmDialog
        sessions={sessions}
        settings={settings}
        onUpdate={(id, fn) => updateSessionRow(id, fn)}
      />
    </div>
  )
}

export default function App() {
  // Locking unmounts the whole app, so nothing stays in the DOM until the PIN is entered.
  const { epoch, locked } = useSecurity()
  // Only one window runs the app; any other shows just the "open elsewhere" screen.
  const instance = useInstance()
  return (
    <ThemeProvider>
      <TooltipProvider>
        {instance !== 'active' ? (
          instance === 'other' ? (
            <InstanceScreen />
          ) : (
            <div className="min-h-screen bg-background" />
          )
        ) : locked ? (
          // Locked: nothing of the app is rendered except the lock page and the time-limit
          // alarm (still shown, but every action on it re-asks for the PIN).
          <>
            <LockScreen />
            <LockedLimitAlarmDialog onUpdate={(id, fn) => updateSessionRow(id, fn)} />
          </>
        ) : (
          <Main key={epoch} />
        )}
      </TooltipProvider>
    </ThemeProvider>
  )
}
