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
import { defaultSessionName, type Session } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  onSave: (name: string) => void
}

export function RenameSessionDialog({ open, onOpenChange, session, onSave }: Props) {
  const [name, setName] = useState('')
  const fallback = defaultSessionName(session.number)

  useEffect(() => {
    if (open) setName(session.name)
  }, [open, session.name])

  const save = () => {
    onSave(name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>تغییر نام نشست</DialogTitle>
          <DialogDescription>
            اگر نام را خالی بگذارید، نام پیش‌فرض ({fallback}) استفاده می‌شود.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="نام نشست"
          placeholder={fallback}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <DialogFooter>
          <Button onClick={save}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
