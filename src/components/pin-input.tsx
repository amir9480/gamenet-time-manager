import { forwardRef, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { PIN_MAX } from '@/lib/security'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
}

// Digits-only PIN field shared by the lock page and Settings.
export const PinInput = forwardRef<HTMLInputElement, Props>(function PinInput(
  { value, onChange, className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="password"
      dir="ltr"
      inputMode="numeric"
      // Browsers ignore "off" on password fields; "new-password" stops saved-password
      // suggestions, and the data attributes opt out of 1Password / LastPass / Bitwarden.
      autoComplete="new-password"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      data-bwignore
      data-form-type="other"
      maxLength={PIN_MAX}
      className={cn('h-11 text-center text-lg tracking-[0.5em]', className)}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      {...rest}
    />
  )
})
