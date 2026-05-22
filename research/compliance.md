# Compliance — Market Research

> Generated 2026-05-22 by a research agent surveying LLC compliance + corporate governance tools. See [README.md](README.md) for the synthesis decisions distilled from this research.

## Summary

The compliance-tracking market splits cleanly into three buckets: (1) **registered-agent companies with bolt-on dashboards** (Northwest, ZenBusiness, Harbor, CSC) — built around their filing-services revenue, so the UI is intentionally light; (2) **SOC2/SaaS compliance platforms** (Vanta, Drata) — way over-engineered for our use case, but their scorecard UX is the gold standard; and (3) **DIY in Notion/Airtable** — what most 2-person LLCs actually run. For The Barrax's needs (2 users, ~10 recurring obligations, FFL renewal being the only odd one), the right answer is a Notion-grade simple tracker with a Vanta-grade scorecard, not a Harbor Compliance clone.

## Solutions Reviewed

### 1. Northwest Registered Agent
- **What it is:** Registered-agent service with a free client dashboard that doubles as a basic compliance hub. They scan/upload state mail same-day and email when annual-report deadlines approach.
- **Pricing:** Registered agent $125/yr per state. Annual-report filing service $100/yr + state fee. Dashboard is free with RA service.
- **Relevant features:** Email reminders before annual-report due dates, document repository (everything they receive on your behalf gets scanned), state-by-state requirement detection.
- **UI patterns to steal:** Same-day document scan + email notification flow. "Here's what's due, here's the form" — pragmatic, not gamified.
- **Gaps:** No scorecard, no calendar view, no multi-obligation tracking beyond the filings they handle, nothing for FFL or county licenses, no document versioning.

### 2. ZenBusiness (Worry-Free Compliance)
- **What it is:** LLC formation company with the strongest small-business compliance dashboard in the RA category. Includes a **Compliance Scorecard** grading you Good/Fair/Poor across categories (amendments, annual reports, BOI, meeting minutes, RA).
- **Pricing:** Worry-Free Compliance $199/yr. Includes 2 amendments + annual-report filing.
- **Relevant features:** Scorecard, centralized compliance calendar with direct-action links, pre-deadline email reminders, BOI tracking.
- **UI patterns to steal:** **The Good/Fair/Poor scorecard per category is the single best UX idea in this space** — better than a single numeric score, more actionable than a raw deadline list. Direct-action links from calendar to filing form is also worth copying.
- **Gaps:** Only covers items they sell services for. Won't track BATFE, county licenses, sales tax, or insurance. No document attachment for "the actual filed PDF."

### 3. Harbor Compliance (Entity Manager)
- **What it is:** Enterprise-grade entity management for organizations with dozens of LLCs across many states. SaaS bundle of Entity Manager + License Manager + Tax Manager + Records Manager.
- **Pricing:** Software bundle $540/yr (entry). RA $99/yr per state. À la carte, so costs stack fast.
- **Relevant features:** **Interactive map** showing where each entity is registered (visually impressive for multi-state). Auto-syncs to Secretary of State databases to detect status drift. Built-in requirement reference DB. License Manager specifically tracks state-issued licenses (closest thing to FFL handling we found).
- **UI patterns to steal:** **Map view for multi-jurisdiction.** Auto-status-check against authoritative source (could we ping NV/TN SoS APIs?). License Manager's renewal-window concept (license-type-specific cadences, not generic annual).
- **Gaps:** Built for enterprise legal teams. Massive overkill for 2 people / 2 jurisdictions. Pricing alone disqualifies.

### 4. Vanta / Drata (SOC2 platforms — pattern reference only)
- **What it is:** SaaS compliance automation for SOC2/ISO27001/HIPAA. **Wrong category for us** but their dashboard UX is what every other vendor copies poorly.
- **Pricing:** $7,500–$50,000/yr. Not relevant.
- **Relevant features:** Per-control status, continuous monitoring with hourly tests, evidence collection, framework-mapped views.
- **UI patterns to steal:** **Per-control status tiles** ("PASS" / "FAIL" / "NEEDS REVIEW" pills) on a single dashboard — every obligation gets one tile, color-coded by health. Drift detection: control was green, now it's red, here's why. Vanta's "guided flows" for non-technical compliance owners — explicit "do this next" prompts rather than just lists.
- **Gaps:** N/A — wrong category. Reference only.

### 5. Notion / Airtable DIY templates
- **What it is:** What most 2-person LLCs actually use. Notion Marketplace has an "LLC Operations Tracker + Compliance Calendar" template; Airtable has a generic compliance-tracking base. Both rely on formula columns (`dateAdd(last_filed, 1, "years")`) and reminder triggers.
- **Pricing:** Notion $10/user/mo, Airtable $20/user/mo, or free tiers.
- **Relevant features:** Custom fields, calendar view, file attachments per record, formula-driven next-due-date, automation-driven reminder emails.
- **UI patterns to steal:** **File attachment lives on the record** (the filed-2025-annual-report.pdf attaches directly to the "TN Annual Report" obligation row). Formula-derived next-due dates rather than manually maintained.
- **Gaps:** No domain knowledge — you have to type in every Tennessee-specific deadline yourself. No state-API integration. Reminder cadence is generic. No FFL-aware logic.

### 6. FFL-specific tools (FastBound, FFLSafe, Easy Bound Book)
- **What it is:** ATF compliance software for firearms dealers. **All focused on the A&D book (acquisition/disposition recordkeeping) and Form 4473, NOT on FFL renewal tracking.** FFL renewal is treated as a once-every-3-years event handled out-of-band; ATF mails Form 8 Part II ~90 days before expiry.
- **Pricing:** FFLSafe free. FastBound ~$9–$99/mo by volume.
- **Relevant features:** A&D bound book, audit logs, e-4473.
- **UI patterns to steal:** Nothing directly applicable to renewal tracking — but the **90-day pre-expiry mailing cadence from ATF tells us the right reminder window for FFL** (90/60/30/7 days, not the 30/14/7 standard for state filings).
- **Gaps:** No FFL-renewal-specific tracker exists as a product. This is a gap our tool can fill trivially — it's one line item with a 3-year recurrence.

## Cross-cutting patterns (table stakes)
- **Email reminders** at multiple intervals before deadline (no SMS, no in-app push — email is universal)
- **Calendar view** showing all upcoming obligations on a month/year grid
- **Per-obligation record** with name, jurisdiction, due date, last filed date, status
- **Document attachment** on each obligation (the actual filed PDF)
- **State/jurisdiction tag** on each obligation
- **Status pills** (Good/Fair/Poor or Pass/At-Risk/Overdue) — not numeric scores

## Interesting differentiators (worth stealing)
- **ZenBusiness's category scorecard** (Good/Fair/Poor per category) — far more actionable than a single overall score
- **Harbor's auto-status-check against SoS databases** — call Nevada/Tennessee SoS each week, detect if entity status drifted to "not in good standing"
- **Vanta's "next action" prompts** — don't just say "TN annual report due in 14 days," say "File TN annual report — [direct link to TNTAP]"
- **Notion-style file attachment on the record** — every filed-PDF lives with its obligation, versioned by year
- **License-Manager-style per-license-type cadences** — FFL is 3-year, sales tax is monthly, annual report is yearly; the data model has to handle arbitrary cadences, not assume annual

## Recommendations for our build

### V1 — ship this
- **One table: `obligations`** with fields: name, jurisdiction, cadence (cron-style or interval), next_due_date, last_filed_date, status, attached_document_url, notes
- **One calendar view** (month + list)
- **One scorecard** with 3-5 categories (Federal/State/Local/Tax/Insurance), each Good/At-Risk/Overdue based on next_due_date
- **Email reminders** at 90/30/14/7/1 days before due (cron job — we already have this infra)
- **Document upload per obligation** (Supabase Storage — we already have it)
- **Manual "mark filed" button** that bumps last_filed_date, computes next_due_date from cadence, and prompts for the PDF upload

### V2 — defer
- SoS API integration for auto-status-check (Nevada and Tennessee both have semi-scrapable status pages, but it's a project)
- "Next action" deep-links to the actual filing portal per obligation
- Multi-year document history view (V1 just stores latest; V2 keeps all)
- Calendar export (.ics) for Google Calendar mirroring

### Deliberately NOT build
- **No multi-entity support** — we have one LLC. Don't model for "subsidiaries" we'll never have.
- **No user roles / permissions beyond staff-auth** — 2 users, both fully trusted. Don't build RBAC.
- **No "compliance framework" abstraction** — Vanta-style SOC2 frameworks are over-engineering for a fixed list of ~10 obligations. Just list the obligations.
- **No vendor/RA integration** — Northwest is our RA; we get their emails directly. Don't try to sync.
- **No SMS reminders** — email is enough (per existing `feedback_sms_costs.md` discipline, SMS costs money and adds noise for internal staff).
- **No FFL-specific bound-book features** — FastBound exists, we're not rebuilding it. We only track the renewal as one obligation.

## Suggested Linear issues
- **Compliance V1: data model + obligations table** — Single Supabase table with cadence/next_due/last_filed/status/document_url; seed with the 9 known obligations (NV list, TN annual, NV RA, TN RA, annual member meeting, Davidson Co license, Nashville license, FFL, TN sales tax, insurance).
- **Compliance V1: scorecard + obligations list page** — Staff-only page at /compliance with ZenBusiness-style Good/At-Risk/Overdue category pills + flat obligation list with status, due date, last filed.
- **Compliance V1: calendar view** — Month grid showing all obligations on their due dates, color-coded by status. Reuse existing calendar component if possible.
- **Compliance V1: mark-filed flow + PDF upload** — Modal that bumps last_filed_date, recomputes next_due_date from cadence, requires PDF attachment to Supabase Storage.
- **Compliance V1: email reminder cron** — Daily cron checks obligations with next_due in [90, 30, 14, 7, 1] days, emails Greg + Julie. Use existing cron + email infra.
- **Compliance V1: FFL-specific 3-year cadence** — Verify the cadence field handles non-annual intervals; FFL renewal is the only odd one but the model has to support it cleanly.
- **Compliance V2 backlog: SoS status-check job** — Weekly cron pings NV and TN SoS to detect "not in good standing" drift between our records and reality.
- **Compliance V2 backlog: per-obligation deep-links** — Add `filing_portal_url` field; render as "File now" button on the obligations list.
- **Compliance V2 backlog: document version history** — Keep all yearly filings, not just latest. View past filings per obligation.

---

## Sources

- [Northwest Registered Agent — Annual Report Service](https://www.northwestregisteredagent.com/annual-report)
- [Northwest Registered Agent Review 2026 — LLC University](https://www.llcuniversity.com/reviews/northwest-registered-agent-llc/)
- [ZenBusiness — Worry-Free Compliance](https://www.zenbusiness.com/pricing-worry-free/)
- [ZenBusiness Compliance Dashboard Help](https://help.zenbusiness.com/en/articles/11708744-how-to-utilize-the-compliance-dashboard)
- [Harbor Compliance — Entity Manager Software](https://www.harborcompliance.com/entity-manager-software)
- [Harbor Compliance Review — LLC University](https://www.llcuniversity.com/harbor-compliance-review/)
- [CSC Global — Entity Management](https://www.cscglobal.com/service/entity-solutions/entity-management/)
- [CSCNavigator](https://www.cscglobal.com/service/business-administration/cscnavigator/)
- [Drata vs Vanta — Truvo](https://truvocyber.com/blog/soc-2-audit-guide-drata-vanta)
- [Secureframe vs Vanta vs Drata](https://drata.com/blog/secureframe-vs-vanta-vs-drata)
- [FastBound — FFL Renewal](https://www.fastbound.com/ffl-blog/ffl-renewal/)
- [FFLSafe](https://fflsafe.com/)
- [FFL eZ Check — ATF](https://www.atf.gov/firearms/ffl-ez-check-application)
- [Notion — LLC Operations Tracker + Compliance Calendar Template](https://www.notion.com/templates/llc-operations-tracker-compliance-calendar)
- [Airtable — Compliance Tracking Template](https://www.airtable.com/templates/compliance-tracking/exptcjSBc8Bc49xAe)
- [Comp AI — open-source Vanta/Drata alternative](https://github.com/trycompai/comp)
- [awesome-compliance (theopenlane)](https://github.com/theopenlane/awesome-compliance)
