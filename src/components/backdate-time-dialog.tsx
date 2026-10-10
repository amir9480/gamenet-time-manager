import { useEffect, useState } from 'react'
import type { DriveStep } from 'driver.js'
import { History } from 'lucide-react'
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
import { MinutesInput } from '@/components/ui/minutes-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tip } from '@/components/tip'
import { useDiscardGuard } from '@/components/discard-dialog'
import { TourHelpButton } from '@/components/tour-help-button'
import { parseNumber } from '@/lib/format'
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
import { categoryName, type Device, type Session, type Settings } from '@/lib/store'

// Guide of this dialog (opens by itself the first time, or F1 / the «?» button). The steps point at
// the `data-tour` attributes below, so keep the two in sync when the markup changes.
export const backdateTour: TourDef = {
  id: 'backdate',
  present: tourSel('backdate-minutes'),
  priority: 60,
  steps: (): DriveStep[] => [
    {
      element: tourSel('backdate-device'),
      waitForElement: 2000,
      disableActiveInteraction: true,
      popover: {
        title: 'دستگاه',
        description:
          'دستگاهی را انتخاب کنید که مشتری در آن مدت روی آن بازی کرده است. اگر همان دستگاه فعلی تایم باشد، شروع تایم به عقب می‌رود؛ اگر دستگاه دیگری باشد، یک بخش جدید قبل از تایم فعلی با نرخ فعلی همین تایم ساخته می‌شود که بعداً از ریز هزینه‌ها قابل ویرایش است.',
        side: 'bottom',
      },
    },
    {
      element: tourSel('backdate-minutes'),
      disableActiveInteraction: true,
      popover: {
        title: 'مدت',
        description:
          'چند دقیقه از بازی قبل از ثبت تایم را فراموش کرده‌اید؟ همین مقدار به زمان و هزینه‌ی تایم اضافه می‌شود.',
        side: 'top',
      },
    },
    {
      element: tourSel('backdate-submit'),
      disableActiveInteraction: true,
      popover: {
        title: 'افزودن',
        description:
          'مدت گذشته را به تایم اضافه می‌کند. این دکمه وقتی فعال می‌شود که دستگاه و مدت را مشخص کرده باشید.',
        side: 'top',
      },
    },
  ],
}

registerTour(backdateTour)

type Props = {
  session: Session
  settings: Settings
  // Called with the picked device, its category name and the minutes to backdate.
  onAdd: (device: Device, category: string, minutes: number) => void
  // Small icon-only trigger for the compact session card.
  compact?: boolean
  // Trigger button size when not compact (matches whatever it sits next to).
  size?: 'default' | 'sm'
}

export function BackdateTimeDialog({ session, settings, onAdd, compact, size }: Props) {
  const [open, setOpen] = useState(false)
  const [catId, setCatId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [minutes, setMinutes] = useState('')

  const hasSegments = session.segments.length > 0
  const sessionDevice = settings.devices.find((d) => d.id === session.deviceId)

  const categories = settings.deviceCategories.filter((c) =>
    settings.devices.some((d) => d.categoryId === c.id),
  )
  const devicesInCat = settings.devices.filter((d) => d.categoryId === catId)
  const device = settings.devices.find((d) => d.id === deviceId)
  const mins = Math.floor(parseNumber(minutes))

  const dirty =
    catId !== (sessionDevice?.categoryId ?? '') || deviceId !== session.deviceId || minutes !== ''
  const { requestClose, dialog } = useDiscardGuard(dirty, () => setOpen(false))

  const canSubmit = hasSegments && !!device && mins > 0

  // The first time the dialog opens, the guide starts by itself (unless guides were skipped).
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (tourSkipped() || tourSeen('backdate-seen') || isTourActive()) return
      markTourSeen('backdate-seen')
      startTour(backdateTour, () => {})
    }, 400)
    return () => window.clearTimeout(t)
  }, [open])

  const submit = () => {
    if (!canSubmit || !device) return
    onAdd(device, categoryName(settings, device), mins)
    setOpen(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o, details) => {
          // The guide's popover lives outside the dialog; clicking it must not close the dialog.
          if (!o && isTourActive() && details.reason === 'outside-press') return
          if (o) {
            setCatId(sessionDevice?.categoryId ?? '')
            setDeviceId(session.deviceId)
            setMinutes('')
            setOpen(true)
          } else requestClose()
        }}
      >
        <Tip label="افزودن زمان گذشته به تایم">
          <DialogTrigger
            render={
              compact ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="افزودن زمان گذشته"
                  data-tour="card-backdate"
                  disabled={!hasSegments}
                />
              ) : (
                <Button variant="outline" size={size} data-tour="card-backdate" disabled={!hasSegments} />
              )
            }
          >
            <History /> {!compact && 'افزودن زمان گذشته'}
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1">
              افزودن زمان گذشته
              <TourHelpButton tour="backdate" />
            </DialogTitle>
            <DialogDescription>
              برای زمانی که فراموش کرده‌اید ثبت کنید؛ این مدت پیش از شروع تایم اضافه می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3" data-tour="backdate-device">
            <div className="flex flex-col gap-1.5">
              <Label>نوع دستگاه</Label>
              <Select
                items={categories.map((c) => ({ value: c.id, label: c.name }))}
                value={catId}
                onValueChange={(v) => {
                  setCatId(v as string)
                  const first = settings.devices.find((d) => d.categoryId === v)
                  setDeviceId(first?.id ?? '')
                }}
              >
                <SelectTrigger className="w-full" aria-label="نوع دستگاه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>دستگاه</Label>
              <Select
                items={devicesInCat.map((d) => ({ value: d.id, label: d.name }))}
                value={deviceId}
                onValueChange={(v) => setDeviceId(v as string)}
              >
                <SelectTrigger className="w-full" aria-label="دستگاه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {devicesInCat.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
            <div className="flex flex-col gap-1.5" data-tour="backdate-minutes">
              <Label htmlFor="backdate-minutes">مدت (دقیقه)</Label>
              <MinutesInput
                id="backdate-minutes"
                placeholder="0"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button data-tour="backdate-submit" disabled={!canSubmit} onClick={submit}>
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
