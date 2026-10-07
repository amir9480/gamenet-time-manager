import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  JALALI_WEEKDAYS,
  daysInJalaliMonth,
  formatJalaliDate,
  formatMonthYear,
  jalaliToDate,
  jalaliWeekday,
  toFa,
  toJalali,
} from '@/lib/jalali'

type Props = {
  label: string
  // Local midnight timestamp of the chosen day.
  value: number
  onChange: (dayStart: number) => void
}

export function JalaliDatePicker({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = toJalali(value)
  const [view, setView] = useState({ y: selected.y, m: selected.m })

  const shiftMonth = (delta: number) =>
    setView(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
    })

  const first = jalaliToDate({ ...view, d: 1 })
  const blanks = jalaliWeekday(first)
  const days = daysInJalaliMonth(view.y, view.m)
  const cells: (number | null)[] = [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]

  const pick = (d: number) => {
    onChange(jalaliToDate({ ...view, d }).getTime())
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setView({ y: selected.y, m: selected.m })
        setOpen(o)
      }}
    >
      <PopoverTrigger render={<Button variant="outline" className="justify-between gap-2" />}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span>{formatJalaliDate(value)}</span>
        <CalendarDays />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" aria-label="ماه قبل" onClick={() => shiftMonth(-1)}>
            <ChevronRight />
          </Button>
          <span className="font-bold">{formatMonthYear(view.y, view.m)}</span>
          <Button variant="ghost" size="icon-sm" aria-label="ماه بعد" onClick={() => shiftMonth(1)}>
            <ChevronLeft />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {JALALI_WEEKDAYS.map((w) => (
            <span key={w} className="py-1 text-muted-foreground">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <span key={i} />
            ) : (
              <Button
                key={i}
                size="icon-sm"
                variant={
                  d === selected.d && view.y === selected.y && view.m === selected.m
                    ? 'default'
                    : 'ghost'
                }
                onClick={() => pick(d)}
              >
                {toFa(d)}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(new Date().setHours(0, 0, 0, 0))
            setOpen(false)
          }}
        >
          امروز
        </Button>
      </PopoverContent>
    </Popover>
  )
}
