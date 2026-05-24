@AGENTS.md

# The Barrax Ledger

Internal back-office operational tool for The Barrax (Nashville firearms training facility). Built 2026-05-21. Sister app to [TheBarraxCRM](https://github.com/gregory-1212/TheBarraxCRM) — the CRM handles members and income (Stripe), the Ledger handles expenses, compliance, 1099 contractors, and receipts.

## Prime Directive

Bulletproof. The Ledger will hold tax records, compliance filings, and contractor info that Julie will run the operations side of the business from. Decisions favor long-term reliability over speed. Battle-tested patterns over clever ones.

## How to Work With Greg

The CRM's CLAUDE.md is the canonical source for working norms — these mirror it.

### Ask Before Building
Do NOT build page structure, feature scope, naming, or data model changes without Greg's explicit approval. Present a proposal, get sign-off, THEN build. This is the #1 behavioral rule.

If multiple interpretations of a request exist, present them — don't pick silently.

### Plan Mode for Non-Trivial Work
For any task with 3+ steps or architectural decisions, enter plan mode first. Write out what you'll do. Get confirmation. Then execute.

### Define Success Criteria
Before non-trivial work, transform the task into verifiable criteria. "Add validation" → "Write tests for invalid inputs, then make them pass." For multi-step tasks, state the plan with a verification check per step.

### Wait For The Answer
If you ask a question, WAIT for the answer before continuing. Don't start implementing while a question is pending.

### Plain English, Not Shell Commands
Greg is non-technical. Don't paste shell commands at him expecting him to run them. Ask in plain English ("Want me to ship this?", "OK to deploy?") and do the work yourself — the system pops an approval prompt that he clicks. When something truly requires action outside the Codespace (a credential paste, a Vercel dashboard click), describe destination + action, not terminal flags. See `feedback_plain_english_actions.md` in CRM memory.

### Autonomous Mode: Queue Blockers, Keep Working
On open-ended runs, blockers are queue items, not stop signals. Maintain a running "for Greg" list (credential, decision, env var, Julie input) and surface it concisely when he checks in. Set blocked tasks aside, pick the next one. Only stop when EVERY remaining task is blocked. See `feedback_keep_working_queue_blockers.md` in CRM memory.

### Research Before Editing
Never change code you haven't read. Open the file, understand what it's doing and why, then edit.

### Surgical Changes
Touch only what you must. When editing existing code: don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style even if you'd do it differently. Every changed line should trace directly to the requested task.

### Never Guess
Never state something as fact without verifying first. Say "I don't know" if you don't.

### No Workarounds or Half-Measures
No band-aid fixes. No "we'll fix the real thing later." Build it right or surface the constraint to Greg.

### Simplicity First
Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for scenarios that genuinely cannot happen. If you'd write 200 lines and it could be 50, rewrite it. Test: would a senior engineer say this is overcomplicated?

### Model Selection
If a task requires deep architectural decisions, multi-system refactors, or complex debugging across many files, tell Greg "this task is better on Opus" BEFORE starting.

### Batch Pushes
Don't `git push` after every small change. Each push burns Vercel build minutes. Batch commits, push at end of session or when Greg needs to see changes live.

### Test Before Push
Test on localhost:3020 (or the Codespace's port-forwarded URL) before pushing. The Ledger's dev server runs on port 3020 (CRM uses 3010). Type checking verifies code correctness, not feature correctness — if you can't test the UI, say so explicitly rather than claiming success.

### Code Quality
- Default to writing no comments. Only add one when WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug
- Don't explain WHAT the code does — names already do that. Don't reference the current task ("used by X", "added for Y flow") — that rots
- Prefer reliable and readable over clever and compact
- Handle REAL edge cases, not impossible-scenario error handling

## Stack & Environment

### Stack
- Next.js 16 App Router (Turbopack) + TypeScript + Tailwind v4
- Supabase (separate project from CRM — total data isolation; project ref `owlslturwizhutsiyhjd`)
- Vercel (live at **ledger.thebarrax.com**, auto-builds on every push to main)
- GitHub: `gregory-1212/TheBarraxLedger`
- Resend (transactional email via SMTP — Supabase Auth magic links + the LED-12/21 reminder cron when `RESEND_API_KEY` is set)
- JSZip (for the LED-49 Year-End Packet)

### Sister App Relationship
TheBarraxCRM at `/workspaces/TheBarraxCRM/` is the sister app. They share NO code and NO database. Different Vercel projects, different Supabase projects, different auth.

Cross-app data (e.g., income from CRM + expenses from Ledger for a full P&L) is handled at the reporting layer when needed, not via shared database. The two apps are deliberately isolated so neither can affect the other's reliability.

### Dev Environment
- Developed from the CRM's Codespace at `/workspaces/TheBarraxLedger` as a sibling directory
- Dev server: port 3020 (CRM uses 3010). `npm run dev` routes through `scripts/with-env.sh` (see below).
- `.env.local` is the source of truth for local config; `.env.example` documents every var

### Codespace env override (scripts/with-env.sh)

**This Codespace was provisioned for the CRM and ships CRM Supabase keys as user-secrets.** Those values leak into every shell's `process.env`. Next.js loads env vars with `process.env` winning over `.env.local`, so without intervention the Ledger dev/build silently picks up the CRM's Supabase URL while reading the Ledger's publishable key — manifests as "Invalid API key" everywhere.

[scripts/with-env.sh](scripts/with-env.sh) is the workaround: it sources `.env.local` with `set -a` before exec-ing the wrapped command, overwriting the inherited values. Every npm script (dev / build / start / test) routes through it. The wrapper gracefully skips sourcing when `.env.local` is absent (so Vercel's build environment, where env vars are injected directly into process.env, still works).

**Implication for new tools:** anything invoked via `node script.mjs` directly (not through npm) skips the wrapper. Those scripts must either read `.env.local` themselves (see `scripts/run-ddl.mjs` for the pattern) OR be invoked via `./scripts/with-env.sh node ...`.

### Pushing to GitHub

The Codespace's auto-injected `GITHUB_TOKEN` is scoped to the parent repo (TheBarraxCRM) and 403s on Ledger pushes. Until LED-58 lands (Codespace user-secret for a Ledger-scoped PAT), push using a fine-grained PAT inline. Pattern documented in `reference_ledger_push_workflow.md` in CRM memory. **Don't persist the token to .git/config**; use `git -c credential.helper= push https://x-access-token:<TOKEN>@github.com/...`.

## Code & Build Patterns

- Browser Supabase: `createClient()` from `utils/supabase/client.ts` (uses publishable key, respects RLS)
- Server Supabase: `createClient()` from `utils/supabase/server.ts` (cookie-aware, for Server Components + Route Handlers)
- Service-role Supabase: `createServiceClient()` from same file (bypasses RLS, server-only)
- Uses `@supabase/ssr` for App Router auth/session handling
- Tailwind v4 (CSS-first config, classes used in JSX the normal way)
- DDL migrations: `node scripts/run-ddl.mjs supabase/migrations/<file>.sql` — connects via the IPv4 pooler (`aws-1-us-east-1.pooler.supabase.com:5432`) since the direct host is IPv6-only and Codespaces can't reach it. Reads `.env.local` itself; doesn't need the wrapper.
- Documents archive: `utils/documents.ts` provides `uploadDocument` / `getSignedUrl` / `softDeleteDocument` / `listDocumentsForEntity`. Polymorphic via `entity_type` + `entity_id`. Used by W-9/Contract/COI vendor slots (LED-40), receipts (when LED-22 ships), and compliance attachments.
- CSV exports: pure builders in `utils/iris-1099-nec.ts` + `utils/categorized-expense-csv.ts`; data fetchers + generators in `utils/year-end-csv-generators.ts`; routes in `app/api/exports/*` are thin auth+audit shells. Format invariants pinned by `__tests__/csv-exports.test.mjs` (runs via `npm test`, plain Node + `--experimental-strip-types`).
- Forecast helper: `utils/forecast.ts` `forecastBetween(supabase, start, end, {sources?})` — cross-source money-out aggregation used by the home calendar tile (LED-50) + bills sidebar widget.
- Date range presets: `utils/date-ranges.ts` `resolvePreset(name, {today})` — 7 presets (this/last month/quarter, ytd default, last year, custom). `components/DateRangePicker.tsx` is the shared server-component picker.
- Email send: `utils/send-email.ts` is a minimal Resend REST wrapper. Gracefully no-ops + logs when `RESEND_API_KEY` is unset.

## Crons

- **`/api/cron/reminders`** (LED-12 + LED-21) — daily 13:00 UTC (8am CT). Sends batched reminder emails for compliance items + bills due in 7 days + 1 day. Idempotent via the `reminder_sends` table. Recipients hardcoded to greg + julie. Send is no-op until `RESEND_API_KEY` is set in Vercel env.
- Cron schedule lives in [vercel.json](vercel.json). Optional `CRON_SECRET` env var enables Bearer auth on cron endpoints.

## Architecture

### What this app does
- Tracks bills (recurring + one-off, multiple categories)
- Tracks vendors (anyone money goes to — subscriptions, utilities, contractors, suppliers)
- Tracks 1099-eligible contractors and generates year-end CSV for the CPA
- Captures receipts (phone photo → Claude vision OCR → categorized archive)
- Tracks compliance (LLC filings for NV-home + TN-foreign-registration, member meetings, business licenses, sales tax)
- Calendar view that pulls all dated items into one unified view
- Tax-ready CSV export at year-end

### What this app does NOT do
- Double-entry general ledger — out of scope; the CSV export is enough for the CPA
- Invoicing / accounts receivable — handled by the CRM
- Payroll — no W-2 employees
- Member-facing UI — internal-only, for Greg + Julie

### Multi-jurisdiction LLC
The Barrax LLC is formed in **Nevada (home state)** and registered as a **foreign LLC in Tennessee** (where the business operates). Compliance items have a `jurisdiction` field (NV or TN). Compliance scorecard is per-jurisdiction with an overall roll-up.

## Linear Workflow

Issues live in the **Ledger** team in Linear. Projects group related issues (Foundation, Compliance, Vendors, Bills, etc.). Working pattern:

- When starting a Linear issue: read the issue body + acceptance criteria; move to "In Progress"
- Update the issue body or comments with notable decisions during the work
- Move to "Done" only when acceptance criteria are met
- Capture new ideas as Linear issues, not just in chat

**Do NOT use branch-per-issue / PR-per-task.** Greg works directly on main and doesn't review PRs — that pattern would add an approval step that doesn't get used. Same convention as the CRM.

## Domain Knowledge

- **Julie** is the day-to-day operator. She keeps physical records and operational paperwork. When info from her office is needed (LLC formation dates, registered agents, insurance policies, vendor contacts), use the `tasks/julie-info-requests/` folder pattern (mirrored from the CRM repo's tasks/ structure) — produce a concise email/text-ready list she can respond to piecemeal.
- **Compliance is V1 priority** because LLC filings + member meetings have hard deadlines and tracking was previously ad-hoc.
- The CRM handles all member-facing operations. Anything member-related belongs in the CRM, not here.

## Where To Find More

- `research/*.md` — research notes (1099, bills, compliance, reports-calendar, receipts, vendors) that drove design decisions. Re-read before adding features that touch these areas.
- `/workspaces/TheBarraxCRM/tasks/` — research and planning history from when the Ledger was scoped (sister-repo context)
- `tasks/julie-info-requests/` (in either repo) — info-gathering pattern + collected responses
- **Auto-memory** at `~/.claude/projects/-workspaces-TheBarraxCRM/memory/` (shared with the CRM since both repos live in the same Codespace). Key entries for the Ledger: `ledger-2026-05-22` (initial build) → `ledger-2026-05-23` (year-end CPA deliverables) → `ledger-2026-05-24` (1099 lifecycle end-to-end + reminder cron + delivery log + filter rail). Plus references: `reference-with-env-wrapper`, `reference-ledger-push-workflow`, `reference-vercel-sensitive-env-vars`.
