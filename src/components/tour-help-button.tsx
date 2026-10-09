import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/tip'
import { isTourActive, startTourById } from '@/lib/tour'

// Small «?» next to a dialog's title: starts the guide registered under `tour` (same as F1).
export function TourHelpButton({ tour }: { tour: string }) {
  return (
    <Tip label="راهنمای این بخش (F1)">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label="راهنمای این بخش"
        onClick={() => {
          if (!isTourActive()) startTourById(tour, () => {})
        }}
      >
        <CircleHelp />
      </Button>
    </Tip>
  )
}
