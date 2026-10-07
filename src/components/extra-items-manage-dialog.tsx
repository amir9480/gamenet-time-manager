import { useEffect, useState } from 'react'
import { Minus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDiscardGuard } from '@/components/discard-dialog'
import { formatNumber } from '@/lib/format'
import { extraTimeCost, type ExtraItem, type ExtraTime } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ExtraItem[]
  times: ExtraTime[]
  onSave: (items: ExtraItem[], times: ExtraTime[]) => void
}

export function ExtraItemsManageDialog({
  open,
  onOpenChange,
  items: savedItems,
  times: savedTimes,
  onSave,
}: Props) {
  // Edits are kept in a draft until the user saves.
  const [items, setItems] = useState(savedItems)
  const [times, setTimes] = useState(savedTimes)

  useEffect(() => {
    if (open) {
      setItems(savedItems)
      setTimes(savedTimes)
    }
    // Only re-seed the draft when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onItemsChange = setItems
  const onTimesChange = setTimes

  const dirty =
    JSON.stringify(items) !== JSON.stringify(savedItems) ||
    JSON.stringify(times) !== JSON.stringify(savedTimes)

  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const save = () => {
    onSave(items, times)
    onOpenChange(false)
  }

  const decrease = (id: string) =>
    onItemsChange(
      items.flatMap((i) => (i.id !== id ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : [])),
    )
  const total =
    items.reduce((sum, i) => sum + i.price * i.qty, 0) +
    times.reduce((sum, t) => sum + extraTimeCost(t), 0)

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>زمان اضافه و بوفه ثبت‌شده</DialogTitle>
          <DialogDescription>
            برای اصلاح اشتباه، تعداد را کم کنید یا مورد را حذف کنید و سپس ذخیره را بزنید.
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 && times.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">موردی ثبت نشده است.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {times.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(t.minutes)} دقیقه × {t.typeName} ({formatNumber(t.price)} در ساعت) ={' '}
                    {formatNumber(extraTimeCost(t))} تومان
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`حذف ${t.name}`}
                  onClick={() => onTimesChange(times.filter((x) => x.id !== t.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.name}</div>
                  {i.description && (
                    <div className="truncate text-xs text-muted-foreground">{i.description}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(i.qty)} × {formatNumber(i.price)} = {formatNumber(i.price * i.qty)} تومان
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`کم کردن ${i.name}`}
                    onClick={() => decrease(i.id)}
                  >
                    <Minus />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`حذف ${i.name}`}
                    onClick={() => onItemsChange(items.filter((x) => x.id !== i.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>جمع</span>
              <span>{formatNumber(total)} تومان</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={requestClose}>
            انصراف
          </Button>
          <Button onClick={save}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {dialog}
    </>
  )
}
