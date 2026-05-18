# Frontend agent notes

## Modal / Panel style (Products + Settings)

- For product-related modals/panels in `/products` and settings pages (e.g. `/settings/categories`, `/settings/units`), prefer `AppResponsivePanel` and keep desktop width consistent with the Product Create / Product Detail panels.
- Default desktop width: `desktop-width="680px"` (unless the UI explicitly calls for a compact confirm modal).
- Keep header + footer patterns consistent with existing product panels (`compact-header`, `full-bleed-header`, sticky bottom action area).

## Page UI baseline (List pages)

- Use `AppPageHeader` with a search input that includes a clear (`x`) button when there is a query.
- Mobile actions: prefer icon-first buttons and hide text using `sm:inline` so desktop/tablet still shows labels.
- Summary section: compact 4-card grid (`grid-cols-4`, small uppercase label, `tabular-nums` values) to save vertical space.
- Table section: card header + count badge, sticky table header, and a right-aligned action column/button.
- Scrolling: prefer a single page scroll via `#app-shell-scroll-root` (avoid nested vertical scrolling containers). If needed, use `overflow-x-auto` for wide tables but keep vertical scrolling on the page.
