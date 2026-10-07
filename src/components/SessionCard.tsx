import { useState } from 'react'
import { Clock, Pause, Pencil, Play, Square } from 'lucide-react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChangeDeviceDialog } from '@/components/ChangeDeviceDialog'
import { CustomerPickerDialog } from '@/components/CustomerPickerDialog'
import { PriceSelect } from '@/components/PriceSelect'
import { ExtraItemPicker } from '@/components/ExtraItemPicker'
import { ExtraItemsManageDialog } from '@/components/ExtraItemsManageDialog'
import { ExtraTimeDialog } from '@/components/ExtraTimeDialog'
import { SessionSummaryDialog } from '@/components/SessionSummaryDialog'
import { Timer } from '@/components/Timer'
import { Tip } from '@/components/Tip'
import { formatNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/jalali'
import { useNow } from '@/lib/useNow'
import {
  addExtraItem,
  addExtraTime,
  changeType,
  computeCost,
  deviceOf,
  devicePriceGroups,
  elapsedMs,
  flatPrices,
  pauseSession,
  resumeSession,
  selectedPrice,
  switchDevice,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  session: Session
  sessions: Session[]
  settings: Settings
  onUpdate: (fn: (s: Session) => Session) => void
  onEnd: () => void
  compact?: boolean
}

const statusLabel = { running: 'در حال بازی', paused: 'متوقف' } as const

const SWITCH_DEVICE = '__switch_device__'

export function SessionCard({ session, sessions, settings, onUpdate, onEnd, compact }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryNow, setSummaryNow] = useState(0)
  const [manageOpen, setManageOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)
  const running = session.status === 'running'

  const now = useNow(running)

  const time = running ? now : Date.now()
  const type = selectedPrice(settings, session)
  const groups = devicePriceGroups(deviceOf(settings, session), settings.rateGroups)
  const customer = settings.customers.find((c) => c.id === session.customerId)
  const total = computeCost(session, time)
  const name = session.deviceName
  const first = session.segments[0]
  const last = session.segments[session.segments.length - 1]
  const rangeTitle = first
    ? `شروع: ${formatJalaliDateTime(first.from)}
${last.to ? `پایان: ${formatJalaliDateTime(last.to)}` : `اکنون: ${formatJalaliDateTime(time)}`}`
    : undefined

  const resume = () => onUpdate((s) => resumeSession(settings, s, Date.now()))
  const pause = () => onUpdate((s) => pauseSession(s, Date.now()))
  const requestType = (id: string) => {
    if (id === SWITCH_DEVICE) setSwitchOpen(true)
    else if (id !== type.id) setPendingTypeId(id)
  }
  const confirmType = () => {
    if (!pendingTypeId) return
    onUpdate((s) => changeType(settings, s, pendingTypeId, Date.now()))
    setPendingTypeId(null)
  }
  const pendingType = flatPrices(settings.rateGroups).find((t) => t.id === pendingTypeId)
  const openSummary = () => {
    setSummaryNow(Date.now())
    setSummaryOpen(true)
  }


  const dialogs = (
    <>

        <AlertDialog
          open={pendingType !== undefined}
          onOpenChange={(o) => !o && setPendingTypeId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تغییر نوع نرخ؟</AlertDialogTitle>
              <AlertDialogDescription>
                نوع نرخ از «{type.name}» ({formatNumber(type.price)} تومان در ساعت) به «
                {pendingType?.name}» ({formatNumber(pendingType?.price ?? 0)} تومان در ساعت) تغییر
                می‌کند.{' '}
                {running
                  ? 'این تغییر از همین لحظه روی ثانیه‌های بعدی اعمال می‌شود؛ زمان گذشته با نرخ قبلی محاسبه می‌ماند.'
                  : 'زمان گذشته با نرخ قبلی محاسبه می‌ماند و نرخ جدید از زمان ادامه‌ی تایم اعمال می‌شود.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={confirmType}>تایید تغییر</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CustomerPickerDialog
          open={customerOpen}
          onOpenChange={setCustomerOpen}
          customers={settings.customers}
          value={session.customerId}
          onSave={(customerId) => onUpdate((x) => ({ ...x, customerId }))}
        />

        <ChangeDeviceDialog
          open={switchOpen}
          onOpenChange={setSwitchOpen}
          session={session}
          settings={settings}
          sessions={sessions}
          onSwitch={(device, category, price) =>
            onUpdate((x) => switchDevice(x, device, category, price, Date.now()))
          }
        />

        <ExtraItemsManageDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          items={session.extraItems}
          times={session.extraTimes}
          onSave={(extraItems, extraTimes) =>
            onUpdate((s) => ({ ...s, extraItems, extraTimes }))
          }
        />

        <SessionSummaryDialog
          readOnly
          open={detailOpen}
          onOpenChange={setDetailOpen}
          deviceName={customer ? `${name} (${customer.name})` : name}
          session={session}
          now={time}
        />

        <SessionSummaryDialog
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          deviceName={customer ? `${name} (${customer.name})` : name}
          session={session}
          now={summaryNow}
          onConfirm={() => {
            setSummaryOpen(false)
            onEnd()
          }}
        />
    </>
  )

  if (compact) {
    return (
      <Card size="sm">
        <CardContent className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Tip label={statusLabel[session.status]}>
                <span
                  className={`size-2.5 shrink-0 rounded-full ${running ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/50'}`}
                />
              </Tip>
              <span className="truncate text-base font-bold">{name}</span>
              {session.categoryName && (
                <Badge variant="outline" className="shrink-0">
                  {session.categoryName}
                </Badge>
              )}
            </div>
            <Tip label={customer ? `مشتری: ${customer.name} (تغییر)` : 'انتخاب مشتری'}>
              <Button
                variant="ghost"
                size="xs"
                className="max-w-28 shrink-0"
                aria-label="تغییر مشتری"
                onClick={() => setCustomerOpen(true)}
              >
                <Pencil />
                <span className="truncate">{customer ? customer.name : 'مشتری'}</span>
              </Button>
            </Tip>
          </div>

          <Tip label={rangeTitle}>
            <div>
              <Timer ms={elapsedMs(session, time)} compact />
            </div>
          </Tip>

          <Tip label="مشاهده جزئیات هزینه">
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="flex items-baseline justify-center gap-1.5 rounded-md py-0.5 hover:bg-muted"
            >
              <span className="text-2xl font-bold" dir="ltr">
                {formatNumber(total)}
              </span>
              <span className="text-xs text-muted-foreground">تومان</span>
            </button>
          </Tip>

          <PriceSelect
            groups={groups}
            value={type.id}
            onChange={requestType}
            extraItems={[{ value: SWITCH_DEVICE, label: 'تغییر دستگاه…' }]}
            extra={<SelectItem value={SWITCH_DEVICE}>تغییر دستگاه…</SelectItem>}
            trigger={
              <Tip label="تغییر نرخ یا دستگاه">
                <SelectTrigger size="sm" className="w-full text-xs" aria-label="نرخ">
                  <SelectValue />
                </SelectTrigger>
              </Tip>
            }
          />

          <div className="flex items-center gap-1.5">
            {running ? (
              <Tip label="توقف موقت تایم">
                <Button size="sm" className="flex-1" onClick={pause}>
                  <Pause /> توقف
                </Button>
              </Tip>
            ) : (
              <>
                <Tip label="ادامه‌ی تایم">
                  <Button size="sm" className="flex-1" onClick={resume}>
                    <Play /> ادامه
                  </Button>
                </Tip>
                <Tip label="پایان تایم و مشاهده صورت‌حساب">
                  <Button size="sm" variant="destructive" className="flex-1" onClick={openSummary}>
                    <Square /> اتمام
                  </Button>
                </Tip>
              </>
            )}
            <ExtraTimeDialog
              compact
              groups={groups}
              currentTypeId={type.id}
              onAdd={(t) => onUpdate((s) => addExtraTime(s, t))}
            />
            <ExtraItemPicker
              compact
              categories={settings.extraCategories}
              catalog={settings.extraItems}
              onAdd={(item) => onUpdate((s) => addExtraItem(s, item))}
            />
          </div>

          {(session.extraTimes.length > 0 || session.extraItems.length > 0) && (
            <Tip label="مشاهده و تغییر زمان‌ها و اقلام اضافه">
              <Badge
                variant="secondary"
                className="h-auto cursor-pointer self-center py-0.5 hover:bg-secondary/70"
                render={<button type="button" onClick={() => setManageOpen(true)} />}
              >
                {session.extraTimes.length > 0 && (
                  <>
                    <Clock /> {formatNumber(session.extraTimes.length)}
                  </>
                )}
                {session.extraItems.length > 0 && (
                  <>بوفه: {formatNumber(session.extraItems.reduce((n, i) => n + i.qty, 0))}</>
                )}
              </Badge>
            </Tip>
          )}
        </CardContent>
        {dialogs}
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-bold">{name}</span>
            {session.categoryName && <Badge variant="outline">{session.categoryName}</Badge>}
            <PriceSelect
              groups={groups}
              value={type.id}
              onChange={requestType}
              extraItems={[{ value: SWITCH_DEVICE, label: 'تغییر دستگاه…' }]}
              extra={<SelectItem value={SWITCH_DEVICE}>تغییر دستگاه…</SelectItem>}
              trigger={
                <Tip label="تغییر نرخ یا دستگاه">
                  <SelectTrigger className="w-auto min-w-44" aria-label="نرخ">
                    <SelectValue />
                  </SelectTrigger>
                </Tip>
              }
            />
            <Badge variant={running ? 'default' : 'secondary'}>{statusLabel[session.status]}</Badge>
            <Tip label="تغییر مشتری">
              <Button
                variant="ghost"
                size="sm"
                aria-label="تغییر مشتری"
                onClick={() => setCustomerOpen(true)}
              >
                <Pencil /> {customer ? customer.name : 'بدون مشتری'}
              </Button>
            </Tip>
          </div>

          <Tip label={rangeTitle}>
            <div>
              <Timer ms={elapsedMs(session, time)} />
            </div>
          </Tip>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>زمان اضافه</Label>
            <ExtraTimeDialog
              groups={groups}
              currentTypeId={type.id}
              onAdd={(t) => onUpdate((s) => addExtraTime(s, t))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>بوفه</Label>
            <ExtraItemPicker
              categories={settings.extraCategories}
              catalog={settings.extraItems}
              onAdd={(item) => onUpdate((s) => addExtraItem(s, item))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>مجموع هزینه تایم</Label>
            <div className="flex items-center gap-2">
              <Tip label="مشاهده جزئیات هزینه">
                <Input
                  readOnly
                  dir="ltr"
                  className="cursor-pointer font-bold"
                  value={formatNumber(total)}
                  onClick={() => setDetailOpen(true)}
                />
              </Tip>
              <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
            </div>
          </div>
        </div>

        {(session.extraTimes.length > 0 || session.extraItems.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {session.extraTimes.map((t) => (
              <Tip key={t.id} label="تغییر">
                <Badge
                  variant="outline"
                  className="h-auto cursor-pointer py-1 hover:bg-muted"
                  render={<button type="button" onClick={() => setManageOpen(true)} />}
                >
                  <Clock /> {t.name}: {formatNumber(t.minutes)} دقیقه
                </Badge>
              </Tip>
            ))}
            {session.extraItems.map((i) => (
              <Tip key={i.id} label={i.description || 'تغییر'}>
                <Badge
                  variant="secondary"
                  className="h-auto cursor-pointer py-1 hover:bg-secondary/70"
                  render={<button type="button" onClick={() => setManageOpen(true)} />}
                >
                  {i.name}
                  {i.description ? ` (${i.description})` : ''} × {formatNumber(i.qty)} ={' '}
                  {formatNumber(i.price * i.qty)}
                </Badge>
              </Tip>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {running ? (
            <Tip label="توقف موقت تایم">
              <Button className="flex-1" onClick={pause}>
                <Pause /> توقف
              </Button>
            </Tip>
          ) : (
            <>
              <Tip label="ادامه‌ی تایم">
                <Button className="flex-1" onClick={resume}>
                  <Play /> ادامه
                </Button>
              </Tip>
              <Tip label="پایان تایم و مشاهده صورت‌حساب">
                <Button className="flex-1" variant="destructive" onClick={openSummary}>
                  <Square /> اتمام
                </Button>
              </Tip>
            </>
          )}
        </div>
      </CardContent>
      {dialogs}
    </Card>
  )
}
