import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Skeleton } from '@/components/ui/skeleton'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { useDiscardGuard } from '@/components/discard-dialog'
import {
  addWalletTransaction,
  deleteWalletTransaction,
  readCustomerWalletTransactions,
  updateWalletTransaction,
} from '@/lib/db'
import { formatNumber, parseNumber } from '@/lib/format'
import { endOfDay, formatJalaliDateTime, startOfDay } from '@/lib/jalali'
import type { Customer, WalletTransaction } from '@/lib/store'

const PAGE_SIZE = 12
const toman = (n: number) => `${formatNumber(n)} تومان`

const KIND_LABEL: Record<WalletTransaction['kind'], string> = {
  'legacy-debt': 'بدهی (نسخه‌های قبل)',
  'legacy-payment': 'پرداخت (نسخه‌های قبل)',
  'session-debt': 'بدهی تایم',
  'session-credit-leftover': 'اعتبار باقی‌مانده',
  'manual-adjustment': 'اصلاح دستی',
}

export function CustomerDebtsDialog({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const [rangeOn, setRangeOn] = useState(false)
  const [fromDay, setFromDay] = useState(startOfDay(Date.now()))
  const [toDay, setToDay] = useState(startOfDay(Date.now()))
  const [page, setPage] = useState(0)
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditText, setCreditText] = useState('')
  const [editing, setEditing] = useState<WalletTransaction | null>(null)
  const [editingText, setEditingText] = useState('')
  const [deleting, setDeleting] = useState<WalletTransaction | null>(null)

  const allRows = useLiveQuery(() => readCustomerWalletTransactions(customer.id), [customer.id])
  const rows = useMemo(() => {
    if (!allRows) return allRows
    if (!rangeOn) return allRows
    const from = startOfDay(fromDay)
    const to = endOfDay(toDay)
    return allRows.filter((x) => x.at >= from && x.at <= to)
  }, [allRows, rangeOn, fromDay, toDay])
  const balance = useMemo(
    () => allRows?.reduce((sum, x) => sum + x.amount, 0),
    [allRows],
  )

  const pages = Math.max(1, Math.ceil((rows?.length ?? 0) / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = useMemo(
    () => rows?.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE) ?? [],
    [rows, current],
  )

  const totals = useMemo(() => {
    const list = rows ?? []
    const credits = list.filter((x) => x.amount > 0).reduce((sum, x) => sum + x.amount, 0)
    const debits = list.filter((x) => x.amount < 0).reduce((sum, x) => sum + Math.abs(x.amount), 0)
    return { credits, debits }
  }, [rows])

  const creditAmount = Math.floor(parseNumber(creditText))
  const saveCredit = async () => {
    if (creditAmount <= 0) return
    await addWalletTransaction(
      customer.id,
      creditAmount,
      'manual-adjustment',
      'افزایش اعتبار دستی',
    )
    setCreditText('')
    setCreditOpen(false)
  }
  const { requestClose: requestCloseCredit, dialog: creditDiscardDialog } = useDiscardGuard(
    creditText !== '',
    () => {
      setCreditOpen(false)
      setCreditText('')
    },
  )

  const manualCreditEditable = (row: WalletTransaction) =>
    row.kind === 'manual-adjustment' && row.amount > 0 && Date.now() - row.at <= 24 * 60 * 60 * 1000

  const editingAmount = Math.floor(parseNumber(editingText))
  const saveEditing = async () => {
    if (!editing || !manualCreditEditable(editing) || editingAmount <= 0) return
    await updateWalletTransaction(editing.id, { amount: editingAmount })
    setEditing(null)
    setEditingText('')
  }

  const removeEditing = async () => {
    if (!deleting || !manualCreditEditable(deleting)) return
    await deleteWalletTransaction(deleting.id)
    setDeleting(null)
  }
  const { requestClose: requestCloseEditing, dialog: editingDiscardDialog } = useDiscardGuard(
    editing !== null && editingText !== String(editing.amount),
    () => {
      setEditing(null)
      setEditingText('')
    },
  )

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>تراکنش‌های کیف پول {customer.name}</DialogTitle>
          <DialogDescription>
            مانده‌ی منفی یعنی بدهی و مانده‌ی مثبت یعنی اعتبار. این بخش فقط برای مشاهده است.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 text-center text-sm sm:grid-cols-3">
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">جمع مخارج</div>
            {rows ? (
              <b className="text-destructive">{toman(totals.debits)}</b>
            ) : (
              <Skeleton className="mx-auto mt-1 h-4 w-20" />
            )}
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">جمع اعتبارها</div>
            {rows ? (
              <b className="text-green-600">{toman(totals.credits)}</b>
            ) : (
              <Skeleton className="mx-auto mt-1 h-4 w-20" />
            )}
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">مانده‌ی کیف پول</div>
            {balance !== undefined ? (
              <b className={balance < 0 ? 'text-destructive' : balance > 0 ? 'text-green-600' : undefined}>
                {balance > 0 ? '+' : ''}
                {formatNumber(balance)} تومان
              </b>
            ) : (
              <Skeleton className="mx-auto mt-1 h-4 w-20" />
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={rangeOn}
              onCheckedChange={(v) => {
                setRangeOn(v === true)
                setPage(0)
              }}
            />
            اعمال بازه‌ی تاریخ
          </label>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">از تاریخ</Label>
            <JalaliDatePicker
              label=""
              value={startOfDay(fromDay)}
              onChange={(d) => {
                setFromDay(startOfDay(d))
                setPage(0)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">تا تاریخ</Label>
            <JalaliDatePicker
              label=""
              value={startOfDay(toDay)}
              onChange={(d) => {
                setToDay(startOfDay(d))
                setPage(0)
              }}
            />
          </div>
        </div>

        {rows === undefined ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">تراکنشی ثبت نشده است.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col divide-y rounded-lg border">
              <div className="grid grid-cols-[9rem_1fr_8rem] gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span>تاریخ</span>
                <span>نوع</span>
                <span>مبلغ</span>
              </div>
              {shown.map((r) => (
                <div key={r.id} className="grid grid-cols-[9rem_1fr_8rem] items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-xs">{formatJalaliDateTime(r.at)}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge variant={r.amount < 0 ? 'destructive' : 'secondary'}>{KIND_LABEL[r.kind]}</Badge>
                    {r.note && <span className="truncate text-xs text-muted-foreground">{r.note}</span>}
                  </span>
                  <div className="flex items-center justify-end gap-1" dir="ltr">
                    {manualCreditEditable(r) && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="ویرایش اعتبار"
                          onClick={() => {
                            setEditing(r)
                            setEditingText(String(r.amount))
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="حذف اعتبار"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                    <span
                      className={
                        r.amount < 0 ? 'font-medium text-destructive' : 'font-medium text-green-600'
                      }
                    >
                      {r.amount > 0 ? '+' : ''}
                      {formatNumber(r.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {rows.length} تراکنش · صفحه {current + 1} از {pages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="صفحه‌ی قبل"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    <ChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="صفحه‌ی بعد"
                    disabled={current >= pages - 1}
                    onClick={() => setPage(current + 1)}
                  >
                    <ChevronLeft />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setCreditOpen(true)}>
            <Plus /> افزودن اعتبار
          </Button>
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <AlertDialog
        open={creditOpen}
        onOpenChange={(o) => (o ? setCreditOpen(true) : requestCloseCredit())}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>افزودن اعتبار</AlertDialogTitle>
            <AlertDialogDescription>
              مبلغی که ثبت می‌کنید به کیف پول مشتری اضافه می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wallet-credit">مبلغ اعتبار</Label>
            <div className="flex items-center gap-2">
              <MoneyInput
                id="wallet-credit"
                autoFocus
                placeholder="مثلا 100,000"
                value={creditAmount > 0 ? formatNumber(creditAmount) : creditText}
                onChange={(e) => setCreditText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveCredit()}
              />
              <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction disabled={creditAmount <= 0} onClick={saveCredit}>
              ثبت اعتبار
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={editing !== null} onOpenChange={(o) => !o && requestCloseEditing()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ویرایش اعتبار</AlertDialogTitle>
            <AlertDialogDescription>
              مبلغ جدید اعتبار را وارد کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wallet-credit-edit">مبلغ اعتبار</Label>
            <div className="flex items-center gap-2">
              <MoneyInput
                id="wallet-credit-edit"
                autoFocus
                value={editingAmount > 0 ? formatNumber(editingAmount) : editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
              />
              <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction disabled={editingAmount <= 0} onClick={saveEditing}>
              ذخیره
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف اعتبار؟</AlertDialogTitle>
            <AlertDialogDescription>
              این تراکنش اعتبار حذف می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeEditing}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {creditDiscardDialog}
      {editingDiscardDialog}
    </>
  )
}
