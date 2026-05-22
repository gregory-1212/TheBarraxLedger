# Receipts — Market Research

> Generated 2026-05-22 by a research agent surveying receipt OCR + management tools. See [README.md](README.md) for the synthesis decisions distilled from this research.

## Summary

For a 2-person internal tool processing 20-50 receipts/month, the market splits cleanly into three tiers: (a) full-stack expense platforms (Expensify, Dext, Ramp) that are overbuilt for our use case but expose excellent UX patterns to steal, (b) raw OCR APIs (Veryfi, Mindee, Nanonets) whose accuracy claims (96-99%) Claude Vision can match in practice — at a fraction of the cost at our volume, and (c) self-hosted (Paperless-ngx) which is interesting as a storage/search model but overkill. Recommendation: build it ourselves with Claude Vision + a Supabase private bucket, stealing the phone-first capture flow from Ramp/Expensify.

## Solutions Reviewed

### 1. Expensify (SmartScan)
- **What it is:** The category-defining expense platform. SmartScan is its OCR pipeline; phone-first, used by millions.
- **Pricing:** Free tier limits SmartScan to 25 scans/month; paid plans start ~$5/user/mo (Collect) and $9/user/mo (Control).
- **OCR accuracy:** Claims 98.6-99% on standard printed receipts; degrades on faded thermal and poor lighting.
- **Phone capture UX:** Native iOS/Android app. Tap-and-shoot, auto edge detection, multi-shot, bulk import (10 at a time). "Reply with receipt photo to an SMS prompt" is its killer flow for card transactions.
- **Fields extracted:** Merchant, date, amount, currency (150+), tax, category. Partial line items.
- **UI patterns to steal:** SMS-prompt-on-charge for capture; gallery thumbnails not a list; one-tap "looks right, save" confirmation.
- **Gaps:** Overkill at $9/user. Forces you into their categorization taxonomy.

### 2. Dext (formerly Receipt Bank)
- **What it is:** Bookkeeping-first capture tool; the accountant favorite. Strong Xero/QuickBooks ties.
- **Pricing:** ~$30-90/mo tiers depending on volume.
- **OCR accuracy:** Self-claims 99.9% (marketing); independent tests put field-level at 82-95% — best-in-class for non-LLM.
- **Phone capture UX:** Native app, snap-and-submit, bulk upload, GPS mileage. Auto-publishes to ledger.
- **Fields extracted:** Vendor, date, total, tax, payment method, line items (best line-item extraction in this set).
- **UI patterns to steal:** "Inbox → Review → Archived" three-state pipeline. The review queue is the right model.
- **Gaps:** Built around having a bookkeeper as a user. Too heavy for 2 people.

### 3. Ramp (Receipt Capture)
- **What it is:** Corporate card + finance ops; receipt scanner is bundled free for cardholders.
- **Pricing:** Free if you use a Ramp card; otherwise N/A (card-tied).
- **OCR accuracy:** Claims 95% same-day match rate (different metric — about matching photo to transaction).
- **Phone capture UX:** **The gold standard.** When the card is swiped, Ramp texts the cardholder; they reply with the photo, Ramp attaches it to the transaction. Zero app open, zero typing.
- **Fields extracted:** Auto-pulled from the card transaction; OCR fills in tax + memo only.
- **UI patterns to steal:** SMS-reply capture is the single best UX in this market. Capture should be a thread, not a form.
- **Gaps:** Locked to Ramp's card. We aren't using one.

### 4. Veryfi (OCR API)
- **What it is:** Specialized receipt/invoice OCR API. The "real" OCR competitor to Claude Vision.
- **Pricing:** 100 docs free, then $0.08/receipt OR a $500/mo minimum (6,250 receipts). **The minimum is a dealbreaker** at our volume.
- **OCR accuracy:** 98.7% in independent benchmarks; sub-5-second latency. Best in class for crumpled/faded thermal because of receipt-specific training.
- **Phone capture UX:** Provides a mobile SDK if you build your own app; otherwise just an API.
- **Fields extracted:** Vendor, date, subtotal, tax, total, payment method, last4, line items, category guess.
- **UI patterns to steal:** Their JSON schema is a solid model for our DB columns.
- **Gaps:** $500/mo minimum is ~$10/receipt at our volume. Not viable.

### 5. Paperless-ngx (Open Source)
- **What it is:** Self-hosted document archive with Tesseract OCR, tags, correspondents, full-text search. Not receipt-specific.
- **Pricing:** Free; you host it.
- **OCR accuracy:** Tesseract — usable on clean printed text, weak on thermal/crumpled receipts. No structured field extraction out of the box.
- **Phone capture UX:** Email-to-inbox is the canonical flow. Mobile is a weak point — third-party apps (Paperless Mobile) only.
- **Fields extracted:** Full text only by default. Date/correspondent via regex or ML add-on.
- **UI patterns to steal:** **Email-to-archive ingestion** is brilliant and dead simple. Tags + correspondents + searchable full-text are the right archive primitives.
- **Gaps:** No structured extraction. Self-hosting overhead. No "vendor + total" model — it's a doc store.

## OCR API comparison table

| Provider | Receipt accuracy | Cost at 50/mo | Structured JSON | Notes |
|---|---|---|---|---|
| **Claude Vision (Sonnet 4.5)** | ~95-99% with good prompt | **~$0.50 total** | Yes (define schema in prompt) | Already in our stack |
| Veryfi | 98.7% | $500 (forced minimum) | Yes, native | Best raw accuracy; pricing kills it |
| Mindee | 96.1% | ~$25 (250 free, then $0.10) | Yes, native | Strong free tier |
| Nanonets | ~95% | ~$15-25 | Yes, customizable | No-code training |
| AWS Textract (AnalyzeExpense) | ~95% | ~$0.50 | Yes (Expense API) | Same cost as Claude, less flexible schema |
| Google Document AI | ~95% | ~$1-3 | Yes (Expense parser) | Comparable to Textract |
| Tesseract (open source) | 70-85% on thermal | $0 | No — raw text only | Would need a second pass |

## Cross-cutting patterns
- **Capture is SMS or photo, never a form.** Every modern tool has moved away from "open app, fill in fields." Ramp's text-reply is the apex.
- **Three-state pipeline: Captured → Review → Archived.** Universal. Auto-save into "Review" with a confidence flag; user confirms once.
- **Gallery (thumbnail grid) is the default archive view** in every modern tool. List view is the legacy fallback for power users.
- **Search is OCR-full-text + structured (vendor, amount range, date range).** Date and amount are the highest-value filters.
- **Line items are mostly skipped.** Even Veryfi/Dext, the leaders, treat line items as best-effort. For CPA export, total + tax + vendor + category is enough.
- **Storage is always private bucket + signed URLs.** S3/GCS with short-lived links. Encryption-at-rest is table stakes.

## Interesting differentiators
- **Ramp's SMS-on-swipe**: capture happens at the moment of purchase, not at the desk. We can mimic this manually — Julie texts a number, attachment lands in the inbox.
- **Dext's bookkeeper review queue** is the right mental model for our CPA export at year-end.
- **Paperless-ngx's email-to-archive** is the lowest-friction "PDF receipt from Amazon" handler — forward the email, done.
- **Expensify's "looks right" one-tap confirm** vs requiring full field review — the right default for high-confidence extractions.

## Recommendations for our build

**OCR: stick with Claude Vision.** At 50 receipts/month, Claude Sonnet at ~$3/M input + image tokens will run well under $1/month total. Accuracy is within margin of Veryfi/Mindee for our use case (gas station, Amazon, hardware store receipts — 90% are standard formats). Veryfi's $500/mo minimum is disqualifying. Mindee's free tier (250/mo) is a viable backup if Claude misses a category systematically. Define a strict JSON schema in the prompt and use Claude's structured output mode.

**Phone capture: web-only via PWA, not a native app.** Use the phone's `<input type="file" accept="image/*" capture="environment">` for direct camera invoke. Skip multi-shot stitching and edge detection — overengineering for our volume. Add a second path: forward email PDFs to a dedicated inbox that auto-ingests (steals Paperless-ngx's pattern). Native app is unjustifiable for 2 users.

**Storage: Supabase private bucket + signed URLs.** Keep originals forever. Store extracted JSON in a `receipts` table with `image_path`, `vendor`, `date`, `total_cents`, `tax_cents`, `category`, `payment_method`, `confidence`, `status` (pending/confirmed/exported), `raw_ocr_json`. Match Stripe's `*_cents` integer pattern — never decimal. Fuzzy vendor match via simple `pg_trgm` similarity against existing vendors; auto-suggest, don't auto-assign.

**Review flow:** Default to "auto-save into Review queue." Greg/Julie tap each one once to confirm. Year-end: filter by date range + category → CSV export → hand to CPA.

## Suggested Linear issues

- **Receipts: data model + Supabase private bucket** — Schema design (cents integers, status enum, raw_ocr_json), RLS for staff-only, signed URL helper.
- **Receipts: Claude Vision extraction endpoint** — `/api/receipts/extract` accepting image, returning strict JSON schema, with confidence score.
- **Receipts: phone capture page (PWA)** — Mobile-first page with native camera invoke, immediate upload, optimistic UI ("Got it, processing…").
- **Receipts: email-to-receipts ingestion** — Dedicated forwarding address; cron polls and pushes PDFs through extraction pipeline. Handles Amazon/online vendor flow.
- **Receipts: review queue UI** — Three-state pipeline (Pending → Confirmed → Exported). One-tap confirm for high-confidence; inline edit for low.
- **Receipts: vendor fuzzy match** — `pg_trgm` on a vendors table; auto-suggest top match with a "different vendor" override.
- **Receipts: gallery + search archive** — Thumbnail grid default, list as toggle. Filters: vendor, date range, amount range, category, full-text on OCR.
- **Receipts: CPA year-end CSV export** — Filter by tax year, export to category-grouped CSV matching Greg's CPA's template.
- **Receipts: confidence threshold + auto-confirm policy** — Decide which fields/confidence levels skip review (e.g., total > 90% confidence auto-confirms; vendor never auto-confirms).

---

## Sources

- [Top 10 best OCR APIs of 2026 (Mindee)](https://www.mindee.com/blog/leading-ocr-api-solutions)
- [Veryfi vs Google Cloud Vision vs Mindee benchmark](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/)
- [Veryfi Receipt OCR API pricing](https://faq.veryfi.com/en/articles/3743986-what-are-the-plans-prices-for-ocr-api)
- [Expensify receipt scanning app](https://use.expensify.com/receipt-scanning-app)
- [Dext Receipts product page](https://dext.com/us/receipt-bank)
- [Dext most accurate receipt OCR comparison](https://dext.com/us/blog/single/the-most-accurate-receipt-ocr-software)
- [OCR Accuracy Test 2026: Dext vs Hubdoc vs AutoEntry vs AI](https://zerentry.com/blog/ocr-accuracy-comparison-2026)
- [Ramp best receipt scanner apps](https://ramp.com/blog/best-receipt-scanning-apps)
- [Wave Receipts](https://www.waveapps.com/receipts)
- [Paperless-ngx docs](https://docs.paperless-ngx.com/usage/)
- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [DeepSeek OCR vs Claude Vision accuracy](https://sparkco.ai/blog/deepseek-ocr-vs-claude-vision-a-deep-dive-into-accuracy)
