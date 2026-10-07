import type { ReactElement, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Tooltip around a single element; `\n` in a string label starts a new line.
export function Tip({ label, children }: { label: ReactNode; children: ReactElement }) {
  if (!label) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="whitespace-pre-line">{label}</TooltipContent>
    </Tooltip>
  )
}
