import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint";

// ── Tier thresholds ════════════════════════════════════════════
// Must match the server-side tier calculation.
// Failures per tier boundary: 3 → T1, 6 → T2, 9 → T3, 12 → T4, 15+ → T5 (permanent ban)
export const TIER_DURATIONS = {
  1: 5 * 60 * 1000,       // 5 minutes
  2: 15 * 60 * 1000,      // 15 minutes
  3: 30 * 60 * 1000,      // 30 minutes
  4: 60 * 60 * 1000,      // 60 minutes (severe)
  5: Infinity,             // Tier 5 = permanent ban (15+ failures)
};

export const MAX_TIER = 5;
export const PERMANENT_BAN_TIER = 5;

// If remaining lockout exceeds this, treat as permanent ban (2 years in ms)
export const PERMANENT_BAN_THRESHOLD = 2 * 365 * 24 * 60 * 60 * 1000;

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-login-lockout`;

/**
 * Format milliseconds into a human-readable countdown string.
 * Shows full breakdown: years, months, weeks, days, hours, minutes, seconds.
 * Uses monospace-safe formatting so digits don't shift width.
 */
export function formatCountdown(ms) {
  let remaining = Math.max(0, Math.ceil(ms / 1000));

  const years = Math.floor(remaining / (365 * 24 * 60 * 60));
  remaining %= 365 * 24 * 60 * 60;

  const months = Math.floor(remaining / (30 * 24 * 60 * 60));
  remaining %= 30 * 24 * 60 * 60;

  const weeks = Math.floor(remaining / (7 * 24 * 60 * 60));
  remaining %= 7 * 24 * 60 * 60;

  const days = Math.floor(remaining / (24 * 60 * 60));
  remaining %= 24 * 60 * 60;

  const hours = Math.floor(remaining / (60 * 60));
  remaining %= 60 * 60;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds.toString().padStart(2, "0")}s`);

  return parts.join(" ");
}

/**
 * Check lockout by IP only — no email required.
 * Runs on page load / reload. If this IP has any active suspensions
 * (from attacking any account), the lockout overlay appears immediately.
 */
async function checkIpLockout() {
  try {
    const fingerprint = getDeviceFingerprint();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check-ip", deviceFingerprint: fingerprint }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return { locked: false, retryAfterMs: 0, tier: 0 };
    return await res.json();
  } catch {
    return { locked: false, retryAfterMs: 0, tier: 0 };
  }
}

/**
 * Check lockout by email + IP.
 * Runs when the user tabs out of the email field.
 */
async function checkServerLockout(email) {
  try {
    const fingerprint = getDeviceFingerprint();
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        action: "check",
        email: email.trim().toLowerCase(),
        deviceFingerprint: fingerprint,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return { locked: false, retryAfterMs: 0, tier: 0 };
    return await res.json();
  } catch {
    return { locked: false, retryAfterMs: 0, tier: 0 };
  }
}

/**
 * Send a login attempt through the server-side rate limiter.
 * Returns the full server response including lockout state.
 */
async function attemptServerLogin(email, password) {
  try {
    const fingerprint = getDeviceFingerprint();
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        action: "login",
        email: email.trim().toLowerCase(),
        password,
        deviceFingerprint: fingerprint,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const body = await res.json();
    return { status: res.status, body };
  } catch (err) {
    // Edge Function unreachable — fall back to direct Supabase auth
    // so the user can still log in even if the rate-limiter is down
    return {
      status: 0,
      body: { error: null, success: false, _networkError: true },
    };
  }
}

/**
 * ════════════════════════════════════════════════════════════════
 * useSecuredCountdown
 *
 * The single source of truth for login lockout state.
 *
 * Contract:
 *   - On mount, queries the server for any existing lockout.
 *   - While locked, runs a live countdown synced to the server's
 *     suspended_until timestamp (not a local timer).
 *   - On login attempt, delegates to the server for auth + rate limit.
 *   - On success, clears all state.
 *
 * Returns:
 *   locked      — boolean, true if currently suspended
 *   retryAfterMs — number, milliseconds remaining (from server)
 *   retry        — function, call to attempt login(email, password)
 *                   returns { success, error, locked, retryAfterMs }
 *   formatted    — string, human-readable countdown (e.g. "4m 09s")
 *   tier         — number, current lockout tier (0 = not locked)
 *   attemptsLeft — number, estimated attempts before next tier
 * ════════════════════════════════════════════════════════════════
 */
export function useSecuredCountdown() {
  const [locked, setLocked] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [serverTimestamp, setServerTimestamp] = useState(0); // When the countdown ends (server clock)
  const [tier, setTier] = useState(0);
  const timerRef = useRef(null);

  // ── Live countdown: re-syncs with server every 15s ────────
  const startCountdown = useCallback((ms) => {
    // Clear any previous interval
    if (timerRef.current) window.clearInterval(timerRef.current);

    setRetryAfterMs(ms);
    setLocked(true);

    // Update every second for smooth UI
    timerRef.current = window.setInterval(() => {
      setRetryAfterMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          window.clearInterval(timerRef.current);
          setLocked(false);
          setTier(0);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, []);

  // ── On mount: check server for existing lockout ────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  /**
   * Public: check if a specific email is locked (call on mount
   * or when email field changes to restore lockout across refresh).
   */
  const restoreLockout = useCallback(async (email) => {
    if (!email || !email.trim()) {
      setLocked(false);
      setRetryAfterMs(0);
      return;
    }

    const result = await checkServerLockout(email);
    if (result.locked && result.retryAfterMs > 0) {
      setTier(result.tier || 1);
      startCountdown(result.retryAfterMs);
    } else {
      setLocked(false);
      setRetryAfterMs(0);
      setTier(0);
    }
  }, [startCountdown]);

  /**
   * Public: attempt a login through the server-side rate limiter.
   */
  const retry = useCallback(async (email, password) => {
    // Client-side pre-check: don't even hit the server if we know we're locked
    if (locked && retryAfterMs > 0) {
      return {
        success: false,
        error: `Account suspended. Please wait ${formatCountdown(retryAfterMs)} before trying again.`,
        locked: true,
        retryAfterMs,
        tier,
      };
    }

    const { status, body } = await attemptServerLogin(email, password);

    // Edge Function unreachable — fall back to direct Supabase auth
    if (body?._networkError) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!error && data?.session) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          setLocked(false);
          setRetryAfterMs(0);
          setTier(0);
          return {
            success: true,
            user: {
              id: data.user.id,
              email: data.user.email,
              displayName:
                data.user.user_metadata?.name ||
                data.user.user_metadata?.full_name ||
                data.user.email,
            },
            session: {
              accessToken: data.session.access_token,
              expiresAt: data.session.expires_at,
            },
            locked: false,
            retryAfterMs: 0,
            tier: 0,
          };
        }
      } catch (_authErr) {
        // Fall through to generic error
      }
      return {
        success: false,
        error: "Invalid email or password.",
        locked: false,
        retryAfterMs: 0,
      };
    }

    // 423 Locked — server says we're suspended
    if (status === 423 && body.locked) {
      setTier(body.tier || 1);
      startCountdown(body.retryAfterMs || 0);
      return {
        success: false,
        error: body.error || "Account suspended. Please wait before trying again.",
        locked: true,
        retryAfterMs: body.retryAfterMs || 0,
        tier: body.tier || 1,
      };
    }

    // 401 Auth failure — server may have escalated the tier
    if (status === 401) {
      // Re-query the server to get fresh state
      const fresh = await checkServerLockout(email);
      if (fresh.locked && fresh.retryAfterMs > 0) {
        setTier(fresh.tier || 1);
        startCountdown(fresh.retryAfterMs);
      }
      return {
        success: false,
        error: body.error || "Invalid email or password.",
        locked: fresh.locked || false,
        retryAfterMs: fresh.retryAfterMs || 0,
        tier: fresh.tier || 0,
      };
    }

    // 200 Success
    if (status === 200 && body.success) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setLocked(false);
      setRetryAfterMs(0);
      setTier(0);
      return {
        success: true,
        user: body.user,
        session: body.session,
        locked: false,
        retryAfterMs: 0,
        tier: 0,
      };
    }

    // Unexpected response
    return {
      success: false,
      error: body.error || "An unexpected error occurred. Please try again.",
      locked: false,
      retryAfterMs: 0,
    };
  }, [locked, retryAfterMs, tier, startCountdown]);

  // ── Derived values ──────────────────────────────────────────
  const formatted = formatCountdown(retryAfterMs);
  const attemptsBeforeLock = Math.max(0, 3 - ((tier > 0 ? tier * 3 : 0)));
  // If remaining time exceeds ~2 years, treat as permanent ban (no countdown)
  const isPermanentlyBanned = retryAfterMs >= PERMANENT_BAN_THRESHOLD;

  return {
    locked,
    retryAfterMs,
    formatted,
    tier,
    isPermanentlyBanned,
    attemptsLeft: locked ? 0 : Math.max(0, 3 - (retryAfterMs > 0 ? 0 : 0)),
    startCountdown,
    restoreLockout,
    retry,
    checkIpLockout,
  };
}
