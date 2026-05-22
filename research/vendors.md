# Vendors — Market Research

> Generated 2026-05-22 by a research agent surveying SMB vendor management software. See [README.md](README.md) for the synthesis decisions distilled from this research.

## Summary

Vendor management in the SMB segment splits into two camps: full AP platforms (Bill.com, Ramp, Melio) that wrap vendor records around invoice/payment workflows, and accounting suites (QuickBooks, Xero) where vendors are a sub-module of the chart of accounts. Open-source ERPs (ERPNext, Odoo) and lightweight DB tools (Airtable, Notion) round out the spectrum. For a 2-user / 50-vendor internal tool, the table-stakes set is small and well-defined; almost every "feature" the SaaS players sell beyond that is bloat for our use case.

## Solutions Reviewed

### 1. QuickBooks Online (vendor module)
- **What it is:** Accounting suite where "Vendors" lives under Expenses. Every vendor is a Contact with a transaction list and 1099 toggle.
- **Pricing:** Bundled in QBO ($35–$235/mo). 1099 e-file ~$15 base + per-form.
- **Vendor record fields:** Display name, company, primary contact, email, phone, billing address, payment terms (Net 15/30), opening balance, account number, default expense account, tax ID (EIN/SSN), business ID, 1099 tracking checkbox, attachments.
- **Relevant features:** "Invite contractor to add their own tax info" — sends a secure W-9 link so the contractor self-populates the TIN; the SMB never types it. TIN validation against IRS records via integrations (Track1099).
- **UI patterns to steal:** Vendor list with searchable, sortable columns (name, phone, email, open balance, action button). Detail page = tabs for Transactions / Vendor Details / Notes / Attachments. "Money bar" at top of detail page showing open balance + overdue.
- **Gaps:** No native YTD-spend total on the detail page itself — you have to run a separate report (long-standing user complaint). Don't replicate this gap.

### 2. Bill.com
- **What it is:** AP-first platform. Vendor record exists to receive payments; bill workflow is the primary noun.
- **Pricing:** $45–$79/user/mo; 1099 e-file $0.65/form in 2026.
- **Vendor record fields:** Legal name, DBA, address, phone/email, federal tax classification (individual/sole prop/LLC/C-corp/S-corp/partnership), TIN, payment method (ACH/check/virtual card/intl wire), payment email, default GL account, 1099-eligible flag, attachments.
- **Relevant features:** **W-9 Agent** — vendor self-serves a W-9 via secure link, every field validated against IRS rules, eliminates ~80% of manual collection steps. Tax classification drives 1099 eligibility automatically (corps excluded).
- **UI patterns to steal:** Vendor profile shows "Recent bills" feed + cumulative paid-to-date in a side panel. Sensitive fields (TIN, bank acct) masked by default with a reveal button.
- **Gaps:** Heavy AP machinery (approval workflows, sync engines) is overkill for 2 users.

### 3. Ramp (Bill Pay + Vendor Management)
- **What it is:** Spend management with a free Bill Pay tier that includes vendor management as a first-class object.
- **Pricing:** Free core; $15/user/mo for Plus (multi-entity, global). ACH free from Ramp Business Account.
- **Vendor record fields:** Name, contact, payment instructions, tax ID, 1099 flag, default category, attached documents.
- **Relevant features:** AI-driven vendor consolidation — automatically merges duplicate vendor records when multiple bills come in with slight name variations. Vendor "intelligence" surfaces a SaaS-subscription view (which Ramp cards have charged that vendor).
- **UI patterns to steal:** Free-form **per-vendor activity feed** (chronological mix of bills, payments, card charges, notes). The activity timeline is the detail page, not a separate tab.
- **Gaps:** Tied to Ramp's card/banking ecosystem; not useful unless you bank with them.

### 4. Xero (Contacts + Tax Details)
- **What it is:** Accounting suite. Suppliers/customers unified as "Contacts"; flagged with `is_supplier`.
- **Pricing:** $20–$80/mo.
- **Vendor record fields:** Contact name, primary person, addresses (postal + street), phones, email, default currency, payment terms, default account, tax settings, **Tax Details panel** (US) with W-9 request + status.
- **Relevant features:** Single Contact model — vendor and customer can be the same record (handy if a contractor is also occasionally a member). Secure W-9 request link populates Tax Details automatically.
- **UI patterns to steal:** **W-9 status badge** on the contact card (Requested / Received / Validated / Missing). Treat W-9 as a first-class status, not a buried file.
- **Gaps:** "1099 contact" view is separate from the main contact page (users have complained for years) — don't split these.

### 5. Airtable / Notion vendor templates
- **What they are:** Generic DB-as-spreadsheet templates. Closest analogs to a from-scratch internal build.
- **Pricing:** Free–$24/user/mo.
- **Common fields across templates:** Vendor name, type/category (Subscription / Utility / Contractor / Supplier / Government), status (Active/Inactive), primary contact (name, email, phone), payment method, payment terms, contract start/end, renewal date, total spend (rollup from linked bills table), notes, attachments (W-9, COI, contract), internal owner.
- **Relevant features:** Linked-record pattern: `Vendors` ↔ `Bills` ↔ `Categories`. Rollup field auto-sums YTD spend from the linked Bills table. Views (Active, Needs W-9, Renewals This Quarter) replace bespoke filters.
- **UI patterns to steal:** **Saved views as workflow** — "1099 vendors missing W-9" is a filtered view, not a separate page. Linked-record rollups for spend totals (we'd do this with SQL aggregates, same outcome).
- **Gaps:** No security model for sensitive fields (TINs sit in plain cells); no audit log.

### 6. ERPNext / Odoo (open source, for reference)
- **Standard fields:** Supplier name, type (Company/Individual), supplier group/category, default currency, payment terms, primary address, primary contact, tax ID, default payable account, hold flag, "is_frozen", attachments, vendor portal toggle.
- **Worth noting:** Both have a **"supplier hold"** concept (block new POs/payments without deleting the record) and **supplier groups/tags** for categorization. Odoo's vendor record uses tabs (Contacts, Sales/Purchase, Invoicing, Internal Notes) that scale well as the record matures.

## Cross-cutting patterns (table stakes)

Every solution surveyed has these fields on a vendor record:
- Legal name + display/DBA
- One primary contact (name, email, phone)
- Billing address
- Payment method on file (ACH/check/card/wire)
- Default expense category / GL account
- Tax ID + 1099 eligibility flag + business classification (drives whether 1099 is required)
- Notes / internal comments
- Attachments (W-9, contract, COI)
- Status (Active / Inactive / On Hold)

YTD-spend display is universally a **list of recent transactions + a single sum** at the top of the detail page. Charts are rare and only show up in spend-management tools (Ramp, Coupa). For 50 vendors, a list + sum is enough.

Sensitive data (TIN, bank account): every SaaS platform **masks by default** and requires explicit reveal. None of them encrypt at the application layer beyond what the DB provides — they rely on row-level access control + audit logging.

1099-eligibility pattern: a **boolean toggle on the vendor** + a **business classification dropdown** (Individual/Sole Prop/Partnership/LLC/Corp). Classification = Corporation auto-disables 1099 in most platforms. W-9 collection is increasingly **self-serve via secure link**, not manual data entry by staff.

One-off vs recurring: no platform formally distinguishes them. The pattern is to create the vendor record once (even for one-offs), tag it `Active` while in use, then archive — not delete. This preserves the bill history.

## Interesting differentiators (worth stealing)

- **W-9 status as a first-class field** (Xero) — Requested / Received / Validated / Missing on the vendor card.
- **Activity feed as the detail page** (Ramp) — chronological mix of bills, notes, status changes. Don't bury history in a sub-tab.
- **Vendor categories as the primary index axis** (Odoo) — the index page should default to grouped-by-category, not flat alphabetical.
- **"Hold" status, not delete** (ERPNext) — preserves history.
- **Self-serve W-9 link** (QBO, Bill.com, Xero) — saves data entry and avoids tax ID flying through email.

## Recommendations for our build

### Include in V1
- Vendor record with: legal name, DBA, category (enum: Subscription / Utility / Contractor / Supplier / Government / Other), primary contact (name, email, phone), billing address, payment method (enum), default expense category, 1099-eligible flag, business classification, tax ID (masked, reveal-on-click), status (Active / Inactive / Hold), notes, attachments.
- Vendor index: grouped by category, searchable, columns for name / category / YTD spend / status.
- Vendor detail page: header with YTD-spend sum + status badge + W-9 status badge; single activity feed below (bills + payments + notes interleaved by date).
- Attachments slot with named expected docs: W-9, Contract, COI.
- 1099 readiness view (saved filter): all `1099_eligible = true` vendors with W-9 status visible at a glance.

### Defer
- Approval workflows (overkill for 2 users).
- Vendor portal / self-serve W-9 link (do manual W-9 upload in V1; revisit if it becomes a chore).
- Spend charts (sum + transaction list is enough at 50 vendors).
- Multi-currency, multi-entity.
- Vendor performance metrics / scorecards.

### Deliberately NOT build
- Tier / "preferred vendor" concept — not useful for an internal back-office at this scale; category + status covers it.
- Bill approval routing — 2 users, no need.
- Custom vendor fields / form builder — pick the right fixed set up front.
- Anything resembling a procurement workflow (RFQs, POs). Bills land in the system after the fact; we're not procuring.

## Suggested Linear issues

- **Vendor data model + migration** — Define the `vendors` table (fields above) and a `vendor_attachments` table; migration with no seed data.
- **Vendor index page** — Grouped-by-category list with search, status pill, YTD spend column.
- **Vendor detail page (activity feed)** — Header (name, status, YTD, W-9 badge) + interleaved activity feed of bills/payments/notes.
- **Tax ID masking + reveal** — Mask TIN in all views; reveal-on-click logged to an audit table. Prevents shoulder-surfing and creates accountability.
- **1099 readiness view** — Saved filter listing 1099-eligible vendors with W-9 status; export CSV for year-end filing prep.
- **Vendor attachments (W-9 / Contract / COI)** — Named slots, Supabase Storage, RLS so only staff can read. Justification: physical W-9s and contracts need a single canonical home; email/Drive scatter is the current failure mode.
- **Hold status + archival rules** — Add `status = hold` and prevent deletion of vendors with linked bills. Soft-delete with `deleted_at` instead. Preserves financial history.

---

## Sources

- [QuickBooks Online vendor setup for 1099s](https://quickbooks.intuit.com/learn-support/en-us/help-article/payroll-setup/set-contractors-track-1099s-quickbooks/L4wX1Ge0e_US_en_US)
- [QuickBooks: Invite contractor to add tax info](https://quickbooks.intuit.com/learn-support/en-us/help-article/account-management/invite-contractor-add-tax-info/L9QgBNvRy_US_en_US)
- [QuickBooks vendor transactions view](https://quickbooks.intuit.com/learn-support/en-us/help-article/vendor-management/view-vendor-transactions/L338TnVyK_US_en_US)
- [Bill.com 1099 filing product page](https://www.bill.com/product/1099-filing)
- [Bill.com W-9 management](https://help.bill.com/direct/s/article/000002843)
- [Bill.com W-9 Agent](https://help.bill.com/direct/s/article/000004550)
- [Ramp Bill Pay](https://ramp.com/accounts-payable)
- [Ramp pricing](https://ramp.com/pricing)
- [Xero 1099 filing](https://www.xero.com/us/accounting-software/run-financial-reports/file-1099/)
- [Xero request W-9 details](https://central.xero.com/s/article/Request-W-9-details-from-your-1099-contacts)
- [Melio review and pricing 2026](https://vitalrecordsinc.com/melio-review-2026-features-pricing-pros-con/)
- [Airtable Vendor Management template](https://www.airtable.com/templates/vendor-management/exphFFedaHndN8IGK)
- [Airtable vendor management guide](https://www.optimizeis.com/blogs/beyond-the-spreadsheet-a-guide-to-airtable-vendor-management-and-procurement-automation)
- [Notion vendor management templates](https://www.notion.com/templates/category/vendor-management)
- [ERPNext supplier source (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/buying/doctype/supplier/supplier.py)
- [ERPNext procurement overview](https://frappe.io/erpnext/open-source-procurement)
- [Odoo vendor management overview](https://www.odooexpress.com/services/vendor-management)
- [Odoo 19 vendor management blog](https://www.netilligence.io/blog/how-to-manage-vendors-in-odoo-19-purchase-module/)
