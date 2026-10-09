import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tip } from '@/components/tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { WEEKDAY_NAMES } from '@/lib/jalali'
import {
  ROUND_MODE_LABELS,
  flatPrices,
  overrideLabel,
  roundAmount,
  uid,
  type FlatPrice,
  type PriceOverride,
  type RateGroup,
  type RoundMode,
} from '@/lib/store'

type Props = {
  overrides: PriceOverride[]
  groups: RateGroup[]
  onChange: (overrides: PriceOverride[]) => void
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const clockToMin = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}
const minToClock = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

function TimeInput({ value, onChange, label }: { value: number; onChange: (m: number) => void; label: string }) {
  return (
    <Input
      type="time"
      dir="ltr"
      aria-label={label}
      className="w-28"
      value={minToClock(value)}
      onChange={(e) => e.target.value && onChange(clockToMin(e.target.value))}
    />
  )
}

const ROUND_ITEMS = (Object.keys(ROUND_MODE_LABELS) as RoundMode[]).map((value) => ({
  value,
  label: ROUND_MODE_LABELS[value],
}))

export function PriceOverridesEditor({ overrides, groups, onChange }: Props) {
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [fill, setFill] = useState<Record<string, { percent: string; step: string; mode: RoundMode }>>({})

  const prices = flatPrices(groups)
  const byGroup = groups.map((g) => ({ group: g, prices: prices.filter((p) => p.groupId === g.id) }))

  const patch = (id: string, fn: (o: PriceOverride) => PriceOverride) =>
    onChange(overrides.map((o) => (o.id === id ? fn(o) : o)))

  const addOverride = () => {
    const seed: PriceOverride = {
      id: uid(),
      weekdays: [5],
      startMin: 20 * 60,
      endMin: 2 * 60,
      prices: Object.fromEntries(prices.map((p) => [p.id, p.price])),
    }
    onChange([...overrides, seed])
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...overrides]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(next)
  }

  const applyFill = (o: PriceOverride) => {
    const f = fill[o.id]
    if (!f) return
    const percent = parseNumber(f.percent)
    if (percent <= 0) return
    const step = parseNumber(f.step) || 1000
    const mode = f.mode
    patch(o.id, (x) => ({
      ...x,
      prices: Object.fromEntries(
        prices.map((p) => [p.id, roundAmount(p.price * (percent / 100), { step, mode, auto: false })]),
      ),
    }))
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    onChange(overrides.filter((o) => o.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold">بازه‌های قیمت ویژه</h3>
        <p className="text-sm text-muted-foreground">
          برای روز و بازه‌ی ساعتی مشخص، قیمت‌ها را جای قیمت معمول جایگزین می‌کند (مثلاً برای ساعات
          شلوغی). بازه‌ای که از نیمه‌شب می‌گذرد را با ساعت پایان کوچک‌تر از ساعت شروع مشخص کنید (مثلاً
          ۲۰:۰۰ تا ۰۲:۰۰). اگر چند بازه با هم همپوشانی داشته باشند، بازه‌ی بالاتر در این فهرست اولویت
          دارد.
        </p>
      </div>

      {overrides.map((o, index) => {
        const wraps = o.endMin <= o.startMin
        const f = fill[o.id] ?? { percent: '', step: '1,000', mode: 'ceil' as RoundMode }
        return (
          <div key={o.id} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                <Tip label="انتقال به بالا (اولویت بیشتر)">
                  <span>
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp />
                    </Button>
                  </span>
                </Tip>
                <Tip label="انتقال به پایین (اولویت کمتر)">
                  <span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === overrides.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                </Tip>
              </div>

              <Input
                aria-label="نام بازه"
                placeholder="تخفیف ساعات خلوت"
                aria-invalid={!o.name?.trim()}
                className="min-w-32 flex-1"
                value={o.name ?? ''}
                onChange={(e) => patch(o.id, (x) => ({ ...x, name: e.target.value }))}
              />

              <Tip label={overrides.length <= 0 ? '' : 'حذف بازه'}>
                <span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف بازه"
                    onClick={() => setPendingDelete({ id: o.id, label: o.name?.trim() || overrideLabel(o) })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </Tip>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {WEEKDAY_NAMES.map((name, value) => {
                const checked = o.weekdays.includes(value)
                const onlyOne = checked && o.weekdays.length <= 1
                return (
                  <Tip key={value} label={onlyOne ? 'حداقل یک روز لازم است' : name}>
                    <Label className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        disabled={onlyOne}
                        checked={checked}
                        onCheckedChange={(v) =>
                          patch(o.id, (x) => ({
                            ...x,
                            weekdays:
                              v === true
                                ? [...x.weekdays, value].sort((a, b) => a - b)
                                : x.weekdays.filter((d) => d !== value),
                          }))
                        }
                      />
                      {name}
                    </Label>
                  </Tip>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TimeInput label="شروع" value={o.startMin} onChange={(startMin) => patch(o.id, (x) => ({ ...x, startMin }))} />
              <span className="text-sm text-muted-foreground">تا</span>
              <TimeInput label="پایان" value={o.endMin} onChange={(endMin) => patch(o.id, (x) => ({ ...x, endMin }))} />
              {wraps && <span className="text-xs text-muted-foreground">(تا روز بعد)</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <span className="text-xs text-muted-foreground">پر کردن سریع:</span>
              <Input
                dir="ltr"
                inputMode="numeric"
                aria-label="درصد قیمت نسبت به قیمت پیش‌فرض (۱۰۰٪ = بدون تغییر)"
                placeholder="٪ درصد"
                className="w-20"
                value={f.percent}
                onChange={(e) => setFill((m) => ({ ...m, [o.id]: { ...f, percent: e.target.value } }))}
              />
              <span className="text-xs text-muted-foreground">رند به</span>
              <MoneyInput
                aria-label="مضرب رند کردن"
                className="w-24"
                value={f.step}
                onChange={(e) => setFill((m) => ({ ...m, [o.id]: { ...f, step: e.target.value } }))}
              />
              <Select
                items={ROUND_ITEMS}
                value={f.mode}
                onValueChange={(mode) => setFill((m) => ({ ...m, [o.id]: { ...f, mode: mode as RoundMode } }))}
              >
                <SelectTrigger className="w-28" aria-label="نوع رند کردن">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_ITEMS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={parseNumber(f.percent) <= 0} onClick={() => applyFill(o)}>
                اعمال روی همه‌ی قیمت‌ها
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {byGroup.map(({ group, prices: groupPrices }) =>
                groupPrices.length === 0 ? null : (
                  <div key={group.id} className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">{group.name}</Label>
                    <div className="flex flex-wrap gap-2">
                      {groupPrices.map((p: FlatPrice) => (
                        <div key={p.id} className="flex items-center gap-1.5">
                          <span className="text-sm">{p.name}</span>
                          <MoneyInput
                            aria-label={`قیمت ویژه ${p.name}`}
                            className="w-28"
                            placeholder="0"
                            value={o.prices[p.id] ? formatNumber(o.prices[p.id]) : ''}
                            onChange={(e) =>
                              patch(o.id, (x) => ({
                                ...x,
                                prices: { ...x.prices, [p.id]: parseNumber(e.target.value) },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )
      })}

      <Button variant="outline" size="sm" className="self-start" onClick={addOverride}>
        <Plus /> افزودن بازه قیمت ویژه
      </Button>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف بازه قیمت ویژه؟</AlertDialogTitle>
            <AlertDialogDescription>«{pendingDelete?.label}» حذف می‌شود.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
