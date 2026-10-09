import { CalendarClock, Eye, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/tip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatNumber } from '@/lib/format'
import { summarize } from '@/lib/history'
import { formatJalaliClock, formatJalaliDate } from '@/lib/jalali'
import { NO_CUSTOMER } from '@/lib/stats'
import { historyDebt, type HistoryEntry } from '@/lib/store'

const debtOf = historyDebt

// Money received for the entry, before or after playing alike (`cashPaid` includes the prepay).
const cashOf = (e: HistoryEntry) =>
  e.cashPaid ?? (e.onAccount ? (e.prepayUsed ?? 0) : Math.max(0, e.total - (e.creditUsed ?? 0)))

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
  onToggleDetails,
}: {
  entries: HistoryEntry[]
  onAdd: () => void
  onReserve: () => void
  // Running sessions; when any, the summary is an on-demand view (the toolbar already has add).
  active?: number
  // Visibility of financial/details blocks controlled by the main toolbar button.
  detailsVisible?: boolean
  // Shown (next to «رزرو») only when no session runs; otherwise the toolbar has the same toggle.
  onToggleDetails?: () => void
}) {
  const sum = summarize(entries)
  const debtAdded = entries.reduce((s, e) => s + debtOf(e), 0)
  const cashIn = entries.reduce((s, e) => s + cashOf(e), 0)
  const usedCredit = entries.reduce((s, e) => s + (e.creditUsed ?? 0), 0)
  const start = Math.min(...entries.map((e) => e.startedAt))
  const end = Math.max(...entries.map((e) => e.endedAt))
  const byDevice = new Map<string, { sessions: number; income: number }>()
  for (const e of entries) {
    const key = e.deviceNames.join('، ') || '—'
    const cur = byDevice.get(key) ?? { sessions: 0, income: 0 }
    byDevice.set(key, { sessions: cur.sessions + 1, income: cur.income + e.total })
  }
  const devices = [...byDevice].sort((a, b) => b[1].income - a[1].income)
  // Extra items (بوفه و خدمات) sold in the shift: catalog items by catalog id, free-form ones by name.
  const byItem = new Map<string, { name: string; qty: number; income: number }>()
  for (const e of entries) {
    for (const i of e.extraItems ?? []) {
      const key = i.catalogId ?? `name:${i.name}`
      const cur = byItem.get(key) ?? { name: i.name, qty: 0, income: 0 }
      byItem.set(key, { name: cur.name, qty: cur.qty + i.qty, income: cur.income + i.price * i.qty })
    }
  }
  const items = [...byItem].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.income - a.income)

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
              {onToggleDetails && (
                <Tip label={detailsVisible ? 'پنهان کردن هزینه' : 'نمایش هزینه'}>
                  <Button
                    size="icon-lg"
                    variant="outline"
                    aria-label={detailsVisible ? 'پنهان کردن هزینه' : 'نمایش هزینه'}
                    aria-pressed={!detailsVisible}
                    onClick={onToggleDetails}
                  >
                    {detailsVisible ? <Eye /> : <EyeOff />}
                  </Button>
                </Tip>
              )}
              <Button size="lg" variant="outline" onClick={onReserve}>
                <CalendarClock /> رزرو
              </Button>
              <Button size="lg" data-tour="add-session" onClick={onAdd}>
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
          {items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>درآمد به تفکیک بوفه و خدمات</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center justify-between py-2">
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
            <Stat label="بدهی جدید" value={formatNumber(debtAdded)} unit="تومان" />
            <Stat label="هزینه‌ی زمان" value={formatNumber(sum.timeCost)} unit="تومان" />
            <Stat label="بوفه و زمان اضافه" value={formatNumber(sum.extrasCost)} unit="تومان" />
            <Stat label="دریافتی نقدی" value={formatNumber(cashIn)} unit="تومان" />
            <Stat label="پوشش از اعتبار" value={formatNumber(usedCredit)} unit="تومان" />
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
                    {debtOf(e) > 0 && (
                      <span className="text-xs text-destructive">بدهی {formatNumber(debtOf(e))}</span>
                    )}
                    {!!e.creditUsed && e.creditUsed > 0 && (
                      <span className="text-xs text-green-700">اعتبار {formatNumber(e.creditUsed)}</span>
                    )}
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

          {items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>درآمد به تفکیک بوفه و خدمات</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center justify-between py-2">
                    <span>
                      {i.name} <span className="text-muted-foreground">({formatNumber(i.qty)})</span>
                    </span>
                    <span className="tabular-nums">{formatNumber(i.income)} تومان</span>
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
