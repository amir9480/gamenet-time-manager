// What the header / empty state shows as the app icon.
export type AppIconValue =
  | { kind: 'default' }
  | { kind: 'lucide'; name: string } // any Lucide icon, kebab-case (e.g. "gamepad-2")
  | { kind: 'custom'; src: string } // small PNG data URL

export const DEFAULT_ICON: AppIconValue = { kind: 'default' }
// Relative to the deploy base (GitHub Pages serves the app from /<repo>/).
export const DEFAULT_ICON_SRC = `${import.meta.env.BASE_URL}favicon.svg`

const MAX_FILE_BYTES = 2 * 1024 * 1024
const SIZE = 128

// Reads an image file and returns it scaled down (contain) to a small PNG data URL.
export const imageToIcon = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('not-image'))
    if (file.size > MAX_FILE_BYTES) return reject(new Error('too-big'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode'))
      img.onload = () => {
        const scale = Math.min(SIZE / img.width, SIZE / img.height, 1)
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
