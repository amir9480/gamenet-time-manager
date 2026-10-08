import { CalendarClock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatNumber } from '@/lib/format'
import { summarize } from '@/lib/history'
import { formatJalaliClock, formatJalaliDate } from '@/lib/jalali'
import { NO_CUSTOMER } from '@/lib/stats'
import { type HistoryEntry } from '@/lib/store'

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {unit && <span className="ms-1 text-sm text-muted-foreground">{unit}</span>}
      </CardContent>
    </Card>
  )
}

function StatSkeleton() {
  return (
    <Card size="sm">
      <CardHeader>
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-16" />
      </CardContent>
    </Card>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  )
}

// Shown on the main page instead of the welcome page once every session is closed but one ended
// recently: the details of the shift so far. The add button sits at the top so it never ends up
// below the fold.
export function ShiftSummary({
  entries,
  onAdd,
  onReserve,
  active = 0,
  detailsVisible = true,
}: {
  entries: HistoryEntry[]
  onAdd: () => void
  onReserve: () => void
  // Running sessions; when any, the summary is an on-demand view (the toolbar already has add).
  active?: number
  // Visibility of financial/details blocks controlled by the main toolbar button.
  detailsVisible?: boolean
}) {
  const sum = summarize(entries)
  const onAccount = entries.reduce((s, e) => s + (e.onAccount ? e.total : 0), 0)
  const start = Math.min(...entries.map((e) => e.startedAt))
  const end = Math.max(...entries.map((e) => e.endedAt))
  const byDevice = new Map<string, { sessions: number; income: number }>()
  for (const e of entries) {
    const key = e.deviceNames.join('، ') || '—'
    const cur = byDevice.get(key) ?? { sessions: 0, income: 0 }
    byDevice.set(key, { sessions: cur.sessions + 1, income: cur.income + e.total })
  }
  const devices = [...byDevice].sort((a, b) => b[1].income - a[1].income)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">خلاصه‌ی شیفت</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {active > 0
              ? `${formatNumber(active)} تایم در حال اجراست`
              : 'همه‌ی تایم‌ها پایان یافته‌اند'}{' '}
            · از {formatJalaliDate(start)} {formatJalaliClock(start, false)}{' '}
            تا {formatJalaliClock(end, false)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {active === 0 && (
            <div className="flex gap-2">
              <Button size="lg" variant="outline" onClick={onReserve}>
                <CalendarClock /> رزرو
              </Button>
              <Button size="lg" onClick={onAdd}>
                <Plus /> افزودن تایم
              </Button>
            </div>
          )}
        </div>
      </div>

      {!detailsVisible ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <StatSkeleton key={i} />)}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>تایم‌های شیفت</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {Array.from({ length: Math.max(entries.length, 1) }, (_, i) => (
                <RowSkeleton key={i} />
              ))}
            </CardContent>
          </Card>
          {devices.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>درآمد به تفکیک دستگاه</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {devices.map(([name]) => (
                  <div key={name} className="flex items-center justify-between py-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="درآمد شیفت" value={formatNumber(sum.total)} unit="تومان" />
            <Stat label="تعداد تایم" value={formatNumber(sum.count)} />
            <Stat label="مدت کل" value={formatDuration(sum.durationMs)} />
            <Stat label="نسیه" value={formatNumber(onAccount)} unit="تومان" />
            <Stat label="هزینه‌ی زمان" value={formatNumber(sum.timeCost)} unit="تومان" />
            <Stat label="بوفه و زمان اضافه" value={formatNumber(sum.extrasCost)} unit="تومان" />
            <Stat label="دریافتی نقدی" value={formatNumber(sum.total - onAccount)} unit="تومان" />
            <Stat
              label="میانگین هر تایم"
              value={formatNumber(sum.count ? Math.round(sum.total / sum.count) : 0)}
              unit="تومان"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>تایم‌های شیفت</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y text-sm">
              {entries.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {e.deviceNames.join('، ') || '—'}
                      <span className="ms-2 text-muted-foreground">
                        {e.customerName ?? NO_CUSTOMER}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatJalaliClock(e.startedAt, false)} تا {formatJalaliClock(e.endedAt, false)}{' '}
                      · {formatDuration(e.durationMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.onAccount && <span className="text-xs text-destructive">نسیه</span>}
                    <span className="tabular-nums">{formatNumber(e.total)} تومان</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {devices.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>درآمد به تفکیک دستگاه</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {devices.map(([name, d]) => (
                  <div key={name} className="flex items-center justify-between py-2">
                    <span>
                      {name} <span className="text-muted-foreground">({formatNumber(d.sessions)})</span>
                    </span>
                    <span className="tabular-nums">{formatNumber(d.income)} تومان</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
