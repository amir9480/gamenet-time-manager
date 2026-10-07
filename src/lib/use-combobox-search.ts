import { useMemo, useState } from 'react'
import { buildIndex, searchIndex, type Field } from '@/lib/search'

// Replaces the Combobox's built-in contiguous-substring filter with the ranked search engine:
// spread `props` on <Combobox items={items} …>. `selectedLabel` is the text the input shows for
// the chosen item; it is not a query, so opening the list must not hide the other options.
export function useComboboxSearch<T>(
  items: readonly T[],
  getFields: (item: T) => Field | Field[],
  selectedLabel?: string,
) {
  const [query, setQuery] = useState('')
  // Re-indexed only when the list itself changes, not on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => buildIndex(items, getFields), [items])
  const effective = selectedLabel !== undefined && query === selectedLabel ? '' : query
  const filteredItems = useMemo(() => searchIndex(index, effective), [index, effective])

  return {
    query,
    props: {
      filter: null,
      filteredItems,
      onInputValueChange: (value: string) => setQuery(value),
    },
  }
}
