import { formatJalaliClock, formatJalaliDate, formatJalaliLong } from '@/lib/jalali'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

export function LiveClock({ size }: { size: 'large' | 'small' }) {
  const now = useNow()

  if (size === 'small') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{formatJalaliDate(now)}</span>
        <span dir="ltr" className="font-bold text-foreground tabular-nums">
          {formatJalaliClock(now)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span
        dir="ltr"
        className={cn('font-sans text-7xl leading-none font-bold tabular-nums sm:text-8xl')}
      >
        {formatJalaliClock(now)}
      </span>
      <span className="text-xl text-muted-foreground">{formatJalaliLong(now)}</span>
    </div>
  )
}
