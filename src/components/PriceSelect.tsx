import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import type { RateGroup } from '@/lib/store'

type Props = {
  // The rate groups of the chosen device (see `devicePriceGroups`).
  groups: RateGroup[]
  value: string
  onChange: (priceId: string) => void
  // Extra trailing items (e.g. «تغییر دستگاه…»); their `items` entries must be passed too.
  extraItems?: { value: string; label: string }[]
  extra?: ReactNode
  trigger?: ReactNode
  className?: string
  disabled?: boolean
}

const priceLabel = (name: string, price: number) => `${name} (${formatNumber(price)})`

// Select of per-hour prices, grouped by rate group when there is more than one.
export function PriceSelect({
  groups,
  value,
  onChange,
  extraItems = [],
  extra,
  trigger,
  className,
  disabled,
}: Props) {
  const items = [
    ...groups.flatMap((g) => g.prices.map((p) => ({ value: p.id, label: priceLabel(p.name, p.price) }))),
    ...extraItems,
  ]
  const grouped = groups.length > 1

  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as string)}
    >
      {trigger ?? (
        <SelectTrigger className={className ?? 'w-full'} aria-label="نرخ">
          <SelectValue placeholder="انتخاب نرخ" />
        </SelectTrigger>
      )}
      <SelectContent>
        {groups.map((g) => {
          const rows = g.prices.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {priceLabel(p.name, p.price)}
            </SelectItem>
          ))
          return grouped ? (
            <SelectGroup key={g.id}>
              <SelectLabel>{g.name}</SelectLabel>
              {rows}
            </SelectGroup>
          ) : (
            rows
          )
        })}
        {extra && (
          <>
            <SelectSeparator />
            {extra}
          </>
        )}
      </SelectContent>
    </Select>
  )
}
