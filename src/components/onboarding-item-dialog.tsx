import { useState } from 'react'
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
import { useDiscardGuard } from '@/components/discard-dialog'
import { formatNumber, parseNumber } from '@/lib/format'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryName: string
  onAdd: (name: string, price: number) => void
}

// Adds a custom item to one extra-cost category during onboarding.
export function OnboardingItemDialog({ open, onOpenChange, categoryName, onAdd }: Props) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const unit = parseNumber(price)
  const valid = name.trim() !== '' && unit > 0
  const { requestClose, dialog } = useDiscardGuard(name !== '' || price !== '', () =>
    onOpenChange(false),
  )

  const submit = () => {
    if (!valid) return
    onAdd(name.trim(), unit)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setName('')
            setPrice('')
            onOpenChange(true)
          } else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>افزودن مورد به «{categoryName}»</DialogTitle>
            <DialogDescription>نام و قیمت مورد جدید را وارد کنید.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onb-item-name">نام مورد</Label>
              <Input
                id="onb-item-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onb-item-price">قیمت</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="onb-item-price"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="0"
                  value={price ? formatNumber(unit) : ''}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!valid} onClick={submit}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
