import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Props = ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical'
  // Fade length (any CSS length).
  fade?: string
}

// A scroll container (scrollbar hidden) that fades out the edge(s) that still have content
// beyond them, so it is clear more can be scrolled. A fade disappears once that end is reached.
// Works in RTL too. Give it the sizing/flex classes; the children are laid out by the caller.
export function ScrollFade({
  orientation = 'horizontal',
  fade = '2rem',
  className,
  style,
  children,
  ...props
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // `start` / `end` are physical: left/right (horizontal) or top/bottom (vertical).
  const [more, setMore] = useState({ start: false, end: false })
  const horizontal = orientation === 'horizontal'

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
    const pos = horizontal ? el.scrollLeft : el.scrollTop
    // RTL scrollLeft runs 0 → -max (Chromium/Firefox/Safari), so |pos| is always the distance
    // travelled from the starting edge; map it to physical sides.
    const rtl = horizontal && getComputedStyle(el).direction === 'rtl'
    const travelled = Math.abs(pos)
    const hiddenBefore = rtl ? max - travelled : travelled
    const hiddenAfter = rtl ? travelled : max - travelled
    const next = { start: hiddenBefore > 1, end: hiddenAfter > 1 }
    setMore((p) => (p.start === next.start && p.end === next.end ? p : next))
  }, [horizontal])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child)
      measure()
    })
    mo.observe(el, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [measure])

  const dir = horizontal ? 'to right' : 'to bottom'
  const mask = `linear-gradient(${dir}, ${more.start ? 'transparent' : '#000'} 0, #000 ${fade}, #000 calc(100% - ${fade}), ${more.end ? 'transparent' : '#000'} 100%)`

  return (
    <div
      ref={ref}
      onScroll={measure}
      className={cn(
        'no-scrollbar min-w-0',
        horizontal ? 'overflow-x-auto' : 'overflow-y-auto',
        className,
      )}
      style={{
        ...style,
        maskImage: more.start || more.end ? mask : undefined,
        WebkitMaskImage: more.start || more.end ? mask : undefined,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
