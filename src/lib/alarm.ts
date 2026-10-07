// Generated alarm jingle (Web Audio), so no sound asset has to be bundled.
let ctx: AudioContext | undefined

export const ALARM_INTERVAL_MS = 10_000

// A bell-like note: a sine plus a few inharmonic partials, each with a fast attack and an
// exponential decay (higher partials die sooner), like a struck metal bar.
const bell = (ac: AudioContext, out: AudioNode, start: number, freq: number, length: number) => {
  const partials: [ratio: number, level: number, decay: number][] = [
    [1, 0.5, 1],
    [2.76, 0.18, 0.5],
    [5.4, 0.08, 0.25],
  ]
  for (const [ratio, level, decay] of partials) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * ratio
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(level, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length * decay)
    osc.connect(gain).connect(out)
    osc.start(start)
    osc.stop(start + length * decay + 0.05)
  }
}

// C major arpeggio going up, a quick "tada" answer, then a long high ring; a soft echo makes
// it sound spacious.
const MELODY: [freq: number, at: number, length: number][] = [
  [523.25, 0, 0.5], // C5
  [659.25, 0.14, 0.5], // E5
  [783.99, 0.28, 0.5], // G5
  [1046.5, 0.42, 0.6], // C6
  [783.99, 0.8, 0.4], // G5
  [1046.5, 0.94, 0.4], // C6
  [1318.5, 1.1, 1.4], // E6
]

export const playAlarm = () => {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
    // Feedback echo.
    const delay = ctx.createDelay()
    delay.delayTime.value = 0.22
    const feedback = ctx.createGain()
    feedback.gain.value = 0.3
    const wet = ctx.createGain()
    wet.gain.value = 0.35
    master.connect(delay)
    delay.connect(feedback).connect(delay)
    delay.connect(wet).connect(ctx.destination)

    const t = ctx.currentTime + 0.02
    for (const [freq, at, length] of MELODY) bell(ctx, master, t + at, freq, length)
  } catch {
    // No audio device / autoplay blocked: the dialog is still shown.
  }
}
