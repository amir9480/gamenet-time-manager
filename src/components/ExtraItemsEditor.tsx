import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber, parseNumber } from '@/lib/format'
import { uid, type CatalogItem } from '@/lib/store'

type Props = {
  items: CatalogItem[]
  onChange: (items: CatalogItem[]) => void
}

export function ExtraItemsEditor({ items, onChange }: Props) {
  const update = (id: string, patch: Partial<CatalogItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        موارد زیر هنگام افزودن هزینه اضافه در هر دستگاه قابل انتخاب هستند. گزینه «موارد دیگر» همیشه
        برای ثبت قیمت دلخواه موجود است.
      </p>
      <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-muted-foreground">
        <span>نام مورد</span>
        <span>قیمت (تومان)</span>
        <span />
      </div>
      {items.map((i) => (
        <div key={i.id} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
          <Input
            aria-label="نام مورد"
            aria-invalid={!i.name.trim()}
            value={i.name}
            onChange={(e) => update(i.id, { name: e.target.value })}
          />
          <Input
            aria-label={`قیمت ${i.name}`}
            aria-invalid={!i.price}
            dir="ltr"
            inputMode="numeric"
            placeholder="0"
            value={i.price ? formatNumber(i.price) : ''}
            onChange={(e) => update(i.id, { price: parseNumber(e.target.value) })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="حذف"
            onClick={() => onChange(items.filter((x) => x.id !== i.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...items, { id: uid(), name: 'مورد جدید', price: 0 }])}
      >
        <Plus /> افزودن مورد
      </Button>
    </div>
  )
}
