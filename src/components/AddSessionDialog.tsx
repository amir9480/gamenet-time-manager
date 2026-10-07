import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NameCombobox } from '@/components/NameCombobox'
import { readPreviousNames } from '@/lib/db'
import { formatNumber } from '@/lib/format'
import {
  defaultSessionName,
  defaultType,
  nextFreeNumber,
  type PriceType,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  sessions: Session[]
  onCreate: (type: PriceType, name: string) => void
}

export function AddSessionDialog({ open, onOpenChange, settings, sessions, onCreate }: Props) {
  const [typeId, setTypeId] = useState('')
  const [name, setName] = useState('')
  const previousNames = useLiveQuery(readPreviousNames) ?? []

  useEffect(() => {
    if (open) {
      setTypeId(defaultType(settings).id)
      setName('')
    }
    // Only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const type = settings.priceTypes.find((t) => t.id === typeId) ?? defaultType(settings)
  const typeItems = settings.priceTypes.map((t) => ({
    value: t.id,
    label: `${t.name} (${formatNumber(t.price)})`,
  }))
  const placeholder = defaultSessionName(nextFreeNumber(sessions))

  const submit = () => {
    onCreate(type, name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>افزودن نشست</DialogTitle>
          <DialogDescription>نوع نرخ را انتخاب کنید؛ زمان‌سنج بلافاصله شروع می‌شود.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>نوع نرخ (ساعتی)</Label>
            <Select items={typeItems} value={type.id} onValueChange={(v) => setTypeId(v as string)}>
              <SelectTrigger className="w-full" aria-label="نوع نرخ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeItems.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-session-name">نام (اختیاری)</Label>
            <NameCombobox
              id="new-session-name"
              placeholder={placeholder}
              value={name}
              onChange={setName}
              suggestions={previousNames}
              onEnter={submit}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit}>
            <Play /> شروع نشست
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
