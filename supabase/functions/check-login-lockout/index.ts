/**
 * Edge Function: check-login-lockout
 *
 * Three operations via a single POST endpoint:
 *   action: "check"     → check lockout by email + IP (on email blur)
 *   action: "check-ip"  → check lockout by IP only (on page load, no email needed)
 *   action: "login"     → full login attempt with server-side rate limiting
 *
 * Multi-vector tracking:
 *   - Per-email + per-identifier (IP + device fingerprint)
 *   - Per-IP aggregate (all emails combined — stops credential stuffing)
 *
 * Exponential backoff: 5min → 15min → 30min → 60min+
 *
 * Deploy: supabase functions deploy check-login-lockout --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for, cf-connecting-ip",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  return new Response(JSON.stringify(body), { status, headers });
}

/** Extract the client's real public IP from proxy-aware headers */
function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();

  const forwarded = req.headers.get("X-Forwarded-For");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }

  const realIp = req.headers.get("X-Real-IP");
  if (realIp) return realIp.trim();

  return null;
}

/** SHA-256 hash via SubtleCrypto */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Payload =
  | { action: "check"; email: string; deviceFingerprint: string }
  | { action: "check-ip"; deviceFingerprint: string }
  | { action: "login"; email: string; password: string; deviceFingerprint: string };

/** Find the most restrictive active lockout from a list of tracker rows */
function findMostRestrictive(rows: Array<{ suspended_until: string; lockout_tier: number }>, now: number) {
  let best = null;
  for (const r of rows) {
    if (!r.suspended_until) continue;
    const until = new Date(r.suspended_until).getTime();
    if (until > now && (!best || until > best.suspendedUntil)) {
      best = { suspendedUntil: until, tier: r.lockout_tier };
    }
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseAuth = anonKey
    ? createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabaseAdmin;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = payload;
  if (!action || (action !== "check" && action !== "check-ip" && action !== "login")) {
    return jsonResponse({ error: "Invalid action. Use 'check', 'check-ip', or 'login'." }, 400);
  }

  const clientIp = extractClientIp(req) || "unknown";
  const now = Date.now();

  // ═══════════════════════════════════════════════════════════════
  // CHECK-IP: IP + fingerprint lockout check (no email required)
  // Runs on page load. If this IP OR this device fingerprint has
  // any active suspensions (across any email), return locked.
  // Catches VPN/IP switching — same device fingerprint = same actor.
  // ═══════════════════════════════════════════════════════════════
  if (action === "check-ip") {
    const ipForQuery = clientIp === "unknown" ? "0.0.0.0" : clientIp;
    const checkPayload = payload as { action: "check-ip"; deviceFingerprint: string };
    const fingerprint = String(checkPayload.deviceFingerprint || "");
    const fingerprintHash = fingerprint ? await sha256Hex(fingerprint) : "";

    // Check by IP
    const { data: ipRows } = await supabaseAdmin
      .from("login_attempts_tracker")
      .select("suspended_until, lockout_tier")
      .eq("last_ip", ipForQuery)
      .not("suspended_until", "is", null)
      .gt("suspended_until", new Date().toISOString());

    const ipResult = findMostRestrictive(ipRows || [], now);

    // Check by fingerprint (catches VPN/IP switching)
    let fpResult = null;
    if (fingerprintHash) {
      const { data: fpRows } = await supabaseAdmin
        .from("login_attempts_tracker")
        .select("suspended_until, lockout_tier")
        .eq("fingerprint_hash", fingerprintHash)
        .not("suspended_until", "is", null)
        .gt("suspended_until", new Date().toISOString());

      fpResult = findMostRestrictive(fpRows || [], now);
    }

    // Pick the most restrictive between IP and fingerprint
    const result = [ipResult, fpResult].filter(Boolean).reduce((best, curr) =>
      !best || curr.suspendedUntil > best.suspendedUntil ? curr : best
    , null);

    if (result) {
      return jsonResponse({
        locked: true,
        retryAfterMs: result.suspendedUntil - now,
        tier: result.tier,
      });
    }

    return jsonResponse({ locked: false, retryAfterMs: 0, tier: 0 });
  }

  // ── From here on, email is required ──────────────────────────
  const email = String((payload as { email?: string }).email || "").trim().toLowerCase();
  if (!email) {
    return jsonResponse({ error: "Email is required" }, 400);
  }

  const fingerprint = String(
    (payload as { deviceFingerprint?: string }).deviceFingerprint || ""
  );
  const identifierHash = await sha256Hex(`${clientIp}::${fingerprint}`);
  const fingerprintHash = fingerprint ? await sha256Hex(fingerprint) : "";

  // ═══════════════════════════════════════════════════════════════
  // CHECK: email + IP lockout check
  // Runs when user tabs out of the email field.
  // ═══════════════════════════════════════════════════════════════
  if (action === "check") {
    const ipForQuery = clientIp === "unknown" ? "0.0.0.0" : clientIp;

    const { data: rows } = await supabaseAdmin
      .from("login_attempts_tracker")
      .select("suspended_until, lockout_tier")
      .eq("email", email)
      .eq("last_ip", ipForQuery)
      .not("suspended_until", "is", null);

    const result = findMostRestrictive(rows || [], now);

    if (result) {
      return jsonResponse({
        locked: true,
        retryAfterMs: result.suspendedUntil - now,
        tier: result.tier,
      });
    }

    return jsonResponse({ locked: false, retryAfterMs: 0, tier: 0 });
  }

  // ═══════════════════════════════════════════════════════════════
  // LOGIN: full rate-limited authentication
  // Three layers of lockout:
  //   1. IP-level  — is this IP locked from any email?
  //   2. Email+ID   — is this email+device combo locked?
  //   3. Email-wide — is this email locked from any device?
  // ═══════════════════════════════════════════════════════════════
  const loginPayload = payload as { action: "login"; email: string; password: string; deviceFingerprint: string };
  const password = String(loginPayload.password || "");
  if (!password) {
    return jsonResponse({ error: "Password is required" }, 400);
  }

  // ── Layer 1: IP + fingerprint-level lockout ───────────────────
  // If this IP OR this device fingerprint has been locked out, block.
  // Catches VPN/IP switching — same fingerprint = same actor.
  const ipForQuery = clientIp === "unknown" ? "0.0.0.0" : clientIp;

  const { data: ipLockouts } = await supabaseAdmin
    .from("login_attempts_tracker")
    .select("suspended_until, lockout_tier")
    .eq("last_ip", ipForQuery)
    .not("suspended_until", "is", null)
    .gt("suspended_until", new Date().toISOString());

  const ipResult = findMostRestrictive(ipLockouts || [], now);

  // Also check by fingerprint (blocks VPN bypass)
  let fpResult = null;
  if (fingerprintHash) {
    const { data: fpLockouts } = await supabaseAdmin
      .from("login_attempts_tracker")
      .select("suspended_until, lockout_tier")
      .eq("fingerprint_hash", fingerprintHash)
      .not("suspended_until", "is", null)
      .gt("suspended_until", new Date().toISOString());

    fpResult = findMostRestrictive(fpLockouts || [], now);
  }

  const layer1 = [ipResult, fpResult].filter(Boolean).reduce((best, curr) =>
    !best || curr.suspendedUntil > best.suspendedUntil ? curr : best
  , null);

  if (layer1) {
    // If the match is by fingerprint (not IP), say "device" for clarity
    const isDeviceMatch = fpResult && (!ipResult || fpResult.suspendedUntil >= ipResult.suspendedUntil);
    return jsonResponse(
      {
        success: false,
        error: isDeviceMatch
          ? "Access temporarily suspended due to suspicious activity from this device."
          : "Access temporarily suspended due to suspicious activity from this network.",
        locked: true,
        retryAfterMs: layer1.suspendedUntil - now,
        tier: layer1.tier,
      },
      423
    );
  }

  // ── Layer 2: Email + identifier (device) lockout ─────────────
  const { data: rateResult, error: rateError } = await supabaseAdmin.rpc(
    "handle_login_attempt",
    {
      p_email: email,
      p_identifier: identifierHash,
      p_ip: ipForQuery,
      p_fingerprint: fingerprint,
      p_success: false,
    }
  );

  if (rateError) {
    console.error("Rate limiter RPC error:", rateError.message);
  }

  if (rateResult?.locked) {
    return jsonResponse(
      {
        success: false,
        error: "Account temporarily suspended due to multiple failed login attempts.",
        locked: true,
        retryAfterMs: rateResult.retry_after_ms,
        tier: rateResult.tier,
      },
      423
    );
  }

  // ── Layer 3: Email-wide lockout (any device) ─────────────────
  const { data: emailLockouts } = await supabaseAdmin
    .from("login_attempts_tracker")
    .select("suspended_until, lockout_tier")
    .eq("email", email)
    .not("suspended_until", "is", null)
    .gt("suspended_until", new Date().toISOString());

  const emailResult = findMostRestrictive(emailLockouts || [], now);
  if (emailResult) {
    return jsonResponse(
      {
        success: false,
        error: "Account temporarily suspended due to multiple failed login attempts.",
        locked: true,
        retryAfterMs: emailResult.suspendedUntil - now,
        tier: emailResult.tier,
      },
      423
    );
  }

  // ── All clear — attempt authentication ───────────────────────
  const { data: authData, error: authError } =
    await supabaseAuth.auth.signInWithPassword({ email, password });

  if (authError || !authData?.user) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid email or password.",
        locked: false,
        retryAfterMs: 0,
      },
      401
    );
  }

  // ── Success — reset the tracker ──────────────────────────────
  await supabaseAdmin.rpc("handle_login_attempt", {
    p_email: email,
    p_identifier: identifierHash,
    p_ip: ipForQuery,
    p_fingerprint: fingerprint,
    p_success: true,
  });

  return jsonResponse({
    success: true,
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role:
        authData.user.user_metadata?.role ||
        authData.user.app_metadata?.role ||
        "employee",
      displayName:
        authData.user.user_metadata?.name ||
        authData.user.user_metadata?.full_name ||
        authData.user.email,
    },
    session: {
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at,
    },
  });
});
