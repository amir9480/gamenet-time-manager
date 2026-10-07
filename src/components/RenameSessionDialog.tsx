import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NameCombobox } from '@/components/NameCombobox'
import { readPreviousNames } from '@/lib/db'
import { defaultSessionName, type Session } from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  onSave: (name: string) => void
}

export function RenameSessionDialog({ open, onOpenChange, session, onSave }: Props) {
  const [name, setName] = useState('')
  const previousNames = useLiveQuery(readPreviousNames) ?? []
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
        <NameCombobox
          autoFocus
          aria-label="نام نشست"
          placeholder={fallback}
          value={name}
          onChange={setName}
          suggestions={previousNames}
          onEnter={save}
        />
        <DialogFooter>
          <Button onClick={save}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
