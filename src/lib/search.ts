// A small search engine for in-memory lists: tokenizes the query, matches every word against
// every field of an item (order independent), tolerates small typos and ranks by relevance.
// Used by every search box in the app (see `rank`, `buildIndex`/`searchIndex`).

// A searchable field. `weight` scales its score (names > secondary info > numbers).
export type Field = string | { text: string; weight?: number }

// Lower-case, Persian/Arabic digits and letter variants unified, diacritics dropped, and
// everything that is not a letter or digit (·, parentheses, ZWNJ, dashes…) turned into a space.
// Letters and digits are split apart so «pc3» and «PC 3» are the same text.
export const normalizeSearch = (text: string) =>
  text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    // NFKD turns «آ» into «ا» + a mark and strips accents; the marks are removed below.
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .toLowerCase()
    // «1,000» → «1000»
    .replace(/(\d)[,٬](?=\d)/g, '$1')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

type Prepared = { words: string[]; joined: string; weight: number }

const prepare = (fields: Field | Field[]): Prepared[] =>
  (Array.isArray(fields) ? fields : [fields])
    .map((f): Prepared => {
      const text = normalizeSearch(typeof f === 'string' ? f : f.text)
      return {
        words: text.split(' ').filter(Boolean),
        joined: text.replace(/ /g, ''),
        weight: typeof f === 'string' ? 1 : (f.weight ?? 1),
      }
    })
    .filter((f) => f.joined !== '')

// Optimal-string-alignment distance (insert / delete / replace / swap), giving up above `max`.
const distance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur[j] = v
      best = Math.min(best, v)
    }
    if (best > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

const isNumeric = (t: string) => /^\p{N}+$/u.test(t)

// How well one query word matches one field: exact word 100, word prefix 80, inside a word 50,
// inside the space-less text 45, one small typo 30 (25 against a word's beginning).
const scoreToken = (token: string, field: Prepared): number => {
  let best = 0
  const typo = !isNumeric(token) && token.length >= 4 ? (token.length >= 8 ? 2 : 1) : 0
  for (const w of field.words) {
    if (w === token) return 100
    if (w.startsWith(token)) best = Math.max(best, 80)
    else if (token.length >= 2 && w.includes(token)) best = Math.max(best, 50)
    else if (best < 30 && typo) {
      if (distance(token, w, typo) <= typo) best = 30
      else if (w.length > token.length && distance(token, w.slice(0, token.length), typo) <= typo)
        best = Math.max(best, 25)
    }
  }
  // Words written apart in the query but joined in the field (or the other way round).
  if (best < 45 && token.length >= 3 && field.joined.includes(token)) best = 45
  return best
}

export type Index<T> = { item: T; fields: Prepared[] }[]

// Normalises every field once; build it with `useMemo` and reuse it for each keystroke.
export const buildIndex = <T>(items: readonly T[], getFields: (item: T) => Field | Field[]): Index<T> =>
  items.map((item) => ({ item, fields: prepare(getFields(item)) }))

// Items matching at least half of the query words, best first: more matched words, then the
// higher score, then the original order. An empty query returns the items untouched.
export const searchIndex = <T>(index: Index<T>, query: string): T[] => {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return index.map((e) => e.item)
  const need = Math.max(1, Math.ceil(tokens.length / 2))
  const hits: { item: T; matched: number; score: number; at: number }[] = []
  index.forEach((e, at) => {
    let matched = 0
    let score = 0
    for (const t of tokens) {
      let top = 0
      for (const f of e.fields) top = Math.max(top, scoreToken(t, f) * f.weight)
      if (top > 0) {
        matched++
        score += top
      }
    }
    if (matched >= need) hits.push({ item: e.item, matched, score, at })
  })
  hits.sort((a, b) => b.matched - a.matched || b.score - a.score || a.at - b.at)
  return hits.map((h) => h.item)
}

// One-shot search for small lists whose fields change every render (e.g. running sessions).
export const rank = <T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => Field | Field[],
): T[] =>
  normalizeSearch(query) === '' ? [...items] : searchIndex(buildIndex(items, getFields), query)
