import { useState } from 'react'
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDiscardGuard } from '@/components/discard-dialog'
import { Tip } from '@/components/tip'
import { formatNumber, parseNumber } from '@/lib/format'
import { uid, type Device, type DeviceCategory, type RateGroup, type Usage } from '@/lib/store'

type Props = {
  categories: DeviceCategory[]
  devices: Device[]
  rateGroups: RateGroup[]
  usage: Usage
  onChange: (categories: DeviceCategory[], devices: Device[]) => void
}

// Which rate groups a device (or every device of a type) can be billed with; ≥1 stays ticked.
function RateGroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: RateGroup[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string, on: boolean) => {
    if (!on && value.length <= 1) return
    onChange(groups.filter((g) => (g.id === id ? on : value.includes(g.id))).map((g) => g.id))
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => (
        <Label key={g.id} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2">
          <Checkbox
            className="mt-0.5"
            checked={value.includes(g.id)}
            onCheckedChange={(v) => toggle(g.id, v)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{g.name}</span>
            <span className="text-xs text-muted-foreground">
              {g.prices.map((p) => `${p.name} (${formatNumber(p.price)})`).join('، ')}
            </span>
          </span>
        </Label>
      ))}
    </div>
  )
}

const rateNames = (device: Device, groups: RateGroup[]) =>
  device.rateIds
    .map((id) => groups.find((g) => g.id === id)?.name)
    .filter(Boolean)
    .join('، ')

// Next free number after the highest «prefix N» already used.
const nextNumber = (devices: Device[], prefix: string) => {
  const p = prefix.trim()
  const nums = devices.map((d) => {
    if (!d.name.startsWith(`${p} `)) return 0
    const n = Number(d.name.slice(p.length + 1))
    return Number.isInteger(n) ? n : 0
  })
  return Math.max(0, ...nums) + 1
}

// ---- one device: add / edit ---------------------------------------------------

function DeviceFormDialog({
  title,
  description,
  initial,
  placeholder,
  rateGroups,
  onSave,
  onClose,
}: {
  title: string
  description: string
  initial: { name: string; rateIds: string[] }
  placeholder: string
  rateGroups: RateGroup[]
  onSave: (v: { name: string; rateIds: string[] }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [rateIds, setRateIds] = useState(initial.rateIds)

  const valid = name.trim() !== '' && rateIds.length > 0
  const dirty = name !== initial.name || JSON.stringify(rateIds) !== JSON.stringify(initial.rateIds)
  const { requestClose, dialog } = useDiscardGuard(dirty, onClose)

  const submit = () => {
    if (!valid) return
    onSave({ name: name.trim(), rateIds })
    onClose()
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="device-name">نام دستگاه</Label>
              <Input
                id="device-name"
                autoFocus
                placeholder={placeholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>نرخ‌های این دستگاه</Label>
              <RateGroupPicker groups={rateGroups} value={rateIds} onChange={setRateIds} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!valid} onClick={submit}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}

// ---- several devices at once --------------------------------------------------

function AddManyDialog({
  category,
  devices,
  rateGroups,
  onAdd,
  onClose,
}: {
  category: DeviceCategory
  devices: Device[]
  rateGroups: RateGroup[]
  onAdd: (devices: Device[]) => void
  onClose: () => void
}) {
  // Nothing is preselected: the rate groups must be chosen on purpose.
  const defaultPrefix = `${category.name.trim() || 'دستگاه'} شماره`
  const [prefix, setPrefix] = useState(defaultPrefix)
  const [count, setCount] = useState('')
  const [start, setStart] = useState('')
  const [rateIds, setRateIds] = useState<string[]>([])

  const n = Math.min(50, Math.floor(parseNumber(count)))
  const first = start ? Math.floor(parseNumber(start)) : nextNumber(devices, prefix)
  const valid = prefix.trim() !== '' && n >= 1 && first >= 1 && rateIds.length > 0

  const dirty =
    prefix !== defaultPrefix || count !== '' || start !== '' || rateIds.length > 0
  const { requestClose, dialog } = useDiscardGuard(dirty, onClose)

  const submit = () => {
    if (!valid) return
    onAdd(
      Array.from({ length: n }, (_, i) => ({
        id: uid(),
        categoryId: category.id,
        name: `${prefix.trim()} ${first + i}`,
        rateIds,
      })),
    )
    onClose()
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>افزودن چند دستگاه</DialogTitle>
            <DialogDescription>
              چند دستگاه از نوع «{category.name || '—'}» با پیشوند مشترک و شماره‌ی پشت سر هم ساخته
              می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dev-prefix">پیشوند نام</Label>
              <Input id="dev-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-count">تعداد</Label>
                <Input
                  id="dev-count"
                  autoFocus
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="0"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-start">شروع شماره‌گذاری</Label>
                <Input
                  id="dev-start"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder={String(nextNumber(devices, prefix))}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>نرخ‌ها</Label>
              <RateGroupPicker groups={rateGroups} value={rateIds} onChange={setRateIds} />
            </div>
            {valid && (
              <div className="flex flex-col gap-1.5">
                <Label>دستگاه‌هایی که ساخته می‌شوند ({formatNumber(n)})</Label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/30 p-2">
                  {Array.from({ length: n }, (_, i) => `${prefix.trim()} ${first + i}`).map((name) => (
                    <Badge key={name} variant="outline" className="bg-background">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button disabled={!valid} onClick={submit}>
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}

// ---- pricing for every device of a type -------------------------------------------

function TypeRatesDialog({
  category,
  devices,
  rateGroups,
  onSave,
  onClose,
}: {
  category: DeviceCategory
  devices: Device[]
  rateGroups: RateGroup[]
  onSave: (rateIds: string[]) => void
  onClose: () => void
}) {
  // Start from the first device's groups (or the first group when the type is empty).
  const initial = devices[0]?.rateIds ?? rateGroups.slice(0, 1).map((g) => g.id)
  const [rateIds, setRateIds] = useState(initial)
  const dirty = JSON.stringify(rateIds) !== JSON.stringify(initial)
  const { requestClose, dialog } = useDiscardGuard(dirty, onClose)

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>نرخ همه‌ی دستگاه‌های «{category.name || '—'}»</DialogTitle>
            <DialogDescription>
              نرخ‌های انتخاب‌شده برای هر {formatNumber(devices.length)} دستگاه این نوع اعمال می‌شود و
              نرخ قبلی آن‌ها را جایگزین می‌کند.
            </DialogDescription>
          </DialogHeader>
          <RateGroupPicker groups={rateGroups} value={rateIds} onChange={setRateIds} />
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button
              disabled={rateIds.length === 0 || devices.length === 0}
              onClick={() => {
                onSave(rateIds)
                onClose()
              }}
            >
              اعمال برای همه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}

// ---- editor -------------------------------------------------------------------

type DialogState =
  | { kind: 'one'; category: DeviceCategory }
  | { kind: 'many'; category: DeviceCategory }
  | { kind: 'edit'; device: Device }
  | { kind: 'rates'; category: DeviceCategory }
  | null

type PendingDelete =
  | { kind: 'category'; id: string; name: string }
  | { kind: 'device'; id: string; name: string }

export function DevicesEditor({ categories, devices, rateGroups, usage, onChange }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const close = () => setDialog(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'category')
      onChange(categories.filter((x) => x.id !== pendingDelete.id), devices)
    else onChange(categories, devices.filter((x) => x.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const addDevices = (added: Device[]) => onChange(categories, [...devices, ...added])
  const patchDevice = (id: string, patch: Partial<Device>) =>
    onChange(
      categories,
      devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        ابتدا نوع دستگاه (مثلاً پی‌سی یا پلی‌استیشن) را بسازید، سپس دستگاه‌ها را یکی‌یکی یا
        گروهی اضافه کنید. نرخ هر دستگاه را با دکمه‌ی ویرایش یا برای همه‌ی دستگاه‌های یک نوع با دکمه‌ی
        نرخ تغییر دهید.
      </p>

      {categories.map((c) => {
        const list = devices.filter((d) => d.categoryId === c.id)
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="نام نوع دستگاه"
                aria-invalid={!c.name.trim()}
                placeholder="مثلاً پلی‌استیشن"
                className="font-bold"
                value={c.name}
                onChange={(e) =>
                  onChange(
                    categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                    devices,
                  )
                }
              />
              <Tip label={list.length ? 'تغییر نرخ همه‌ی دستگاه‌های این نوع' : 'ابتدا دستگاه اضافه کنید'}>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={list.length === 0}
                    onClick={() => setDialog({ kind: 'rates', category: c })}
                  >
                    <Coins /> نرخ همه
                  </Button>
                </span>
              </Tip>
              <Tip label={list.length ? 'ابتدا دستگاه‌های این نوع را حذف کنید' : 'حذف نوع دستگاه'}>
                <span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف نوع دستگاه"
                    disabled={list.length > 0}
                    onClick={() => setPendingDelete({ kind: 'category', id: c.id, name: c.name })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </Tip>
            </div>

            {list.length === 0 && (
              <p className="text-xs text-muted-foreground">هنوز دستگاهی از این نوع نیست.</p>
            )}
            {list.map((d) => {
              const busy = usage.deviceIds.has(d.id)
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {rateNames(d, rateGroups) || 'بدون نرخ'}
                    </div>
                  </div>
                  <Tip label="ویرایش نام و نرخ">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`ویرایش ${d.name}`}
                      onClick={() => setDialog({ kind: 'edit', device: d })}
                    >
                      <Pencil />
                    </Button>
                  </Tip>
                  <Tip label={busy ? 'این دستگاه در یک تایم فعال است' : 'حذف دستگاه'}>
                    <span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="حذف دستگاه"
                        disabled={busy}
                        onClick={() => setPendingDelete({ kind: 'device', id: d.id, name: d.name })}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </Tip>
                </div>
              )
            })}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!c.name.trim()}
                onClick={() => setDialog({ kind: 'one', category: c })}
              >
                <Plus /> افزودن دستگاه
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!c.name.trim()}
                onClick={() => setDialog({ kind: 'many', category: c })}
              >
                <Plus /> افزودن چند دستگاه
              </Button>
              {!c.name.trim() && (
                <span className="self-center text-xs text-muted-foreground">
                  ابتدا نام نوع دستگاه را وارد کنید.
                </span>
              )}
            </div>
          </div>
        )
      })}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...categories, { id: uid(), name: '' }], devices)}
      >
        <Plus /> افزودن نوع دستگاه
      </Button>

      {dialog?.kind === 'one' && (
        <DeviceFormDialog
          title={`افزودن دستگاه به «${dialog.category.name}»`}
          description="نام دستگاه و نرخ‌های قابل استفاده برای آن را مشخص کنید."
          initial={{ name: '', rateIds: [] }}
          placeholder={`${dialog.category.name} ${nextNumber(
            devices.filter((d) => d.categoryId === dialog.category.id),
            dialog.category.name,
          )}`}
          rateGroups={rateGroups}
          onSave={({ name, rateIds }) =>
            addDevices([{ id: uid(), categoryId: dialog.category.id, name, rateIds }])
          }
          onClose={close}
        />
      )}
      {dialog?.kind === 'many' && (
        <AddManyDialog
          category={dialog.category}
          devices={devices.filter((d) => d.categoryId === dialog.category.id)}
          rateGroups={rateGroups}
          onAdd={addDevices}
          onClose={close}
        />
      )}
      {dialog?.kind === 'edit' && (
        <DeviceFormDialog
          title="ویرایش دستگاه"
          description="نام و نرخ‌های این دستگاه را تغییر دهید."
          initial={{ name: dialog.device.name, rateIds: dialog.device.rateIds }}
          placeholder={dialog.device.name}
          rateGroups={rateGroups}
          onSave={({ name, rateIds }) => patchDevice(dialog.device.id, { name, rateIds })}
          onClose={close}
        />
      )}
      {dialog?.kind === 'rates' && (
        <TypeRatesDialog
          category={dialog.category}
          devices={devices.filter((d) => d.categoryId === dialog.category.id)}
          rateGroups={rateGroups}
          onSave={(rateIds) =>
            onChange(
              categories,
              devices.map((d) => (d.categoryId === dialog.category.id ? { ...d, rateIds } : d)),
            )
          }
          onClose={close}
        />
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'category' ? 'حذف نوع دستگاه؟' : 'حذف دستگاه؟'}
            </AlertDialogTitle>
            <AlertDialogDescription>«{pendingDelete?.name}» حذف می‌شود.</AlertDialogDescription>
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
