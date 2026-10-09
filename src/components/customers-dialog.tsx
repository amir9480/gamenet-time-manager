import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, NotebookPen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NewCustomerDialog } from '@/components/new-customer-dialog'
import { HistoryDialog } from '@/components/history-dialog'
import { CustomerDebtsDialog } from './customer-debts-dialog'
import { customerFields } from '@/components/customer-select'
import { Tip } from '@/components/tip'
import { buildIndex, searchIndex } from '@/lib/search'
import { deleteCustomer, readCustomerSpend, readDebts } from '@/lib/db'
import { formatNumber } from '@/lib/format'
import type { Customer, Usage } from '@/lib/store'

const PAGE_SIZE = 8

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: Customer[]
  usage: Usage
}

// Customer management; every change is saved immediately (not part of the Settings draft).
export function CustomersDialog({ open, onOpenChange, customers, usage }: Props) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [debtsFor, setDebtsFor] = useState<Customer | null>(null)
  const [statsFor, setStatsFor] = useState<Customer | null>(null)
  const [debtorsOnly, setDebtorsOnly] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)

  // Deferred: the list renders first, the totals fill in once the history has been summed
  // (undefined while loading; re-summed whenever history changes).
  const spend = useLiveQuery(() => (open ? readCustomerSpend() : undefined), [open])
  // Outstanding debt (نسیه) per customer, loaded the same deferred way.
  const debts = useLiveQuery(() => (open ? readDebts() : undefined), [open])
  const balanceOf = (id: string) => debts?.get(id)?.balance ?? 0
  const debtors = debts ? customers.filter((c) => balanceOf(c.id) < 0) : []
  const totalOwed = debtors.reduce((sum, c) => sum + Math.abs(balanceOf(c.id)), 0)

  // Newest first; a query ranks the customers by relevance instead.
  const index = useMemo(() => buildIndex([...customers].reverse(), customerFields), [customers])
  const found = useMemo(() => searchIndex(index, q), [index, q])
  const matches = debtorsOnly ? found.filter((c) => balanceOf(c.id) < 0) : found
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setQ('')
            setPage(0)
          }
          onOpenChange(o)
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>مشتریان</DialogTitle>
            <DialogDescription>
              مشتریان هنگام شروع تایم قابل انتخاب هستند (اختیاری) و در تاریخچه و آمار فیلتر می‌شوند.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:flex-1">
              <Search className="pointer-events-none absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="جستجوی مشتری"
                placeholder="جستجو بر اساس نام یا شماره"
                className="ps-8"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(0)
                }}
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              variant={debtorsOnly ? 'default' : 'outline'}
              aria-pressed={debtorsOnly}
              disabled={debts === undefined}
              onClick={() => {
                setDebtorsOnly(!debtorsOnly)
                setPage(0)
              }}
            >
              <NotebookPen /> بدهکاران{debts ? ` (${formatNumber(debtors.length)})` : ''}
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setAdding(true)}>
              <Plus /> مشتری جدید
            </Button>
          </div>

          {debts && totalOwed > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <span>مجموع بدهی مشتریان</span>
              <b className="text-destructive">{formatNumber(totalOwed)} تومان</b>
            </div>
          )}

          {matches.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {customers.length === 0 ? 'هنوز مشتری ثبت نشده است.' : 'مشتری‌ای پیدا نشد.'}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              <div className="hidden grid-cols-[1fr_1fr_7rem_8rem_5rem] gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid">
                <span>نام</span>
                <span>شماره‌ی تماس</span>
                <span>مجموع خرید</span>
                <span>مانده کیف پول</span>
                <span />
              </div>
              {shown.map((c) => {
                const busy = usage.customerIds.has(c.id)
                const indebted = balanceOf(c.id) < 0
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-2 items-center gap-2 px-3 py-1.5 sm:grid-cols-[1fr_1fr_7rem_8rem_5rem]"
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      className="justify-start truncate px-1 text-sm"
                      onClick={() => setStatsFor(c)}
                    >
                      {c.name}
                    </Button>
                    <span className="truncate text-sm text-muted-foreground" dir="ltr">
                      {c.phone || '—'}
                    </span>
                    {spend === undefined ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      <span className="truncate text-sm" dir="ltr">
                        {formatNumber(spend.get(c.id) ?? 0)}{' '}
                        <span className="text-xs text-muted-foreground">تومان</span>
                      </span>
                    )}
                    {debts === undefined ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      (() => {
                        const info = debts.get(c.id)
                        if (!info)
                          return (
                            <Tip label="مشاهده‌ی تراکنش‌های کیف پول">
                              <Button
                                variant="ghost"
                                size="xs"
                                className="justify-start px-1 text-muted-foreground"
                                onClick={() => setDebtsFor(c)}
                              >
                                0
                              </Button>
                            </Tip>
                          )
                        return (
                          <Tip label="مشاهده‌ی تراکنش‌های کیف پول">
                            <Button
                              variant="ghost"
                              size="xs"
                              className="justify-start px-1"
                              onClick={() => setDebtsFor(c)}
                            >
                              {info.balance < 0 ? (
                                <span className="font-bold text-destructive" dir="ltr">
                                  {formatNumber(Math.abs(info.balance))}-
                                </span>
                              ) : info.balance > 0 ? (
                                <span className="font-bold text-green-600" dir="ltr">
                                  +{formatNumber(info.balance)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">تسویه‌شده</span>
                              )}
                            </Button>
                          </Tip>
                        )
                      })()
                    )}
                    <div className="col-start-2 row-start-3 flex justify-end gap-0.5 sm:col-start-auto sm:row-start-auto">
                      <Tip label="ویرایش">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="ویرایش"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil />
                        </Button>
                      </Tip>
                      <Tip
                        label={
                          busy
                            ? 'این مشتری در یک تایم فعال است'
                            : indebted
                              ? 'این مشتری بدهی پرداخت‌نشده دارد'
                              : 'حذف'
                        }
                      >
                        <span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="حذف"
                            disabled={busy || indebted}
                            onClick={() => setPendingDelete(c)}
                          >
                            <Trash2 />
                          </Button>
                        </span>
                      </Tip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {matches.length} مشتری · صفحه {current + 1} از {pages}
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
        </DialogContent>
      </Dialog>

      {debtsFor && <CustomerDebtsDialog customer={debtsFor} onClose={() => setDebtsFor(null)} />}
      {statsFor && (
        <HistoryDialog
          open
          onOpenChange={(o) => !o && setStatsFor(null)}
          fixedCustomer={{ id: statsFor.id, name: statsFor.name }}
        />
      )}
      {adding && <NewCustomerDialog open onOpenChange={setAdding} />}
      {editing && (
        <NewCustomerDialog
          key={editing.id}
          open
          customer={editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مشتری؟</AlertDialogTitle>
            <AlertDialogDescription>«{pendingDelete?.name}» حذف می‌شود.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return
                deleteCustomer(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
