import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDiscardGuard } from '@/components/discard-dialog'
import { addCatalogItem } from '@/lib/db'
import { formatNumber, parseNumber } from '@/lib/format'
import type { CatalogItem, Settings } from '@/lib/store'

const NEW_CATEGORY = '__new__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  // Prefill taken from the custom item that was just added.
  initialName: string
  initialPrice: number
  // Called with the stored catalog item right after saving.
  onSaved?: (item: CatalogItem) => void
}

// Saves a one-off «سایر هزینه‌ها» item into the extra items catalog.
export function SaveExtraItemDialog({ open, onOpenChange, settings, initialName, initialPrice, onSaved }: Props) {
  const noCategories = settings.extraCategories.length === 0
  const [name, setName] = useState(initialName)
  const [price, setPrice] = useState(String(initialPrice))
  const [categoryId, setCategoryId] = useState('')
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setPrice(String(initialPrice))
    setCategoryId(settings.extraCategories.length === 1 ? settings.extraCategories[0].id : '')
    setNewCategory('')
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const creating = noCategories || categoryId === NEW_CATEGORY
  const unit = parseNumber(price)
  const dirty =
    name !== initialName || unit !== initialPrice || categoryId !== '' || newCategory !== ''
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))

  const valid =
    name.trim() !== '' && unit > 0 && (creating ? newCategory.trim() !== '' : categoryId !== '')

  const save = async () => {
    const saved = await addCatalogItem(settings, {
      name,
      price: unit,
      ...(creating ? { newCategoryName: newCategory } : { categoryId }),
    })
    if (saved) onSaved?.(saved)
    onOpenChange(false)
  }

  const catItems = [
    ...settings.extraCategories.map((c) => ({ value: c.id, label: c.name })),
    { value: NEW_CATEGORY, label: 'دسته‌بندی جدید…' },
  ]

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true)
          else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>افزودن به بوفه</DialogTitle>
            <DialogDescription>دسته‌بندی را انتخاب و در صورت نیاز نام و قیمت را ویرایش کنید.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>دسته‌بندی</Label>
              {!noCategories && (
                <Select items={catItems} value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
                  <SelectTrigger className="w-full" aria-label="دسته‌بندی">
                    <SelectValue placeholder="انتخاب دسته‌بندی" />
                  </SelectTrigger>
                  <SelectContent>
                    {catItems.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {creating && (
                <Input
                  autoFocus={noCategories}
                  placeholder="نام دسته‌بندی جدید، مثلاً نوشیدنی"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-item-name">نام</Label>
              <Input id="extra-item-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-item-price">قیمت</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="extra-item-price"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="0"
                  value={unit ? formatNumber(unit) : ''}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!valid} onClick={save}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
