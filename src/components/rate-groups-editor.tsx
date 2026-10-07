import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tip } from '@/components/tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { uid, type Device, type RateGroup, type Usage } from '@/lib/store'

type Props = {
  groups: RateGroup[]
  devices: Device[]
  usage: Usage
  onChange: (groups: RateGroup[]) => void
}

export function RateGroupsEditor({ groups, devices, usage, onChange }: Props) {
  const patchGroup = (id: string, fn: (g: RateGroup) => RateGroup) =>
    onChange(groups.map((g) => (g.id === id ? fn(g) : g)))

  const addGroup = () => {
    const price = { id: uid(), name: 'نوع ۱', price: 0 }
    onChange([
      ...groups,
      { id: uid(), name: `نرخ ${groups.length + 1}`, prices: [price], defaultPriceId: price.id },
    ])
  }

  const addPrice = (g: RateGroup) =>
    patchGroup(g.id, (x) => ({
      ...x,
      prices: [...x.prices, { id: uid(), name: `نوع ${x.prices.length + 1}`, price: 0 }],
    }))

  const removePrice = (g: RateGroup, id: string) =>
    patchGroup(g.id, (x) => {
      const prices = x.prices.filter((p) => p.id !== id)
      return { ...x, prices, defaultPriceId: x.defaultPriceId === id ? prices[0].id : x.defaultPriceId }
    })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        هر «نرخ» شامل چند قیمت ساعتی است. در بخش دستگاه‌ها مشخص می‌کنید هر دستگاه از کدام نرخ‌ها
        استفاده کند.
      </p>

      {groups.map((g) => {
        const usedByDevices = devices.filter((d) => d.rateIds.includes(g.id))
        const blockReason = usedByDevices.length
          ? `این نرخ برای ${usedByDevices.length} دستگاه انتخاب شده است`
          : ''
        return (
          <div key={g.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="نام نرخ"
                aria-invalid={!g.name.trim()}
                className="font-bold"
                value={g.name}
                onChange={(e) => patchGroup(g.id, (x) => ({ ...x, name: e.target.value }))}
              />
              <Tip label={blockReason || (groups.length <= 1 ? 'حداقل یک نرخ لازم است' : 'حذف نرخ')}>
                <span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف نرخ"
                    disabled={!!blockReason || groups.length <= 1}
                    onClick={() => onChange(groups.filter((x) => x.id !== g.id))}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </Tip>
            </div>

            <div className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2 text-xs text-muted-foreground">
              <Tip label="پیش‌فرض">
                <span>پ</span>
              </Tip>
              <span>نام قیمت</span>
              <span>قیمت ساعتی (تومان)</span>
              <span />
            </div>
            <RadioGroup
              value={g.defaultPriceId}
              onValueChange={(v) => patchGroup(g.id, (x) => ({ ...x, defaultPriceId: v as string }))}
            >
              {g.prices.map((p) => {
                const inUse = usage.priceIds.has(p.id)
                return (
                  <div key={p.id} className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2">
                    <RadioGroupItem value={p.id} aria-label={`پیش‌فرض: ${p.name}`} />
                    <Input
                      aria-label="نام قیمت"
                      aria-invalid={!p.name.trim()}
                      value={p.name}
                      onChange={(e) =>
                        patchGroup(g.id, (x) => ({
                          ...x,
                          prices: x.prices.map((q) => (q.id === p.id ? { ...q, name: e.target.value } : q)),
                        }))
                      }
                    />
                    <Input
                      aria-label={`قیمت ساعتی ${p.name}`}
                      aria-invalid={!p.price}
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="0"
                      value={p.price ? formatNumber(p.price) : ''}
                      onChange={(e) =>
                        patchGroup(g.id, (x) => ({
                          ...x,
                          prices: x.prices.map((q) =>
                            q.id === p.id ? { ...q, price: parseNumber(e.target.value) } : q,
                          ),
                        }))
                      }
                    />
                    <Tip
                      label={
                        inUse
                          ? 'این قیمت در یک تایم فعال استفاده می‌شود'
                          : g.prices.length <= 1
                            ? 'حداقل یک قیمت لازم است'
                            : 'حذف'
                      }
                    >
                      <span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف"
                          disabled={inUse || g.prices.length <= 1}
                          onClick={() => removePrice(g, p.id)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </Tip>
                  </div>
                )
              })}
            </RadioGroup>
            <Button variant="outline" size="sm" className="self-start" onClick={() => addPrice(g)}>
              <Plus /> افزودن قیمت
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm" className="self-start" onClick={addGroup}>
        <Plus /> افزودن نرخ
      </Button>
    </div>
  )
}
