#!/bin/sh
# Wrapper that forces this project's .env.local to take precedence over
# inherited process.env values before exec'ing the wrapped command.
#
# Background: this Codespace is provisioned for TheBarraxCRM and ships
# CRM Supabase keys as Codespace user secrets. Those land in process.env
# before any node process starts. Next.js's env loading gives process.env
# precedence over .env.local — so the Ledger dev server was silently
# using the CRM Supabase URL together with the Ledger publishable key,
# which manifested as "Invalid API key" on /login.
#
# `set -a` marks subsequent assignments as auto-exported, so sourcing
# .env.local overwrites the inherited values for the spawned child.

set -e

# .env.local is the Codespace-dev case (where we have to override inherited
# CRM env vars). Vercel + other CI environments don't have it — env vars are
# injected into process.env directly by the platform — so we skip sourcing
# and just exec the command. Either way the wrapped command sees correct env.
if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

exec "$@"
