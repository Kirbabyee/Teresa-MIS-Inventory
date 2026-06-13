-- ═══════════════════════════════════════════════════════════════════
-- Migration 007: Administrative unlock RPC for login_attempts_tracker
-- Allows admins to immediately lift any lockout restriction.
-- ═══════════════════════════════════════════════════════════════════

-- Unlock by record ID (most precise — targets one specific device+email combo)
CREATE OR REPLACE FUNCTION public.unlock_login_attempt_by_id(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
  v_ip inet;
BEGIN
  -- Capture the row details before deleting for the return message
  SELECT email, last_ip INTO v_email, v_ip
  FROM public.login_attempts_tracker
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Record not found.');
  END IF;

  -- Reset the specific record
  UPDATE public.login_attempts_tracker
  SET consecutive_failures = 0,
      lockout_tier = 0,
      suspended_until = NULL,
      updated_at = now()
  WHERE id = p_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Lockout lifted for ' || v_email || ' on IP ' || COALESCE(v_ip::text, 'unknown')
  );
END;
$$;

-- Unlock ALL records for a given email (clears every device/IP combo for that user)
CREATE OR REPLACE FUNCTION public.unlock_login_attempt_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.login_attempts_tracker
  SET consecutive_failures = 0,
      lockout_tier = 0,
      suspended_until = NULL,
      updated_at = now()
  WHERE email = lower(trim(p_email));

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN json_build_object(
      'success', true,
      'message', 'No active lockouts found for ' || lower(trim(p_email)) || '.'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Cleared ' || v_count || ' lockout record(s) for ' || lower(trim(p_email)) || '.'
  );
END;
$$;

-- Unlock ALL records for a given IP (clears every email on that IP)
CREATE OR REPLACE FUNCTION public.unlock_login_attempt_by_ip(p_ip inet)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.login_attempts_tracker
  SET consecutive_failures = 0,
      lockout_tier = 0,
      suspended_until = NULL,
      updated_at = now()
  WHERE last_ip = p_ip;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN json_build_object(
      'success', true,
      'message', 'No active lockouts found for IP ' || p_ip::text || '.'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Cleared ' || v_count || ' lockout record(s) for IP ' || p_ip::text || '.'
  );
END;
$$;
