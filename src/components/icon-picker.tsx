import { useMemo, useRef, useState } from 'react'
import { RotateCcw, Search, Upload } from 'lucide-react'
import { DynamicIcon, iconNames } from 'lucide-react/dynamic'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tip } from '@/components/tip'
import { DEFAULT_ICON, imageToIcon, type AppIconValue } from '@/lib/app-icon'
import { buildIndex, searchIndex } from '@/lib/search'
import { cn } from '@/lib/utils'

type Props = { value: AppIconValue; onChange: (v: AppIconValue) => void }

const ERRORS: Record<string, string> = {
  'not-image': 'فایل انتخاب‌شده تصویر نیست.',
  'too-big': 'حجم تصویر باید کمتر از ۲ مگابایت باشد.',
}

// Icons are rendered progressively: each one is a separate lazy chunk.
const PAGE = 96

// Picker over every Lucide icon + custom image upload + reset to the default icon.
export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const index = useMemo(() => buildIndex(iconNames, (n) => n), [])
  const matches = useMemo(() => searchIndex(index, q), [index, q])
  const shown = matches.slice(0, limit)

  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      onChange({ kind: 'custom', src: await imageToIcon(file) })
      setError('')
    } catch (e) {
      setError(ERRORS[(e as Error).message] ?? 'بارگذاری تصویر انجام نشد.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-xl border bg-muted/40">
          <AppIcon value={value} className="size-9" />
        </div>

        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) {
              setQ('')
              setLimit(PAGE)
            }
          }}
        >
          <PopoverTrigger render={<Button variant="outline" />}>انتخاب آیکن</PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                dir="ltr"
                aria-label="جستجوی آیکن"
                placeholder={`Search ${iconNames.length} icons…`}
                className="ps-8"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setLimit(PAGE)
                }}
              />
            </div>
            <div
              className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto"
              dir="ltr"
              onScroll={(e) => {
                const el = e.currentTarget
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
                  setLimit((l) => Math.min(l + PAGE, matches.length))
                }
              }}
            >
              {shown.map((name) => {
                const active = value.kind === 'lucide' && value.name === name
                return (
                  <Tip key={name} label={name}>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={name}
                      aria-pressed={active}
                      onClick={() => {
                        onChange({ kind: 'lucide', name })
                        setError('')
                        setOpen(false)
                      }}
                      className={cn(
                        'aspect-square size-auto rounded-md p-0 max-md:size-auto',
                        active && 'bg-primary/10 text-primary ring-1 ring-primary',
                      )}
                    >
                      <DynamicIcon
                        name={name}
                        className="size-5"
                        fallback={() => <span className="size-5" />}
                      />
                    </Button>
                  </Tip>
                )
              })}
              {matches.length === 0 && (
                <p className="col-span-6 py-6 text-center text-sm text-muted-foreground" dir="rtl">
                  آیکنی پیدا نشد
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload /> آیکن دلخواه
        </Button>
        <Input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <Tip
          label={value.kind === 'default' ? 'آیکن پیش‌فرض در حال استفاده است' : 'بازگشت به آیکن پیش‌فرض'}
        >
          <span>
            <Button
              variant="ghost"
              disabled={value.kind === 'default'}
              onClick={() => {
                onChange(DEFAULT_ICON)
                setError('')
              }}
            >
              <RotateCcw /> پیش‌فرض
            </Button>
          </span>
        </Tip>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
