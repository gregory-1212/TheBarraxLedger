# The Barrax Ledger

Internal back-office operational tool for The Barrax (Nashville firearms training facility). Tracks recurring bills, compliance deadlines, receipts, and 1099 contractors. Sister app to [TheBarraxCRM](https://github.com/gregory-1212/TheBarraxCRM); the CRM handles members and income, this handles expenses and operations.

## Status

Brand-new scaffold (2026-05-21). Not yet feature-complete. V1 in progress.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- Supabase (separate project from the CRM, fully isolated database)
- Deployed to Vercel (TBD)

## V1 scope

- Calendar view of all dated items
- Compliance tracking (NV-home + TN-foreign LLC filings, member meetings, etc.)
- Recurring + one-off bill tracking
- Vendor records + 1099 contractor tracking
- Receipt capture via phone photo with OCR (Claude vision API)
- Categorized expense export for tax prep

See `tasks/` (in the CRM repo) for the planning/research history.

## Dev

```
npm install
npm run dev    # starts on port 3020 (CRM uses 3010)
```

Environment variables go in `.env.local` (gitignored). Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and `NEXT_PUBLIC_SUPABASE_ANON_KEY` alias)
- `SUPABASE_SECRET_KEY` (and `SUPABASE_SERVICE_ROLE_KEY` alias)
- `SUPABASE_DB_PASSWORD`

## Relationship to TheBarraxCRM

- Separate GitHub repo
- Separate Supabase project (bulletproof isolation — neither app can affect the other's database)
- Separate auth (Julie/Greg log into each independently for now)
- Cross-app reporting (income from CRM + expenses from Ledger) happens at the application layer when needed, not via shared database
