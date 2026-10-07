import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HandCoins } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useDiscardGuard } from '@/components/discard-dialog'
import { addPayment, readCustomerLedger } from '@/lib/db'
import { formatNumber, parseNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/jalali'
import type { Customer } from '@/lib/store'

const toman = (n: number) => `${formatNumber(n)} تومان`

// Records a payment towards the debt: any amount up to what is still owed.
function PaymentDialog({
  balance,
  onPay,
  onClose,
}: {
  balance: number
  onPay: (amount: number) => void
  onClose: () => void
}) {
  const [text, setText] = useState(String(balance))
  const amount = Math.floor(parseNumber(text))
  const valid = amount > 0 && amount <= balance

  const { requestClose, dialog } = useDiscardGuard(text !== String(balance), onClose)

  const submit = () => {
    if (!valid) return
    onPay(amount)
    onClose()
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت</DialogTitle>
            <DialogDescription>مانده‌ی بدهی: {toman(balance)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-amount">مبلغ پرداختی</Label>
            <div className="flex items-center gap-2">
              <Input
                id="pay-amount"
                dir="ltr"
                inputMode="numeric"
                autoFocus
                aria-invalid={amount > balance}
                value={amount > 0 ? formatNumber(amount) : text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <span className="shrink-0 text-sm text-muted-foreground">تومان</span>
            </div>
            {amount > balance && (
              <span className="text-xs text-destructive">مبلغ بیشتر از مانده‌ی بدهی است.</span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              انصراف
            </Button>
            <Button variant="outline" onClick={() => setText(String(balance))}>
              تسویه کامل
            </Button>
            <Button disabled={!valid} onClick={submit}>
              ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}

// All of a customer's on-account (نسیه) sessions and payments with date and amount.
export function CustomerDebtsDialog({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const ledger = useLiveQuery(() => readCustomerLedger(customer.id), [customer.id])
  const [paying, setPaying] = useState(false)

  const debt = ledger?.debts.reduce((sum, e) => sum + e.total, 0) ?? 0
  const paid = ledger?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0
  const balance = debt - paid

  const rows = ledger
    ? [
        ...ledger.debts.map((e) => ({
          id: e.id,
          at: e.endedAt,
          kind: 'debt' as const,
          label: [e.deviceNames.join('، '), e.categoryNames.join('، ')].filter(Boolean).join(' · '),
          amount: e.total,
        })),
        ...ledger.payments.map((p) => ({
          id: p.id,
          at: p.paidAt,
          kind: 'payment' as const,
          label: 'پرداخت',
          amount: p.amount,
        })),
      ].sort((a, b) => b.at - a.at)
    : undefined

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>نسیه‌ی {customer.name}</DialogTitle>
            <DialogDescription>
              تایم‌هایی که به حساب مشتری گذاشته شده‌اند و پرداخت‌های او، به ترتیب تاریخ.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border p-2">
              <div className="text-xs text-muted-foreground">کل نسیه</div>
              {ledger ? <b>{toman(debt)}</b> : <Skeleton className="mx-auto mt-1 h-4 w-20" />}
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-xs text-muted-foreground">پرداخت‌شده</div>
              {ledger ? <b>{toman(paid)}</b> : <Skeleton className="mx-auto mt-1 h-4 w-20" />}
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-xs text-muted-foreground">مانده</div>
              {ledger ? (
                <b className={balance > 0 ? 'text-destructive' : undefined}>{toman(balance)}</b>
              ) : (
                <Skeleton className="mx-auto mt-1 h-4 w-20" />
              )}
            </div>
          </div>

          {rows === undefined ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              این مشتری نسیه‌ای ندارد.
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              <div className="grid grid-cols-[9rem_1fr_7rem] gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span>تاریخ</span>
                <span>شرح</span>
                <span>مبلغ</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[9rem_1fr_7rem] items-center gap-2 px-3 py-2 text-sm"
                >
                  <span className="text-xs">{formatJalaliDateTime(r.at)}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge variant={r.kind === 'debt' ? 'destructive' : 'secondary'}>
                      {r.kind === 'debt' ? 'نسیه' : 'پرداخت'}
                    </Badge>
                    <span className="truncate">{r.kind === 'debt' ? r.label : ''}</span>
                  </span>
                  <span
                    className={r.kind === 'debt' ? 'font-medium' : 'font-medium text-green-600'}
                    dir="ltr"
                  >
                    {r.kind === 'debt' ? '' : '− '}
                    {formatNumber(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              بستن
            </Button>
            <Button disabled={balance <= 0} onClick={() => setPaying(true)}>
              <HandCoins /> ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paying && (
        <PaymentDialog
          balance={balance}
          onPay={(amount) => addPayment(customer.id, amount)}
          onClose={() => setPaying(false)}
        />
      )}
    </>
  )
}
