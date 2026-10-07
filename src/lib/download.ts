// Saves a generated file the way a browser download does. On the web: an `<a download>` click
// (the browser shows its usual download / Save As UI). In the desktop app the webview ignores
// such downloads, so the Rust `save_file` command shows a native Save dialog and writes the file.
// Resolves to false when the user cancels the desktop dialog. Use this for every export.
import { isTauri } from '@/lib/platform'

export const saveFile = async (name: string, data: BlobPart, type: string): Promise<boolean> => {
  const blob = new Blob([data], { type })
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<boolean>('save_file', new Uint8Array(await blob.arrayBuffer()), {
      headers: { 'x-file-name': encodeURIComponent(name) },
    })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}
