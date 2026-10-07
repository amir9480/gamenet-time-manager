import NumberFlow, { NumberFlowGroup } from '@number-flow/react'

export function Timer({ ms }: { ms: number }) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  return (
    <NumberFlowGroup>
      <div
        dir="ltr"
        className="flex items-baseline justify-center font-mono text-4xl font-bold"
        style={{ fontVariantNumeric: 'tabular-nums', fontKerning: 'none' }}
      >
        <NumberFlow value={h} format={{ minimumIntegerDigits: 2 }} trend={1} />
        <span>:</span>
        <NumberFlow value={m} format={{ minimumIntegerDigits: 2 }} trend={1} digits={{ 1: { max: 5 } }} />
        <span>:</span>
        <NumberFlow value={s} format={{ minimumIntegerDigits: 2 }} trend={1} digits={{ 1: { max: 5 } }} />
      </div>
    </NumberFlowGroup>
  )
}
