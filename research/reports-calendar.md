# Reports & Calendar — Market Research

> Generated 2026-05-22 by a research agent surveying unified calendars + financial-report tools. See [README.md](README.md) for the synthesis decisions distilled from this research.

## Summary

Modern back-office calendars converge on one pattern: a single grid that overlays multiple sources, with a left-rail of toggleable, color-coded calendars and a click-to-open detail panel. Modern report tools (Puzzle, Xero, Bench) have moved past the QuickBooks "wall of numbers" style toward drill-down tables with sparkline context, exporting to both Excel and CSV — CSV being the format CPAs actually re-import. For our use case (2 users, 4 sources, daily calendar / yearly reports), the right answer is a custom Tailwind month grid + a table-first reports module with rock-solid CSV exports — not a heavyweight library.

## Calendar Solutions Reviewed

### 1. Google Calendar
- **What it is:** The dominant calendar UX; users already know it. Free.
- **Multi-source aggregation:** Each connected account/calendar is a separate "source" overlaid on one grid. Left-rail checkboxes toggle visibility. Up to ~5–7 distinct colors stay readable; beyond that the grid becomes noise.
- **View modes:** Day / 4-day / Week / Month / Year / Schedule (agenda). Default is Week on desktop, Schedule on mobile.
- **Event detail UX:** Click event → small popover with title, time, source calendar, location, description. "Open event" link expands to full edit screen. No native side panel.
- **UI patterns to steal:** (a) left-rail calendar list with colored checkboxes acts as both legend and filter; (b) "more" overflow chip when a day has too many events; (c) hover preview on dense weeks; (d) agenda view as the mobile default — a flat chronological list is far better than a tiny grid on a phone.
- **Gaps:** Can't filter events by color natively — surprising omission that we shouldn't repeat. No "next 30 days money out" forecast view.

### 2. Fantastical
- **What it is:** Mac/iOS power-user calendar ($4.75/mo individual, $10/mo family). Aggregates iCloud, Google, Exchange, Office 365, Todoist, Reminders into one feed.
- **Multi-source aggregation:** Best-in-class. "Calendar Sets" let you save a named subset of sources (e.g., "Work", "Personal") and switch the whole grid with one click — equivalent to our "show only Compliance + Bills" filter.
- **View modes:** Day, Week, Month, Year, plus an always-visible right sidebar "DayTicker" agenda list. The DayTicker is the killer feature for deadline-heavy use: a scrollable chronological list that stays visible regardless of grid view.
- **Event detail UX:** Click event → inline expanding panel below the event in the grid (not a floating popover that occludes other days). Sleeker than Google's popover.
- **UI patterns to steal:** (a) Calendar Sets as saved filter presets; (b) persistent agenda rail alongside grid; (c) inline expansion vs floating popover; (d) natural-language event entry ("Pay vendor $500 next Tuesday").
- **Gaps:** Mac/iOS only — not directly usable, but design language is worth copying.

### 3. Notion Calendar (database view)
- **What it is:** Calendar as a view of an underlying database. Free with Notion.
- **Multi-source aggregation:** Doesn't aggregate cross-database natively; one calendar view = one database. The pattern translates well though: each of our sources (Compliance, Bills, Vendors, 1099) can be a "view" of a unified events table — UNION-style query in SQL.
- **View modes:** Month is the default and dominant view; week was added later. No agenda built into the calendar itself.
- **Event detail UX:** Click event → full page side-drawer opens with all properties editable. Drawer-over-grid is the modern default.
- **UI patterns to steal:** (a) color-by-property (status, type, tag) — exactly what we need to map source → color; (b) multiple saved views of the same data with different color logic; (c) side-drawer detail vs popover.
- **Gaps:** Month-only mindset breaks down for time-sensitive items; cluttered for >30 items/month.

### 4. Linear (cycle/due-date pattern)
- **What it is:** Issue tracker with due-date overlays. Not a calendar app per se, but its deadline-on-list pattern is widely copied.
- **Multi-source aggregation:** N/A.
- **UI patterns to steal:** (a) compact calendar icon next to items with color indicating overdue / due-soon / future; (b) hover shows "due in 3 days" / "5 days overdue"; (c) deadline severity color ramp (gray → yellow → red) — perfect for compliance filing deadlines.

## Report Solutions Reviewed

### 1. Puzzle
- **What it is:** AI-powered accounting for startups (~$200/mo plans). Built explicitly to replace QuickBooks/Pilot with a cleaner UX.
- **Report types:** Cash Activity, Balance Sheet, Income Statement (P&L), plus burn / runway / ARR metric tiles on the dashboard.
- **Layout:** Dashboard is metric-tile first (burn, runway, cash balance as big numbers with sparklines), then standard P&L table below. Auto-categorization with an "Ask AI" review queue.
- **Export quality:** CSV + Excel; well-formatted with proper account hierarchy.
- **UI patterns to steal:** (a) "money in / money out" email summary — translates to our "next 30 days money out" tile; (b) dashboard tiles for headline numbers before drilling into full statements; (c) AI-assisted categorization review queue (overkill for us, but worth noting).
- **Gaps:** Startup-focused (ARR, runway) — irrelevant metrics for a training facility.

### 2. Xero Reports
- **What it is:** Mid-market accounting, $20–80/mo. Strong reporting feature set.
- **Report types:** P&L, Balance Sheet, Cash Summary, Aged Payables/Receivables, Trial Balance, plus custom layouts. "Tracking Categories" enable cost-center P&Ls.
- **Layout:** Classic accounting table with Income / COGS / Gross Profit / Expenses / Operating P&L groupings. Every line is a hyperlink.
- **Date range pickers:** This Month, Last Month, This Quarter, Last Quarter, YTD, Last FY, Custom — the canonical preset list to copy verbatim.
- **Drill-down:** Click any number → transaction list filtered to that account/period → click any transaction → full source document. Three-click maximum from summary to receipt.
- **Export quality:** CSV + PDF + Google Sheets + direct connectors to Excel/Power BI. CSV is clean and re-importable.
- **UI patterns to steal:** (a) clickable numbers throughout the report; (b) preset date pickers; (c) "compare to prior period" toggle; (d) export buttons always visible in the report header, not buried in a menu.
- **Gaps:** Built for accountants — we don't need the depth.

### 3. QuickBooks Online Reports
- **What it is:** Industry standard, $35–235/mo. The format every CPA expects.
- **Report types:** ~50 stock reports including P&L, Vendor Spend Summary, 1099 Detail, 1099 Contractor Summary.
- **Layout:** Dense table; cluttered but comprehensive.
- **Export quality:** **Excel only for P&L in QBO — no direct CSV.** This is a known annoyance and a clear differentiator opportunity for us.
- **UI patterns to steal:** (a) 1099 Detail report column order is the CPA-expected canonical: Vendor / Tax ID / Address / Box 1 (NEC) / YTD Total — match this; (b) "Customize" panel with date range, columns, filters, header/footer all in one place.
- **Gaps:** No CSV for P&L; UI is dated; expensive for a 2-person shop.

### 4. Bench
- **What it is:** Full-service bookkeeping ($249–399/mo). Monthly P&L + Balance Sheet + year-end tax packet delivered by humans.
- **Report types:** P&L, Balance Sheet, year-end CPA package.
- **Layout:** Clean, minimal tables — closer to a financial PDF than a software UI.
- **Export quality:** PDF + Excel + CSV. The "year-end packet" concept — a single bundled download with P&L, expense detail, 1099 list, receipt index — is the model to copy for our CPA export.
- **UI patterns to steal:** **The year-end packet.** One button → ZIP containing P&L.csv, expenses_by_category.csv, contractors_1099.csv, receipts/ folder with an index.csv. That's the gold standard for CPA handoff.

## Cross-cutting Patterns

- **Color count ceiling:** 5–7 distinct colors maximum before a grid becomes noise. We have 4 sources — fits comfortably.
- **Toggleable source rail:** Universal pattern. Checkboxes on the left, double as legend and filter.
- **Side-drawer over popover:** Notion-style side drawers are winning over Google-style floating popovers for detail views — they don't occlude the grid and can hold more content.
- **CSV + PDF, both always:** PDF for handing to a CPA's eyes; CSV for the CPA's re-import into their software. Excel is a "nice to have" — `xlsx` package adds 500KB to bundle for a feature that CSV already serves.
- **Drill-down is non-negotiable:** Click any number → see the transactions → click any transaction → see the source. Three clicks max.
- **Preset date ranges are universal:** This Month, Last Month, This Quarter, Last Quarter, YTD, Last Year, Custom.
- **Money-out forecast is rare but valued:** Xero's "next 30 days" cash forecast is one of its most-cited features. None of the leading tools combine it with compliance deadlines — clear differentiator for us.

## Interesting Differentiators

- **Calendar Sets (Fantastical):** Saved filter presets — e.g., "Tax Season" set shows only Compliance + 1099, hides Bills + Vendors.
- **Linear-style overdue ramp:** Color-shift events as the due date approaches (gray → yellow → red) — perfect for compliance filings.
- **Year-end packet (Bench):** Single bundled ZIP for CPA handoff. Way better than asking the CPA to download 4 separate CSVs.
- **Cash forecast tile on calendar (Xero-inspired):** "Money out next 30 days: $X" persistent on the calendar header.
- **Tracking categories (Xero):** A second dimension (location, department) on top of expense categories — overkill for us, but worth noting if we ever add multi-location.

## Recommendations for our build

- **Calendar library:** **Custom Tailwind month grid.** Reasoning: react-big-calendar requires a date adapter (moment/date-fns), pulls in styling we'd fight, and isn't built for "deadline tracker" use; FullCalendar premium is $480/dev for features we don't need and its free build is heavy. Our use case is 4 source types, ~30–100 events/month, no drag-and-drop scheduling, no recurring-event editor — a hand-rolled 7-column grid with a left source-rail and a right detail drawer is ~300 lines and zero deps. Use `date-fns` (already common) for date math.
- **Default view:** **Month on desktop, Agenda list on mobile.** Add Week as a secondary toggle. Skip Day view (low value for a deadline tracker — there's rarely more than 2 things on a day).
- **Event detail UX:** **Right side-drawer** (Notion pattern), 400px wide, with source badge, full details, link to source record. Not a popover.
- **Source filter:** Left rail with 4 colored checkboxes (Compliance / Bills / Vendors / 1099) doubling as legend. Persist filter state in localStorage.
- **Report layout:** **Table-first with sparkline context.** Dashboard top: 3–4 tiles (YTD Revenue, YTD Expenses, Net, Money Out Next 30d). Body: standard P&L table grouped Income / Expenses / Net, every number clickable → drill to underlying transactions. Avoid sankey / stacked bars — CPAs want tables.
- **Date range presets (copy from Xero):** This Month, Last Month, This Quarter, Last Quarter, YTD, Last Year, Custom. YTD is the default.
- **Year-end CSV format (Bench-inspired):**
  - One "Download Year-End Packet" button → ZIP containing:
    - `pnl_2026.csv` (Account / Type / Jan / Feb / ... / Dec / Total)
    - `expenses_by_category_2026.csv` (Category / Subcategory / Total / Transaction Count)
    - `contractors_1099_2026.csv` (Name / Tax ID / Address / YTD Total / Box) — QBO column order
    - `receipts_index.csv` (Date / Vendor / Amount / Category / Filename)
    - `receipts/` folder with PDFs/images
  - All CSVs use ISO dates (`2026-01-15`), no currency symbols, no thousands separators — parser-friendly.
- **Mobile calendar handling:** Agenda list is default on <768px. Group by day with a sticky day header. Tap event → full-screen detail (not a drawer). Avoid trying to render a 7-column grid on a phone.
- **Money-out forecast:** Single calendar header tile, "Next 30 days: $X across N items," click → filtered agenda view. Inexpensive to build, high-perceived-value.

## Suggested Linear issues

- **Build unified calendar grid (custom Tailwind, month + agenda views)** — replaces an external library decision; matches our 4-source use case at 300 lines.
- **Source filter rail with persisted state** — left-rail checkboxes that double as legend and filter; localStorage persists.
- **Event side-drawer detail panel** — 400px right drawer with source-typed rendering and link to source record.
- **Mobile agenda view with day-grouped sticky headers** — default on <768px; tap-through to full-screen detail.
- **Deadline severity color ramp (Linear pattern)** — gray → yellow → red as compliance items approach due date.
- **Reports dashboard tiles (YTD Revenue / Expenses / Net / Money Out Next 30d)** — Puzzle-inspired header tiles on the reports home.
- **P&L table with clickable drill-down to transactions** — Xero-inspired three-click max from summary to source.
- **Year-end packet ZIP exporter (Bench pattern)** — single-button bundled CSV + receipts download for CPA handoff.
- **Standard date-range preset picker** — This Month / Last Month / This Quarter / Last Quarter / YTD / Last Year / Custom.
- **1099 contractor report (QBO column order)** — Name / Tax ID / Address / YTD Total / Box for direct CPA re-import.
- **Calendar header "money out next 30 days" forecast tile** — small differentiator, high perceived value; click → filtered agenda.
- **CSV export contract test** — automated test asserting ISO dates, no currency symbols, no thousand separators across all report exports (year-end correctness is load-bearing).

---

## Sources

- [React FullCalendar vs Big Calendar — Bryntum](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/)
- [react-big-calendar vs fullcalendar — NPM Compare](https://npm-compare.com/fullcalendar,react-big-calendar)
- [Fantastical — Flexibits](https://flexibits.com/fantastical)
- [Fantastical vs Google Calendar — Morgen](https://www.morgen.so/blog-posts/fantastical-vs-google-calendar)
- [Use Notion Calendar with Notion](https://www.notion.com/help/use-notion-calendar-with-notion)
- [Mastering Notion Calendar View Color Customization](https://ones.com/blog/mastering-notion-calendar-view-color-customization/)
- [Linear Due Dates docs](https://linear.app/docs/due-dates)
- [Calendar UI Examples — Eleken](https://www.eleken.co/blog-posts/calendar-ui)
- [Google Calendar color filtering thread](https://support.google.com/calendar/thread/9237497/filter-events-in-calendar-based-in-colour?hl=en)
- [How to Color Code Google Calendar — ClickUp](https://clickup.com/blog/how-to-color-code-google-calendar/)
- [QuickBooks Online P&L CSV export limitations — QBO Support](https://qbo.support/how-do-i-export-a-profit-and-loss-report-to-csv-not-to-excel-using-quickbooks-online/)
- [Puzzle — Reports overview](https://help.puzzle.io/en/articles/8441346-what-reports-does-puzzle-provide)
- [Puzzle product page](https://puzzle.io/)
- [Xero Reports guide — Coupler.io](https://blog.coupler.io/xero-reports/)
- [Xero Export and print a report](https://central.xero.com/s/article/Export-or-print-a-report)
- [Wave 1099-NEC reporting](https://support.waveapps.com/hc/en-us/articles/360048419412-Form-1099-NEC-Generate-and-file-contractor-Non-employee-Compensation-forms)
- [Bench Financial Reporting](https://www.bench.co/small-business-financial-reporting)
- [Xero Cash Flow Forecasting](https://www.xero.com/us/accounting-software/analytics/cash-flow/)
