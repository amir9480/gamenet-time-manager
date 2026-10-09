import { lazy, Suspense, useEffect, useState } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const devicesValid =
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

  const dot = (ok: boolean) => !ok && <span className="size-2 rounded-full bg-destructive" />

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true)
          else requestClose()
        }}
      >
        <Tip label="تنظیمات">
          <DialogTrigger render={<Button variant="outline" size="icon" aria-label="تنظیمات" />}>
            <SettingsIcon />
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>تنظیمات</DialogTitle>
            <DialogDescription>برای اعمال تغییرات، دکمه ذخیره را بزنید.</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="gap-4">
            <TabsList className="w-full max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="general" className="shrink-0">عمومی</TabsTrigger>
              <TabsTrigger value="rates" className="shrink-0">نرخ‌ها {dot(ratesValid)}</TabsTrigger>
              <TabsTrigger value="devices" className="shrink-0">دستگاه‌ها {dot(devicesValid)}</TabsTrigger>
              <TabsTrigger value="extras" className="shrink-0">بوفه و سایر هزینه‌ها {dot(extrasValid)}</TabsTrigger>
              <TabsTrigger value="security" className="shrink-0">امنیت</TabsTrigger>
              <TabsTrigger value="data" className="shrink-0">داده‌ها</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-title">عنوان برنامه</Label>
                <Input
                  id="app-title"
                  placeholder={DEFAULT_TITLE}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  این عنوان بالای صفحه و در نوار عنوان پنجره نمایش داده می‌شود. خالی بگذارید تا عنوان
                  پیش‌فرض استفاده شود.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>آیکن برنامه</Label>
                <Suspense
                  fallback={<div className="h-14 animate-pulse rounded-xl bg-muted/50" aria-hidden />}
                >
                  <IconPicker value={draft.icon} onChange={(icon) => patch({ icon })} />
                </Suspense>
                <p className="text-xs text-muted-foreground">
                  این آیکن بالای صفحه و در صفحه‌ی خالی نمایش داده می‌شود. می‌توانید از فهرست انتخاب کنید،
                  تصویر دلخواه بارگذاری کنید یا به آیکن پیش‌فرض برگردید.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="theme-switch">حالت تاریک</Label>
                <Switch
                  id="theme-switch"
                  checked={draft.theme === 'dark'}
                  onCheckedChange={(c) => patch({ theme: c ? 'dark' : 'light' })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>رنگ تم</Label>
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
              </div>

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
                <div key={s.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor={s.id}>{s.label}</Label>
                    <div className="flex items-center gap-2">
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
                  </div>
                  <Slider
                    id={s.id}
                    dir="ltr"
                    min={SCALE_MIN}
                    max={SCALE_MAX}
                    step={5}
                    value={[draft[s.key]]}
                    onValueChange={(v) => patch({ [s.key]: Array.isArray(v) ? v[0] : v })}
                  />
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                </div>
              ))}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="grouping-switch">گروه‌بندی تایم‌ها بر اساس نوع دستگاه</Label>
                  <Switch
                    id="grouping-switch"
                    checked={draft.grouping}
                    onCheckedChange={(c) => patch({ grouping: c })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  تایم‌ها بر اساس نوع دستگاه دسته‌بندی می‌شوند و بالای فهرست می‌توانید فقط یک نوع را
                  نمایش دهید. فقط وقتی بیش از یک نوع دستگاه دارید دیده می‌شود.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="auto-round-switch">رند کردن خودکار مبلغ نهایی هنگام اتمام تایم</Label>
                <Switch
                  id="auto-round-switch"
                  checked={draft.rounding.auto}
                  onCheckedChange={(auto) => patch({ rounding: { ...draft.rounding, auto } })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-step">رند کردن مبلغ نهایی</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    items={ROUND_ITEMS}
                    value={draft.rounding.mode}
                    onValueChange={(m) => patch({ rounding: { ...draft.rounding, mode: m as RoundMode } })}
                  >
                    <SelectTrigger className="w-full sm:flex-1" aria-label="نوع رند کردن">
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
                  <div className="flex items-center gap-2 sm:flex-1">
                  <span className="text-sm text-muted-foreground">مضرب</span>
                  <MoneyInput
                    id="round-step"
                    aria-invalid={!roundingValid}
                    className="min-w-0 flex-1"
                    value={draft.rounding.step > 0 ? formatNumber(draft.rounding.step) : ''}
                    onChange={(e) =>
                      patch({ rounding: { ...draft.rounding, step: parseNumber(e.target.value) } })
                    }
                  />
                  <span className="text-sm text-muted-foreground">تومان</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  مبلغ نهایی هنگام اتمام تایم به این صورت گرد می‌شود (خودکار یا با دکمه‌ی «رند کردن»).
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>افزایش سریع محدودیت</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 sm:flex-1">
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
                  <span className="text-sm text-muted-foreground">دقیقه (محدودیت زمانی)</span>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-1">
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
                  <span className="text-sm text-muted-foreground">تومان (محدودیت هزینه)</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  وقتی محدودیت یک تایم تمام شود، دکمه‌ی «کمی بیشتر» روی هشدار به همین اندازه به آن اضافه می‌کند.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="autostart-switch" className="flex items-center gap-2">
                  اجرای خودکار با روشن شدن سیستم
                  {!isTauri() && (
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/70"
                      render={<button type="button" onClick={() => setInstallOpen(true)} />}
                    >
                      فقط ویندوز
                    </Badge>
                  )}
                </Label>
                <Switch
                  id="autostart-switch"
                  checked={isTauri() && draft.autostart}
                  disabled={!isTauri()}
                  onCheckedChange={(c) => patch({ autostart: c })}
                />
              </div>
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
