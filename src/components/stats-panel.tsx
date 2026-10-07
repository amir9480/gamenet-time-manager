import { useMemo, type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatDuration, formatNumber } from '@/lib/format'
import type { Range } from '@/lib/jalali'
import { toFa } from '@/lib/jalali'
import {
  dailySeries,
  hourlySeries,
  itemsSold,
  kpis,
  pctChange,
  rateUsage,
  byCategory,
  byDevice,
  topCustomers,
  weekdaySeries,
} from '@/lib/stats'
import type { HistoryEntry } from '@/lib/store'
import { cn } from '@/lib/utils'

type Props = {
  entries: HistoryEntry[]
  // Entries of the equally long previous range; null when there is no comparison («همه»).
  previousEntries: HistoryEntry[] | null
  range: Range
}

const toman = (n: number) => `${formatNumber(n)} تومان`
const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(n)
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

type Row = [label: string, value: string]
// Union of the fields the chart datasets carry.
type Payload = { name: string; sessions: number; income: number; qty: number }

// Tooltip rows are built by the caller so money keeps English digits and «تومان».
const rowsFormatter =
  (rows: (payload: Payload, name: string, value: number) => Row[]) =>
  (value: unknown, name: unknown, item: { color?: string; payload?: unknown }) => (
    <div className="flex w-full flex-col gap-1">
      {rows(item.payload as Payload, String(name), Number(value)).map(([l, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {i === 0 && (
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: item.color }} />
            )}
            {l}
          </span>
          <span className="font-medium text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )

function Delta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null
  const pct = pctChange(current, previous)
  if (pct === null) return <span className="text-xs text-muted-foreground">بدون داده‌ی دوره‌ی قبل</span>
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
      dir="ltr"
    >
      <Icon className="size-3.5" />
      {toFa(Math.abs(pct).toFixed(0))}٪ {up ? 'بیشتر' : 'کمتر'} از دوره‌ی قبل
    </span>
  )
}

function Kpi({ label, value, extra }: { label: string; value: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
      {extra}
    </div>
  )
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string
  empty?: boolean
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">داده‌ای برای نمایش نیست</p>
        ) : (
          <div dir="ltr">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

export function StatsPanel({ entries, previousEntries, range }: Props) {
  const k = useMemo(() => kpis(entries), [entries])
  const prev = useMemo(() => (previousEntries ? kpis(previousEntries) : null), [previousEntries])
  const daily = useMemo(() => dailySeries(entries, range), [entries, range])
  const hourly = useMemo(() => hourlySeries(entries), [entries])
  const weekdays = useMemo(() => weekdaySeries(entries), [entries])
  const names = useMemo(() => topCustomers(entries), [entries])
  const categories = useMemo(() => byCategory(entries), [entries])
  const devices = useMemo(() => byDevice(entries), [entries])
  const rates = useMemo(() => rateUsage(entries), [entries])
  const items = useMemo(() => itemsSold(entries), [entries])

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        در این بازه داده‌ای برای نمایش نیست.
      </p>
    )
  }

  // Share of the calculated costs (the final income may have been edited).
  const costs = k.timeCost + k.extrasCost
  const timeShare = costs ? Math.round((k.timeCost / costs) * 100) : 0

  const dailyConfig = {
    time: { label: 'زمان بازی', color: 'var(--chart-1)' },
    extras: { label: 'بوفه', color: 'var(--chart-2)' },
  } satisfies ChartConfig
  const hourConfig = { sessions: { label: 'تایم', color: 'var(--chart-1)' } } satisfies ChartConfig
  const weekConfig = { income: { label: 'درآمد', color: 'var(--chart-2)' } } satisfies ChartConfig
  const nameConfig = { income: { label: 'درآمد', color: 'var(--chart-1)' } } satisfies ChartConfig
  const deviceConfig = { income: { label: 'درآمد', color: 'var(--chart-4)' } } satisfies ChartConfig
  const categoryConfig: ChartConfig = Object.fromEntries(
    categories.map((r, i) => [r.name, { label: r.name, color: COLORS[i % COLORS.length] }]),
  )
  const itemConfig = { income: { label: 'درآمد', color: 'var(--chart-3)' } } satisfies ChartConfig
  const rateConfig: ChartConfig = Object.fromEntries(
    rates.map((r, i) => [r.name, { label: r.name, color: COLORS[i % COLORS.length] }]),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Kpi
          label="مجموع درآمد"
          value={toman(k.total)}
          extra={<Delta current={k.total} previous={prev ? prev.total : null} />}
        />
        <Kpi
          label="تعداد تایم"
          value={toFa(formatNumber(k.count))}
          extra={<Delta current={k.count} previous={prev ? prev.count : null} />}
        />
        <Kpi label="میانگین درآمد هر تایم" value={toman(k.avgIncome)} />
        <Kpi
          label="میانگین مدت تایم"
          value={<span dir="ltr">{toFa(formatDuration(k.avgDurationMs))}</span>}
        />
        <Kpi
          label="پردرآمدترین روز"
          value={k.best ? toFa(k.best.key) : '—'}
          extra={k.best && <span className="text-xs text-muted-foreground">{toman(k.best.total)}</span>}
        />
        <Kpi
          label="شلوغ‌ترین ساعت"
          value={k.peak ? `${toFa(String(k.peak.hour).padStart(2, '0'))}:۰۰` : '—'}
          extra={
            k.peak && (
              <span className="text-xs text-muted-foreground">
                {toFa(k.peak.sessions)} تایم شروع‌شده
              </span>
            )
          }
        />
        <div className="col-span-full flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>زمان بازی: {toman(k.timeCost)} ({toFa(timeShare)}٪)</span>
            <span>بوفه: {toman(k.extrasCost)} ({toFa(100 - timeShare)}٪)</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" dir="ltr">
            <div style={{ width: `${timeShare}%`, backgroundColor: 'var(--chart-1)' }} />
            <div style={{ width: `${100 - timeShare}%`, backgroundColor: 'var(--chart-2)' }} />
          </div>
        </div>
      </div>

      <ChartCard title="درآمد روزانه" empty={daily.length === 0}>
        <ChartContainer config={dailyConfig} className="h-64 w-full">
          <BarChart data={daily}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => toFa(String(p?.[0]?.payload?.key ?? ''))}
                  formatter={rowsFormatter((_, name, value) => [
                    [dailyConfig[name as 'time']?.label as string, toman(value)],
                  ])}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="time" stackId="a" fill="var(--color-time)" />
            <Bar dataKey="extras" stackId="a" fill="var(--color-extras)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="تایم‌ها در ساعات شبانه‌روز (بر اساس شروع)">
          <ChartContainer config={hourConfig} className="h-56 w-full">
            <BarChart data={hourly}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => `ساعت ${p?.[0]?.payload?.label ?? ''}`}
                    formatter={rowsFormatter((p) => [
                      ['تعداد تایم', toFa(p.sessions)],
                      ['درآمد', toman(p.income)],
                    ])}
                  />
                }
              />
              <Bar dataKey="sessions" fill="var(--color-sessions)" radius={4} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="درآمد بر اساس روز هفته">
          <ChartContainer config={weekConfig} className="h-56 w-full">
            <BarChart data={weekdays}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={rowsFormatter((p) => [
                      ['درآمد', toman(p.income)],
                      ['تعداد تایم', toFa(p.sessions)],
                    ])}
                  />
                }
              />
              <Bar dataKey="income" fill="var(--color-income)" radius={4} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <ChartCard title="مشتریان برتر" empty={names.length === 0}>
        <ChartContainer
          config={nameConfig}
          className="w-full"
          style={{ height: Math.max(120, names.length * 36 + 24) }}
        >
          <BarChart data={names} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={90} />
            <XAxis type="number" hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={rowsFormatter((p) => [
                    ['درآمد', toman(p.income)],
                    ['تعداد تایم', toFa(p.sessions)],
                  ])}
                />
              }
            />
            <Bar dataKey="income" fill="var(--color-income)" radius={4} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="سهم درآمد هر نوع دستگاه" empty={categories.length === 0}>
          <ChartContainer config={categoryConfig} className="mx-auto h-64 w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={rowsFormatter((p) => [
                      [p.name, toman(p.income)],
                      ['تعداد تایم', toFa(p.sessions)],
                    ])}
                  />
                }
              />
              <Pie data={categories} dataKey="income" nameKey="name" innerRadius={55} strokeWidth={2}>
                {categories.map((r, i) => (
                  <Cell key={r.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="درآمد هر دستگاه" empty={devices.length === 0}>
          <ChartContainer
            config={deviceConfig}
            className="w-full"
            style={{ height: Math.max(120, devices.length * 36 + 24) }}
          >
            <BarChart data={devices} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={90} />
              <XAxis type="number" hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={rowsFormatter((p) => [
                      ['درآمد', toman(p.income)],
                      ['تعداد تایم', toFa(p.sessions)],
                    ])}
                  />
                }
              />
              <Bar dataKey="income" fill="var(--color-income)" radius={4} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="سهم درآمد هر نوع نرخ" empty={rates.length === 0}>
          <ChartContainer config={rateConfig} className="mx-auto h-64 w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={rowsFormatter((p) => [
                      [p.name, toman(p.income)],
                    ])}
                  />
                }
              />
              <Pie data={rates} dataKey="income" nameKey="name" innerRadius={55} strokeWidth={2}>
                {rates.map((r, i) => (
                  <Cell key={r.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="فروش بوفه" empty={items.length === 0}>
          <ChartContainer
            config={itemConfig}
            className="w-full"
            style={{ height: Math.max(120, items.length * 36 + 24) }}
          >
            <BarChart data={items} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80} />
              <XAxis type="number" hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={rowsFormatter((p) => [
                      ['درآمد', toman(p.income)],
                      ['تعداد فروش', toFa(p.qty)],
                    ])}
                  />
                }
              />
              <Bar dataKey="income" fill="var(--color-income)" radius={4} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </div>
  )
}
