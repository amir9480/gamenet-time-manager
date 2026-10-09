import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

// A small «?» button explaining a field. Opens on hover (mouse) and on click/tap (touch).
export function HelpHint({ children, label = 'توضیح' }: { children: ReactNode; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label={label}
            className="size-5 shrink-0 rounded-full p-0 text-muted-foreground max-md:size-5 max-md:h-auto"
          />
        }
      >
        <CircleHelp className="size-4" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  )
}
