import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tip } from '@/components/tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { uid, type CatalogItem, type ExtraCategory } from '@/lib/store'

type Props = {
  categories: ExtraCategory[]
  items: CatalogItem[]
  onChange: (categories: ExtraCategory[], items: CatalogItem[]) => void
}

export function ExtraItemsEditor({ categories, items, onChange }: Props) {
  const update = (id: string, patch: Partial<CatalogItem>) =>
    onChange(
      categories,
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )

  const catItems = categories.map((c) => ({ value: c.id, label: c.name }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        اقلام زیر هنگام افزودن از بوفه در هر تایم قابل انتخاب هستند؛ با داشتن بیش از یک
        دسته‌بندی، می‌توان فهرست را فیلتر کرد. گزینه «موارد دیگر» همیشه برای ثبت قیمت دلخواه موجود است.
      </p>

      {categories.map((c) => {
        const list = items.filter((i) => i.categoryId === c.id)
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="نام دسته‌بندی"
                placeholder="مثلاً نوشیدنی سرد"
                aria-invalid={!c.name.trim()}
                className="font-bold"
                value={c.name}
                onChange={(e) =>
                  onChange(
                    categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                    items,
                  )
                }
              />
              <Tip
                label={
                  list.length
                    ? 'ابتدا موارد این دسته را حذف یا منتقل کنید'
                    : categories.length <= 1
                      ? 'حداقل یک دسته‌بندی لازم است'
                      : 'حذف دسته‌بندی'
                }
              >
                <span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف دسته‌بندی"
                    disabled={list.length > 0 || categories.length <= 1}
                    onClick={() =>
                      onChange(
                        categories.filter((x) => x.id !== c.id),
                        items,
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </span>
              </Tip>
            </div>

            {list.length > 0 && (
              <div className="grid grid-cols-[1fr_7rem_9rem_2rem] gap-2 text-xs text-muted-foreground">
                <span>نام مورد</span>
                <span>قیمت (تومان)</span>
                <span>دسته‌بندی</span>
                <span />
              </div>
            )}
            {list.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_7rem_9rem_2rem] items-center gap-2">
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
                <Select
                  items={catItems}
                  value={i.categoryId}
                  onValueChange={(v) => update(i.id, { categoryId: v as string })}
                >
                  <SelectTrigger className="w-full" aria-label="دسته‌بندی">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catItems.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  onClick={() =>
                    onChange(
                      categories,
                      items.filter((x) => x.id !== i.id),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                onChange(categories, [...items, { id: uid(), name: 'مورد جدید', price: 0, categoryId: c.id }])
              }
            >
              <Plus /> افزودن مورد
            </Button>
          </div>
        )
      })}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...categories, { id: uid(), name: '' }], items)}
      >
        <Plus /> افزودن دسته‌بندی
      </Button>
    </div>
  )
}
