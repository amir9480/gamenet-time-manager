import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { NewCustomerDialog } from '@/components/NewCustomerDialog'
import { Tip } from '@/components/Tip'
import type { Customer } from '@/lib/store'

type Props = {
  customers: Customer[]
  value: string | undefined
  onChange: (id: string | undefined) => void
  id?: string
  autoFocus?: boolean
}

const label = (c: Customer) => (c.phone ? `${c.name} (${c.phone})` : c.name)

// Optional customer picker with search by name/phone and inline «مشتری جدید».
export function CustomerSelect({ customers, value, onChange, id, autoFocus }: Props) {
  const [newOpen, setNewOpen] = useState(false)
  const selected = customers.find((c) => c.id === value) ?? null

  return (
    <div className="flex items-center gap-2">
      <Combobox
        items={customers}
        value={selected}
        onValueChange={(c) => onChange((c as Customer | null)?.id)}
        itemToStringLabel={(c: Customer) => label(c)}
        isItemEqualToValue={(a: Customer, b: Customer) => a.id === b.id}
        filter={(c: Customer, q: string) =>
          `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())
        }
      >
        <ComboboxInput
          id={id}
          autoFocus={autoFocus}
          placeholder="بدون مشتری"
          aria-label="مشتری"
          showClear={!!selected}
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>مشتری‌ای پیدا نشد</ComboboxEmpty>
          <ComboboxList>
            {(c: Customer) => (
              <ComboboxItem key={c.id} value={c}>
                {label(c)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Tip label="مشتری جدید">
        <Button
          variant="outline"
          size="icon"
          aria-label="مشتری جدید"
          onClick={() => setNewOpen(true)}
        >
          <UserPlus />
        </Button>
      </Tip>
      <NewCustomerDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(c) => onChange(c.id)}
      />
    </div>
  )
}
