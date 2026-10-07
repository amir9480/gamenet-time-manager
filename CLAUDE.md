# gamenet-reza (گیم نت رضا)

Single-page Persian (RTL, Vazirmatn) game-net session/cost tracker. React + Vite + TypeScript + Tailwind v4 + shadcn/ui (Base UI based "base-nova" style), wrapped as a Tauri v2 desktop app. All data lives in `localStorage`.

## Commands (pnpm only)
- `pnpm dev` — Vite on `0.0.0.0:3000` (strictPort; Tauri `devUrl` points at `localhost:3000`).
- `pnpm build` — `tsc -b && vite build` (strict, `noUnusedLocals`); run after every change.
- `pnpm tauri dev` — desktop window. `pnpm tauri build --no-bundle` — portable exe at `src-tauri/target/release/gamenet-reza.exe` (no installer; window starts maximized).
- Add shadcn components with `pnpm dlx shadcn@latest add <name> -y`.

## Product model
- No fixed devices. The user adds **sessions** on demand (empty state + CTA, and a button after the last card). A session is created **running** with a chosen price type and optional name; default name is `دستگاه N` using the lowest free number among sessions on screen. Ending (اتمام) shows a cost breakdown dialog and, once confirmed, **removes** the session.
- Settings dialog is draft-based (ذخیره/انصراف, close button = cancel, discard-confirm when dirty, save disabled while a name is empty or a price is 0). Tabs: عمومی (dark mode, accent color, autostart), نرخ‌ها (one global list of per-hour price types with a default radio), موارد اضافه (catalog of extra items; defaults نوشابه 1000 / چیپس 2000 / کیک 500).
- Cost: a session is a list of **segments** (one continuous run at one rate; each carries `typeId` + mirrored name/price, and saving price types in Settings rewrites them for ALL existing sessions — past, running and future — via `applyPriceTypes`). Changing the price type while running closes the segment and opens a new one. Time cost is billed per whole second, rounded up (`segmentCost`). Extra time entries (custom name + minutes + a price type picked when added, defaulting to the session's current type; snapshot) are billed at that entry's rate; extra items are `price × qty` (the «موارد دیگر» item has a raw price and optional description). Total = Σ segments + extra times + extra items.
- Display: English digits with thousands separators, label «تومان» placed **outside** inputs.

## Code map
- `src/lib/store.ts` — types, defaults, session transitions (`createSession`, `pauseSession`, `resumeSession`, `changeType`), cost helpers, `useLocalStorage`. Business logic belongs here, not in components.
- `src/lib/format.ts` — `formatNumber`, `parseNumber` (accepts Persian/Arabic digits), `formatDuration`, `formatClock`. `src/lib/accents.ts` — generated accent list; `src/accents.css` — generated per-accent CSS vars (`:root[data-accent=…]` / `.dark[data-accent=…]`).
- `src/App.tsx` — owns `settings` and `sessions` state, empty state, add-session flow. `src/components/SessionCard.tsx` is the per-session UI (header row, fields row, chips row, buttons row). Dialogs: `AddSessionDialog`, `RenameSessionDialog`, `ExtraTimeDialog`, `ExtraItemPicker`, `ExtraItemsManageDialog` (draft + save/cancel), `SessionSummaryDialog`, `SettingsDialog`. `Timer.tsx` uses `@number-flow/react`.
- `src-tauri/` — Tauri config (`tauri.conf.json`), autostart plugin (`tauri-plugin-autostart`, permissions in `capabilities/default.json`; the JS side is guarded by `'__TAURI_INTERNALS__' in window`). App icon source: `app-icon.svg` (`pnpm tauri icon app-icon.svg`).

## Conventions & gotchas
- Style: single quotes, no semicolons, ~100 col, trailing commas. Do **not** run prettier with defaults on files (it rewrites quotes/semicolons).
- UI is RTL (`<html lang="fa" dir="rtl">`). Use logical classes (`ms-/me-/ps-/pe-/start-/end-`), not `left/right`. Keep numeric inputs `dir="ltr"`. The Switch forces `dir="ltr"`; the Dialog close button is at the top-left.
- shadcn here is Base UI: triggers use the `render` prop (e.g. `<DialogTrigger render={<Button />}>`), not `asChild`; `Select` takes `items` for label lookup. Dialog/AlertDialog content scrolls with the whole viewport (wrapper `fixed inset-0 overflow-y-auto`), never inside the dialog — don't add `max-h/overflow` to dialog contents.
- Persistence: no migrations (app unpublished). When the stored shape changes, bump the storage keys in `App.tsx` (currently `gamenet-settings-v5`, `gamenet-sessions-v6`; theme: `gamenet-theme`, `gamenet-accent`).
- Timestamps drive timers (`segments[].from/to`), so running sessions survive reloads; cards re-render once per second only while running.
- TypeScript 6: don't add `baseUrl` (deprecated); the `@/*` alias is configured via `paths` and `vite.config.ts` (`import.meta.dirname`).
