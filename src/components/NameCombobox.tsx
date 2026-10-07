import { useState } from 'react'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'

type Props = {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
  autoFocus?: boolean
  'aria-label'?: string
  onEnter?: () => void
}

const MAX_SHOWN = 8

// Free-text input that suggests previously used names while typing.
export function NameCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
  autoFocus,
  onEnter,
  ...rest
}: Props) {
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase()
  const shown = suggestions
    .filter((n) => n.toLowerCase().includes(q) && n !== value)
    .slice(0, MAX_SHOWN)

  return (
    <Combobox
      items={shown}
      filter={null}
      value={value || null}
      onValueChange={(v) => onChange((v as string | null) ?? '')}
      inputValue={value}
      onInputValueChange={onChange}
      open={open && shown.length > 0}
      onOpenChange={setOpen}
    >
      <ComboboxInput
        id={id}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        showTrigger={false}
        className="w-full"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(open && shown.length > 0)) onEnter?.()
        }}
      />
      <ComboboxContent>
        <ComboboxList>
          {(name: string) => (
            <ComboboxItem key={name} value={name}>
              {name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
