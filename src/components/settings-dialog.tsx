import { lazy, Suspense, useEffect, useState } from 'react'
import { Check, Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { Tip } from '@/components/tip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDiscardGuard } from '@/components/discard-dialog'
import { DataTab } from '@/components/data-tab'
import { DevicesEditor } from '@/components/devices-editor'
import { ExtraItemsEditor } from '@/components/extra-items-editor'
import { RateGroupsEditor } from '@/components/rate-groups-editor'
import { DEFAULT_TITLE, useTheme, type Theme } from '@/components/theme-provider'
import { ACCENTS, type Accent } from '@/lib/accents'
import type { AppIconValue } from '@/lib/app-icon'
import { formatNumber, parseNumber } from '@/lib/format'
import {
  ROUND_MODE_LABELS,
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

export type SettingsTab = 'general' | 'rates' | 'devices' | 'extras' | 'data'

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
  rounding: Rounding
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
  const { theme, setTheme, accent, setAccent, title, setTitle, icon, setIcon, grouping, setGrouping, rounding, setRounding } =
    useTheme()
  const [autostartSaved, setAutostartSaved] = useState(false)
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  const saved: Draft = { ...settings, theme, accent, autostart: autostartSaved, title, icon, grouping, rounding }
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
  const extrasValid =
    draft.extraCategories.length > 0 &&
    named(draft.extraCategories) &&
    named(draft.extraItems) &&
    draft.extraItems.every((i) => i.price > 0)
  const roundingValid = draft.rounding.step > 0
  const valid = ratesValid && devicesValid && extrasValid && roundingValid

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
    })
    setTheme(draft.theme)
    setAccent(draft.accent)
    setTitle(draft.title.trim() || DEFAULT_TITLE)
    setIcon(draft.icon)
    setGrouping(draft.grouping)
    setRounding(draft.rounding)
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
            <TabsList className="w-full">
              <TabsTrigger value="general">عمومی</TabsTrigger>
              <TabsTrigger value="rates">نرخ‌ها {dot(ratesValid)}</TabsTrigger>
              <TabsTrigger value="devices">دستگاه‌ها {dot(devicesValid)}</TabsTrigger>
              <TabsTrigger value="extras">بوفه {dot(extrasValid)}</TabsTrigger>
              <TabsTrigger value="data">داده‌ها</TabsTrigger>
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
                      <button
                        type="button"
                        aria-label={a.label}
                        aria-pressed={draft.accent === a.id}
                        onClick={() => patch({ accent: a.id })}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-popover transition',
                          draft.accent === a.id ? 'ring-2 ring-foreground' : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: a.swatch }}
                      >
                        {draft.accent === a.id && <Check className="size-4" />}
                      </button>
                    </Tip>
                  ))}
                </div>
              </div>

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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-step">رند کردن مبلغ نهایی</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={ROUND_ITEMS}
                    value={draft.rounding.mode}
                    onValueChange={(m) => patch({ rounding: { ...draft.rounding, mode: m as RoundMode } })}
                  >
                    <SelectTrigger className="w-36" aria-label="نوع رند کردن">
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
                  <span className="text-sm text-muted-foreground">مضرب</span>
                  <Input
                    id="round-step"
                    dir="ltr"
                    inputMode="numeric"
                    aria-invalid={!roundingValid}
                    className="w-32"
                    value={draft.rounding.step > 0 ? formatNumber(draft.rounding.step) : ''}
                    onChange={(e) =>
                      patch({ rounding: { ...draft.rounding, step: parseNumber(e.target.value) } })
                    }
                  />
                  <span className="text-sm text-muted-foreground">تومان</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  دکمه‌ی «رند کردن» هنگام اتمام تایم، مبلغ نهایی را به این صورت گرد می‌کند.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="autostart-switch">اجرای خودکار با روشن شدن سیستم</Label>
                <Switch
                  id="autostart-switch"
                  checked={draft.autostart}
                  disabled={!isTauri()}
                  onCheckedChange={(c) => patch({ autostart: c })}
                />
              </div>
            </TabsContent>

            <TabsContent value="rates">
              <RateGroupsEditor
                groups={draft.rateGroups}
                devices={draft.devices}
                usage={usage}
                onChange={(rateGroups) => patch({ rateGroups })}
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
                onChange={(extraCategories, extraItems) => patch({ extraCategories, extraItems })}
              />
            </TabsContent>

            <TabsContent value="data">
              <DataTab activeSessions={usage.deviceIds.size} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-destructive">
              {valid || tab === 'data' ? '' : roundingValid
                ? 'نام‌ها باید تکمیل و قیمت‌ها بیشتر از صفر باشند و هر دستگاه یک نرخ داشته باشد.'
                : 'مضرب رند کردن باید بیشتر از صفر باشد.'}
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
