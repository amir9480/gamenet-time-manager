import { useState, type ReactNode } from 'react'
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

export function DiscardDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>تغییرات ذخیره نشده</AlertDialogTitle>
          <AlertDialogDescription>
            تغییراتی که اعمال کرده‌اید ذخیره نشده‌اند. با خروج، این تغییرات از بین می‌روند.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ادامه ویرایش</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            خروج بدون ذخیره
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Route every way of closing a dialog (X, Esc, overlay, cancel button) through
// `requestClose`; render `dialog` once anywhere inside the component.
export function useDiscardGuard(
  dirty: boolean,
  close: () => void,
): { requestClose: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false)
  const requestClose = () => (dirty ? setOpen(true) : close())
  const dialog = (
    <DiscardDialog
      open={open}
      onOpenChange={setOpen}
      onConfirm={() => {
        setOpen(false)
        close()
      }}
    />
  )
  return { requestClose, dialog }
}
