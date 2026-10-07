import { PriceSelect } from '@/components/price-select'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  defaultPriceFor,
  devicePriceGroups,
  type Device,
  type Settings,
} from '@/lib/store'

export type Pick = { categoryId: string; deviceId: string; priceId: string }

// `free` = devices that may be chosen (not used by another session).
export const pickFor = (
  settings: Settings,
  free: Device[],
  preferredCategoryId: string | undefined,
): Pick => {
  const cats = settings.deviceCategories
  const hasFree = (id: string) => free.some((d) => d.categoryId === id)
  const categoryId =
    cats.find((c) => c.id === preferredCategoryId && hasFree(c.id))?.id ??
    cats.find((c) => hasFree(c.id))?.id ??
    cats.find((c) => c.id === preferredCategoryId)?.id ??
    cats[0]?.id ??
    ''
  const device = free.find((d) => d.categoryId === categoryId)
  return {
    categoryId,
    deviceId: device?.id ?? '',
    priceId: defaultPriceFor(device, settings.rateGroups)?.id ?? '',
  }
}

type Props = {
  settings: Settings
  free: Device[]
  pick: Pick
  onChange: (pick: Pick) => void
  idPrefix?: string
}

// Category → free device → price (prices come from the chosen device's rate groups).
export function DevicePicker({ settings, free, pick, onChange, idPrefix = 'pick' }: Props) {
  const inCategory = free.filter((d) => d.categoryId === pick.categoryId)
  const device = free.find((d) => d.id === pick.deviceId)
  const groups = devicePriceGroups(device, settings.rateGroups)

  const categoryItems = settings.deviceCategories.map((c) => ({
    value: c.id,
    label: `${c.name} (${free.filter((d) => d.categoryId === c.id).length} آزاد)`,
  }))
  const deviceItems = inCategory.map((d) => ({ value: d.id, label: d.name }))

  const selectCategory = (categoryId: string) => {
    const d = free.find((x) => x.categoryId === categoryId)
    onChange({
      categoryId,
      deviceId: d?.id ?? '',
      priceId: defaultPriceFor(d, settings.rateGroups)?.id ?? '',
    })
  }

  const selectDevice = (deviceId: string) => {
    const d = free.find((x) => x.id === deviceId)
    onChange({
      ...pick,
      deviceId,
      priceId: defaultPriceFor(d, settings.rateGroups)?.id ?? '',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-category`}>نوع دستگاه</Label>
        <Select items={categoryItems} value={pick.categoryId} onValueChange={(v) => selectCategory(v as string)}>
          <SelectTrigger id={`${idPrefix}-category`} className="w-full" aria-label="نوع دستگاه">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-device`}>دستگاه</Label>
        {inCategory.length === 0 ? (
          <p className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">
            دستگاه آزادی از این نوع وجود ندارد.
          </p>
        ) : (
          <Select items={deviceItems} value={pick.deviceId} onValueChange={(v) => selectDevice(v as string)}>
            <SelectTrigger id={`${idPrefix}-device`} className="w-full" aria-label="دستگاه">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deviceItems.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {device && (
        <div className="flex flex-col gap-1.5">
          <Label>نرخ (ساعتی)</Label>
          <PriceSelect
            groups={groups}
            value={pick.priceId}
            onChange={(priceId) => onChange({ ...pick, priceId })}
          />
        </div>
      )}
    </div>
  )
}
