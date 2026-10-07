import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { useComboboxSearch } from '@/lib/use-combobox-search'

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
  const { props: search } = useComboboxSearch(options, (o) => o.label, selected.label)

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(o) => o && onChange((o as FilterOption).value)}
      itemToStringLabel={(o: FilterOption) => o.label}
      isItemEqualToValue={(a: FilterOption, b: FilterOption) => a.value === b.value}
      {...search}
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
