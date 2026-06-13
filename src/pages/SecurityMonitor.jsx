import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Clock,
  Monitor,
  Globe,
  Search,
  RefreshCw,
  Unlock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Ban,
  X,
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Helpers ────────────────────────────────────────────────────────

/** Mask a hash: show first 6 and last 4 chars */
function maskHash(hash) {
  if (!hash || hash.length < 12) return hash || "—";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** Format a duration from now until a future ISO timestamp */
function timeRemaining(iso) {
  if (!iso) return { text: "—", expired: true, ms: 0 };
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { text: "Expired", expired: true, ms: 0 };
  const secs = Math.ceil(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years >= 2) return { text: "Permanent", expired: false, ms: diff, permanent: true };
  if (years > 0) return { text: `${years}y ${days % 30}d`, expired: false, ms: diff };
  if (months > 0) return { text: `${months}mo ${days % 30}d`, expired: false, ms: diff };
  if (weeks > 0) return { text: `${weeks}w ${days % 7}d`, expired: false, ms: diff };
  if (days > 0) return { text: `${days}d ${hrs % 24}h`, expired: false, ms: diff };
  if (hrs > 0) return { text: `${hrs}h ${mins % 60}m`, expired: false, ms: diff };
  return { text: `${mins}m ${secs % 60}s`, expired: false, ms: diff };
}

const TIER_META = {
  0: { label: "Normal", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  1: { label: "Tier 1 — Warning", color: "bg-amber-100 text-amber-700 border-amber-200" },
  2: { label: "Tier 2 — Elevated", color: "bg-orange-100 text-orange-700 border-orange-200" },
  3: { label: "Tier 3 — High", color: "bg-red-100 text-red-700 border-red-200" },
  4: { label: "Tier 4 — Severe", color: "bg-red-200 text-red-800 border-red-300" },
  5: { label: "Tier 5 — Permanent Ban", color: "bg-red-600 text-white border-red-700" },
};

// ─── Live Countdown Cell ────────────────────────────────────────────

function CountdownCell({ suspendedUntil, tier }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rem = timeRemaining(suspendedUntil);

  if (tier >= 5 || rem.permanent) {
    return (
      <div className="flex items-center gap-1.5">
        <Ban className="h-3.5 w-3.5 text-red-500" />
        <span className="text-xs font-semibold text-red-600">Permanent</span>
      </div>
    );
  }

  if (rem.expired) {
    return (
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-600">Cleared</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 text-amber-500" />
      <span className="text-xs font-mono font-semibold text-amber-700 tabular-nums">
        {rem.text}
      </span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function SecurityMonitor() {
  const { showGlobalLoader, hideGlobalLoader } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [filterActive, setFilterActive] = useState(true);

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [unlockingId, setUnlockingId] = useState(null);

  // ── Fetch data ──────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("login_attempts_tracker")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      toast.error(`Failed to load security data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Derived data ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...records];

    // Filter: active only
    if (filterActive) {
      const now = new Date();
      list = list.filter(
        (r) => r.suspended_until && new Date(r.suspended_until) > now
      );
    }

    // Search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.email?.toLowerCase().includes(q) ||
          r.last_ip?.toString().includes(q) ||
          r.identifier_hash?.toLowerCase().includes(q) ||
          r.fingerprint_hash?.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (sortKey === "suspended_until" || sortKey === "updated_at" || sortKey === "created_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });

    return list;
  }, [records, search, sortKey, sortDir, filterActive]);

  const stats = useMemo(() => {
    const now = new Date();
    const active = records.filter(
      (r) => r.suspended_until && new Date(r.suspended_until) > now
    );
    const permanent = active.filter((r) => r.lockout_tier >= 5);
    const uniqueEmails = new Set(active.map((r) => r.email)).size;
    const uniqueIps = new Set(active.map((r) => r.last_ip)).size;
    return { total: records.length, active: active.length, permanent: permanent.length, uniqueEmails, uniqueIps };
  }, [records]);

  // ── Sort toggle ─────────────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 text-slate-300" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3 text-[#411111]" />
    ) : (
      <ChevronDown className="h-3 w-3 text-[#411111]" />
    );
  };

  // ── Unlock action ───────────────────────────────────────────────
  const handleUnlock = async () => {
    if (!confirmTarget) return;
    setUnlockingId(confirmTarget.id);
    setConfirmOpen(false);

    try {
      const { data, error } = await supabase.rpc("unlock_login_attempt_by_id", {
        p_id: confirmTarget.id,
      });

      if (error) throw error;

      toast.success(data?.message || "Lockout lifted successfully.");
      await fetchRecords();
    } catch (err) {
      toast.error(`Unlock failed: ${err.message}`);
    } finally {
      setUnlockingId(null);
      setConfirmTarget(null);
    }
  };

  const openConfirm = (record) => {
    setConfirmTarget(record);
    setConfirmOpen(true);
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search email, IP, or hash…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-md border-slate-200 bg-white text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filterActive ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterActive(true)}
            className={cn(
              "h-9 text-sm font-medium rounded-md",
              filterActive
                ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f] border border-[#4a1111]"
                : "border-slate-200 text-slate-600"
            )}
          >
            <ShieldAlert className="mr-1.5 h-4 w-4" />
            Active Only
          </Button>
          <Button
            variant={!filterActive ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterActive(false)}
            className={cn(
              "h-9 text-sm font-medium rounded-md",
              !filterActive
                ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f] border border-[#4a1111]"
                : "border-slate-200 text-slate-600"
            )}
          >
            All Records
          </Button>
        </div>
      </div>

      {/* ── Data Table ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  { key: "email", label: "Target User" },
                  { key: "last_ip", label: "IP Address" },
                  { key: "identifier_hash", label: "Device Footprint" },
                  { key: "lockout_tier", label: "Severity" },
                  { key: "consecutive_failures", label: "Failures" },
                  { key: "suspended_until", label: "Time Remaining" },
                  { key: "updated_at", label: "Last Attempt" },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <SortIcon col={col.key} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                        <ShieldCheck className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {filterActive ? "No active lockouts" : "No records found"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {filterActive
                            ? "All accounts are currently accessible."
                            : "The tracking table is empty."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const tierMeta = TIER_META[row.lockout_tier] || TIER_META[0];
                  const isActive =
                    row.suspended_until &&
                    new Date(row.suspended_until) > new Date();
                  const isPermanent = row.lockout_tier >= 5;

                  return (
                    <tr
                      key={row.id}
                      className="transition-colors even:bg-slate-50/50 hover:bg-slate-50/60"
                    >
                      {/* Target User */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                              isPermanent
                                ? "bg-red-100 text-red-600"
                                : isActive
                                ? "bg-amber-100 text-amber-600"
                                : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {(row.email?.[0] || "?").toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]">
                            {row.email || "—"}
                          </span>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-mono text-slate-600">
                            {row.last_ip || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Device Footprint */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-slate-400" />
                          <code className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {maskHash(row.fingerprint_hash || row.identifier_hash)}
                          </code>
                        </div>
                      </td>

                      {/* Severity Badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex w-[130px] justify-center text-xs font-semibold px-2 py-1 rounded-md border",
                            tierMeta.color
                          )}
                        >
                          {tierMeta.label}
                        </span>
                      </td>

                      {/* Failure Count */}
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            row.consecutive_failures >= 15
                              ? "text-red-600"
                              : row.consecutive_failures >= 9
                              ? "text-orange-600"
                              : row.consecutive_failures >= 3
                              ? "text-amber-600"
                              : "text-slate-500"
                          )}
                        >
                          {row.consecutive_failures}
                        </span>
                      </td>

                      {/* Time Remaining */}
                      <td className="px-4 py-3.5">
                        <CountdownCell
                          suspendedUntil={row.suspended_until}
                          tier={row.lockout_tier}
                        />
                      </td>

                      {/* Last Attempt */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-400">
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right">
                        {isActive || isPermanent ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={unlockingId === row.id}
                            onClick={() => openConfirm(row)}
                            className="h-8 rounded-md border-slate-200 text-slate-600 text-xs hover:bg-slate-50 hover:text-slate-900"
                          >
                            {unlockingId === row.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Unlock className="h-3 w-3 mr-1" />
                            )}
                            Unblock
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
          <div className="text-sm text-slate-500">
            Showing {filtered.length} of {records.length} records
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal ───────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Unblock</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `Unblock ${confirmTarget.email} on IP ${confirmTarget.last_ip || "unknown"}? This will immediately lift the login restriction.`
                : "This action will immediately lift the login restriction."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              disabled={unlockingId}
              className="rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlock}
              disabled={unlockingId}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              {unlockingId ? "Unblocking..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
