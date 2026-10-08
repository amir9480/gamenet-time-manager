import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tip } from '@/components/tip'
import { useDiscardGuard } from '@/components/discard-dialog'
import { formatNumber, parseNumber } from '@/lib/format'
import { categoryName, type Device, type Session, type Settings } from '@/lib/store'

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

  const submit = () => {
    if (!canSubmit || !device) return
    onAdd(device, categoryName(settings, device), mins)
    setOpen(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
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
                  disabled={!hasSegments}
                />
              ) : (
                <Button variant="outline" size={size} disabled={!hasSegments} />
              )
            }
          >
            <History /> {!compact && 'افزودن زمان گذشته'}
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>افزودن زمان گذشته</DialogTitle>
            <DialogDescription>
              برای زمانی که فراموش کرده‌اید ثبت کنید؛ این مدت پیش از شروع تایم اضافه می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backdate-minutes">مدت (دقیقه)</Label>
              <Input
                id="backdate-minutes"
                dir="ltr"
                inputMode="numeric"
                placeholder="0"
                value={mins > 0 ? formatNumber(mins) : minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!canSubmit} onClick={submit}>
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
