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
import { addCustomer, updateCustomer } from '@/lib/db'
import type { Customer } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (customer: Customer) => void
  // Edit mode: mount per customer (`key`) so the fields start from its values.
  customer?: Customer
}

// Saved immediately (outside the Settings draft).
export function NewCustomerDialog({ open, onOpenChange, onCreated, customer: editing }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')

  const dirty = name !== (editing?.name ?? '') || phone !== (editing?.phone ?? '')
  const { requestClose, dialog } = useDiscardGuard(dirty, () => onOpenChange(false))
  const valid = name.trim() !== ''

  const submit = async () => {
    if (!valid) return
    if (editing) {
      await updateCustomer(editing.id, name, phone)
      onOpenChange(false)
      return
    }
    const customer = await addCustomer(name, phone)
    setName('')
    setPhone('')
    onOpenChange(false)
    onCreated?.(customer)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setName('')
            setPhone('')
            onOpenChange(true)
          } else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش مشتری' : 'مشتری جدید'}</DialogTitle>
            <DialogDescription>نام مشتری الزامی و شماره‌ی تماس اختیاری است.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-customer-name">نام</Label>
              <Input
                id="new-customer-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-customer-phone">شماره‌ی تماس (اختیاری)</Label>
              <Input
                id="new-customer-phone"
                dir="ltr"
                inputMode="tel"
                placeholder="09…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
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
