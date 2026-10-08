import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatMoneyInput, sanitizeMoneyInput } from '@/lib/format'

// Longer than any session realistically needs.
export const MAX_MINUTES = 1400

export type MinutesInputProps = Omit<React.ComponentProps<typeof Input>, 'max'> & { max?: number }

// Whole minutes only: anything but digits is dropped while typing (Persian/Arabic digits are
// converted), values above `max` are capped to it, and the value is shown with thousands
// separators, like `MoneyInput`.
export function MinutesInput({ value, onChange, max = MAX_MINUTES, ...props }: MinutesInputProps) {
  const displayValue =
    value === undefined || value === null || value === '' ? '' : formatMoneyInput(value)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let next = sanitizeMoneyInput(event.target.value)
    if (next !== '' && Number(next) > max) next = String(max)
    if (next !== event.target.value) {
      event.target.value = next
    }
    onChange?.(event)
  }

  return <Input {...props} dir="ltr" inputMode="numeric" value={displayValue} onChange={handleChange} />
}
