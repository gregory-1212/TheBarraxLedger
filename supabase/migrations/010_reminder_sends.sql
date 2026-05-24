-- Migration 010: reminder_sends
-- LED-12 + LED-21: daily cron sends reminder emails for compliance items and
-- bills due within configured horizons (7 days + 1 day). This table tracks
-- which reminders have already gone out so the cron is idempotent — re-runs
-- on the same day don't re-spam, and the next horizon's reminder is a
-- separate row.
--
-- Unique constraint on (entity_type, entity_id, horizon_days) is what
-- enforces "send at most once per (item, horizon) pair." The cron uses
-- ON CONFLICT DO NOTHING when inserting.

CREATE TABLE public.reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('compliance_item', 'bill')),
  entity_id uuid NOT NULL,
  horizon_days int NOT NULL CHECK (horizon_days > 0),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_to text[] NOT NULL,

  UNIQUE (entity_type, entity_id, horizon_days)
);

CREATE INDEX reminder_sends_recent_idx
  ON public.reminder_sends (sent_at DESC);

ALTER TABLE public.reminder_sends ENABLE ROW LEVEL SECURITY;

-- Cron writes via service-role (bypasses RLS). Staff can read for audit.
CREATE POLICY reminder_sends_staff_read ON public.reminder_sends
  FOR SELECT USING (public.is_staff());

COMMENT ON TABLE public.reminder_sends IS
  'One row per (item, horizon) reminder sent. Idempotent via unique constraint — the daily reminder cron uses ON CONFLICT DO NOTHING. Used by LED-12 (compliance) and LED-21 (bills).';
