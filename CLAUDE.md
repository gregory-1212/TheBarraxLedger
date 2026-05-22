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
- Supabase (separate project from CRM — total data isolation)
- Deployed to Vercel (TBD — not yet wired)
- GitHub: `gregory-1212/TheBarraxLedger` (auto-deploys on push once Vercel is connected)

### Sister App Relationship
TheBarraxCRM at `/workspaces/TheBarraxCRM/` is the sister app. They share NO code and NO database. Different Vercel projects, different Supabase projects, different auth.

Cross-app data (e.g., income from CRM + expenses from Ledger for a full P&L) is handled at the reporting layer when needed, not via shared database. The two apps are deliberately isolated so neither can affect the other's reliability.

### Dev Environment
- Currently developed from the CRM's Codespace at `/workspaces/TheBarraxLedger` as a sibling directory
- Dev server: port 3020 (CRM uses 3010)
- May get its own dedicated Codespace later as the project matures

## Code & Build Patterns

- Browser Supabase: `createClient()` from `utils/supabase/client.ts` (uses publishable key, respects RLS)
- Server Supabase: `createClient()` from `utils/supabase/server.ts` (cookie-aware, for Server Components + Route Handlers)
- Service-role Supabase: `createServiceClient()` from same file (bypasses RLS, server-only)
- Uses `@supabase/ssr` for App Router auth/session handling
- Tailwind v4 (CSS-first config, classes used in JSX the normal way)

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

- `/workspaces/TheBarraxCRM/tasks/` — research and planning history from when the Ledger was scoped (sister-repo context)
- `tasks/julie-info-requests/` (in either repo) — info-gathering pattern + collected responses
- Auto-memory files at `~/.claude/projects/-workspaces-TheBarraxLedger/memory/` (once the Ledger has its own Codespace; currently sharing the CRM's memory dir)
