import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatMoneyInput, sanitizeMoneyInput } from '@/lib/format'

export type MoneyInputProps = React.ComponentProps<typeof Input>

export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  const displayValue =
    value === undefined || value === null || value === ''
      ? ''
      : formatMoneyInput(value)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeMoneyInput(event.target.value)
    if (next !== event.target.value) {
      event.target.value = next
    }
    onChange?.(event)
  }

  return <Input {...props} dir="ltr" inputMode="numeric" value={displayValue} onChange={handleChange} />
}
