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
import { CustomerSelect } from '@/components/CustomerSelect'
import { useDiscardGuard } from '@/components/DiscardDialog'
import type { Customer } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: Customer[]
  value: string | undefined
  onSave: (customerId: string | undefined) => void
}

// Change (or clear) the customer of a running session.
export function CustomerPickerDialog({ open, onOpenChange, customers, value, onSave }: Props) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const { requestClose, dialog } = useDiscardGuard(draft !== value, () => onOpenChange(false))

  const save = () => {
    onSave(draft)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true)
          else requestClose()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>مشتری تایم</DialogTitle>
            <DialogDescription>انتخاب مشتری اختیاری است.</DialogDescription>
          </DialogHeader>
          <CustomerSelect customers={customers} value={draft} onChange={setDraft} autoFocus />
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
