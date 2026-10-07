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
import { formatClock, formatDuration, formatNumber } from '@/lib/format'
import {
  extraItemsCost,
  extraTimeCost,
  extraTimesCost,
  segmentCost,
  segmentMs,
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
  onConfirm?: () => void
}

const toman = (n: number) => `${formatNumber(n)} تومان`

export function SessionSummaryDialog({
  open,
  onOpenChange,
  deviceName,
  session,
  now,
  readOnly = false,
  onConfirm,
}: Props) {
  const { segments, extraTimes, extraItems } = session
  const start = segments[0]?.from
  const end = segments.length ? (segments[segments.length - 1].to ?? now) : undefined
  const timeTotal = segments.reduce((sum, seg) => sum + segmentCost(seg, now), 0)
  const timesCost = extraTimesCost(session)
  const itemsCost = extraItemsCost(session)
  const total = timeTotal + timesCost + itemsCost

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {readOnly ? `جزئیات هزینه ${deviceName}` : `اتمام نشست ${deviceName}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {readOnly
              ? 'هزینه‌ها به‌صورت زنده محاسبه می‌شوند.'
              : 'با تایید، نشست پایان می‌یابد و زمان و هزینه‌ها صفر می‌شوند.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <span>شروع: <b dir="ltr">{start ? formatClock(start) : '—'}</b></span>
            <span>{readOnly ? 'اکنون' : 'پایان'}: <b dir="ltr">{end ? formatClock(end) : '—'}</b></span>
          </div>

          <table className="w-full table-fixed text-start">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[16%]" />
              <col className="w-[28%]" />
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
                    <div>{seg.typeName}</div>
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

          <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
            <span>مجموع</span>
            <span>{toman(total)}</span>
          </div>
        </div>

        <AlertDialogFooter>
          {readOnly ? (
            <AlertDialogCancel>بستن</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>تایید و اتمام نشست</AlertDialogAction>
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
