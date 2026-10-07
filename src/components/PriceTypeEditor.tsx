import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tip } from '@/components/Tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { uid, type PriceType } from '@/lib/store'

type Props = {
  types: PriceType[]
  defaultId: string
  onChange: (types: PriceType[], defaultId: string) => void
}

export function PriceTypeEditor({ types, defaultId, onChange }: Props) {
  const update = (id: string, patch: Partial<PriceType>) =>
    onChange(
      types.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      defaultId,
    )

  const remove = (id: string) => {
    if (types.length <= 1) return
    const next = types.filter((t) => t.id !== id)
    onChange(next, id === defaultId ? next[0].id : defaultId)
  }

  const add = () => {
    const t: PriceType = { id: uid(), name: `نوع ${types.length + 1}`, price: 0 }
    onChange([...types, t], defaultId)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2 text-xs text-muted-foreground">
        <Tip label="پیش‌فرض">
          <span>پ</span>
        </Tip>
        <span>نام نوع</span>
        <span>نرخ ساعتی (تومان)</span>
        <span />
      </div>
      <RadioGroup value={defaultId} onValueChange={(v) => onChange(types, v as string)}>
        {types.map((t) => (
          <div key={t.id} className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2">
            <RadioGroupItem value={t.id} aria-label={`پیش‌فرض: ${t.name}`} />
            <Input
              aria-label="نام نوع"
              aria-invalid={!t.name.trim()}
              value={t.name}
              onChange={(e) => update(t.id, { name: e.target.value })}
            />
            <Input
              aria-label={`نرخ ساعتی ${t.name}`}
              aria-invalid={!t.price}
              dir="ltr"
              inputMode="numeric"
              placeholder="0"
              value={t.price ? formatNumber(t.price) : ''}
              onChange={(e) => update(t.id, { price: parseNumber(e.target.value) })}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="حذف"
              disabled={types.length <= 1}
              onClick={() => remove(t.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </RadioGroup>
      <Button variant="outline" size="sm" className="self-start" onClick={add}>
        <Plus /> افزودن نوع
      </Button>
    </div>
  )
}
