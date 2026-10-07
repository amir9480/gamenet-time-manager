import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DevicePicker, pickFor, type Pick } from '@/components/device-picker'
import { useDiscardGuard } from '@/components/discard-dialog'
import {
  categoryName,
  flatPrices,
  freeDevices,
  type Device,
  type FlatPrice,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  settings: Settings
  sessions: Session[]
  onSwitch: (device: Device, category: string, price: FlatPrice) => void
}

// Moves a session to another free device (and price), e.g. from a PC to a PlayStation.
export function ChangeDeviceDialog({
  open,
  onOpenChange,
  session,
  settings,
  sessions,
  onSwitch,
}: Props) {
  const free = freeDevices(settings.devices, sessions)
  const currentCategory = settings.devices.find((d) => d.id === session.deviceId)?.categoryId
  const [pick, setPick] = useState<Pick>(() => pickFor(settings, free, currentCategory))
  const [initial, setInitial] = useState(pick)

  useEffect(() => {
    if (!open) return
    const p = pickFor(settings, free, currentCategory)
    setPick(p)
    setInitial(p)
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const device = free.find((d) => d.id === pick.deviceId)
  const price = flatPrices(settings.rateGroups).find((p) => p.id === pick.priceId)
  const valid = !!device && !!price

  const dirty = JSON.stringify(pick) !== JSON.stringify(initial)
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const submit = () => {
    if (!device || !price) return
    onSwitch(device, categoryName(settings, device), price)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true)
          else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر دستگاه</DialogTitle>
            <DialogDescription>
              از این لحظه، زمان با دستگاه و نرخ جدید محاسبه می‌شود؛ زمان گذشته با نرخ قبلی می‌ماند و
              دستگاه فعلی ({session.deviceName}) آزاد می‌شود.
            </DialogDescription>
          </DialogHeader>
          <DevicePicker settings={settings} free={free} pick={pick} onChange={setPick} idPrefix="switch" />
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!valid} onClick={submit}>
              <ArrowLeftRight /> تغییر دستگاه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
