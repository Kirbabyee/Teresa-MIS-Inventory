import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint";

/**
 * ════════════════════════════════════════════════════════════════
 * useLockoutCheck
 *
 * Runs inside the authenticated shell (Layout). Provides two
 * layers of lockout enforcement beyond the initial check in
 * AuthContext.checkAppState:
 *
 *   1. Real-time listener — subscribes to postgres_changes on
 *      login_attempts_tracker. Any INSERT/UPDATE triggers an
 *      immediate re-check so lockouts take effect near-instantly.
 *
 *   2. Periodic polling — every 15 seconds queries for any
 *      active lockout row matching the current user's email or
 *      device fingerprint. Catches cases where the real-time
 *      channel misses an event (e.g. brief disconnect).
 *
 * If a match is found, the user is signed out via supabase.auth
 * .signOut(), which triggers onAuthStateChange → checkAppState
 * → redirect to /login.
 *
 * No visual output — this is a silent guard.
 * ════════════════════════════════════════════════════════════════
 */
export function useLockoutCheck() {
  const timerRef = useRef(null);
  const subscribedRef = useRef(false);

  // ── Query: is the current session locked out? ─────────────
  const checkLockout = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.toLowerCase().trim();
      if (!email) return;

      const fingerprint = getDeviceFingerprint();
      const now = new Date().toISOString();

      const { data: rows, error } = await supabase
        .from("login_attempts_tracker")
        .select("id")
        .gt("suspended_until", now)
        .or(
          `email.eq.${email},` +
          `fingerprint_hash.eq.${fingerprint},` +
          `identifier_hash.eq.${fingerprint}`
        )
        .limit(1);

      if (error) return;

      if (rows && rows.length > 0) {
        // Locked out — sign out (AuthContext picks up the state change)
        try { await supabase.auth.signOut(); } catch (_e) { /* ignore */ }
      }
    } catch (_e) {
      // Silently fail — never block the user on a check error
    }
  }, []);

  // ── Polling: every 15 seconds ─────────────────────────────
  useEffect(() => {
    checkLockout();
    timerRef.current = window.setInterval(checkLockout, 15_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [checkLockout]);

  // ── Real-time listener on the lockout table ───────────────
  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const channel = supabase
      .channel("lockout-guard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "login_attempts_tracker" },
        () => { checkLockout(); }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      subscribedRef.current = false;
    };
  }, [checkLockout]);
}
