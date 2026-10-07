// Latest GitHub release lookup, shared by the update check and the install dialog.
import { REPO, REPO_URL } from '@/lib/platform'

export const RELEASES_URL = `${REPO_URL}/releases`

export type ReleaseInfo = {
  version: string
  notes: string
  url: string
  // Windows NSIS setup asset (`*-setup.exe`), when the release has one.
  installerUrl: string | null
}

// Semver compare with prerelease support (1.0.0-beta.2 < 1.0.0). Returns <0, 0 or >0.
export const compareVersions = (a: string, b: string): number => {
  const parse = (v: string) => {
    const s = v.replace(/^v/, '')
    // Split on the first '-' only: the prerelease part may contain more (1.0.0-beta-2).
    const dash = s.indexOf('-')
    const core = dash < 0 ? s : s.slice(0, dash)
    const pre = dash < 0 ? [] : s.slice(dash + 1).split('.')
    return { nums: core.split('.').map((n) => Number(n) || 0), pre }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d
  }
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) {
      if (Number(p) !== Number(q)) return Number(p) - Number(q)
    } else if (pn !== qn) return pn ? -1 : 1
    else if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

type ApiRelease = {
  tag_name: string
  body: string | null
  html_url: string
  draft: boolean
  assets: { name: string; browser_download_url: string }[]
}

let cached: { at: number; promise: Promise<ReleaseInfo | null> } | null = null

// Newest published release (pre-releases included while the app is in beta); null when offline.
export const fetchLatestRelease = (): Promise<ReleaseInfo | null> => {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.promise
  const promise = fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then((r) => (r.ok ? (r.json() as Promise<ApiRelease[]>) : []))
    .then((list): ReleaseInfo | null => {
      const rel = list
        .filter((r) => !r.draft)
        .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0]
      if (!rel) return null
      return {
        version: rel.tag_name.replace(/^v/, ''),
        notes: (rel.body ?? '').trim(),
        url: rel.html_url,
        installerUrl:
          rel.assets.find((a) => a.name.endsWith('-setup.exe'))?.browser_download_url ?? null,
      }
    })
    .catch(() => null)
  cached = { at: Date.now(), promise }
  return promise
}
