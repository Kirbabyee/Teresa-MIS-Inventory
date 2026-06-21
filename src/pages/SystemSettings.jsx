import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchSetting, upsertSetting } from "@/lib/inventoryApi";
import {
  loadAllSystemSettings as loadExportSettings,
  saveAllSystemSettings as saveExportSettings,
} from "@/lib/systemSettingsApi";
import { useExportCleanup } from "@/hooks/useExportCleanup";

// ─── Toggle Switch ────────────────────────────────────────────────────────
function ToggleSwitch({ enabled, onToggle, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={() => onToggle(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#411111] focus-visible:ring-offset-2",
        enabled ? "bg-[#411111]" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out",
          enabled ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ─── Reveal Panel (animated expand) ────────────────────────────────────────
function RevealPanel({ show, children }) {
  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────
function SettingsCard({ icon: Icon, title, description, children }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="flex items-start gap-4 px-6 pt-6 pb-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#411111]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800 tracking-tight">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-sm text-slate-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="px-6 pb-6 pt-4">{children}</div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function SystemSettings() {
  // ── File Export Settings ───────────────────────────────────────────────
  const [exportRetentionEnabled, setExportRetentionEnabled] = useState(false);
  const [exportRetentionDays, setExportRetentionDays] = useState(180);

  // ── Borrowing Records Retention ────────────────────────────────────────
  const [borrowRetentionEnabled, setBorrowRetentionEnabled] = useState(false);
  const [borrowRetentionDays, setBorrowRetentionDays] = useState(90);

  // ── Borrowing Log Erasure (new — system_configurations) ────────────────
  const [borrowingErasureEnabled, setBorrowingErasureEnabled] = useState(false);
  const [borrowingErasureDays, setBorrowingErasureDays] = useState(365);

  // ── Inventory Activity Logs Retention (legacy — inventory_settings) ───
  const [inventoryRetentionEnabled, setInventoryRetentionEnabled] =
    useState(false);
  const [inventoryRetentionDays, setInventoryRetentionDays] = useState(60);

  // ── Inventory Audit Log Erasure (new — system_configurations) ─────────
  const [inventoryErasureEnabled, setInventoryErasureEnabled] = useState(false);
  const [inventoryErasureDays, setInventoryErasureDays] = useState(60);

  // ── Admin Approval Guard ───────────────────────────────────────────────
  const [isAdminApprovalRequired, setIsAdminApprovalRequired] = useState(false);

  // ── Persistence state ──────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ── Snapshot of loaded values for dirty checking ───────────────────────
  const savedValues = useRef(null);

  // — Auto-run export cleanup Edge Function (once per 24h when enabled) —
  useExportCleanup(exportRetentionEnabled, exportRetentionDays, (result) => {
    const files = result?.deletedFileCount ?? 0;
    const rows = Object.values(result?.deletedTables || {}).reduce(
      (t, n) => t + Number(n || 0), 0
    );
    if (files > 0 || rows > 0) {
      toast.info("Export cleanup completed", {
        description: `Removed ${rows} log rows and ${files} stored files.`,
        duration: 5000,
      });
    }
  });

  // ── Load persisted settings ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        // Load export erasure settings from the new system_configurations table
        const exportCfg = await loadExportSettings();

        // Load borrowing/inventory/admin settings from inventory_settings (legacy)
        const keys = [
          "retention.borrowing.enabled",
          "retention.borrowing.days",
          "retention.inventory.enabled",
          "retention.inventory.days",
          "borrowing.require_admin_approval",
        ];

        const results = await Promise.allSettled(
          keys.map((key) => fetchSetting(key))
        );

        if (cancelled) return;

        const getBool = (idx) => {
          const r = results[idx];
          if (r.status === "fulfilled" && r.value?.value != null) {
            const v = r.value.value;
            if (typeof v === "boolean") return v;
            if (typeof v === "string")
              return v.toLowerCase() === "true" || v === "1";
            return Boolean(v);
          }
          return null;
        };

        const getNum = (idx, fallback) => {
          const r = results[idx];
          if (r.status === "fulfilled" && r.value?.value != null) {
            const raw = r.value.value;
            const v =
              typeof raw === "object" && raw !== null
                ? raw.days ?? raw.value
                : raw;
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
          }
          return fallback;
        };

        const nextBorrowEnabled = getBool(0) ?? false;
        const nextBorrowDays = getNum(1, 90);
        const nextInventoryEnabled = getBool(2) ?? false;
        const nextInventoryDays = getNum(3, 60);
        const nextAdminApproval = getBool(4) ?? false;

        setExportRetentionEnabled(exportCfg.exportRetentionEnabled);
        setExportRetentionDays(exportCfg.exportRetentionDays);
        setBorrowingErasureEnabled(exportCfg.borrowingErasureEnabled);
        setBorrowingErasureDays(exportCfg.borrowingErasureDays);
        setBorrowRetentionEnabled(nextBorrowEnabled);
        setBorrowRetentionDays(nextBorrowDays);
        setInventoryRetentionEnabled(nextInventoryEnabled);
        setInventoryRetentionDays(nextInventoryDays);
        setIsAdminApprovalRequired(nextAdminApproval);
        setInventoryErasureEnabled(exportCfg.inventoryErasureEnabled ?? false);
        setInventoryErasureDays(exportCfg.inventoryErasureDays ?? 60);

        // Snapshot for dirty comparison — all values normalised
        savedValues.current = {
          exportRetentionEnabled: exportCfg.exportRetentionEnabled,
          exportRetentionDays: exportCfg.exportRetentionDays,
          borrowingErasureEnabled: exportCfg.borrowingErasureEnabled,
          borrowingErasureDays: exportCfg.borrowingErasureDays,
          borrowRetentionEnabled: nextBorrowEnabled,
          borrowRetentionDays: nextBorrowDays,
          inventoryRetentionEnabled: nextInventoryEnabled,
          inventoryRetentionDays: nextInventoryDays,
          isAdminApprovalRequired: nextAdminApproval,
          inventoryErasureEnabled: exportCfg.inventoryErasureEnabled ?? false,
          inventoryErasureDays: exportCfg.inventoryErasureDays ?? 60,
        };
      } catch (err) {
        console.error("Failed to load system settings:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Dirty check — compares current state against loaded snapshot ────────
  const hasChanges = (() => {
    if (!savedValues.current) return false;
    const s = savedValues.current;
    return (
      Boolean(exportRetentionEnabled) !== Boolean(s.exportRetentionEnabled) ||
      Number(exportRetentionDays) !== Number(s.exportRetentionDays) ||
      Boolean(borrowingErasureEnabled) !== Boolean(s.borrowingErasureEnabled) ||
      Number(borrowingErasureDays) !== Number(s.borrowingErasureDays) ||
      Boolean(borrowRetentionEnabled) !== Boolean(s.borrowRetentionEnabled) ||
      Number(borrowRetentionDays) !== Number(s.borrowRetentionDays) ||
      Boolean(inventoryRetentionEnabled) !==
        Boolean(s.inventoryRetentionEnabled) ||
      Number(inventoryRetentionDays) !== Number(s.inventoryRetentionDays) ||
      Boolean(isAdminApprovalRequired) !==
        Boolean(s.isAdminApprovalRequired) ||
      Boolean(inventoryErasureEnabled) !==
        Boolean(s.inventoryErasureEnabled) ||
      Number(inventoryErasureDays) !== Number(s.inventoryErasureDays)
    );
  })();

  // ── Open confirm modal (only called when dirty) ────────────────────────
  const handleSaveClick = useCallback(() => {
    if (hasChanges) {
      setShowConfirmModal(true);
    }
  }, [hasChanges]);

  // ── Confirmed save ─────────────────────────────────────────────────────
  const handleConfirmSave = useCallback(async () => {
    setShowConfirmModal(false);
    setSaving(true);

    let exportSuccess = false;
    let legacySuccess = false;
    let exportError = null;
    let legacyError = null;

    // ── 1. Save export erasure settings → system_configurations table ────
    try {
      await saveExportSettings({
        exportRetentionEnabled,
        exportRetentionDays: Number(exportRetentionDays),
        borrowingErasureEnabled,
        borrowingErasureDays: Number(borrowingErasureDays),
        borrowRetentionEnabled,
        borrowRetentionDays: Number(borrowRetentionDays),
        inventoryRetentionEnabled,
        inventoryRetentionDays: Number(inventoryRetentionDays),
        isAdminApprovalRequired,
        inventoryErasureEnabled,
        inventoryErasureDays: Number(inventoryErasureDays),
      });
      exportSuccess = true;
    } catch (err) {
      console.error("Failed to save export settings:", err);
      exportError = err;
    }

    // ── 2. Save borrowing/inventory/admin settings → inventory_settings ─
    try {
      const entries = [
        {
          key: "retention.borrowing.enabled",
          value: borrowRetentionEnabled,
        },
        {
          key: "retention.borrowing.days",
          value: { days: Number(borrowRetentionDays) },
        },
        {
          key: "retention.inventory.enabled",
          value: inventoryRetentionEnabled,
        },
        {
          key: "retention.inventory.days",
          value: { days: Number(inventoryRetentionDays) },
        },
        {
          key: "borrowing.require_admin_approval",
          value: isAdminApprovalRequired,
        },
      ];

      await Promise.allSettled(
        entries.map(({ key, value }) => upsertSetting(key, value))
      );
      legacySuccess = true;
    } catch (err) {
      console.error("Failed to save legacy settings:", err);
      legacyError = err;
    }

    // ── Result handling ──────────────────────────────────────────────────
    if (exportSuccess && legacySuccess) {
      // Update snapshot so button disables again until next change
      savedValues.current = {
        exportRetentionEnabled,
        exportRetentionDays: Number(exportRetentionDays),
        borrowingErasureEnabled,
        borrowingErasureDays: Number(borrowingErasureDays),
        borrowRetentionEnabled,
        borrowRetentionDays: Number(borrowRetentionDays),
        inventoryRetentionEnabled,
        inventoryRetentionDays: Number(inventoryRetentionDays),
        isAdminApprovalRequired,
        inventoryErasureEnabled,
        inventoryErasureDays: Number(inventoryErasureDays),
      };

      toast.success("System settings saved successfully.", {
        description: "All configuration changes have been persisted.",
        duration: 3000,
      });
    } else {
      const errMsg =
        exportError?.message || legacyError?.message ||
        "An unexpected error occurred. Please try again.";
      toast.error("Failed to save settings.", {
        description: errMsg,
      });
    }

    setSaving(false);
  }, [
    exportRetentionEnabled,
    exportRetentionDays,
    borrowingErasureEnabled,
    borrowingErasureDays,
    borrowRetentionEnabled,
    borrowRetentionDays,
    inventoryRetentionEnabled,
    inventoryRetentionDays,
    isAdminApprovalRequired,
    inventoryErasureEnabled,
    inventoryErasureDays,
  ]);

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-56 rounded-lg bg-slate-100 animate-pulse" />
        {[1, 2].map((i) => (
          <div key={i} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="h-5 w-5 rounded bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 rounded bg-slate-100 animate-pulse" />
                  <div className="h-3 w-72 rounded bg-slate-100 animate-pulse" />
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="h-9 w-full rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-9 w-2/3 rounded-lg bg-slate-100 animate-pulse" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="h-5 w-5 rounded bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 rounded bg-slate-100 animate-pulse" />
                  <div className="h-3 w-72 rounded bg-slate-100 animate-pulse" />
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="h-9 w-full rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-9 w-2/3 rounded-lg bg-slate-100 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Top Row: Export + Admin Approval ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File Export Settings */}
        <SettingsCard
          icon={FileSpreadsheet}
          title="Automated Export File Erasure"
          description="Automatically purge exported .xlsx reports that exceed the configured retention threshold."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Enable auto-erasure
              </span>
              <ToggleSwitch
                enabled={exportRetentionEnabled}
                onToggle={setExportRetentionEnabled}
                ariaLabel="Toggle export file auto-erasure"
              />
            </div>

            <RevealPanel show={exportRetentionEnabled}>
              <div className="pt-3 border-t border-slate-100">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Retention threshold
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={exportRetentionDays}
                    onChange={(e) => setExportRetentionDays(e.target.value)}
                    className="no-number-spinner h-10 w-24 rounded-lg border-slate-200 bg-slate-50 text-sm text-slate-700 focus:border-[#411111] focus:ring-[#411111]"
                  />
                  <span className="text-sm text-slate-500">days</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Export files older than {exportRetentionDays} days will be
                  permanently removed by the daily cleanup worker.
                </p>
              </div>
            </RevealPanel>
          </div>
        </SettingsCard>

        {/* Administrative Borrowing Approval Guard */}
        <SettingsCard
          icon={ShieldCheck}
          title="Require Administrative Approval for Borrowing"
          description="When enabled, all student-initiated item requests will hold in a pending state until manually authorized by an administrator."
        >
          <div className="flex items-center justify-between">
            <p className="min-w-0 flex-1 pr-6 text-sm text-slate-500 leading-relaxed">
              
            </p>
            <ToggleSwitch
              enabled={isAdminApprovalRequired}
              onToggle={setIsAdminApprovalRequired}
              ariaLabel="Toggle administrative approval requirement"
            />
          </div>
        </SettingsCard>
      </div>

      {/* ── Bottom Row: Borrowing + Inventory Retention ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Borrowing Log Erasure */}
        <SettingsCard
          icon={Clock}
          title="Automated Borrowing Log Erasure"
          description="Automatically purge completed borrowing records that exceed the configured retention threshold. Active or pending records are never removed."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Enable auto-erasure
              </span>
              <ToggleSwitch
                enabled={borrowingErasureEnabled}
                onToggle={setBorrowingErasureEnabled}
                ariaLabel="Toggle borrowing log auto-erasure"
              />
            </div>

            <RevealPanel show={borrowingErasureEnabled}>
              <div className="pt-3 border-t border-slate-100">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Retention threshold
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={borrowingErasureDays}
                    onChange={(e) => setBorrowingErasureDays(e.target.value)}
                    className="no-number-spinner h-10 w-24 rounded-lg border-slate-200 bg-slate-50 text-sm text-slate-700 focus:border-[#411111] focus:ring-[#411111]"
                  />
                  <span className="text-sm text-slate-500">days</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Completed borrowing records older than {borrowingErasureDays} days will be
                  permanently removed. Active or pending records are never deleted.
                </p>
              </div>
            </RevealPanel>
          </div>
        </SettingsCard>

        {/* Inventory Audit Log Erasure (dynamic discovery + pg_cron) */}
        <SettingsCard
          icon={Clock}
          title="Automated Inventory Auditing Log Erasure"
          description="Automatically purge inventory activity logs from all inventory tables (including dynamically created tab log tables) that exceed the configured retention threshold."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Enable auto-erasure
              </span>
              <ToggleSwitch
                enabled={inventoryErasureEnabled}
                onToggle={setInventoryErasureEnabled}
                ariaLabel="Toggle inventory audit log auto-erasure"
              />
            </div>

            <RevealPanel show={inventoryErasureEnabled}>
              <div className="pt-3 border-t border-slate-100">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Retention threshold
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={inventoryErasureDays}
                    onChange={(e) => setInventoryErasureDays(e.target.value)}
                    className="no-number-spinner h-10 w-24 rounded-lg border-slate-200 bg-slate-50 text-sm text-slate-700 focus:border-[#411111] focus:ring-[#411111]"
                  />
                  <span className="text-sm text-slate-500">days</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Inventory audit logs older than {inventoryErasureDays} days
                  will be permanently removed from every inventory tab's log
                  table (including <code className="text-[11px] bg-slate-100 px-1 rounded">inventory_change_logs</code> and
                  all dynamically created <code className="text-[11px] bg-slate-100 px-1 rounded">*_logs</code> tables).
                </p>
              </div>
            </RevealPanel>
          </div>
        </SettingsCard>
      </div>

      {/* ── Sticky Floating Action Toolbar ─────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="button"
          onClick={saving || !hasChanges ? undefined : handleSaveClick}
          disabled={saving || !hasChanges}
          className={cn(
            "bg-[#411111] hover:bg-[#411111]/90 text-white font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 shadow-md shadow-[#411111]/10 transform active:scale-95 text-sm tracking-wide",
            (saving || !hasChanges) &&
              "opacity-40 cursor-not-allowed pointer-events-none shadow-none"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Configurations
            </>
          )}
        </Button>
      </div>

      {/* ── Confirmation Modal ─────────────────────────────────────────── */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              Save configuration changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to apply these settings? This will update
              system-wide policies including data retention schedules and
              borrowing approval rules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSave}
              className="bg-[#411111] hover:bg-[#3f0f0f] text-white rounded-lg px-6"
            >
              Yes, Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
