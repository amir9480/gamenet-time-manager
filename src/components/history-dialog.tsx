import { Fragment, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { FilterCombobox } from '@/components/filter-combobox'
import { StatsPanel } from '@/components/stats-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { db } from '@/lib/db'
import { previousRange } from '@/lib/stats'
import { formatDuration, formatNumber } from '@/lib/format'
import { groupByDay, pageCount, pageGroups, summarize } from '@/lib/history'
import {
  endOfDay,
  formatJalaliClock,
  formatJalaliDate,
  formatJalaliLong,
  presetRange,
  startOfDay,
  toFa,
  type Preset,
} from '@/lib/jalali'
import { extraTimeCost, segmentCost, segmentMs, type HistoryEntry } from '@/lib/store'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'امروز' },
  { id: 'yesterday', label: 'دیروز' },
  { id: 'week', label: 'این هفته' },
  { id: 'month', label: 'این ماه' },
  { id: 'all', label: 'همه' },
]

const toman = (n: number) => `${formatNumber(n)} تومان`

type Pending = { kind: 'one'; entry: HistoryEntry } | { kind: 'range' } | null

export function HistoryDialog({ open, onOpenChange }: Props) {
  const [preset, setPreset] = useState<Preset | 'custom'>('today')
  const [range, setRange] = useState(() => presetRange('today'))
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  // 'all' | 'none' (no customer) | customer id; 'all' | category name
  const [customerFilter, setCustomerFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const rangeEntries = useLiveQuery(
    () => db.history.where('endedAt').between(range.from, range.to, true, true).reverse().toArray(),
    [range.from, range.to],
  )

  const customerItems = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of rangeEntries ?? [])
      if (e.customerId && !seen.has(e.customerId))
        seen.set(
          e.customerId,
          e.customerPhone ? `${e.customerName} (${e.customerPhone})` : (e.customerName ?? ''),
        )
    if (customerFilter !== 'all' && customerFilter !== 'none' && !seen.has(customerFilter))
      seen.set(customerFilter, '—')
    return [
      { value: 'all', label: 'همه‌ی مشتریان' },
      { value: 'none', label: 'مشتری مهمان' },
      ...[...seen].map(([value, label]) => ({ value, label })),
    ]
  }, [rangeEntries, customerFilter])

  const categoryItems = useMemo(() => {
    const names = new Set((rangeEntries ?? []).flatMap((e) => e.categoryNames))
    if (categoryFilter !== 'all') names.add(categoryFilter)
    return [
      { value: 'all', label: 'همه‌ی انواع دستگاه' },
      ...[...names].map((n) => ({ value: n, label: n })),
    ]
  }, [rangeEntries, categoryFilter])

  const applyFilters = (list: HistoryEntry[]) =>
    list.filter(
      (e) =>
        (customerFilter === 'all' ||
          (customerFilter === 'none' ? !e.customerId : e.customerId === customerFilter)) &&
        (categoryFilter === 'all' || e.categoryNames.includes(categoryFilter)),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => rangeEntries && applyFilters(rangeEntries), [rangeEntries, customerFilter, categoryFilter])

  // Equally long range right before the selected one, for the stats comparison.
  const prevRange = previousRange(range)
  const prevRaw = useLiveQuery(
    async () =>
      prevRange
        ? db.history.where('endedAt').between(prevRange.from, prevRange.to, true, true).toArray()
        : null,
    [prevRange?.from, prevRange?.to],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previousEntries = useMemo(() => (prevRaw ? applyFilters(prevRaw) : null), [prevRaw, customerFilter, categoryFilter])

  const groups = useMemo(() => groupByDay(entries ?? []), [entries])
  const summary = useMemo(() => summarize(entries ?? []), [entries])
  const pages = pageCount(groups)
  const current = Math.min(page, pages - 1)
  const visible = pageGroups(groups, current)

  const choosePreset = (p: Preset) => {
    setPreset(p)
    setRange(presetRange(p))
    setPage(0)
  }
  const setCustom = (from: number, to: number) => {
    setPreset('custom')
    setRange({ from, to })
    setPage(0)
  }

  const confirmDelete = async () => {
    if (!pending) return
    if (pending.kind === 'one') await db.history.delete(pending.entry.id)
    else await db.history.bulkDelete((entries ?? []).map((e) => e.id))
    setPending(null)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg">تاریخچه تایم‌ها</DialogTitle>
          <DialogDescription>تایم‌های پایان‌یافته به تفکیک روز و درآمد هر روز؛ با فیلتر نام، جمع درآمد هر مشتری را ببینید.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? 'default' : 'outline'}
              onClick={() => choosePreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          {preset !== 'all' && (
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <JalaliDatePicker
                label="از"
                value={startOfDay(range.from)}
                onChange={(d) => setCustom(d, Math.max(range.to, endOfDay(d)))}
              />
              <JalaliDatePicker
                label="تا"
                value={startOfDay(range.to)}
                onChange={(d) => setCustom(Math.min(range.from, d), endOfDay(d))}
              />
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">مشتری</Label>
            <FilterCombobox
              aria-label="فیلتر مشتری"
              options={customerItems}
              value={customerFilter}
              onChange={(v) => {
                setCustomerFilter(v)
                setPage(0)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">نوع دستگاه</Label>
            <FilterCombobox
              aria-label="فیلتر نوع دستگاه"
              options={categoryItems}
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v)
                setPage(0)
              }}
            />
          </div>
        </div>

        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">تاریخچه</TabsTrigger>
            <TabsTrigger value="stats">آمار</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="تعداد تایم" value={toFa(formatNumber(summary.count))} />
          <Stat label="مجموع زمان" value={toFa(formatDuration(summary.durationMs))} ltr />
          <Stat label="درآمد زمان" value={toman(summary.timeCost)} />
          <Stat label="درآمد بوفه" value={toman(summary.extrasCost)} />
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground sm:col-span-4">
            <span className="font-bold">مجموع درآمد</span>
            <span className="text-lg font-bold">{toman(summary.total)}</span>
          </div>
        </div>

        {entries === undefined ? null : groups.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            تایمی با این مشخصات ثبت نشده است.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <table className="w-full table-fixed text-start text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[26%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-start font-normal">تایم</th>
                  <th className="px-2 py-1.5 text-start font-normal">شروع – پایان</th>
                  <th className="px-2 py-1.5 text-start font-normal">مدت</th>
                  <th className="px-2 py-1.5 text-start font-normal">هزینه</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-muted/60">
                      <td colSpan={2} className="px-2 py-2 font-bold">
                        {formatJalaliLong(g.entries[0].endedAt)}{' '}
                        <span className="font-normal text-muted-foreground">
                          ({toFa(g.key)} · {toFa(g.entries.length)} تایم)
                        </span>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        <span dir="ltr" className="inline-block">
                          {toFa(formatDuration(g.durationMs))}
                        </span>
                      </td>
                      <td colSpan={2} className="px-2 py-2 font-bold whitespace-nowrap">
                        {toman(g.total)}
                      </td>
                    </tr>
                    {g.entries.map((e) => (
                      <Fragment key={e.id}>
                        <tr
                          className="cursor-pointer border-b align-middle hover:bg-muted/40"
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        >
                          <td className="px-2 py-2">
                            <div className="truncate">{e.deviceNames.join('، ')}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[e.categoryNames.join('، '), e.customerName].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span dir="ltr" className="inline-block">
                              {formatJalaliClock(e.startedAt, false)} –{' '}
                              {formatJalaliClock(e.endedAt, false)}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span dir="ltr" className="inline-block">
                              {toFa(formatDuration(e.durationMs))}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{toman(e.total)}</td>
                          <td className="px-1 py-1">
                            <div className="flex items-center">
                              <ChevronDown
                                className={cn(
                                  'size-4 text-muted-foreground transition-transform',
                                  expanded === e.id && 'rotate-180',
                                )}
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="حذف"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setPending({ kind: 'one', entry: e })
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded === e.id && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={5} className="px-3 py-3">
                              <Details entry={e} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between">
              <Button variant="destructive" size="sm" onClick={() => setPending({ kind: 'range' })}>
                <Trash2 /> حذف تاریخچه‌ی این بازه
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="صفحه قبل"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronRight />
                </Button>
                <span className="text-sm">
                  صفحه {toFa(current + 1)} از {toFa(pages)}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="صفحه بعد"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronLeft />
                </Button>
              </div>
            </div>
          </div>
        )}
          </TabsContent>

          <TabsContent value="stats">
            {entries && <StatsPanel entries={entries} previousEntries={previousEntries} range={range} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف از تاریخچه؟</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'one'
                ? `تایم «${pending.entry.deviceNames.join('، ')}» (${formatJalaliDate(pending.entry.endedAt)}) برای همیشه حذف می‌شود.`
                : `${toFa(summary.count)} تایم در بازه‌ی انتخاب‌شده برای همیشه حذف می‌شود.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Stat({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-bold" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  )
}

function Details({ entry }: { entry: HistoryEntry }) {
  const now = entry.endedAt
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {entry.segments.map((seg, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span>
            <span dir="ltr" className="inline-block">
              {formatJalaliClock(seg.from)} – {formatJalaliClock(seg.to ?? now)}
            </span>{' '}
            · {seg.typeName} ({formatNumber(seg.price)} در ساعت) ·{' '}
            <span dir="ltr" className="inline-block">
              {toFa(formatDuration(segmentMs(seg, now)))}
            </span>
          </span>
          <span className="shrink-0">{toman(segmentCost(seg, now))}</span>
        </div>
      ))}
      {entry.extraTimes.map((t) => (
        <div key={t.id} className="flex justify-between gap-4">
          <span>
            {t.name}: {formatNumber(t.minutes)} دقیقه × {t.typeName} ({formatNumber(t.price)} در
            ساعت)
          </span>
          <span className="shrink-0">{toman(extraTimeCost(t))}</span>
        </div>
      ))}
      {entry.extraItems.map((i) => (
        <div key={i.id} className="flex justify-between gap-4">
          <span>
            {i.name}
            {i.description ? ` (${i.description})` : ''}: {formatNumber(i.qty)} ×{' '}
            {formatNumber(i.price)}
          </span>
          <span className="shrink-0">{toman(i.price * i.qty)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1.5 font-bold">
        <span>
          زمان {formatNumber(entry.timeCost)} + زمان اضافه {formatNumber(entry.extraTimesCost)} +
          موارد {formatNumber(entry.extraItemsCost)}
        </span>
        <span className="shrink-0">{toman(entry.calculatedTotal ?? entry.total)}</span>
      </div>
      {entry.calculatedTotal !== undefined && (
        <div className="flex justify-between gap-4 font-bold">
          <span>مبلغ نهایی (ویرایش‌شده هنگام اتمام)</span>
          <span className="shrink-0">{toman(entry.total)}</span>
        </div>
      )}
    </div>
  )
}
