import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
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
import { OnboardingItemDialog } from '@/components/OnboardingItemDialog'
import { useTheme } from '@/components/theme-provider'
import { formatNumber, parseNumber } from '@/lib/format'
import { toFa } from '@/lib/jalali'
import {
  DEFAULT_HOURLY_PRICE,
  DEVICE_SAMPLES,
  EXTRA_SAMPLES,
  defaultChoice,
  settingsFromChoice,
  type ExtraSample,
  type OnboardingChoice,
  type OnboardingItem,
} from '@/lib/samples'
import { uid, type Settings } from '@/lib/store'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  settings: Settings
  // Apply the chosen catalog (also marks onboarding as done).
  onFinish: (next: Settings) => void
}

const MAX_DEVICES = 50
const STEPS = ['انتخاب موارد', 'دستگاه‌ها و نرخ ساعتی', 'قیمت اقلام بوفه'] as const

const cardCls = (on: boolean) => cn('rounded-lg border p-2.5', on && 'border-primary/50 bg-primary/5')

// Numeric input with the «تومان» label outside it.
function Money({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
    </div>
  )
}

export function OnboardingDialog({ open, settings, onFinish }: Props) {
  const { title } = useTheme()
  const [choice, setChoice] = useState<OnboardingChoice>(defaultChoice)
  const [step, setStep] = useState(0)
  const [addFor, setAddFor] = useState<ExtraSample | null>(null)

  const checkedDevices = DEVICE_SAMPLES.filter((d) => choice.devices[d.id].checked)
  const checkedExtras = EXTRA_SAMPLES.filter((e) => choice.extras[e.id])

  const setDevice = (id: string, patch: Partial<OnboardingChoice['devices'][string]>) =>
    setChoice((c) => ({ ...c, devices: { ...c.devices, [id]: { ...c.devices[id], ...patch } } }))
  const setItems = (
    id: string,
    fn: (items: OnboardingChoice['items'][string]) => OnboardingChoice['items'][string],
  ) => setChoice((c) => ({ ...c, items: { ...c.items, [id]: fn(c.items[id]) } }))

  // First problem on the current step (shown in the footer; «بعدی» stays disabled meanwhile).
  const stepError = (): string | null => {
    if (step === 0 && checkedDevices.length === 0) return 'حداقل یک نوع دستگاه را انتخاب کنید.'
    if (step === 1) {
      for (const d of checkedDevices) {
        const c = choice.devices[d.id]
        if (c.count < 1) return `تعداد «${d.name}» را وارد کنید.`
        if (c.prices.length < 1) return `برای «${d.name}» حداقل یک نرخ لازم است.`
        for (const p of c.prices) {
          if (!p.name.trim()) return `نام یکی از نرخ‌های «${d.name}» خالی است.`
          if (p.price <= 0) return `قیمت نرخ «${p.name.trim()}» در «${d.name}» را وارد کنید.`
        }
      }
    }
    if (step === 2) {
      for (const e of checkedExtras) {
        for (const i of choice.items[e.id]) {
          if (!i.name.trim()) return `نام یکی از موارد «${e.name}» خالی است.`
          if (i.price <= 0) return `قیمت «${i.name.trim()}» در «${e.name}» را وارد کنید.`
        }
      }
    }
    return null
  }
  const error = stepError()
  const stepValid = error === null
  const last = step === STEPS.length - 1

  const total = checkedDevices.reduce((sum, d) => sum + choice.devices[d.id].count, 0)

  return (
    <>
      {/* Mandatory: Esc / outside clicks never close it; only finishing the last step does. */}
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg">به {title} خوش آمدید</DialogTitle>
            <DialogDescription>
              مرحله‌ی {toFa(step + 1)} از {toFa(STEPS.length)}: {STEPS[step]}. همه‌چیز بعداً از تنظیمات
              قابل تغییر است.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn('h-1 flex-1 rounded-full bg-muted', i <= step && 'bg-primary')}
              />
            ))}
          </div>

          {step === 0 && (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="font-bold">چه دستگاه‌هایی دارید؟</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEVICE_SAMPLES.map((d) => (
                    <label
                      key={d.id}
                      className={cn(
                        cardCls(choice.devices[d.id].checked),
                        'flex cursor-pointer items-center gap-2',
                      )}
                    >
                      <Checkbox
                        checked={choice.devices[d.id].checked}
                        onCheckedChange={(v) => setDevice(d.id, { checked: v })}
                      />
                      <span className="font-medium">{d.name}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="font-bold">چه چیزهایی می‌فروشید؟</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXTRA_SAMPLES.map((e) => (
                    <label
                      key={e.id}
                      className={cn(cardCls(choice.extras[e.id]), 'flex cursor-pointer items-start gap-2')}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={choice.extras[e.id]}
                        onCheckedChange={(v) =>
                          setChoice((c) => ({ ...c, extras: { ...c.extras, [e.id]: v } }))
                        }
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">{e.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.items.join('، ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}

          {step === 1 && (
            <section className="flex flex-col gap-2">
              {checkedDevices.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  دستگاهی انتخاب نشده است؛ می‌توانید بعداً از تنظیمات دستگاه اضافه کنید.
                </p>
              ) : null}
              {checkedDevices.map((d) => {
                const c = choice.devices[d.id]
                const setPrices = (fn: (p: OnboardingItem[]) => OnboardingItem[]) =>
                  setDevice(d.id, { prices: fn(c.prices) })
                return (
                  <div key={d.id} className={cn(cardCls(false), 'flex flex-col gap-2')}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">{d.name}</span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        تعداد
                        <Input
                          aria-label={`تعداد ${d.name}`}
                          aria-invalid={c.count < 1}
                          dir="ltr"
                          inputMode="numeric"
                          className="w-16 text-center"
                          placeholder="0"
                          value={c.count ? formatNumber(c.count) : ''}
                          onChange={(e) =>
                            setDevice(d.id, {
                              count: Math.min(MAX_DEVICES, Math.floor(parseNumber(e.target.value))),
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">نرخ‌های ساعتی (اولی پیش‌فرض است)</div>
                    {c.prices.map((p) => (
                      <div key={p.id} className="grid grid-cols-[1fr_11rem_2rem] items-center gap-2">
                        <Input
                          aria-label={`نام نرخ ${d.name}`}
                          aria-invalid={!p.name.trim()}
                          placeholder="نام نرخ"
                          value={p.name}
                          onChange={(e) =>
                            setPrices((ps) =>
                              ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                            )
                          }
                        />
                        <Money>
                          <Input
                            aria-label={`قیمت ${p.name || d.name}`}
                            aria-invalid={p.price <= 0}
                            dir="ltr"
                            inputMode="numeric"
                            placeholder="0"
                            value={p.price ? formatNumber(p.price) : ''}
                            onChange={(e) =>
                              setPrices((ps) =>
                                ps.map((x) =>
                                  x.id === p.id ? { ...x, price: parseNumber(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                        </Money>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="حذف نرخ"
                          disabled={c.prices.length <= 1}
                          onClick={() => setPrices((ps) => ps.filter((x) => x.id !== p.id))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        setPrices((ps) => [...ps, { id: uid(), name: '', price: DEFAULT_HOURLY_PRICE }])
                      }
                    >
                      <Plus /> افزودن نرخ
                    </Button>
                  </div>
                )
              })}
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-3">
              {checkedExtras.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  موردی انتخاب نشده است؛ می‌توانید بعداً از تنظیمات (بوفه) مورد اضافه کنید.
                </p>
              )}
              {checkedExtras.map((e) => (
                <div key={e.id} className={cn(cardCls(false), 'flex flex-col gap-2')}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">{e.name}</h3>
                    <Button size="sm" onClick={() => setAddFor(e)}>
                      <Plus /> افزودن مورد
                    </Button>
                  </div>
                  {choice.items[e.id].length === 0 && (
                    <p className="text-xs text-muted-foreground">موردی در این دسته نیست.</p>
                  )}
                  {choice.items[e.id].map((i) => (
                    <div key={i.id} className="grid grid-cols-[1fr_11rem_2rem] items-center gap-2">
                      <span className="truncate">{i.name}</span>
                      <Money>
                        <Input
                          aria-label={`قیمت ${i.name}`}
                          aria-invalid={i.price <= 0}
                          dir="ltr"
                          inputMode="numeric"
                          placeholder="0"
                          value={i.price ? formatNumber(i.price) : ''}
                          onChange={(ev) =>
                            setItems(e.id, (items) =>
                              items.map((x) =>
                                x.id === i.id ? { ...x, price: parseNumber(ev.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </Money>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`حذف ${i.name}`}
                        onClick={() => setItems(e.id, (items) => items.filter((x) => x.id !== i.id))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          <DialogFooter className="items-center sm:justify-between">
            {error ? (
              <span role="alert" className="text-sm text-destructive">
                {error}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {step === 1 && total > 0 ? `${formatNumber(total)} دستگاه ساخته می‌شود` : ''}
              </span>
            )}
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  <ArrowRight /> قبلی
                </Button>
              )}
              {last ? (
                <Button
                  disabled={!stepValid}
                  onClick={() => onFinish(settingsFromChoice(settings, choice))}
                >
                  <Check /> ساخت و شروع
                </Button>
              ) : (
                <Button disabled={!stepValid} onClick={() => setStep(step + 1)}>
                  بعدی <ArrowLeft />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {addFor && (
        <OnboardingItemDialog
          open
          onOpenChange={(o) => !o && setAddFor(null)}
          categoryName={addFor.name}
          onAdd={(name, price) =>
            setItems(addFor.id, (items) => [...items, { id: uid(), name, price }])
          }
        />
      )}
    </>
  )
}
