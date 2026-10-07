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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExtraItemPicker } from '@/components/ExtraItemPicker'
import { ExtraItemsManageDialog } from '@/components/ExtraItemsManageDialog'
import { ExtraTimeDialog } from '@/components/ExtraTimeDialog'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
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
  displayName,
  elapsedMs,
  pauseSession,
  resumeSession,
  selectedType,
  type Session,
  type Settings,
} from '@/lib/store'

type Props = {
  session: Session
  settings: Settings
  onUpdate: (fn: (s: Session) => Session) => void
  onEnd: () => void
}

const statusLabel = { running: 'در حال بازی', paused: 'متوقف' } as const

export function SessionCard({ session, settings, onUpdate, onEnd }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryNow, setSummaryNow] = useState(0)
  const [manageOpen, setManageOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)
  const running = session.status === 'running'

  const now = useNow(running)

  const time = running ? now : Date.now()
  const type = selectedType(settings, session)
  const total = computeCost(session, time)
  const name = displayName(session)
  const first = session.segments[0]
  const last = session.segments[session.segments.length - 1]
  const rangeTitle = first
    ? `شروع: ${formatJalaliDateTime(first.from)}
${last.to ? `پایان: ${formatJalaliDateTime(last.to)}` : `اکنون: ${formatJalaliDateTime(time)}`}`
    : undefined

  const resume = () => onUpdate((s) => resumeSession(settings, s, Date.now()))
  const pause = () => onUpdate((s) => pauseSession(s, Date.now()))
  const requestType = (id: string) => {
    if (id !== type.id) setPendingTypeId(id)
  }
  const confirmType = () => {
    if (!pendingTypeId) return
    onUpdate((s) => changeType(settings, s, pendingTypeId, Date.now()))
    setPendingTypeId(null)
  }
  const pendingType = settings.priceTypes.find((t) => t.id === pendingTypeId)
  const openSummary = () => {
    setSummaryNow(Date.now())
    setSummaryOpen(true)
  }

  const typeItems = settings.priceTypes.map((t) => ({
    value: t.id,
    label: `${t.name} (${formatNumber(t.price)})`,
  }))

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-bold">{name}</span>
            <Tip label="تغییر نام">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="تغییر نام"
                onClick={() => setRenameOpen(true)}
              >
                <Pencil />
              </Button>
            </Tip>
            <Select items={typeItems} value={type.id} onValueChange={(v) => requestType(v as string)}>
              <Tip label="تغییر نوع نرخ">
                <SelectTrigger className="w-auto min-w-44" aria-label="نوع نرخ">
                  <SelectValue />
                </SelectTrigger>
              </Tip>
              <SelectContent>
                {typeItems.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant={running ? 'default' : 'secondary'}>{statusLabel[session.status]}</Badge>
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
              priceTypes={settings.priceTypes}
              currentTypeId={type.id}
              onAdd={(t) => onUpdate((s) => addExtraTime(s, t))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>هزینه اضافه</Label>
            <ExtraItemPicker
              catalog={settings.extraItems}
              onAdd={(item) => onUpdate((s) => addExtraItem(s, item))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>مجموع هزینه نشست</Label>
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
            <Tip label="توقف موقت نشست">
              <Button className="flex-1" onClick={pause}>
                <Pause /> توقف
              </Button>
            </Tip>
          ) : (
            <>
              <Tip label="ادامه‌ی نشست">
                <Button className="flex-1" onClick={resume}>
                  <Play /> ادامه
                </Button>
              </Tip>
              <Tip label="پایان نشست و مشاهده صورت‌حساب">
                <Button className="flex-1" variant="destructive" onClick={openSummary}>
                  <Square /> اتمام
                </Button>
              </Tip>
            </>
          )}
        </div>
      </CardContent>

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
                : 'زمان گذشته با نرخ قبلی محاسبه می‌ماند و نرخ جدید از زمان ادامه‌ی نشست اعمال می‌شود.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={confirmType}>تایید تغییر</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RenameSessionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        session={session}
        onSave={(newName) => onUpdate((s) => ({ ...s, name: newName.trim() }))}
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
        deviceName={name}
        session={session}
        now={time}
      />

      <SessionSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        deviceName={name}
        session={session}
        now={summaryNow}
        onConfirm={() => {
          setSummaryOpen(false)
          onEnd()
        }}
      />
    </Card>
  )
}
