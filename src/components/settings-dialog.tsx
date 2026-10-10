import type { DriveStep } from 'driver.js'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Check, Settings as SettingsIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InstallDialog } from '@/components/install-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MinutesInput } from '@/components/ui/minutes-input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Tip } from '@/components/tip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { HelpHint } from '@/components/help-hint'
import { ScrollFade } from '@/components/scroll-fade'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TourHelpButton } from '@/components/tour-help-button'
import {
  isTourActive,
  markTourSeen,
  registerTour,
  startTour,
  tourSeen,
  tourSel,
  tourSkipped,
  type TourDef,
} from '@/lib/tour'
import { useDiscardGuard } from '@/components/discard-dialog'
import { DataTab } from '@/components/data-tab'
import { SecuritySettings } from '@/components/security-settings'
import { DevicesEditor } from '@/components/devices-editor'
import { ExtraItemsEditor } from '@/components/extra-items-editor'
import { PriceOverridesEditor } from '@/components/price-overrides-editor'
import { RateGroupsEditor } from '@/components/rate-groups-editor'
import { DEFAULT_TITLE, SCALE_MAX, SCALE_MIN, useTheme, type Theme } from '@/components/theme-provider'
import { ACCENTS, type Accent } from '@/lib/accents'
import type { AppIconValue } from '@/lib/app-icon'
import { formatNumber, parseNumber } from '@/lib/format'
import {
  ROUND_MODE_LABELS,
  overrideChangesPrice,
  type QuickExtend,
  type Rounding,
  type RoundMode,
  type Settings,
  type Usage,
} from '@/lib/store'
import { cn } from '@/lib/utils'

// The picker pulls in the whole Lucide icon list, so it is only downloaded when Settings opens.
const IconPicker = lazy(() =>
  import('@/components/icon-picker').then((m) => ({ default: m.IconPicker })),
)

const ROUND_ITEMS = (Object.keys(ROUND_MODE_LABELS) as RoundMode[]).map((value) => ({
  value,
  label: ROUND_MODE_LABELS[value],
}))

export type SettingsTab = 'general' | 'rates' | 'devices' | 'extras' | 'security' | 'data'

type Props = {
  settings: Settings
  usage: Usage
  onChange: (s: Omit<Settings, 'customers'>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  // Tab shown each time the dialog opens.
  initialTab?: SettingsTab
}

type Draft = Settings & {
  theme: Theme
  accent: Accent
  autostart: boolean
  title: string
  icon: AppIconValue
  grouping: boolean
  uiScale: number
  fontScale: number
  rounding: Rounding
  quickExtend: QuickExtend
}

const isTauri = () => '__TAURI_INTERNALS__' in window

// Guide of this dialog (opens by itself the first time, or F1 / the «?» button): only what each tab
// is for; the details are explained next to each section. The steps point at the `data-tour`
// attributes on the tabs below, so keep the two in sync when tabs are added, renamed or removed.
export const settingsTour: TourDef = {
  id: 'settings-dialog',
  present: tourSel('settings-tab-general'),
  priority: 80,
  steps: (): DriveStep[] => [
    {
      element: tourSel('settings-tab-general'),
      waitForElement: 2000,
      disableActiveInteraction: true,
      popover: {
        title: 'عمومی',
        description:
          'ظاهر و رفتار برنامه: تم و رنگ، عنوان و آیکن، اندازه‌ی رابط و نوشته‌ها، نحوه‌ی نمایش کارت‌ها، رند کردن مبلغ نهایی، افزایش سریع محدودیت و اجرای خودکار برنامه.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('settings-tab-rates'),
      disableActiveInteraction: true,
      popover: {
        title: 'نرخ‌ها',
        description:
          'گروه‌های نرخ و قیمت ساعتی هر کدام، و بازه‌های قیمت ویژه. هر دستگاه از این نرخ‌ها استفاده می‌کند.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('settings-tab-devices'),
      disableActiveInteraction: true,
      popover: {
        title: 'دستگاه‌ها',
        description:
          'نوع دستگاه‌ها (مثل پی‌سی یا پلی‌استیشن) و خود دستگاه‌ها؛ هر دستگاه را به یک یا چند گروه نرخ وصل می‌کنید. می‌توانید چند دستگاه را یک‌جا بسازید.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('settings-tab-extras'),
      disableActiveInteraction: true,
      popover: {
        title: 'بوفه و سایر هزینه‌ها',
        description:
          'دسته‌بندی‌ها و محصولات بوفه را با قیمتشان اضافه یا ویرایش کنید تا هنگام ثبت هزینه‌ی اضافه‌ی هر تایم قابل انتخاب باشند.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('settings-tab-security'),
      disableActiveInteraction: true,
      popover: {
        title: 'امنیت',
        description:
          'قفل برنامه با رمز ۴ تا ۸ رقمی و زمان قفل خودکار هنگام بی‌کاری.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('settings-tab-data'),
      disableActiveInteraction: true,
      popover: {
        title: 'داده‌ها',
        description:
          'پشتیبان‌گیری و بازیابی از فایل، پاک کردن تاریخچه، و بازگردانی کامل برنامه به حالت اول. این بخش فوراً اعمال می‌شود و جزو دکمه‌ی ذخیره نیست.',
        side: 'bottom',
      },
    },
  ],
}

registerTour(settingsTour)

export function SettingsDialog({
  settings,
  usage,
  onChange,
  open,
  onOpenChange,
  initialTab = 'general',
}: Props) {
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    title,
    setTitle,
    icon,
    setIcon,
    setPreview,
    grouping,
    setGrouping,
    uiScale,
    setUiScale,
    fontScale,
    setFontScale,
    rounding,
    setRounding,
    quickExtend,
    setQuickExtend,
  } = useTheme()
  const [autostartSaved, setAutostartSaved] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  const saved: Draft = {
    ...settings,
    theme,
    accent,
    autostart: autostartSaved,
    title,
    icon,
    grouping,
    uiScale,
    fontScale,
    rounding,
    quickExtend,
  }
  const [draft, setDraft] = useState<Draft>(saved)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const readAutostart = () => {
    if (!isTauri()) return Promise.resolve(false)
    return import('@tauri-apps/plugin-autostart')
      .then((m) => m.isEnabled())
      .catch(() => false)
  }

  // Re-seed the draft from saved values every time the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    readAutostart().then((enabled) => {
      if (cancelled) return
      setAutostartSaved(enabled)
      setDraft({ ...saved, autostart: enabled })
    })
    setDraft(saved)
    setTab(initialTab)
    return () => {
      cancelled = true
    }
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Theme, accent and scales preview live; closing (save or cancel) drops the preview.
  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }
    setPreview({
      theme: draft.theme,
      accent: draft.accent,
      uiScale: draft.uiScale,
      fontScale: draft.fontScale,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.theme, draft.accent, draft.uiScale, draft.fontScale])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const named = (xs: { name: string }[]) => xs.every((x) => x.name.trim())
  const ratesValid =
    draft.rateGroups.length > 0 &&
    named(draft.rateGroups) &&
    draft.rateGroups.every((g) => g.prices.length > 0 && named(g.prices) && g.prices.every((p) => p.price > 0))
  const emptyCategory = draft.deviceCategories.find(
    (c) => !draft.devices.some((d) => d.categoryId === c.id),
  )
  const devicesValid =
    !emptyCategory &&
    named(draft.deviceCategories) &&
    named(draft.devices) &&
    draft.devices.every((d) => d.rateIds.length > 0)
  // First problem of the first invalid price override (shown in the footer), or undefined.
  const overrideError = draft.priceOverrides
    .map((o) =>
      !o.name?.trim()
        ? 'نام بازه‌ی قیمت ویژه را وارد کنید.'
        : o.weekdays.length === 0
          ? `برای «${o.name.trim()}» حداقل یک روز را انتخاب کنید.`
          : o.startMin === o.endMin
            ? `ساعت شروع و پایان «${o.name.trim()}» نباید یکی باشد.`
            : !overrideChangesPrice(o, draft.rateGroups)
              ? `در «${o.name.trim()}» حداقل یکی از قیمت‌ها باید با قیمت معمول فرق داشته باشد.`
              : undefined,
    )
    .find(Boolean)
  const overridesValid = overrideError === undefined
  const extrasValid =
    draft.extraCategories.length > 0 &&
    named(draft.extraCategories) &&
    named(draft.extraItems) &&
    draft.extraItems.every((i) => i.price > 0)
  const roundingValid = draft.rounding.step > 0
  const quickExtendValid = draft.quickExtend.minutes > 0 && draft.quickExtend.cost > 0
  const valid =
    ratesValid && overridesValid && devicesValid && extrasValid && roundingValid && quickExtendValid

  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const trimNames = <T extends { name: string }>(xs: T[]): T[] =>
    xs.map((x) => ({ ...x, name: x.name.trim() }))

  const save = async () => {
    if (!valid) return
    onChange({
      rateGroups: draft.rateGroups.map((g) => ({
        ...g,
        name: g.name.trim(),
        prices: trimNames(g.prices),
      })),
      deviceCategories: trimNames(draft.deviceCategories),
      devices: trimNames(draft.devices),
      extraCategories: trimNames(draft.extraCategories),
      extraItems: trimNames(draft.extraItems),
      priceOverrides: draft.priceOverrides.map((o) => ({ ...o, name: o.name?.trim() })),
    })
    setTheme(draft.theme)
    setAccent(draft.accent)
    setTitle(draft.title.trim() || DEFAULT_TITLE)
    setIcon(draft.icon)
    setGrouping(draft.grouping)
    setUiScale(draft.uiScale)
    setFontScale(draft.fontScale)
    setRounding(draft.rounding)
    setQuickExtend(draft.quickExtend)
    if (isTauri() && draft.autostart !== autostartSaved) {
      try {
        const m = await import('@tauri-apps/plugin-autostart')
        if (draft.autostart) await m.enable()
        else await m.disable()
        setAutostartSaved(await m.isEnabled())
      } catch {
        // keep the previous autostart state if the plugin call fails
      }
    }
    onOpenChange(false)
  }

  // The first time the dialog opens, the guide starts by itself (unless guides were skipped).
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (tourSkipped() || tourSeen('settings-seen') || isTourActive()) return
      markTourSeen('settings-seen')
      startTour(settingsTour, () => {})
    }, 500)
    return () => window.clearTimeout(t)
  }, [open])

  const dot = (ok: boolean) => !ok && <span className="size-2 rounded-full bg-destructive" />

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o, details) => {
          if (o) onOpenChange(true)
          // The guide's popover lives outside the dialog; clicking it must not close the dialog.
          else if (isTourActive() && details.reason === 'outside-press') return
          else requestClose()
        }}
      >
        <Tip label="تنظیمات">
          <DialogTrigger render={<Button variant="outline" size="icon" aria-label="تنظیمات" data-tour="settings" />}>
            <SettingsIcon />
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1">
              تنظیمات
              <TourHelpButton tour="settings-dialog" />
            </DialogTitle>
            <DialogDescription>برای اعمال تغییرات، دکمه ذخیره را بزنید.</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="gap-4">
            <ScrollFade>
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="general" className="shrink-0" data-tour="settings-tab-general">عمومی</TabsTrigger>
              <TabsTrigger value="rates" className="shrink-0" data-tour="settings-tab-rates">نرخ‌ها {dot(ratesValid)}</TabsTrigger>
              <TabsTrigger value="devices" className="shrink-0" data-tour="settings-tab-devices">دستگاه‌ها {dot(devicesValid)}</TabsTrigger>
              <TabsTrigger value="extras" className="shrink-0" data-tour="settings-tab-extras">بوفه و سایر هزینه‌ها {dot(extrasValid)}</TabsTrigger>
              <TabsTrigger value="security" className="shrink-0" data-tour="settings-tab-security">امنیت</TabsTrigger>
              <TabsTrigger value="data" className="shrink-0" data-tour="settings-tab-data">داده‌ها</TabsTrigger>
            </TabsList>
            </ScrollFade>

            <TabsContent value="general" className="flex flex-col gap-5">
              <SettingRow
                label="عنوان برنامه"
                htmlFor="app-title"
                hint="این عنوان بالای صفحه و در نوار عنوان پنجره نمایش داده می‌شود. خالی بگذارید تا عنوان پیش‌فرض استفاده شود."
              >
                <Input
                  id="app-title"
                  placeholder={DEFAULT_TITLE}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </SettingRow>

              <SettingRow
                top
                label="آیکن برنامه"
                hint="این آیکن بالای صفحه و در صفحه‌ی خالی نمایش داده می‌شود. می‌توانید از فهرست انتخاب کنید، تصویر دلخواه بارگذاری کنید یا به آیکن پیش‌فرض برگردید."
              >
                <Suspense
                  fallback={<div className="h-14 animate-pulse rounded-xl bg-muted/50" aria-hidden />}
                >
                  <IconPicker value={draft.icon} onChange={(icon) => patch({ icon })} />
                </Suspense>
              </SettingRow>

              <SettingRow inline label="حالت تاریک" htmlFor="theme-switch">
                <Switch
                  id="theme-switch"
                  checked={draft.theme === 'dark'}
                  onCheckedChange={(c) => patch({ theme: c ? 'dark' : 'light' })}
                />
              </SettingRow>

              <SettingRow top label="رنگ تم">
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <Tip key={a.id} label={a.label}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={a.label}
                        aria-pressed={draft.accent === a.id}
                        onClick={() => patch({ accent: a.id })}
                        className={cn(
                          'size-8 rounded-full text-white hover:text-white max-md:size-8 ring-offset-2 ring-offset-popover transition',
                          draft.accent === a.id ? 'ring-2 ring-foreground' : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: a.swatch }}
                      >
                        {draft.accent === a.id && <Check className="size-4" />}
                      </Button>
                    </Tip>
                  ))}
                </div>
              </SettingRow>

              {(
                [
                  {
                    key: 'uiScale',
                    id: 'ui-scale',
                    label: 'مقیاس رابط کاربری',
                    hint: 'اندازه‌ی همه‌ی اجزای برنامه (متن، دکمه‌ها و فاصله‌ها) را با هم کوچک یا بزرگ می‌کند؛ برای مانیتورهای مختلف مناسب است.',
                  },
                  {
                    key: 'fontScale',
                    id: 'font-scale',
                    label: 'اندازه‌ی متن',
                    hint: 'فقط اندازه‌ی نوشته‌ها را کم یا زیاد می‌کند و بقیه‌ی اجزا را تغییر نمی‌دهد.',
                  },
                ] as const
              ).map((s) => (
                <SettingRow key={s.key} label={s.label} htmlFor={s.id} hint={s.hint}>
                  <div className="flex items-center gap-3">
                    <Slider
                      id={s.id}
                      dir="ltr"
                      className="flex-1"
                      min={SCALE_MIN}
                      max={SCALE_MAX}
                      step={5}
                      value={[draft[s.key]]}
                      onValueChange={(v) => patch({ [s.key]: Array.isArray(v) ? v[0] : v })}
                    />
                    <span dir="ltr" className="w-12 text-end text-sm tabular-nums">
                      {draft[s.key]}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={draft[s.key] === 100}
                      onClick={() => patch({ [s.key]: 100 })}
                    >
                      بازنشانی
                    </Button>
                  </div>
                </SettingRow>
              ))}

              <SettingRow
                inline
                label="گروه‌بندی تایم‌ها بر اساس نوع دستگاه"
                htmlFor="grouping-switch"
                hint="تایم‌ها بر اساس نوع دستگاه دسته‌بندی می‌شوند و بالای فهرست می‌توانید فقط یک نوع را نمایش دهید. فقط وقتی بیش از یک نوع دستگاه دارید دیده می‌شود."
              >
                <Switch
                  id="grouping-switch"
                  checked={draft.grouping}
                  onCheckedChange={(c) => patch({ grouping: c })}
                />
              </SettingRow>

              <SettingRow inline label="رند کردن خودکار مبلغ نهایی" htmlFor="auto-round-switch">
                <Switch
                  id="auto-round-switch"
                  checked={draft.rounding.auto}
                  onCheckedChange={(auto) => patch({ rounding: { ...draft.rounding, auto } })}
                />
              </SettingRow>

              <SettingRow
                label="رند کردن مبلغ نهایی"
                htmlFor="round-step"
                hint="مبلغ نهایی هنگام اتمام تایم به این صورت گرد می‌شود (خودکار یا با دکمه‌ی «رند کردن»)."
              >
                <div className="grid gap-2 @lg:grid-cols-2 @lg:items-center">
                  <Select
                    items={ROUND_ITEMS}
                    value={draft.rounding.mode}
                    onValueChange={(m) => patch({ rounding: { ...draft.rounding, mode: m as RoundMode } })}
                  >
                    <SelectTrigger className="w-full" aria-label="نوع رند کردن">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUND_ITEMS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <MoneyInput
                      id="round-step"
                      aria-invalid={!roundingValid}
                      className="min-w-0 flex-1"
                      value={draft.rounding.step > 0 ? formatNumber(draft.rounding.step) : ''}
                      onChange={(e) =>
                        patch({ rounding: { ...draft.rounding, step: parseNumber(e.target.value) } })
                      }
                    />
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">تومان</span>
                  </div>
                </div>
              </SettingRow>

              <SettingRow
                label="افزایش سریع محدودیت"
                hint="وقتی محدودیت یک تایم تمام شود، دکمه‌ی «کمی بیشتر» روی هشدار به همین اندازه به آن اضافه می‌کند."
              >
                <div className="grid gap-2 @lg:grid-cols-2 @lg:items-center">
                  <div className="flex items-center gap-2">
                    <MinutesInput
                      id="quick-extend-minutes"
                      aria-invalid={draft.quickExtend.minutes <= 0}
                      aria-label="افزایش سریع محدودیت زمانی"
                      className="min-w-0 flex-1"
                      value={draft.quickExtend.minutes > 0 ? String(draft.quickExtend.minutes) : ''}
                      onChange={(e) =>
                        patch({ quickExtend: { ...draft.quickExtend, minutes: parseNumber(e.target.value) } })
                      }
                    />
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">دقیقه (زمانی)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MoneyInput
                      id="quick-extend-cost"
                      aria-invalid={draft.quickExtend.cost <= 0}
                      aria-label="افزایش سریع محدودیت هزینه"
                      className="min-w-0 flex-1"
                      value={draft.quickExtend.cost > 0 ? formatNumber(draft.quickExtend.cost) : ''}
                      onChange={(e) =>
                        patch({ quickExtend: { ...draft.quickExtend, cost: parseNumber(e.target.value) } })
                      }
                    />
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">تومان (هزینه)</span>
                  </div>
                </div>
              </SettingRow>

              <SettingRow
                inline
                label="اجرای خودکار با روشن شدن سیستم"
                htmlFor="autostart-switch"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    id="autostart-switch"
                    checked={isTauri() && draft.autostart}
                    disabled={!isTauri()}
                    onCheckedChange={(c) => patch({ autostart: c })}
                  />
                  {!isTauri() && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/70"
                      render={<button type="button" onClick={() => setInstallOpen(true)} />}
                    >
                      فقط ویندوز
                    </Badge>
                  )}
                </div>
              </SettingRow>
              <InstallDialog open={installOpen} onOpenChange={setInstallOpen} windowsOnly />
            </TabsContent>

            <TabsContent value="rates" className="flex flex-col gap-6">
              <RateGroupsEditor
                groups={draft.rateGroups}
                devices={draft.devices}
                usage={usage}
                onChange={(rateGroups) => patch({ rateGroups })}
              />
              <PriceOverridesEditor
                overrides={draft.priceOverrides}
                groups={draft.rateGroups}
                onChange={(priceOverrides) => patch({ priceOverrides })}
              />
            </TabsContent>

            <TabsContent value="devices">
              <DevicesEditor
                categories={draft.deviceCategories}
                devices={draft.devices}
                rateGroups={draft.rateGroups}
                usage={usage}
                onChange={(deviceCategories, devices) => patch({ deviceCategories, devices })}
              />
            </TabsContent>

            <TabsContent value="extras">
              <ExtraItemsEditor
                categories={draft.extraCategories}
                items={draft.extraItems}
                usage={usage}
                onChange={(extraCategories, extraItems) => patch({ extraCategories, extraItems })}
              />
            </TabsContent>

            <TabsContent value="security">
              <SecuritySettings />
            </TabsContent>

            <TabsContent value="data">
              <DataTab activeSessions={usage.deviceIds.size} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-destructive">
              {valid || tab === 'data'
                ? ''
                : !roundingValid
                  ? 'مضرب رند کردن باید بیشتر از صفر باشد.'
                  : !quickExtendValid
                    ? 'مقادیر افزایش سریع محدودیت باید بیشتر از صفر باشند.'
                    : overrideError
                      ? overrideError
                      : emptyCategory
                        ? `برای نوع دستگاه ${emptyCategory.name.trim() ? `«${emptyCategory.name.trim()}»` : 'بدون نام'} حداقل یک دستگاه اضافه کنید.`
                        : 'نام‌ها باید تکمیل و قیمت‌ها بیشتر از صفر باشند و هر دستگاه یک نرخ داشته باشد.'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={requestClose}>
                {tab === 'data' && !dirty ? 'بستن' : 'انصراف'}
              </Button>
              {tab !== 'data' && (
                <Button disabled={!valid || !dirty} onClick={save}>
                  ذخیره
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog}
    </>
  )
}

// One settings row: label (+ optional «?» hint) on the start side, control on the other. On
// sm+ it is a two-column grid so every control lines up; `inline` keeps label and a switch on
// one line on mobile, `top` aligns the label with the top of a tall control.
function SettingRow({
  label,
  htmlFor,
  hint,
  inline,
  top,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: string
  inline?: boolean
  top?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'gap-1.5 sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-4',
        inline ? 'flex items-center justify-between' : 'flex flex-col',
        top ? 'sm:items-start' : 'sm:items-center',
      )}
    >
      <div className={cn('flex flex-wrap items-center gap-1.5', top && 'sm:pt-2')}>
        <Label htmlFor={htmlFor} className="flex items-center gap-2">
          {label}
        </Label>
        {hint && <HelpHint>{hint}</HelpHint>}
      </div>
      <div className={cn('min-w-0', !inline && '@container')}>{children}</div>
    </div>
  )
}
