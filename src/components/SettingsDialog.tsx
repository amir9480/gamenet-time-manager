import { useEffect, useState } from 'react'
import { Check, Settings as SettingsIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Label } from '@/components/ui/label'
import { Tip } from '@/components/Tip'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExtraItemsEditor } from '@/components/ExtraItemsEditor'
import { PriceTypeEditor } from '@/components/PriceTypeEditor'
import { useTheme, type Theme } from '@/components/theme-provider'
import { ACCENTS, type Accent } from '@/lib/accents'
import type { Settings } from '@/lib/store'
import { cn } from '@/lib/utils'

type Props = {
  settings: Settings
  onChange: (s: Settings) => void
}

type Draft = {
  priceTypes: Settings['priceTypes']
  defaultTypeId: string
  extraItems: Settings['extraItems']
  theme: Theme
  accent: Accent
  autostart: boolean
}

const isTauri = () => '__TAURI_INTERNALS__' in window

export function SettingsDialog({ settings, onChange }: Props) {
  const { theme, setTheme, accent, setAccent } = useTheme()
  const [open, setOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [autostartSaved, setAutostartSaved] = useState(false)

  const saved: Draft = {
    priceTypes: settings.priceTypes,
    defaultTypeId: settings.defaultTypeId,
    extraItems: settings.extraItems,
    theme,
    accent,
    autostart: autostartSaved,
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
    return () => {
      cancelled = true
    }
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const ratesValid = draft.priceTypes.every((t) => t.name.trim() && t.price > 0)
  const extrasValid = draft.extraItems.every((i) => i.name.trim() && i.price > 0)
  const valid = ratesValid && extrasValid

  const requestClose = () => {
    if (dirty) setDiscardOpen(true)
    else setOpen(false)
  }

  const save = async () => {
    if (!valid) return
    onChange({
      ...settings,
      priceTypes: draft.priceTypes.map((t) => ({ ...t, name: t.name.trim() })),
      defaultTypeId: draft.defaultTypeId,
      extraItems: draft.extraItems.map((i) => ({ ...i, name: i.name.trim() })),
    })
    setTheme(draft.theme)
    setAccent(draft.accent)
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
    setOpen(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) setOpen(true)
          else requestClose()
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="icon" aria-label="تنظیمات" />}>
          <SettingsIcon />
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تنظیمات</DialogTitle>
            <DialogDescription>برای اعمال تغییرات، دکمه ذخیره را بزنید.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="general">عمومی</TabsTrigger>
              <TabsTrigger value="rates">
                نرخ‌ها
                {!ratesValid && <span className="size-2 rounded-full bg-destructive" />}
              </TabsTrigger>
              <TabsTrigger value="extras">
                موارد اضافه
                {!extrasValid && <span className="size-2 rounded-full bg-destructive" />}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex flex-col gap-4">
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

            <TabsContent value="rates" className="flex flex-col gap-3">
              <PriceTypeEditor
                types={draft.priceTypes}
                defaultId={draft.defaultTypeId}
                onChange={(priceTypes, defaultTypeId) => patch({ priceTypes, defaultTypeId })}
              />
            </TabsContent>

            <TabsContent value="extras">
              <ExtraItemsEditor
                items={draft.extraItems}
                onChange={(extraItems) => patch({ extraItems })}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-destructive">
              {valid ? '' : 'نام و قیمت تمام موارد باید تکمیل شود (قیمت بیشتر از صفر).'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={requestClose}>
                انصراف
              </Button>
              <Button disabled={!valid || !dirty} onClick={save}>
                ذخیره
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغییرات ذخیره نشده</AlertDialogTitle>
            <AlertDialogDescription>
              تغییراتی که اعمال کرده‌اید ذخیره نشده‌اند. با خروج، این تغییرات از بین می‌روند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ادامه ویرایش</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false)
                setOpen(false)
              }}
            >
              خروج بدون ذخیره
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
