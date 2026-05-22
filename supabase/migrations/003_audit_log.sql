-- Migration 003: audit_log table + log_audit() helper
-- LED-35: Append-only audit log for sensitive actions.
--
-- Write path: SECURITY DEFINER function log_audit() — callable from any authed
-- session. Direct INSERT/UPDATE/DELETE on the table is blocked (no RLS policies
-- for those operations, so they fall through to "deny").
--
-- Read path: staff can SELECT.

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet
);

CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_type, entity_id, occurred_at DESC) WHERE entity_type IS NOT NULL;
CREATE INDEX audit_log_action_idx ON public.audit_log (action, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read: staff only
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT USING (public.is_staff());

-- No INSERT/UPDATE/DELETE policies → blocked except via log_audit() below.

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address inet DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_email text := auth.email();
BEGIN
  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'log_audit() requires an authenticated user';
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_email, action, entity_type, entity_id, metadata, ip_address
  ) VALUES (
    v_actor_id, v_actor_email, p_action, p_entity_type, p_entity_id, p_metadata, p_ip_address
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, inet) TO authenticated;

COMMENT ON TABLE public.audit_log IS
  'Append-only log of sensitive staff actions. Read via SELECT (staff-gated). Write only via log_audit() function.';
