import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
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
import { formatNumber, parseNumber } from '@/lib/format'
import { OTHER_ITEM_NAME, type CatalogItem, type ExtraCategory, type ExtraItem } from '@/lib/store'

type Props = {
  categories: ExtraCategory[]
  catalog: CatalogItem[]
  onAdd: (item: Omit<ExtraItem, 'id'>) => void
  // Small icon-only trigger for the compact session card.
  compact?: boolean
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="کم کردن"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center font-mono tabular-nums">{value}</span>
      <Button variant="outline" size="icon-sm" aria-label="زیاد کردن" onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
  )
}

export function ExtraItemPicker({ categories, catalog, onAdd, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [otherPrice, setOtherPrice] = useState('')
  const [otherQty, setOtherQty] = useState(0)
  const [otherNote, setOtherNote] = useState('')
  // Category filter (only offered when there is more than one category).
  const [category, setCategory] = useState<string | null>(null)
  const visible = category ? catalog.filter((c) => c.categoryId === category) : catalog

  const reset = () => {
    setCategory(null)
    setCounts({})
    setOtherPrice('')
    setOtherQty(0)
    setOtherNote('')
  }

  const otherUnit = parseNumber(otherPrice)
  const otherValid = otherQty > 0 && otherUnit > 0
  const lines = [
    ...catalog
      .filter((c) => (counts[c.id] ?? 0) > 0)
      .map((c) => ({ catalogId: c.id, name: c.name, price: c.price, qty: counts[c.id] })),
    ...(otherValid
      ? [
          {
            name: OTHER_ITEM_NAME,
            price: otherUnit,
            qty: otherQty,
            ...(otherNote.trim() ? { description: otherNote.trim() } : {}),
          },
        ]
      : []),
  ]
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  const dirty =
    Object.values(counts).some((n) => n > 0) || otherPrice !== '' || otherQty > 0 || otherNote !== ''
  const { requestClose, dialog } = useDiscardGuard(dirty, () => {
    reset()
    setOpen(false)
  })

  const submit = () => {
    lines.forEach(onAdd)
    reset()
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
      <Tip label="افزودن از بوفه به تایم">
        <DialogTrigger
          render={
            compact ? (
              <Button variant="outline" size="icon-sm" aria-label="افزودن از بوفه" />
            ) : (
              <Button variant="outline" />
            )
          }
        >
          <Plus /> {!compact && 'افزودن هزینه'}
        </DialogTrigger>
      </Tip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن از بوفه</DialogTitle>
          <DialogDescription>تعداد هر مورد را مشخص کنید و سپس افزودن را بزنید.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="xs"
                variant={category === null ? 'default' : 'outline'}
                onClick={() => setCategory(null)}
              >
                همه
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  size="xs"
                  variant={category === c.id ? 'default' : 'outline'}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          )}
          {visible.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{formatNumber(c.price)} تومان</div>
              </div>
              <Stepper
                value={counts[c.id] ?? 0}
                onChange={(n) => setCounts((prev) => ({ ...prev, [c.id]: n }))}
              />
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="font-medium">{OTHER_ITEM_NAME}</div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="other-price" className="text-xs text-muted-foreground">
                  قیمت واحد
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="other-price"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="0"
                    value={otherPrice ? formatNumber(otherUnit) : ''}
                    onChange={(e) => setOtherPrice(e.target.value)}
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">تعداد</Label>
                <Stepper value={otherQty} onChange={setOtherQty} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="other-note" className="text-xs text-muted-foreground">
                توضیحات (اختیاری)
              </Label>
              <Input
                id="other-note"
                placeholder="مثلاً بابت چه چیزی؟"
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm">
            جمع: <b>{formatNumber(total)}</b> تومان
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={lines.length === 0} onClick={submit}>
              افزودن
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {dialog}
    </>
  )
}
