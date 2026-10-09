import { useEffect, useRef, useState } from 'react'
import type { DriveStep } from 'driver.js'
import { ArrowLeft, ArrowRight, Minus, Plus } from 'lucide-react'
import { RadioCard } from '@/components/add-session-dialog'
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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { RadioGroup } from '@/components/ui/radio-group'
import { SaveExtraItemDialog } from '@/components/save-extra-item-dialog'
import { Tip } from '@/components/tip'
import { TourHelpButton } from '@/components/tour-help-button'
import { useDiscardGuard } from '@/components/discard-dialog'
import { formatNumber, parseNumber } from '@/lib/format'
import { toFa } from '@/lib/jalali'
import { rank, type Field } from '@/lib/search'
import {
  isTourActive,
  markTourSeen,
  registerTour,
  startTour,
  tourEl,
  tourSeen,
  tourSel,
  tourSkipped,
  type TourDef,
} from '@/lib/tour'
import { OTHER_ITEM_NAME, type CatalogItem, type ExtraItem, type Settings } from '@/lib/store'

type StepKey = 'category' | 'product' | 'count'
const ORDER: StepKey[] = ['category', 'product', 'count']
const TITLES: Record<StepKey, string> = {
  category: 'دسته‌بندی بوفه',
  product: 'محصول',
  count: 'تعداد',
}

// What has been chosen so far; `custom` stands for the free «سایر هزینه‌ها» item.
type Choice = { categoryId: string; itemId: string; custom: boolean }
const OTHER_VALUE = '__other__'

type SearchItem = {
  key: string
  label: string
  sub: string
  choice: Choice
  fields: Field[]
}

type Props = {
  settings: Settings
  onAdd: (item: Omit<ExtraItem, 'id'>) => void
  // Small icon-only trigger for the compact session card.
  compact?: boolean
}

// The mounted picker hands the guide a lever, so it can send the dialog back to its first step.
const pickerCtl: {
  toStart?: () => void
  hasItems?: () => boolean
} = {}

// Guide of this dialog (opens by itself the first time, or F1 while it is open). The steps point at
// the `data-tour` attributes below, so keep the two in sync when the markup changes. The user picks
// the product (or «سایر هزینه‌ها») themselves; the guide then explains the matching count step.
export const extraPickerTour: TourDef = {
  id: 'extra-picker',
  present: tourSel('extra-search'),
  priority: 20,
  steps: (ctx): DriveStep[] => {
    const hasItems = !!pickerCtl.hasItems?.()
    const search: DriveStep = {
      element: tourSel('extra-search'),
      waitForElement: 2000,
      disableActiveInteraction: true,
      popover: {
        title: 'جستجوی سریع',
        description:
          'نام محصول یا دسته‌بندی را بنویسید تا همان را مستقیم انتخاب کنید و به مرحله‌ی تعداد بروید. «سایر هزینه‌ها» هم در نتیجه‌ها هست.',
        side: 'bottom',
      },
    }
    const other: DriveStep = {
      element: tourSel('extra-fields-other'),
      waitForElement: 1500,
      disableActiveInteraction: true,
      data: { keepAlive: true },
      popover: {
        title: 'قیمت، توضیحات و تعداد',
        description:
          'برای «سایر هزینه‌ها» قیمت واحد را بنویسید، در صورت نیاز توضیح بدهید (مثلاً بابت چه چیزی) و تعداد را مشخص کنید. جمع همان لحظه حساب می‌شود.',
        side: 'top',
        onPrevClick: (_el, _step, { driver: d }) => {
          pickerCtl.toStart?.()
          if (hasItems) d.moveTo(1)
          else d.movePrevious()
        },
      },
    }
    if (!hasItems) return [search, other]
    return [
      search,
      {
        element: tourSel('extra-choices'),
        waitForElement: 1500,
        skipMissingElement: true,
        data: { keepAlive: true },
        // The list stays clickable: the guide continues by itself once something is picked.
        onHighlighted: (_el, _step, { driver: d }) => {
          ctx.watch(() => {
            if (tourEl(tourSel('extra-fields-item'))) {
              ctx.stopWatch()
              d.moveTo(2)
            } else if (tourEl(tourSel('extra-fields-other'))) {
              ctx.stopWatch()
              d.moveTo(3)
            } else if (!d.getActiveElement()?.isConnected) {
              // Picking a category swaps the list for the product list: highlight the new one.
              ctx.stopWatch()
              d.moveTo(1)
            }
          }, 300)
        },
        popover: {
          title: 'انتخاب محصول',
          description:
            'یکی از محصولات بوفه را انتخاب کنید (اگر چند دسته دارید، اول دسته و بعد محصول؛ قیمت‌ها از تنظیمات > بوفه می‌آیند). اگر چیزی در فهرست نیست، «سایر هزینه‌ها» را بزنید: می‌تواند یک محصول جدید باشد که هنوز ثبت نکرده‌اید، یا هزینه‌ای با توضیح متنی که دیگر تکرار نمی‌شود. با انتخاب شما، راهنما ادامه پیدا می‌کند.',
          side: 'top',
          showButtons: ['previous', 'close'],
          onPrevClick: (_el, _step, { driver: d }) => {
            ctx.stopWatch()
            d.movePrevious()
          },
        },
      },
      {
        element: tourSel('extra-fields-item'),
        waitForElement: 1500,
        skipMissingElement: true,
        disableActiveInteraction: true,
        data: { keepAlive: true },
        popover: {
          title: 'تعداد',
          description:
            'برای محصول بوفه فقط تعداد را مشخص می‌کنید؛ قیمت از فهرست می‌آید و جمع همان لحظه حساب می‌شود.',
          side: 'top',
          nextBtnText: 'پایان',
          onNextClick: (_el, _step, { driver: d }) => d.destroy(),
          onPrevClick: (_el, _step, { driver: d }) => {
            pickerCtl.toStart?.()
            d.moveTo(1)
          },
        },
      },
      other,
    ]
  },
}

// Shown when a «سایر هزینه‌ها» line is being added: keep it as a reusable product or as a text-only cost.
export const extraOfferTour: TourDef = {
  id: 'extra-offer',
  present: tourSel('offer-new'),
  priority: 30,
  steps: (): DriveStep[] => [
    {
      element: tourSel('offer-new'),
      waitForElement: 1500,
      disableActiveInteraction: true,
      popover: {
        title: 'محصول جدید بوفه',
        description:
          'این هزینه به فهرست بوفه اضافه می‌شود تا دفعه‌ی بعد مستقیم انتخابش کنید. پس از آن نام، دسته‌بندی و قیمت را تأیید می‌کنید.',
        side: 'top',
      },
    },
    {
      element: tourSel('offer-other'),
      disableActiveInteraction: true,
      popover: {
        title: 'فقط به عنوان توضیح متنی',
        description:
          'هزینه فقط برای همین تایم و با همان توضیحی که نوشتید ثبت می‌شود و در فهرست بوفه نمی‌ماند؛ مناسب هزینه‌ای که دیگر تکرار نمی‌شود.',
        side: 'top',
      },
    },
  ],
}

registerTour(extraPickerTour)
registerTour(extraOfferTour)

// Starts a once-only guide shortly after its dialog appeared (unless guides were skipped).
const offerTour = (def: TourDef, flag: string) => {
  if (tourSkipped() || tourSeen(flag) || isTourActive()) return
  markTourSeen(flag)
  startTour(def, () => {})
}

function QtyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Math.max(1, Math.floor(parseNumber(value)) || 1)
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="کم کردن"
        disabled={n <= 1}
        onClick={() => onChange(String(n - 1))}
      >
        <Minus />
      </Button>
      <Input
        className="w-16 text-center"
        inputMode="numeric"
        aria-label="تعداد"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button variant="outline" size="icon-sm" aria-label="زیاد کردن" onClick={() => onChange(String(n + 1))}>
        <Plus />
      </Button>
    </div>
  )
}

export function ExtraItemPicker({ settings, onAdd, compact }: Props) {
  const catalog = settings.extraItems
  const itemsIn = (categoryId: string) => catalog.filter((c) => c.categoryId === categoryId)
  // Only categories that actually hold items can be picked.
  const categories = settings.extraCategories.filter((c) => itemsIn(c.id).length > 0)
  const noCatalog = catalog.length === 0

  const stepsFor = (p: Choice): StepKey[] => {
    if (noCatalog) return ['count']
    return ORDER.filter(
      (k) =>
        k === 'count' ||
        (k === 'category' && categories.length > 1) ||
        (k === 'product' && !p.custom && (!p.categoryId || itemsIn(p.categoryId).length > 1)),
    )
  }
  // Only choices with a single option are filled in (their step is skipped).
  const resolve = (p: Choice): Choice => {
    let { categoryId, itemId } = p
    if (!categoryId && categories.length === 1) categoryId = categories[0].id
    if (categoryId && !itemId && !p.custom && itemsIn(categoryId).length === 1) {
      itemId = itemsIn(categoryId)[0].id
    }
    return { ...p, categoryId, itemId }
  }
  const EMPTY: Choice = { categoryId: '', itemId: '', custom: noCatalog }
  const after = (steps: StepKey[], from: StepKey) =>
    steps.find((k) => ORDER.indexOf(k) > ORDER.indexOf(from)) ?? 'count'
  const before = (steps: StepKey[], from: StepKey) =>
    [...steps].reverse().find((k) => ORDER.indexOf(k) < ORDER.indexOf(from))

  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>(() => resolve(EMPTY))
  const [initial, setInitial] = useState(choice)
  const [step, setStep] = useState<StepKey>(() => stepsFor(choice)[0])
  const [qty, setQty] = useState('1')
  const [otherPrice, setOtherPrice] = useState('')
  const [otherNote, setOtherNote] = useState('')
  const [query, setQuery] = useState('')
  // A custom item is added only after the user decided whether to keep it in the catalog.
  const [offer, setOffer] = useState<{
    name: string
    price: number
    qty: number
    keepOpen: boolean
  } | null>(null)
  const offerSaved = useRef(false)
  const [offerAsk, setOfferAsk] = useState(false)
  const [offerSave, setOfferSave] = useState(false)

  const restart = () => {
    const c = resolve(EMPTY)
    setChoice(c)
    setInitial(c)
    setStep(stepsFor(c)[0])
    setQty('1')
    setOtherPrice('')
    setOtherNote('')
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    restart()
    const t = window.setTimeout(() => offerTour(extraPickerTour, 'extra-picker-seen'), 400)
    return () => window.clearTimeout(t)
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Offered right after the user confirmed a «سایر هزینه‌ها» line.
  useEffect(() => {
    if (!offerAsk) return
    const t = window.setTimeout(() => offerTour(extraOfferTour, 'extra-offer-seen'), 400)
    return () => window.clearTimeout(t)
  }, [offerAsk])

  pickerCtl.hasItems = () => !noCatalog
  pickerCtl.toStart = () => {
    const c = resolve(EMPTY)
    setChoice(c)
    setStep(stepsFor(c)[0])
  }

  const item = catalog.find((c) => c.id === choice.itemId)
  const steps = stepsFor(choice)
  const prevStep = before(steps, step)
  const last = step === 'count'
  const count = Math.max(0, Math.floor(parseNumber(qty)))
  const otherUnit = parseNumber(otherPrice)
  const unitPrice = choice.custom ? otherUnit : (item?.price ?? 0)
  const total = unitPrice * count

  const dirty =
    JSON.stringify(choice) !== JSON.stringify(initial) ||
    qty !== '1' ||
    otherPrice !== '' ||
    otherNote !== ''
  const { requestClose, dialog } = useDiscardGuard(dirty, () => setOpen(false))

  const stepValid =
    step === 'category'
      ? !!choice.categoryId || choice.custom
      : step === 'product'
        ? choice.custom || !!item
        : count > 0 && (choice.custom ? otherUnit > 0 : !!item)

  // Choosing a card moves on to the next step that still needs input.
  const choose = (c: Choice, from: StepKey) => {
    setChoice(c)
    setStep(after(stepsFor(c), from))
  }
  const pickCategory = (categoryId: string) => resolve({ categoryId, itemId: '', custom: false })

  // Quick search: every catalog item plus the free item.
  const searchItems: SearchItem[] = [
    ...catalog.flatMap((c): SearchItem[] => {
      const cat = settings.extraCategories.find((x) => x.id === c.categoryId)
      return [
        {
          key: c.id,
          label: c.name,
          sub: `${cat?.name ?? ''} · ${formatNumber(c.price)} تومان`,
          choice: { categoryId: c.categoryId, itemId: c.id, custom: false },
          fields: [{ text: c.name, weight: 3 }, { text: cat?.name ?? '', weight: 2 }, String(c.price)],
        },
      ]
    }),
    {
      key: OTHER_VALUE,
      label: OTHER_ITEM_NAME,
      sub: 'با قیمت دلخواه',
      choice: { categoryId: '', itemId: '', custom: true },
      fields: [{ text: OTHER_ITEM_NAME, weight: 3 }, 'قیمت دلخواه'],
    },
  ]
  const quickSelect = (it: SearchItem | null) => {
    setQuery('')
    if (!it) return
    setChoice(it.choice)
    setStep('count')
  }

  const finish = (keepOpen: boolean) => {
    if (keepOpen) restart()
    else setOpen(false)
  }

  const submit = (keepOpen: boolean) => {
    if (!stepValid) return
    if (choice.custom) {
      offerSaved.current = false
      setOffer({ name: otherNote.trim(), price: otherUnit, qty: count, keepOpen })
      setOfferAsk(true)
      return
    }
    if (item) onAdd({ catalogId: item.id, name: item.name, price: item.price, qty: count })
    finish(keepOpen)
  }

  // «خیر»: keep it as a one-off «سایر هزینه‌ها» line.
  const addAsOther = () => {
    if (!offer) return
    onAdd({
      name: OTHER_ITEM_NAME,
      price: offer.price,
      qty: offer.qty,
      ...(offer.name ? { description: offer.name } : {}),
    })
    setOfferAsk(false)
    finish(offer.keepOpen)
  }

  // Saved to the catalog: the session gets that catalog item instead.
  const addAsCatalog = (saved: CatalogItem) => {
    if (!offer) return
    offerSaved.current = true
    onAdd({ catalogId: saved.id, name: saved.name, price: saved.price, qty: offer.qty })
    finish(offer.keepOpen)
  }

  const productRadio = choice.custom ? OTHER_VALUE : choice.itemId

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o, details) => {
          if (o) setOpen(true)
          // The guide's popover lives outside the dialog; clicking it must not close the dialog.
          else if (isTourActive() && details.reason === 'outside-press') return
          else requestClose()
        }}
      >
        <Tip label="خرید از بوفه یا افزودن سایر هزینه‌ها">
          <DialogTrigger
            render={
              compact ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="خرید از بوفه یا افزودن سایر هزینه‌ها"
                  data-tour="card-extra"
                />
              ) : (
                <Button variant="outline" data-tour="card-extra" />
              )
            }
          >
            <Plus /> {!compact && 'افزودن هزینه'}
          </DialogTrigger>
        </Tip>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1">
              خرید از بوفه یا افزودن سایر هزینه‌ها
              <TourHelpButton tour="extra-picker" />
            </DialogTitle>
          </DialogHeader>

          <Combobox
            items={searchItems}
            // Ranked multi-word search instead of the built-in contiguous-substring filter.
            filter={null}
            filteredItems={rank(searchItems, query, (it) => it.fields)}
            value={null}
            onValueChange={(it) => quickSelect(it as SearchItem | null)}
            inputValue={query}
            onInputValueChange={setQuery}
            itemToStringLabel={(it: SearchItem) => `${it.label} ${it.sub}`}
          >
            <ComboboxInput
              placeholder="جستجوی سریع محصول یا دسته‌بندی…"
              aria-label="جستجوی سریع"
              showTrigger={false}
              className="w-full"
              data-tour="extra-search"
            />
            <ComboboxContent>
              <ComboboxEmpty>موردی پیدا نشد</ComboboxEmpty>
              <ComboboxList>
                {(it: SearchItem) => (
                  <ComboboxItem key={it.key} value={it}>
                    <span className="flex flex-1 items-center gap-2">
                      <span>{it.label}</span>
                      <span className="text-xs text-muted-foreground">{it.sub}</span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">{TITLES[step]}</h3>
            {steps.length > 1 && (
              <span className="text-xs text-muted-foreground">
                مرحله‌ی {toFa(Math.max(0, steps.indexOf(step)) + 1)} از {toFa(steps.length)}
              </span>
            )}
          </div>

          {step === 'category' && (
            <RadioGroup
              className="sm:grid-cols-2"
              data-tour="extra-choices"
              value={choice.custom ? OTHER_VALUE : choice.categoryId}
              onValueChange={(v) =>
                v === OTHER_VALUE
                  ? choose({ categoryId: '', itemId: '', custom: true }, 'category')
                  : choose(pickCategory(v as string), 'category')
              }
            >
              {categories.map((c) => (
                <RadioCard key={c.id} value={c.id} checked={!choice.custom && choice.categoryId === c.id}>
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{toFa(itemsIn(c.id).length)} مورد</span>
                  </span>
                </RadioCard>
              ))}
              <RadioCard value={OTHER_VALUE} checked={choice.custom} tour="extra-other">
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span className="font-medium">{OTHER_ITEM_NAME}</span>
                  <span className="text-xs text-muted-foreground">قیمت دلخواه</span>
                </span>
              </RadioCard>
            </RadioGroup>
          )}

          {step === 'product' && (
            <RadioGroup
              className="sm:grid-cols-2"
              data-tour="extra-choices"
              value={productRadio}
              onValueChange={(v) =>
                v === OTHER_VALUE
                  ? choose({ ...choice, itemId: '', custom: true }, 'product')
                  : choose({ ...choice, itemId: v as string, custom: false }, 'product')
              }
            >
              {itemsIn(choice.categoryId).map((c) => (
                <RadioCard key={c.id} value={c.id} checked={choice.itemId === c.id}>
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{formatNumber(c.price)} تومان</span>
                  </span>
                </RadioCard>
              ))}
              <RadioCard value={OTHER_VALUE} checked={choice.custom} tour="extra-other">
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span className="font-medium">{OTHER_ITEM_NAME}</span>
                  <span className="text-xs text-muted-foreground">قیمت دلخواه</span>
                </span>
              </RadioCard>
            </RadioGroup>
          )}

          {step === 'count' && (
            <div
              className="flex flex-col gap-3"
              data-tour={choice.custom ? 'extra-fields-other' : 'extra-fields-item'}
            >
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-2.5 text-sm">
                <span>
                  <b>{choice.custom ? OTHER_ITEM_NAME : item?.name}</b>
                  {!choice.custom && item && ` · ${formatNumber(item.price)} تومان`}
                </span>
              </div>

              {choice.custom && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="other-price" className="text-xs text-muted-foreground">
                      قیمت واحد
                    </Label>
                    <div className="flex items-center gap-2">
                      <MoneyInput
                        id="other-price"
                        placeholder="0"
                        value={otherPrice ? formatNumber(otherUnit) : ''}
                        onChange={(e) => setOtherPrice(e.target.value)}
                      />
                      <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="other-note" className="text-xs text-muted-foreground">
                      توضیحات (اختیاری)
                    </Label>
                    <Input
                      id="other-note"
                      placeholder="مثلاً بابت چه چیزی؟"
                      value={otherNote}
                      onChange={(e) => setOtherNote(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between gap-3">
                <Label>تعداد</Label>
                <QtyField value={qty} onChange={setQty} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <span className="text-muted-foreground">جمع</span>
                <span>
                  <b>{formatNumber(total)}</b> تومان
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            {prevStep && (
              <Button variant="outline" onClick={() => setStep(prevStep)}>
                <ArrowRight /> قبلی
              </Button>
            )}
            {last ? (
              <>
                <Button variant="outline" disabled={!stepValid} onClick={() => submit(true)}>
                  افزودن و ادامه
                </Button>
                <Button disabled={!stepValid} onClick={() => submit(false)}>
                  افزودن
                </Button>
              </>
            ) : (
              <Button disabled={!stepValid} onClick={() => setStep(after(steps, step))}>
                بعدی <ArrowLeft />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}

      <AlertDialog open={offerAsk} onOpenChange={setOfferAsk}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-1">
              این مورد به بوفه اضافه شود؟
              <TourHelpButton tour="extra-offer" />
            </AlertDialogTitle>
            <AlertDialogDescription>
              می‌توانید «{offer?.name || OTHER_ITEM_NAME}» را با قیمت {formatNumber(offer?.price ?? 0)} تومان
              در فهرست بوفه ذخیره کنید تا دفعه‌ی بعد مستقیم انتخاب شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel data-tour="offer-other" onClick={addAsOther}>افزودن به عنوان سایر هزینه‌ها</AlertDialogCancel>
            <AlertDialogAction
              data-tour="offer-new"
              onClick={() => {
                setOfferAsk(false)
                setOfferSave(true)
              }}
            >افزودن به عنوان محصول جدید بوفه</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {offer && (
        <SaveExtraItemDialog
          open={offerSave}
          onOpenChange={(o) => {
            setOfferSave(o)
            // Cancelled without saving: back to the question (nothing has been added yet).
            if (!o && !offerSaved.current) setOfferAsk(true)
          }}
          onSaved={addAsCatalog}
          settings={settings}
          initialName={offer.name}
          initialPrice={offer.price}
        />
      )}
    </>
  )
}
