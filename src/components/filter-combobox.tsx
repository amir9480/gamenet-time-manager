import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'

export type FilterOption = { value: string; label: string }

type Props = {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  'aria-label': string
}

// Searchable replacement for a filter <Select>; stays usable with hundreds of options.
export function FilterCombobox({ options, value, onChange, 'aria-label': ariaLabel }: Props) {
  const selected = options.find((o) => o.value === value) ?? options[0]

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(o) => o && onChange((o as FilterOption).value)}
      itemToStringLabel={(o: FilterOption) => o.label}
      isItemEqualToValue={(a: FilterOption, b: FilterOption) => a.value === b.value}
      // The input shows the chosen label on open; that must not hide the other options.
      filter={(o: FilterOption, q: string) =>
        q.trim() === '' ||
        q === selected.label ||
        o.label.toLowerCase().includes(q.trim().toLowerCase())
      }
    >
      <ComboboxInput aria-label={ariaLabel} showClear={false} className="w-full" />
      <ComboboxContent>
        <ComboboxEmpty>موردی پیدا نشد</ComboboxEmpty>
        <ComboboxList>
          {(o: FilterOption) => (
            <ComboboxItem key={o.value} value={o}>
              {o.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
