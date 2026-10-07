import { useState } from 'react'
import { Clock } from 'lucide-react'
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
import { Tip } from '@/components/Tip'
import { Label } from '@/components/ui/label'
import { useDiscardGuard } from '@/components/DiscardDialog'
import { PriceSelect } from '@/components/PriceSelect'
import { formatNumber, parseNumber } from '@/lib/format'
import { flatPrices, type ExtraTime, type RateGroup } from '@/lib/store'

type Props = {
  // Rate groups of the session's device.
  groups: RateGroup[]
  currentTypeId: string
  onAdd: (time: Omit<ExtraTime, 'id'>) => void
  // Small icon-only trigger for the compact session card.
  compact?: boolean
}

export const DEFAULT_EXTRA_TIME_NAME = 'زمان اضافه'

export function ExtraTimeDialog({ groups, currentTypeId, onAdd, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [typeId, setTypeId] = useState(currentTypeId)

  const mins = Math.floor(parseNumber(minutes))
  const prices = flatPrices(groups)
  const type = prices.find((t) => t.id === typeId) ?? prices[0]

  const dirty = name !== '' || minutes !== '' || typeId !== currentTypeId
  const { requestClose, dialog } = useDiscardGuard(dirty, () => setOpen(false))

  const submit = () => {
    if (!type) return
    onAdd({
      name: name.trim() || DEFAULT_EXTRA_TIME_NAME,
      minutes: mins,
      typeId: type.id,
      typeName: type.name,
      price: type.price,
    })
    setOpen(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            // Reset on every open so the price follows the session's current one.
            setName('')
            setMinutes('')
            setTypeId(currentTypeId)
            setOpen(true)
          } else requestClose()
        }}
      >
        <Tip label="افزودن زمان اضافه به تایم">
          <DialogTrigger
            render={
              compact ? (
                <Button variant="outline" size="icon-sm" aria-label="افزودن زمان اضافه" />
              ) : (
                <Button variant="outline" />
              )
            }
          >
            <Clock /> {!compact && 'افزودن زمان'}
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>افزودن زمان اضافه</DialogTitle>
            <DialogDescription>
              زمان اضافه با نرخ انتخاب‌شده به هزینه تایم اضافه می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-time-name">عنوان (اختیاری)</Label>
              <Input
                id="extra-time-name"
                placeholder={DEFAULT_EXTRA_TIME_NAME}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>نرخ (ساعتی)</Label>
              <PriceSelect groups={groups} value={type?.id ?? ''} onChange={setTypeId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-time-minutes">مدت (دقیقه)</Label>
              <Input
                id="extra-time-minutes"
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
            <Button disabled={mins <= 0 || !type} onClick={submit}>
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
