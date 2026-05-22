# Bills — Market Research

> Generated 2026-05-22 by a research agent surveying SMB AP / bills software. See [README.md](README.md) for the synthesis decisions distilled from this research.

## Summary

Surveyed 6 tools spanning AP-focused (Bill.com, Melio, Ramp, Mercury), accounting suites (QuickBooks Online, Wave, Xero), and open-source (Akaunting). For a 2-user internal tool tracking ~30-100 bills/month whose only real "job" is feeding a categorized CSV to the CPA, the dominant patterns are: a single "Bills to Pay" list with status tabs (Open / Overdue / Paid), a side-panel quick-view for bill detail, "Make Recurring" as an action on a regular bill (not a separate object type), and a forward cash-out forecast tile on the dashboard. Don't replicate the approval-routing, OCR, or ACH-rail complexity — those exist because these products are 50-1000 user platforms, not 2-user trackers.

## Solutions Reviewed

### 1. Bill.com
- **What it is:** The 800lb gorilla of SMB AP. Captures invoices via email/scan, routes for approval, pays via ACH/check/card, syncs to accounting. Built for finance teams of 3+.
- **Pricing:** $45-$79/user/mo plus per-transaction fees on ACH/check.
- **Bill entry flow:** Dedicated "New Bill" page. Vendor first, then invoice #, dates, amount, GL coding, optional approver. "Smart Data Entry" pre-fills based on prior bills from same vendor — single biggest UX win.
- **Bill index layout:** Tabs across the top (Inbox / Approve / Pay / Paid). Index is dense table: vendor, invoice #, due date, amount, status. Click row → detail page (not panel).
- **Recurring handling:** Separate "Recurring Bills" template object. You set vendor, amount, frequency, next due, days-in-advance — it spawns real bill rows on schedule.
- **UI patterns to steal:** Vendor memory (pre-fills GL code + payment terms on second-and-later bills from same vendor). Status-tab navigation.
- **Gaps:** Hugely overbuilt for 2 users. Pricing is a non-starter for our use case.

### 2. QuickBooks Online (Essentials+)
- **What it is:** Industry-default SMB accounting suite. Bills are a sub-feature of Expenses.
- **Pricing:** Bills feature requires Essentials = **$75/mo** (Simple Start at $38 doesn't include AP).
- **Bill entry flow:** "+ New" → Bill → modal-ish full page. Vendor, terms, bill date, due date, bill #, category lines, amount, tax, attachment. "Make recurring" link **at the bottom of the bill** — not a separate flow.
- **Bill index layout:** Bills sub-tab inside Expenses. Filter chips: Unpaid / Paid / Overdue / All. Sortable columns.
- **Recurring handling:** Three types — **Scheduled** (auto-creates), **Reminder** (pings you to create), **Unscheduled** (template only). The Reminder type is interesting for our use: less risk than auto-creating, more help than nothing.
- **UI patterns to steal:** "Make recurring" as an action on an existing bill (versus building a recurring object first). The Scheduled/Reminder/Unscheduled trichotomy.
- **Gaps:** Pay Bills is a separate screen — you select multiple bills, then choose payment account + date. That batch screen is overkill for us.

### 3. Xero
- **What it is:** QBO's chief competitor; cleaner UI, particularly the new "Bills to pay" refresh.
- **Pricing:** $20-$80/mo; bills included in all tiers.
- **Bill entry flow:** "+ Bill" → full page. Vendor, date, due, reference, line items with categories, attachment.
- **Bill index layout:** Best-in-class. "Bills to pay" with status tabs (Draft / Awaiting Approval / Awaiting Payment / Paid). Search bar at top updates dynamically. Date filters on the right. **"Compact view" toggle** in overflow menu.
- **Recurring handling:** "Repeating bills" — separate area, but you create them by copying an existing bill, not by building from scratch.
- **UI patterns to steal:**
  - **Quick View split-screen panel** — click a row, panel slides from right with bill detail; you can approve/edit without leaving the list. This is the single best pattern in the survey for our use case.
  - **Compact view toggle** for power users.
  - Date filter in the same row as search.
- **Gaps:** Some advanced filtering still missing per user forums (tracking categories, supplier location).

### 4. Melio
- **What it is:** Free AP tool aimed at micro-business. Pay vendors by ACH, debit, credit, or check. They make money on credit card fees.
- **Pricing:** Free for ACH; 2.9% for card.
- **Bill entry flow:** Three ingestion modes — **camera upload, email-to-Melio address, manual entry**. Manual is a short form on the home screen. The "forward your invoices to a dedicated email" pattern is the killer feature.
- **Bill index layout:** Bills tab, scheduled vs paid split, filter by vendor.
- **Recurring handling:** Schedule recurring payments to a vendor at chosen frequency.
- **UI patterns to steal:** Dedicated email address per workspace that auto-creates draft bills. Mobile-first home screen showing "next bills due."
- **Gaps:** Tied to actually paying — we just want to track.

### 5. Mercury Bill Pay
- **What it is:** Bill pay bundled into Mercury business banking. Free if you bank with Mercury.
- **Pricing:** Free; $35/mo for advanced workflows tier.
- **Bill entry flow:** AI extracts data from uploaded invoice (no copy-paste). Confirms extracted fields, you schedule the payment.
- **Bill index layout:** Single list under Workflows > Bill Pay. Status badges.
- **Recurring handling:** Supported, lightweight.
- **UI patterns to steal:** OCR-as-default rather than OCR-as-feature. The form is pre-populated; you correct rather than enter.
- **Gaps:** Requires Mercury banking integration.

### 6. Wave (now Wave Pro)
- **What it is:** Closest to our scope — free-ish accounting for solo/micro-business.
- **Pricing:** Free tier; Pro is $16/mo.
- **Bill entry flow:** Purchases > Bills > Create. Form fields: vendor, currency, date, due date, PO/SO, bill #, line items (item, category, qty, price, tax).
- **Bill index layout:** Simple list, vendor-grouped, status column.
- **Recurring handling:** **Doesn't have recurring bills.** Multi-year-old user request still not shipped. Workaround: re-categorize bank transactions to the right expense account.
- **UI patterns to steal:** The bill creation form structure (vendor → dates → line items → category) is the canonical minimum.
- **Gaps:** No recurring bills. Hard miss for our Vercel/Supabase/OtterText auto-charges.

### 7. Akaunting (open-source, brief mention)
- **What it is:** Self-hosted PHP/Laravel accounting suite. Free core; paid apps for advanced features.
- **Pricing:** Self-host free; SaaS $9-$45/mo.
- **Bill entry flow:** Standard vendor/date/items form. Auto-schedule bills is in the core feature list.
- **UI patterns to steal:** Dashboard "overdue invoices" widget as the home tile. Categories implemented as a tree of chart-of-accounts entries.
- **Gaps:** Heavy for our purposes; full COA we don't need.

## Cross-cutting patterns
1. **Status tabs over filter dropdowns.** Open / Overdue / Paid as primary navigation, not as a filter chip. Every tool does this.
2. **Bill detail = side panel, not page.** Xero's Quick View is the modern standard; QBO is moving the same direction.
3. **Recurring = action on a bill, not a separate object type.** You build a regular bill, then click "Make recurring" — this is more discoverable than a top-level "Recurring Bills" nav item.
4. **Vendor as a first-class entity.** Bills hang off vendors. Vendor record remembers default category + default payment method. This is what makes the second bill from Vercel a 5-second entry.
5. **Receipt is a single drag-drop on the bill form**, not a separate object. PDF/JPG/PNG attached to the bill row.
6. **Categories are flat or 2-deep** — only the accounting suites do full chart-of-accounts. For tax CSV the flat list is sufficient (Utilities, Software, Rent, Contractor, Supplies, Taxes/Fees, Other).
7. **Cash-out forecast** is universally a dashboard tile, not a sub-page: "$X due next 7 days / $Y due next 30 days."

## Interesting differentiators
- **Xero Quick View panel** — best-in-class detail-without-navigation pattern.
- **Bill.com "Smart Data Entry"** — second bill from same vendor auto-fills everything except amount/dates. Trivial to replicate with a vendor table.
- **Melio's email-to-bill ingestion** — `bills@thebarrax.com` could create draft bills from forwarded invoices. Plausibly Phase 2.
- **QBO Reminder-type recurring** — instead of auto-creating bills, it pokes you on the due date. Lower-stakes than auto-create, more helpful than nothing.
- **Mercury's OCR-first form** — flip the model: user uploads PDF first, form pre-populates, user confirms.

## Recommendations for our build

Build the minimum viable bill tracker. Concretely:

1. **Two tables:** `vendors` (id, name, default_category, default_payment_method, notes) and `bills` (id, vendor_id, amount_cents, due_date, paid_date nullable, category, payment_method, receipt_url nullable, notes, recurring_template_id nullable).
2. **One index page** at `/bills` with three status tabs: **Due Soon / Overdue / Paid**. Default sort: due_date ascending. Default filter: current month + next 30 days.
3. **Side panel for detail** (steal from Xero). Click row → panel from right with full bill + edit-in-place + mark-paid button.
4. **"Add Bill" = single modal**, not a page. Fields in order: vendor (typeahead, creates new on-the-fly) → amount → due date → category (pre-filled from vendor) → payment method (pre-filled) → drag-drop receipt → notes. **"Make this recurring" toggle at the bottom** — when on, expands to show frequency + end date.
5. **Recurring as a template, not a copy job.** `bill_templates` row with frequency + next_run_at + day_of_month. A cron creates the actual `bill` row 7 days before due. Use QBO's **Reminder** semantics by default — creates a draft you confirm, doesn't auto-mark as a known liability.
6. **Mark-paid action:** Modal with paid_date (default today), amount_paid (default = bill amount, allow partial), payment_method (default from vendor). No bank reconciliation — out of scope.
7. **Dashboard tile** "Bills due next 7 / 30 days" with $ totals and count. Steal Xero's compact list.
8. **Year-end CSV export:** filter by paid_date range + category, export. This is the whole point.

Explicit non-goals (don't build): approval workflows, OCR, ACH/check payment rails, bank-feed reconciliation, multi-currency, vendor portals, 1099 generation (CPA handles), partial-pay history beyond a single amount_paid field.

## Suggested Linear issues
- **Bills: schema + vendors + bills tables** — base data model with categories as enum, payment_methods as enum, soft-delete column.
- **Bills: index page with Due/Overdue/Paid tabs** — table view, default sort due_date asc, current-month filter.
- **Bills: Quick View side panel** — click row opens right panel with detail + edit-in-place + mark-paid.
- **Bills: Add Bill modal** — vendor typeahead with on-the-fly create, receipt drag-drop, "make recurring" toggle.
- **Bills: vendor memory** — second bill from same vendor pre-fills category + payment_method from vendor row.
- **Bills: recurring templates + cron** — `bill_templates` table; daily cron at 7am CT creates draft bills 7 days before due_date. Reminder-type (draft, not auto-paid).
- **Bills: Mark Paid action** — modal capturing paid_date, amount_paid, payment_method. Validate partial-pay edge case.
- **Bills: dashboard tile "Money out next 7/30 days"** — count + total, link to filtered index.
- **Bills: receipt upload to Supabase Storage** — bucket + RLS + thumbnail in detail panel.
- **Bills: year-end CSV export** — date range + category filter, CSV download formatted for Greg's CPA.
- **(Phase 2) Bills: forward-to-email ingestion** — `bills@` address that creates draft bills from PDF attachments.

---

## Sources

- [Bill.com Setup Reference Guide: Using Accounts Payable](https://assets.ctfassets.net/4xstiwmv0r7j/48PfTOV4NOIC2wESaMUmwU/9c4168925780ad60cde7effa72731d9d/Bill.com_Setup_Reference_Guide_May_2018_-_Using_AP.pdf)
- [Schedule and manage a recurring bill - BILL Help Center](https://help.bill.com/direct/s/article/115005953486)
- [BILL Pricing & Plans](https://www.bill.com/product/pricing)
- [Enter bills in QuickBooks Online - Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/pay-bills/enter-bills-record-bill-payments-quickbooks-online/L1e9Ce5J7_US_en_US)
- [How to set up a recurring bill - QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/memorize-transactions/set-recurring-bill/L4i07ozSS_US_en_US)
- [QuickBooks Online Pricing 2026 - NerdWallet](https://www.nerdwallet.com/business/software/learn/quickbooks-pricing)
- [Introducing a new bills experience in Xero](https://blog.xero.com/us/news-events/bills-to-pay-refresh/)
- [A faster way to manage your bills with Quick View - Xero Blog](https://blog.xero.com/product-updates/quick-view-manage-bills/)
- [Pay Bills on Time With Xero Accounts Payable Software](https://www.xero.com/us/accounting-software/pay-bills/)
- [Create a bill - Wave Help Center](https://support.waveapps.com/hc/en-us/articles/208622026-Create-a-bill)
- [Wave Feature Request: Recurring Bills](https://community.waveapps.com/discussion/comment/11019)
- [Melio: Easy Bill Capture for Automated Bill Pay](https://meliopayments.com/easy-bill-capture/)
- [Melio Payment Solution for Small Businesses](https://meliopayments.com/payment-solution-for-small-businesses/)
- [Mercury Bill Pay overview](https://support.mercury.com/hc/en-us/articles/28768945847316-Bill-Pay-overview)
- [Mercury Bill Pay](https://mercury.com/bill-pay)
- [Ramp Bill Pay: Accounts Payable Automation Software](https://ramp.com/accounts-payable)
- [Ramp Bill Pay OCR](https://support.ramp.com/hc/en-us/articles/45686841394579-Ramp-Bill-Pay-OCR)
- [Akaunting Open-Source Accounting Software](https://akaunting.com/open-source-accounting-software)
- [Cash Flow Forecasting Software - Xero](https://www.xero.com/us/accounting-software/analytics/cash-flow/)
