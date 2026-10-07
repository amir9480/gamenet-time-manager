import font400 from '@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2?url'
import font700 from '@fontsource/vazirmatn/files/vazirmatn-arabic-700-normal.woff2?url'
import { groupByDay, summarize } from '@/lib/history'
import { dayKey, formatJalaliClock, toFa, type Range } from '@/lib/jalali'
import { itemsSold, topCustomers } from '@/lib/stats'
import type { HistoryEntry } from '@/lib/store'

// Exports the (filtered) history for an accountant: CSV, XLSX and PDF. Pure data building lives
// here; the download / print plumbing is at the bottom. Money is exported as plain numbers
// (toman) and dates as Jalali with English digits so spreadsheets sort and sum them.

type Cell = string | number
export type Table = { name: string; header: string[]; rows: Cell[][]; total?: Cell[] }

export type ReportMeta = {
  title: string
  rangeLabel: string
  filters: string[]
}

const minutes = (ms: number) => Math.round(ms / 60_000)
const clock = (ts: number) => formatJalaliClock(ts, false).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))

export const rangeLabel = (range: Range): string =>
  range.from <= 0 ? 'همه‌ی تاریخ‌ها' : `${dayKey(range.from)} تا ${dayKey(range.to)}`

const sessionsTable = (entries: HistoryEntry[]): Table => {
  const rows = entries.map((e) => [
    dayKey(e.endedAt),
    clock(e.startedAt),
    clock(e.endedAt),
    minutes(e.durationMs),
    e.deviceNames.join('، '),
    e.categoryNames.join('، '),
    e.customerName ?? '',
    e.customerPhone ?? '',
    e.timeCost,
    e.extraTimesCost,
    e.extraItemsCost,
    e.calculatedTotal ?? e.total,
    e.total,
    e.onAccount ? 'نسیه' : 'پرداخت‌شده',
  ])
  const sum = (i: number) => rows.reduce((s, r) => s + (r[i] as number), 0)
  return {
    name: 'تایم‌ها',
    header: [
      'تاریخ', 'شروع', 'پایان', 'مدت (دقیقه)', 'دستگاه', 'نوع دستگاه', 'مشتری', 'تلفن',
      'هزینه زمان', 'زمان اضافه', 'بوفه', 'مبلغ محاسبه‌شده', 'مبلغ نهایی', 'نحوه پرداخت',
    ],
    rows,
    total: ['مجموع', '', '', sum(3), '', '', '', '', sum(8), sum(9), sum(10), sum(11), sum(12), ''],
  }
}

const dailyTable = (entries: HistoryEntry[]): Table => ({
  name: 'خلاصه روزانه',
  header: ['تاریخ', 'تعداد تایم', 'مدت (دقیقه)', 'درآمد'],
  rows: groupByDay(entries).map((g) => [g.key, g.entries.length, minutes(g.durationMs), g.total]),
  total: (() => {
    const s = summarize(entries)
    return ['مجموع', s.count, minutes(s.durationMs), s.total]
  })(),
})

const customersTable = (entries: HistoryEntry[]): Table => ({
  name: 'مشتریان',
  header: ['مشتری', 'تعداد تایم', 'درآمد'],
  rows: topCustomers(entries, Infinity).map((c) => [c.name, c.sessions, c.income]),
})

const itemsTable = (entries: HistoryEntry[]): Table => ({
  name: 'بوفه',
  header: ['مورد', 'تعداد', 'درآمد'],
  rows: itemsSold(entries, Infinity).map((i) => [i.name, i.qty, i.income]),
})

export const buildTables = (entries: HistoryEntry[]): Table[] =>
  [sessionsTable(entries), dailyTable(entries), customersTable(entries), itemsTable(entries)].filter(
    (t) => t.rows.length > 0,
  )

// ---- CSV --------------------------------------------------------------------

const csvCell = (c: Cell) => {
  const s = String(c)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// UTF-8 with BOM so Excel reads the Persian text correctly.
export const toCsv = (table: Table): string =>
  '﻿' +
  [table.header, ...table.rows, ...(table.total ? [table.total] : [])]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')

// ---- XLSX (minimal writer: stored zip + SpreadsheetML) ------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const zip = (files: { path: string; data: string }[]): Uint8Array<ArrayBuffer> => {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true)
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n, true)
  for (const f of files) {
    const name = enc.encode(f.path)
    const data = enc.encode(f.data)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    u32(local, 0, 0x04034b50)
    u16(local, 4, 20)
    u16(local, 6, 0x0800) // UTF-8 names
    u32(local, 14, crc)
    u32(local, 18, data.length)
    u32(local, 22, data.length)
    u16(local, 26, name.length)
    parts.push(new Uint8Array(local.buffer), name, data)
    const dir = new DataView(new ArrayBuffer(46))
    u32(dir, 0, 0x02014b50)
    u16(dir, 4, 20)
    u16(dir, 6, 20)
    u16(dir, 8, 0x0800)
    u32(dir, 16, crc)
    u32(dir, 20, data.length)
    u32(dir, 24, data.length)
    u16(dir, 28, name.length)
    u32(dir, 42, offset)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + data.length
  }
  const centralSize = central.reduce((s, p) => s + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  u32(end, 0, 0x06054b50)
  u16(end, 8, files.length)
  u16(end, 10, files.length)
  u32(end, 12, centralSize)
  u32(end, 16, offset)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of all) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const xml = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

const colName = (i: number) => String.fromCharCode(65 + i)

// Styles: 0 plain, 1 bold header (grey fill), 2 number #,##0, 3 bold number, 4 bold text.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="3" fontId="1" applyNumberFormat="1" applyFont="1"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`

const sheetXml = (t: Table) => {
  const cell = (c: Cell, r: number, i: number, bold: boolean) => {
    const ref = `${colName(i)}${r}`
    if (typeof c === 'number')
      return `<c r="${ref}" s="${bold ? 3 : 2}"><v>${c}</v></c>`
    if (c === '') return ''
    return `<c r="${ref}" t="inlineStr" s="${bold ? 4 : 0}"><is><t>${xml(c)}</t></is></c>`
  }
  const row = (cells: Cell[], r: number, style: 'head' | 'body' | 'total') =>
    `<row r="${r}">${cells
      .map((c, i) =>
        style === 'head'
          ? `<c r="${colName(i)}${r}" t="inlineStr" s="1"><is><t>${xml(String(c))}</t></is></c>`
          : cell(c, r, i, style === 'total'),
      )
      .join('')}</row>`
  const body = [
    row(t.header, 1, 'head'),
    ...t.rows.map((r, i) => row(r, i + 2, 'body')),
    ...(t.total ? [row(t.total, t.rows.length + 2, 'total')] : []),
  ].join('')
  const widths = t.header
    .map((h, i) => {
      const w = Math.max(
        h.length,
        ...t.rows.map((r) => String(r[i]).length + (typeof r[i] === 'number' ? 3 : 0)),
      )
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(40, Math.max(10, w + 2))}" customWidth="1"/>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${body}</sheetData></worksheet>`
}

export const toXlsx = (tables: Table[]): Uint8Array<ArrayBuffer> => {
  const n = tables.length
  const idx = (f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1)).join('')
  return zip([
    {
      path: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${idx((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)}</Types>`,
    },
    {
      path: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      path: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables
        .map(
          (t, i) =>
            `<sheet name="${xml(t.name.replace(/[[\]:*?/\\]/g, '').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${idx((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`)}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { path: 'xl/styles.xml', data: STYLES },
    ...tables.map((t, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(t) })),
  ])
}

// ---- PDF (print-ready HTML) ---------------------------------------------------

const fmt = (c: Cell) => (typeof c === 'number' ? c.toLocaleString('en-US') : xml(c))

const printHtml = (meta: ReportMeta, tables: Table[], entries: HistoryEntry[]) => {
  const s = summarize(entries)
  const kpi = (label: string, v: string) =>
    `<div class="kpi"><span>${label}</span><b>${v}</b></div>`
  const table = (t: Table) => `<h2>${xml(t.name)}</h2><table><thead><tr>${t.header
    .map((h) => `<th>${xml(h)}</th>`)
    .join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="n"' : ''}>${fmt(c)}</td>`).join('')}</tr>`)
    .join('')}${
    t.total
      ? `<tr class="total">${t.total.map((c) => `<td${typeof c === 'number' ? ' class="n"' : ''}>${fmt(c)}</td>`).join('')}</tr>`
      : ''
  }</tbody></table>`
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${xml(meta.title)}</title><style>
@font-face{font-family:V;font-weight:400;src:url(${new URL(font400, location.href).href})}
@font-face{font-family:V;font-weight:700;src:url(${new URL(font700, location.href).href})}
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}
body{font-family:V,Tahoma,sans-serif;font-size:10px;color:#111;margin:0}
h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px}
.sub{color:#555;margin-bottom:10px}
.kpis{display:flex;gap:8px;margin:10px 0}
.kpi{flex:1;border:1px solid #bbb;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:2px}
.kpi span{color:#555}.kpi b{font-size:13px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:3px 5px;text-align:start}
th{background:#e5e7eb}tr{break-inside:avoid}thead{display:table-header-group}
td.n{direction:ltr;text-align:end;font-variant-numeric:tabular-nums}
tr.total td{font-weight:700;background:#f3f4f6}
</style></head><body>
<h1>${xml(meta.title)}</h1>
<div class="sub">بازه: ${xml(toFa(meta.rangeLabel))}${meta.filters.length ? ` · ${xml(meta.filters.join(' · '))}` : ''} · تاریخ گزارش: ${toFa(dayKey(Date.now()))}</div>
<div class="kpis">${kpi('تعداد تایم', s.count.toLocaleString('en-US'))}${kpi('درآمد زمان', s.timeCost.toLocaleString('en-US'))}${kpi('درآمد بوفه', s.extrasCost.toLocaleString('en-US'))}${kpi('مجموع درآمد (تومان)', s.total.toLocaleString('en-US'))}</div>
${tables.map(table).join('')}
</body></html>`
}

// Prints the report from a hidden iframe: the user picks «Save as PDF» in the print dialog.
// (Rendering in the webview keeps Persian shaping / RTL correct without a PDF library.)
export const printReport = (meta: ReportMeta, entries: HistoryEntry[]): Promise<void> =>
  new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0'
    frame.srcdoc = printHtml(meta, buildTables(entries), entries)
    frame.onload = async () => {
      const win = frame.contentWindow!
      await win.document.fonts.ready
      win.focus()
      win.print()
      setTimeout(() => frame.remove(), 60_000)
      resolve()
    }
    document.body.append(frame)
  })

// ---- download ---------------------------------------------------------------

export const download = (name: string, data: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const exportFileName = (ext: string) =>
  `gamenet-report-${dayKey(Date.now()).replace(/\//g, '-')}.${ext}`

export const exportCsv = (entries: HistoryEntry[]) =>
  download(exportFileName('csv'), toCsv(sessionsTable(entries)), 'text/csv;charset=utf-8')

export const exportXlsx = (entries: HistoryEntry[]) =>
  download(
    exportFileName('xlsx'),
    toXlsx(buildTables(entries)),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
