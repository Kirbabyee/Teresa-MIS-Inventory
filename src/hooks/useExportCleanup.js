import { useEffect, useRef, useCallback } from "react";
import { callCleanupExportLogs, getInventoryCleanupExportLogsEndpoint } from "@/lib/inventoryApi";

// ══════════════════════════════════════════════════════════════════════════════
// useExportCleanup — auto-runs the cleanup-export-logs Edge Function
// when export erasure is enabled, at most once per 24 hours.
// ══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "last_export_cleanup_run";
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Checks localStorage for the last cleanup timestamp.
 * Returns true if 24+ hours have passed since the last run.
 */
const isDue = () => {
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    return Date.now() - Number(last) >= INTERVAL_MS;
  } catch {
    return true;
  }
};

/**
 * Records "now" as the last cleanup time in localStorage.
 */
const markRun = () => {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore quota errors
  }
};

/**
 * Hook: call the cleanup Edge Function on mount (if due) and
 * re-check every time the `enabled` flag flips to true.
 *
 * @param {boolean} enabled  — exportRetentionEnabled from SystemSettings
 * @param {number}  days     — exportRetentionDays from SystemSettings
 * @param {function} onResult — optional callback({ deletedFileCount, deletedTables })
 */
export const useExportCleanup = (enabled, days, onResult) => {
  const hasRun = useRef(false);

  const runCleanup = useCallback(async () => {
    if (!enabled || !isDue()) return;
    if (hasRun.current) return; // guard against double-call in StrictMode

    hasRun.current = true;

    try {
      const endpoint = getInventoryCleanupExportLogsEndpoint();
      const result = await callCleanupExportLogs(endpoint, days);
      markRun();
      onResult?.(result);
    } catch (err) {
      console.warn("[useExportCleanup] failed:", err);
      // Don't mark as run — allow retry next time
      hasRun.current = false;
    }
  }, [enabled, days, onResult]);

  useEffect(() => {
    if (enabled) {
      runCleanup();
    }
  }, [enabled, runCleanup]);
};
