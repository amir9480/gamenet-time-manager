# UI / UX design rules

Read this before building or changing any UI. It captures what the owner considers good UI/UX for this app, mostly learned from corrections. `CLAUDE.md` rules (shadcn only, RTL logical classes, no native dialogs, guided tours, rem sizing) still apply; this file is about layout, spacing and responsiveness.

## Principles
1. **Use space efficiently.** No big empty areas, no controls stranded at the far edge with nothing near them, no tall stacks that fit side by side. If a form has N fields, use N columns (up to a sensible max), not a fixed 3-column grid with holes.
2. **Everything is responsive, mobile and tablet first.** Design the narrow layout first (one column, thumb-friendly), then widen. Test at ~360px, ~768px, ~968px and desktop. Nothing may overflow the dialog or scroll horizontally (except deliberate `ScrollFade` strips).
3. **Everything lines up.** Labels share one column, controls start on one edge, units/suffixes have a fixed width, trash/action buttons share one column. Misaligned left edges are the most common complaint.
4. **Separate what is separate.** Repeated items (rows on mobile, list entries) get a visible container (border + `bg-muted/40` + padding) so one item never runs into the next.
5. **Explain with hints, not paragraphs.** Per-field descriptions go in a `HelpHint` («?» popover, hover on desktop, tap on mobile) beside the label, never as a muted paragraph under the field. Keep one short intro line per tab/dialog at most.
6. **Make the important thing obvious.** A powerful shortcut (e.g. quick fill) gets its own highlighted panel with a title and one explanatory sentence, not a tiny inline row.
7. **Good defaults.** New things start in the most useful state (e.g. a new price interval has all weekdays selected). Don't make the user undo defaults.
8. **Prefer direct controls over lists of checkboxes.** Toggle buttons/chips (`Button` with `aria-pressed`, `variant` default vs outline) for small sets like weekdays, with a «همه» shortcut; segmented/radio cards for short choices.

## Layout recipes (use these, don't reinvent)
- **Settings-style field rows:** `SettingRow` (`settings-dialog.tsx`): label (+ optional `HelpHint`) in a fixed 15rem column, control in the next column from `sm:`; stacked on mobile. `inline` keeps label + switch on one line on mobile; `top` aligns the label with tall controls (swatches, icon picker). Copy this pattern for new form-like screens instead of ad-hoc flex rows.
- **Fields that should flow with the available width:** the control wrapper is an `@container` (Tailwind v4 container queries); inner groups use `@lg:grid-cols-2`, so they split into two columns only when there is room, regardless of the viewport. Prefer container queries over `sm:`/`md:` inside dialogs/tabs because the available width depends on the dialog, not the screen.
  - **Gotcha:** `@container` (inline-size containment) makes an element's intrinsic width 0. Never put it on a flex child that must size to its content (e.g. the control side of an inline label+switch row); it collapses and the control overflows.
- **Label above input in grids:** inside multi-field groups (quick fill, time range) every input has a small `text-xs text-muted-foreground` label above it and fills its cell (`w-full`/`min-w-0 flex-1`). Units («تومان», «درصد») sit outside the input in a fixed-width (`w-12`/`w-24 shrink-0`) span so inputs end at the same edge.
- **Equal columns:** use `grid` with equal tracks (`grid-cols-2`, `sm:grid-cols-[...]`), not flex items sized by their text.
- **Tables-as-rows (catalog editors):** one CSS grid shared by the header row and every data row (same `grid-cols-[…]`), with the leading radio/handle in a narrow column and the delete button in the last. Titles/name inputs that span columns use explicit placement (`col-[2]`, `sm:col-[2/4]`), never `col-start-N` + `col-span-M` together (`col-span` resets the start and breaks placement). Add-buttons below such a list align with the first content column (`ms-8`), not the radio column.
- **Form footer:** hint/helper text on the start side (`flex-1 min-w-48`), primary + cancel buttons at the end, separated by a `border-t`; wraps on narrow screens. Error text sits directly above it.
- **Tab strips and chip rows that can overflow:** wrap in `ScrollFade` (`scroll-fade.tsx`), never hand-roll `overflow-x-auto` + hidden scrollbar.
- **Dialogs:** content scrolls with the page (no inner `max-h/overflow`); every dialog with entered data goes through `useDiscardGuard`; dialogs with a guide get a `TourHelpButton`.
- **Touch targets:** at least ~2rem tall on mobile. The `Button` component has mobile size overrides; when a compact control is wanted add `max-md:h-auto`/`max-md:size-8` to beat them. Swatches/chips use `size-8`.

## Responsive checklist (run before finishing any UI change)
- [ ] 360px wide: one column, no horizontal scroll, switches/buttons inside the dialog, repeated items visually separated.
- [ ] ~768px (tablet) and ~968px: columns don't get cramped (inputs showing «1,0» clipped = too many columns → use a container query or fewer columns).
- [ ] Desktop: no empty gaps, controls aligned on shared edges, similar rows have identical structure.
- [ ] RTL: logical classes only (`ms-/me-/ps-/pe-/start-/end-`), numeric inputs `dir="ltr"`, sliders `dir="ltr"`.
- [ ] Sizes in `rem`, so the interface-scale setting keeps proportions.
- [ ] `pnpm build` passes; if a guide points at what you touched, update its steps and say so.

## Copy / wording
Persian UI text follows the wording rules in `CLAUDE.md` («تایم», «نوع دستگاه», «بوفه»). Hints are one or two plain sentences with a concrete example when it helps (e.g. «۸۰ یعنی ۲۰٪ تخفیف»). Button labels are short verbs («اعمال روی همه», «ذخیره رمز»).

## Process
- When the user sends a screenshot saying something is "unaligned" or "messy", fix the root cause in the shared structure (grid tracks, shared component), not just the one symptom, and check the same pattern elsewhere in the file.
- If a new screen needs a layout not covered above, follow the principles, then add the recipe here.
