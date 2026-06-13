import { useEffect, useRef, useCallback, useState } from 'react';

// Toggle this to true for quick testing (shortens the 15-min window)
const TEST_MODE = false;

const IDLE_TIMEOUT_MS = TEST_MODE
  ? 10_000                        // 10 seconds (test)
  : 15 * 60 * 1000;              // 15 minutes (production)

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
const THROTTLE_MS = 1000; // Throttle activity tracking to once per second

/**
 * Custom hook that monitors user inactivity.
 *
 * After `timeoutMs` of pure inactivity, it flips `isIdle` to `true` and
 * **freezes everything** — all global listeners are removed, the session
 * stays fully intact, and the UI is expected to show an "Are you still
 * there?" modal.
 *
 * Calling `confirmActive()` dismisses the modal, re-attaches listeners,
 * and resumes the idle timer seamlessly from scratch.
 *
 * @param {Object} options
 * @param {number} options.timeoutMs - Inactivity timeout in ms (default: 15 min)
 * @returns {{ isIdle: boolean, confirmActive: Function }}
 */
export function useSessionTimeout({ timeoutMs = IDLE_TIMEOUT_MS } = {}) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // ── Clear the idle timer ──────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Remove all global activity listeners ─────────────────
  const detachListeners = useCallback(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, handleActivity);
    }
  }, []);

  // ── After timeout: freeze and show modal ─────────────────
  const handleIdle = useCallback(() => {
    clearTimer();
    detachListeners();
    lastActivityRef.current = Date.now();
    setIsIdle(true);
  }, [clearTimer, detachListeners]);

  // ── Start (or restart) the idle timer ────────────────────
  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(handleIdle, timeoutMs);
  }, [timeoutMs, handleIdle, clearTimer]);

  // ── Activity handler — throttled ─────────────────────────
  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current > THROTTLE_MS) {
      lastActivityRef.current = now;
      startTimer();
    }
  }, [startTimer]);

  // ── Confirm the user is still present ────────────────────
  const confirmActive = useCallback(() => {
    setIsIdle(false);

    // Re-attach listeners after React re-renders the modal away
    requestAnimationFrame(() => {
      for (const event of ACTIVITY_EVENTS) {
        window.addEventListener(event, handleActivity, { passive: true });
      }
      startTimer();
    });
  }, [handleActivity, startTimer]);

  // ── Mount effect — runs once ─────────────────────────────
  useEffect(() => {
    // Attach listeners
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // Start the first timer
    startTimer();

    // Cleanup on unmount
    return () => {
      clearTimer();
      detachListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isIdle, confirmActive };
}

/**
 * Formats remaining time as MM:SS for display.
 */
export function formatRemainingTime(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default useSessionTimeout;
