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

type Props = {
  open: boolean
  onStart: () => void
  onSkip: () => void
}

// Offered once, right after onboarding. Declining it skips every guide for good.
export function TourPromptDialog({ open, onStart, onSkip }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>راهنمای گام‌به‌گام</AlertDialogTitle>
          <AlertDialogDescription>
            می‌خواهید با یک راهنمای کوتاه، ساخت اولین تایم را قدم‌به‌قدم ببینید؟ هر بخش از برنامه
            راهنمای مخصوص خودش را دارد و هر زمان با کلید <b dir="ltr">F1</b>{' '}
            می‌توانید آن را دوباره ببینید.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onSkip}>رد کردن همه‌ی راهنماها</AlertDialogCancel>
          <AlertDialogAction onClick={onStart}>شروع راهنما</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
