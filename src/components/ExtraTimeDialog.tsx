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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNumber, parseNumber } from '@/lib/format'
import type { ExtraTime, PriceType } from '@/lib/store'

type Props = {
  priceTypes: PriceType[]
  currentTypeId: string
  onAdd: (time: Omit<ExtraTime, 'id'>) => void
}

export const DEFAULT_EXTRA_TIME_NAME = 'زمان اضافه'

export function ExtraTimeDialog({ priceTypes, currentTypeId, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [typeId, setTypeId] = useState(currentTypeId)

  const mins = Math.floor(parseNumber(minutes))
  const type = priceTypes.find((t) => t.id === typeId) ?? priceTypes[0]
  const typeItems = priceTypes.map((t) => ({
    value: t.id,
    label: `${t.name} (${formatNumber(t.price)})`,
  }))

  const submit = () => {
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Reset on every open so the type follows the session's current one.
        setName('')
        setMinutes('')
        setTypeId(currentTypeId)
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Clock /> افزودن زمان
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن زمان اضافه</DialogTitle>
          <DialogDescription>
            زمان اضافه با نرخ نوع انتخاب‌شده به هزینه نشست اضافه می‌شود.
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
            <Label>نوع نرخ (ساعتی)</Label>
            <Select items={typeItems} value={type.id} onValueChange={(v) => setTypeId(v as string)}>
              <SelectTrigger className="w-full" aria-label="نوع نرخ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeItems.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button disabled={mins <= 0} onClick={submit}>
            افزودن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
