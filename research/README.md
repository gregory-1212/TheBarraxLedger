# Ledger Research — 2026-05-22

Per-project research into SaaS + open-source solutions in each product domain. Output of a 6-agent parallel research session before locking in the V1 issue list.

## Files

- [compliance.md](compliance.md) — LLC compliance, multi-jurisdiction tracking, FFL renewal, registered agents
- [vendors.md](vendors.md) — Vendor records, 1099 eligibility, payment methods, attachments
- [bills.md](bills.md) — Accounts payable, recurring bills, mark-paid flow
- [receipts.md](receipts.md) — OCR, phone capture, archive search (Claude Vision benchmark)
- [1099.md](1099.md) — W-9 collection, tax ID security, year-end e-file (IRIS portal)
- [reports-calendar.md](reports-calendar.md) — Unified calendar, P&L reports, year-end CSV exports

## Decisions distilled from this research

See the post-research synthesis in the Linear V1 issue set (Ledger team). Key cross-cutting decisions:

| Pattern | Decision |
|---|---|
| Email-to-X ingestion | Defer to V2 |
| Self-service W-9 link | Defer to V2 |
| Universal document archive | V1 — Foundation-adjacent |
| Audit log of sensitive actions | V1 — Foundation-adjacent |
| Activity feed on detail pages | V1 (UI default) |
| Side-drawer detail (vs full page nav) | V1 (UI default) |
| Year-End Packet ZIP | V1 (Reports project) |
| Hold/archive vs hard-delete | V1 (data convention) |
| IRS IRIS CSV format (not FIRE) | V1 (1099 export) |
| Deadline severity color ramp | V1 (UI default) |
| SoS API status checks | V2 |
| Tax ID masking + reveal + audit | V1 |
