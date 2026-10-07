import { useEffect, useState } from 'react'
import { Coins, NotebookPen, Wallet } from 'lucide-react'
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
import { useTheme } from '@/components/theme-provider'
import { Tip } from '@/components/tip'
import { formatClock, formatDuration, formatNumber, parseNumber } from '@/lib/format'
import {
  ROUND_MODE_LABELS,
  extraItemsCost,
  extraTimeCost,
  extraTimesCost,
  segmentCost,
  roundAmount,
  segmentMs,
  type Customer,
  type Session,
} from '@/lib/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceName: string
  session: Session
  now: number
  // Read-only live view: no confirm button, title/labels reflect an ongoing session.
  readOnly?: boolean
  // The session's customer; only a customer can be put on account (نسیه).
  customer?: Customer
  // Receives the final amount only when it was edited, and whether it goes on the customer's account.
  onConfirm?: (finalTotal?: number, onAccount?: boolean) => void
}

const toman = (n: number) => `${formatNumber(n)} تومان`

export function SessionSummaryDialog({
  open,
  onOpenChange,
  deviceName,
  session,
  now,
  readOnly = false,
  customer,
  onConfirm,
}: Props) {
  const { segments, extraTimes, extraItems } = session
  const { rounding } = useTheme()
  const start = segments[0]?.from
  const end = segments.length ? (segments[segments.length - 1].to ?? now) : undefined
  const timeTotal = segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const timesCost = extraTimesCost(session)
  const itemsCost = extraItemsCost(session)
  const total = timeTotal + timesCost + itemsCost

  // The final amount is editable when ending; it is what gets stored as the income.
  const [finalText, setFinalText] = useState('')
  const [onAccount, setOnAccount] = useState(false)
  useEffect(() => {
    if (open) {
      setFinalText(String(total))
      setOnAccount(false)
    }
    // Reset only when (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const finalAmount = parseNumber(finalText)
  const edited = finalAmount !== total

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {readOnly ? `جزئیات هزینه ${deviceName}` : `اتمام تایم ${deviceName}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {readOnly
              ? 'هزینه‌ها به‌صورت زنده محاسبه می‌شوند.'
              : 'با تایید، تایم پایان می‌یابد و زمان و هزینه‌ها صفر می‌شوند.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <span>شروع: <b dir="ltr">{start ? formatClock(start) : '—'}</b></span>
            <span>{readOnly ? 'اکنون' : 'پایان'}: <b dir="ltr">{end ? formatClock(end) : '—'}</b></span>
          </div>

          <table className="w-full table-fixed text-start">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[16%]" />
              <col className="w-[30%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-start font-normal">بازه</th>
                <th className="px-2 py-1.5 text-start font-normal">مدت</th>
                <th className="px-2 py-1.5 text-start font-normal">نوع نرخ</th>
                <th className="px-2 py-1.5 text-start font-normal">هزینه</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={i} className="border-b align-top last:border-0">
                  <td className="px-2 py-2 text-start">
                    <span dir="ltr" className="inline-block whitespace-nowrap">
                      {formatClock(seg.from)} – {formatClock(seg.to ?? now)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-start">
                    <span dir="ltr" className="inline-block whitespace-nowrap">
                      {formatDuration(segmentMs(seg, now))}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-start">
                    <div>{seg.deviceName ? `${seg.deviceName} · ${seg.typeName}` : seg.typeName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(seg.price)} در ساعت
                    </div>
                  </td>
                  <td className="px-2 py-2 text-start whitespace-nowrap">
                    {toman(segmentCost(seg, now))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-1.5 border-t pt-2">
            <Row label="جمع هزینه زمان" value={toman(timeTotal)} />
            {extraTimes.map((t) => (
              <Row
                key={t.id}
                label={`${t.name}: ${formatNumber(t.minutes)} دقیقه × ${t.typeName} (${formatNumber(t.price)} در ساعت)`}
                value={toman(extraTimeCost(t))}
              />
            ))}
            {extraItems.map((i) => (
              <Row
                key={i.id}
                label={`${i.name}${i.description ? ` (${i.description})` : ''}: ${formatNumber(i.qty)} × ${formatNumber(i.price)}`}
                value={toman(i.price * i.qty)}
              />
            ))}
          </div>

          {readOnly ? (
            <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
              <span>مجموع</span>
              <span>{toman(total)}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 border-t pt-2">
              <div className="flex items-center justify-between gap-4 text-base font-bold">
                <label htmlFor="final-total">مبلغ نهایی</label>
                <div className="flex items-center gap-2">
                  <Tip label={`رند کردن (${ROUND_MODE_LABELS[rounding.mode]} ${formatNumber(rounding.step)} تومان)`}>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="رند کردن"
                      onClick={() => setFinalText(String(roundAmount(finalAmount, rounding)))}
                    >
                      <Coins />
                    </Button>
                  </Tip>
                  <Input
                    id="final-total"
                    dir="ltr"
                    inputMode="numeric"
                    className="w-40 font-bold"
                    value={finalAmount > 0 ? formatNumber(finalAmount) : finalText}
                    onChange={(e) => setFinalText(e.target.value)}
                  />
                  <span className="text-sm font-normal text-muted-foreground">تومان</span>
                </div>
              </div>
              {edited && (
                <span className="text-xs text-muted-foreground">
                  مجموع محاسبه‌شده: {toman(total)}
                </span>
              )}

              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-sm font-normal">نحوه‌ی پرداخت</span>
                <div className="flex gap-1.5" role="group" aria-label="نحوه‌ی پرداخت">
                  <Button
                    size="sm"
                    variant={onAccount ? 'outline' : 'default'}
                    aria-pressed={!onAccount}
                    onClick={() => setOnAccount(false)}
                  >
                    <Wallet /> پرداخت شد
                  </Button>
                  <Tip label={customer ? undefined : 'برای نسیه، ابتدا برای تایم مشتری انتخاب کنید'}>
                    <span>
                      <Button
                        size="sm"
                        variant={onAccount ? 'destructive' : 'outline'}
                        aria-pressed={onAccount}
                        disabled={!customer}
                        onClick={() => setOnAccount(true)}
                      >
                        <NotebookPen /> نسیه
                      </Button>
                    </span>
                  </Tip>
                </div>
              </div>
              {onAccount && customer && (
                <span className="text-xs text-destructive">
                  {toman(finalAmount)} به بدهی «{customer.name}» اضافه می‌شود.
                </span>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          {readOnly ? (
            <AlertDialogCancel>بستن</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onConfirm?.(edited ? finalAmount : undefined, onAccount && !!customer)}
              >
                تایید و اتمام تایم
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  )
}
