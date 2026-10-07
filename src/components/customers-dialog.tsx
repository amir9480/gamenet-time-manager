import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NewCustomerDialog } from '@/components/new-customer-dialog'
import { customerFields } from '@/components/customer-select'
import { Tip } from '@/components/tip'
import { buildIndex, searchIndex } from '@/lib/search'
import { deleteCustomer, readCustomerSpend } from '@/lib/db'
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

  // Deferred: the list renders first, the totals fill in once the history has been summed
  // (undefined while loading; re-summed whenever history changes).
  const spend = useLiveQuery(() => (open ? readCustomerSpend() : undefined), [open])

  // Newest first; a query ranks the customers by relevance instead.
  const index = useMemo(() => buildIndex([...customers].reverse(), customerFields), [customers])
  const matches = useMemo(() => searchIndex(index, q), [index, q])
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>مشتریان</DialogTitle>
            <DialogDescription>
              مشتریان هنگام شروع تایم قابل انتخاب هستند (اختیاری) و در تاریخچه و آمار فیلتر می‌شوند.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus /> مشتری جدید
            </Button>
          </div>

          {matches.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {customers.length === 0 ? 'هنوز مشتری ثبت نشده است.' : 'مشتری‌ای پیدا نشد.'}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              <div className="grid grid-cols-[1fr_1fr_7rem_5rem] gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span>نام</span>
                <span>شماره‌ی تماس</span>
                <span>مجموع خرید</span>
                <span />
              </div>
              {shown.map((c) => {
                const busy = usage.customerIds.has(c.id)
                return (
                  <div key={c.id} className="grid grid-cols-[1fr_1fr_7rem_5rem] items-center gap-2 px-3 py-1.5">
                    <span className="truncate text-sm">{c.name}</span>
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
                    <div className="flex justify-end gap-0.5">
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
                      <Tip label={busy ? 'این مشتری در یک تایم فعال است' : 'حذف'}>
                        <span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="حذف"
                            disabled={busy}
                            onClick={() => deleteCustomer(c.id)}
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

      {adding && <NewCustomerDialog open onOpenChange={setAdding} />}
      {editing && (
        <NewCustomerDialog
          key={editing.id}
          open
          customer={editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  )
}
