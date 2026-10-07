import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NOTICE_LIMITS, noticeUpdates } from '@/lib/notice'

type Props = {
  open: boolean
  // Version the user accepted before (0 = never); older notes are listed as «تغییرات».
  since: number
  onAccept: () => void
}

// Blocking notice that has to be accepted before anything else (onboarding included).
export function NoticeDialog({ open, since, onAccept }: Props) {
  const [checked, setChecked] = useState(false)
  const updates = since > 0 ? noticeUpdates(since) : []

  return (
    <Dialog open={open} disablePointerDismissal onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-amber-500" /> پیش از شروع بخوانید
          </DialogTitle>
          <DialogDescription>محدودیت‌های مهم این برنامه:</DialogDescription>
        </DialogHeader>

        {updates.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg bg-primary/5 p-3 text-sm">
            <b>تغییرات این نسخه</b>
            <ul className="list-disc ps-5">
              {updates.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        <ul className="flex list-disc flex-col gap-2 ps-5 text-sm">
          {NOTICE_LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Checkbox id="notice-accept" checked={checked} onCheckedChange={(c) => setChecked(c)} />
          <Label htmlFor="notice-accept">موارد بالا را خواندم و می‌پذیرم.</Label>
        </div>

        <DialogFooter>
          <Button disabled={!checked} onClick={onAccept}>
            ادامه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
