import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tip } from '@/components/tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { OTHER_ITEM_NAME, uid, type CatalogItem, type ExtraCategory, type Usage } from '@/lib/store'

type Props = {
  categories: ExtraCategory[]
  items: CatalogItem[]
  usage: Usage
  onChange: (categories: ExtraCategory[], items: CatalogItem[]) => void
}

type PendingDelete = { kind: 'category'; id: string; name: string } | { kind: 'item'; id: string; name: string }

export function ExtraItemsEditor({ categories, items, usage, onChange }: Props) {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const update = (id: string, patch: Partial<CatalogItem>) =>
    onChange(
      categories,
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'category')
      onChange(categories.filter((x) => x.id !== pendingDelete.id), items)
    else onChange(categories, items.filter((x) => x.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const catItems = categories.map((c) => ({ value: c.id, label: c.name }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        اقلام زیر هنگام افزودن از بوفه در هر تایم قابل انتخاب هستند؛ با داشتن بیش از یک
        دسته‌بندی، می‌توان فهرست را فیلتر کرد. گزینه «{OTHER_ITEM_NAME}» همیشه برای ثبت قیمت دلخواه موجود است.
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
                    onClick={() => setPendingDelete({ kind: 'category', id: c.id, name: c.name })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </Tip>
            </div>

            {list.length > 0 && (
              <div className="hidden grid-cols-[1fr_7rem_9rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
                <span>نام مورد</span>
                <span>قیمت (تومان)</span>
                <span>دسته‌بندی</span>
                <span />
              </div>
            )}
            {list.map((i) => {
              const inUse = usage.extraItemIds.has(i.id)
              return (
              <div
                key={i.id}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_9rem_2rem] sm:items-center"
              >
                <Input
                  aria-label="نام مورد"
                  aria-invalid={!i.name.trim()}
                  value={i.name}
                  onChange={(e) => update(i.id, { name: e.target.value })}
                  className="col-span-2 sm:col-span-1"
                />
                <MoneyInput
                  aria-label={`قیمت ${i.name}`}
                  aria-invalid={!i.price}
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
                <Tip label={inUse ? 'این مورد در یک تایم فعال استفاده می‌شود' : 'حذف'}>
                  <span className="col-span-2 justify-self-end sm:col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف"
                      disabled={inUse}
                      onClick={() => setPendingDelete({ kind: 'item', id: i.id, name: i.name })}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </Tip>
              </div>
              )
            })}
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

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'category' ? 'حذف دسته‌بندی؟' : 'حذف مورد؟'}
            </AlertDialogTitle>
            <AlertDialogDescription>«{pendingDelete?.name}» حذف می‌شود.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
