import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  Clock,
  Package,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { fetchBorrowingVelocity } from "@/lib/borrowingApi";
import {
  fetchDefectRateBySection,
  fetchSecurityThreatAssessment,
  fetchAuditAnomalies,
} from "@/lib/analyticsApi";
import { useInventoryCatalog } from "@/lib/inventoryApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═══════════════════════════════════════════════════════════════════════════
function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 ${className}`}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD — Primary metric display with optional progress bar
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({
  icon: Icon,
  iconBg = "bg-slate-50 border border-slate-200/60",
  iconColor = "text-slate-600",
  label,
  value,
  barPercent,
  barColor = "#4a1111",
  barLabel,
  sub,
  onClick,
}) {
  return (
    <div
      className={`group rounded-xl bg-white p-4 shadow-sm border border-slate-200/80 transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        onClick
          ? "cursor-pointer hover:shadow-md hover:border-slate-300/80"
          : "hover:shadow-md hover:border-slate-300/80"
      }`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
          >
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 leading-tight uppercase tracking-wide">
            {label}
          </p>
        </div>

        <p className="text-2xl font-bold font-sans text-slate-800 tracking-tight block mt-1">
          {value}
        </p>

        {barPercent !== undefined ? (
          <div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(Math.max(barPercent, 0), 100)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            <div className="mt-1.5">
              <span className="inline-flex items-center text-[10px] font-medium tracking-wide text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 lowercase first-letter:uppercase">
                {barLabel || `${barPercent}%`}
              </span>
            </div>
          </div>
        ) : null}

        {sub && (
          <div className="mt-1">
            <span className="inline-flex items-center text-[10px] font-medium tracking-wide text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 lowercase first-letter:uppercase">
              {sub}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART TOOLTIP — Custom HTML tooltip for the velocity ComposedChart
// ═══════════════════════════════════════════════════════════════════════════
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload || {};
  const returned = Number(data.items_returned ?? data.items_return ?? 0);
  const outstanding = Number(data.items_outstanding ?? 0);
  const total = Number(data.total_items_borrowed ?? 0);
  const transactions = Number(data.total_transactions ?? 0);
  const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/90 backdrop-blur-md p-4 shadow-xl min-w-[220px]">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {label}
      </p>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-xs text-slate-500">Total Borrowed</span>
          </div>
          <span className="text-sm font-bold text-slate-700">{total}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-500">Returned</span>
          </div>
          <span className="text-sm font-bold text-emerald-600">{returned}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="text-xs text-slate-500">Outstanding</span>
          </div>
          <span className="text-sm font-bold text-rose-500">{outstanding}</span>
        </div>

        <div className="border-t border-slate-100 pt-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-[#4a1111]" />
              <span className="text-xs text-slate-500">Transactions</span>
            </div>
            <span className="text-sm font-bold text-[#4a1111]">
              {transactions}
            </span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
          <span className="text-xs text-slate-400">Return Rate</span>
          <span
            className={`text-xs font-bold ${
              returnRate >= 70
                ? "text-emerald-600"
                : returnRate >= 40
                ? "text-amber-600"
                : "text-rose-600"
            }`}
          >
            {returnRate}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART LEGEND — Inline color-coded legend below the chart
// ═══════════════════════════════════════════════════════════════════════════
function ChartLegend() {
  const items = [
    { label: "Total Borrowed", dotClass: "bg-slate-400" },
    { label: "Returned", dotClass: "bg-emerald-500" },
    { label: "Outstanding", dotClass: "bg-rose-500" },
  ];

  return (
    <div className="flex items-center justify-center gap-6 mt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
          <span className="text-[11px] text-slate-400 font-medium">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION STACKED BAR — 100% stacked asset allocation per section
// ═══════════════════════════════════════════════════════════════════════════
function SectionStackedBar({ name, total, defective, borrowed, isLab = false, onClick }) {
  const safeTotal = total > 0 ? total : 1;

  const defectivePct = Math.round((defective / safeTotal) * 100);

  const wrapperClass = onClick
    ? "cursor-pointer rounded-lg p-2 -m-2 transition-colors hover:bg-slate-50 active:bg-slate-100"
    : "";

  const content = (() => {
    if (isLab) {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center">
            <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              {total} PCs
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {defective} defective components
            </span>
          </div>
        </div>
      );
    }

    const borrowedPct = Math.round((borrowed / safeTotal) * 100);
    const availablePct = Math.max(0, 100 - defectivePct - borrowedPct);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700 truncate max-w-[60%]">{name}</span>
          <span className="text-[11px] font-mono text-slate-400">{total}</span>
        </div>
        <div className="h-2.5 w-full bg-slate-100 rounded-full flex overflow-hidden shadow-inner/5">
          {availablePct > 0 && (
            <div className="h-2.5 bg-slate-300 transition-all duration-500" style={{ width: `${availablePct}%` }} title={`Available: ${Math.round((availablePct / 100) * total)}`} />
          )}
          {borrowedPct > 0 && (
            <div className="h-2.5 bg-amber-500 transition-all duration-500" style={{ width: `${borrowedPct}%` }} title={`Borrowed: ${borrowed}`} />
          )}
          {defectivePct > 0 && (
            <div className="h-2.5 bg-rose-500 transition-all duration-500" style={{ width: `${defectivePct}%` }} title={`Defective: ${defective}`} />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            {Math.max(0, Math.round((availablePct / 100) * total))}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {borrowed}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {defective}
          </span>
        </div>
      </div>
    );
  })();

  return (
    <div className={wrapperClass} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      {content}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const navigate = useNavigate();
  const { tabs: inventoryTabs } = useInventoryCatalog();

  // ── State ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allocationFilter, setAllocationFilter] = useState("all");

  // Analytics data
  const [defectBySection, setDefectBySection] = useState([]);
  const [threatAssessment, setThreatAssessment] = useState(null);
  const [auditAnomalies, setAuditAnomalies] = useState([]);

  // Borrowing data
  const [velocityData, setVelocityData] = useState([]);
  const [activeBorrowings, setActiveBorrowings] = useState(0);

  // Computer laboratory inventory
  const [compLabInventory, setCompLabInventory] = useState([]);

  // ── Data Loading ──────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [defectResult, threatResult, auditResult, velocityResult] =
        await Promise.allSettled([
          fetchDefectRateBySection(),
          fetchSecurityThreatAssessment(),
          fetchAuditAnomalies(7),
          fetchBorrowingVelocity({ days: 30 }),
        ]);

      if (defectResult.status === "fulfilled") {
        setDefectBySection(defectResult.value || []);
      } else {
        console.error("Defect rate fetch failed:", defectResult.reason);
        setDefectBySection([]);
      }

      if (threatResult.status === "fulfilled") {
        setThreatAssessment(threatResult.value || null);
      } else {
        console.error("Security threat fetch failed:", threatResult.reason);
        setThreatAssessment(null);
      }

      if (auditResult.status === "fulfilled") {
        const anomalies = auditResult.value?.offHoursChanges || [];
        setAuditAnomalies(anomalies);
      } else {
        console.error("Audit anomalies fetch failed:", auditResult.reason);
        setAuditAnomalies([]);
      }

      if (velocityResult.status === "fulfilled") {
        setVelocityData(velocityResult.value || []);
      } else {
        console.error("Borrowing velocity fetch failed:", velocityResult.reason);
        setVelocityData([]);
      }

      // ── Active Borrowings (currently out, not yet returned) ──────────────
      const { count: activeCount, error: activeErr } = await supabase
        .from("borrowing_records")
        .select("id", { count: "exact", head: true })
        .in("status", ["borrowed", "not_returned"]);
      if (activeErr) {
        console.error("Active borrowings fetch failed:", activeErr);
        setActiveBorrowings(0);
      } else {
        setActiveBorrowings(activeCount || 0);
      }

      // ── Computer Laboratory Inventory ──────────────────────────────────────
      const { data: labRows, error: labErr } = await supabase
        .from("lab_numbers")
        .select("id, lab_number, name")
        .order("lab_number", { ascending: true });

      if (labErr) throw labErr;

      let allComponents = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("computers_components")
          .select("computer_number, status, lab_number_id")
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allComponents = [...allComponents, ...data];
        from += batchSize;
        if (data.length < batchSize) break;
      }

      const grouped = {};
      for (const comp of allComponents) {
        if (!comp.lab_number_id) continue;
        const labId = comp.lab_number_id;
        const computerKey = String(comp.computer_number || "Unknown").trim();
        if (!grouped[labId]) grouped[labId] = {};
        if (!grouped[labId][computerKey]) {
          grouped[labId][computerKey] = { defectiveComponentCount: 0 };
        }
        const statusStr = String(comp.status || "").toUpperCase();
        if (statusStr.includes("DEFECT") || statusStr.includes("BROKEN")) {
          grouped[labId][computerKey].defectiveComponentCount += 1;
        }
      }

      const compLabSummaries = (labRows || []).map((lab) => {
        const pcs = Object.values(grouped[lab.id] || {});
        const total = pcs.length;
        const defective = pcs.reduce((sum, pc) => sum + pc.defectiveComponentCount, 0);
        return {
          id: lab.id,
          name: lab.name || `Laboratory ${lab.lab_number}`,
          total_pcs: total,
          available_pcs: total - defective,
          borrowed_pcs: 0,
          defective_pcs: defective,
        };
      }).filter((lab) => lab.total_pcs > 0 || lab.defective_pcs > 0);

      setCompLabInventory(compLabSummaries);

      const allFailed = [
        defectResult,
        threatResult,
        auditResult,
        velocityResult,
      ].every((r) => r.status === "rejected");
      if (allFailed) {
        setError("Failed to load dashboard data. Please try again.");
      }
    } catch (err) {
      console.error("Dashboard data loading failed:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ── Derived Metrics ────────────────────────────────────────────────────

  const totalAssets = useMemo(
    () =>
      defectBySection.reduce(
        (sum, row) => sum + (Number(row.total) || 0),
        0
      ),
    [defectBySection]
  );

  const totalDefective = useMemo(
    () =>
      defectBySection.reduce(
        (sum, row) => sum + (Number(row.defective) || 0),
        0
      ),
    [defectBySection]
  );

  const totalBorrowed = useMemo(
    () =>
      velocityData.reduce(
        (sum, row) => sum + (Number(row.total_items_borrowed) || 0),
        0
      ),
    [velocityData]
  );

  const defectRate = useMemo(
    () =>
      totalAssets > 0
        ? Math.round((totalDefective / totalAssets) * 10000) / 100
        : 0,
    [totalAssets, totalDefective]
  );

  const totalSections = defectBySection.length;

  const { totalLabPcs, totalOperationalLabPcs } = useMemo(
    () =>
      (compLabInventory || []).reduce(
        (acc, lab) => ({
          totalLabPcs: acc.totalLabPcs + (lab.total_pcs || 0),
          totalOperationalLabPcs: acc.totalOperationalLabPcs + (lab.available_pcs || 0),
        }),
        { totalLabPcs: 0, totalOperationalLabPcs: 0 }
      ),
    [compLabInventory]
  );

  const labOperationalRate = useMemo(
    () =>
      totalLabPcs > 0
        ? Math.round((totalOperationalLabPcs / totalLabPcs) * 1000) / 10
        : 0,
    [totalLabPcs, totalOperationalLabPcs]
  );

  // ── Filtered Allocation Data ───────────────────────────────────────────
  // Unified data source for the Asset Allocation card. Switches between
  // lab mode (2-tier bars) and section mode (3-tier bars) based on the
  // dropdown filter selection.
  const allocationRows = useMemo(() => {
    if (allocationFilter === "labs") {
      // Labs mode: 2-tier bars (Total PCs vs Defective)
      return (compLabInventory || []).map((lab) => ({
        id: lab.id,
        name: lab.name,
        total: lab.total_pcs,
        available: lab.available_pcs,
        borrowed: 0,
        defective: lab.defective_pcs,
        isLab: true,
      }));
    }

    // For "all" or a specific tab, use circulating sections
    let source = defectBySection;

    // If a specific tab is selected, filter sections by tab_id
    if (allocationFilter !== "all") {
      source = defectBySection.filter((s) => s.tabId === allocationFilter);
    } else {
      // "all" — exclude laboratory sections
      source = (inventoryTabs || []).length > 0
        ? defectBySection.filter((section) => {
            const sectionName = String(section.sectionName || "").toLowerCase();
            return !sectionName.includes("lab") && !sectionName.includes("laboratory");
          })
        : defectBySection;
    }

    return [...source]
      .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
      .slice(0, 5)
      .map((s) => ({
        id: s.sectionId,
        slug: s.sectionSlug || "",
        name: s.sectionName,
        total: Number(s.total) || 0,
        available: (Number(s.total) || 0) - (Number(s.defective) || 0) - (Number(s.borrowed) || 0),
        borrowed: Number(s.borrowed) || 0,
        defective: Number(s.defective) || 0,
        isLab: false,
      }));
  }, [allocationFilter, defectBySection, compLabInventory, inventoryTabs]);

  const chartSummary = useMemo(() => {
    if (!velocityData.length) {
      return {
        totalBorrowed: 0,
        totalReturned: 0,
        totalOutstanding: 0,
        totalTransactions: 0,
        avgReturnRate: 0,
      };
    }
    const totals = velocityData.reduce(
      (acc, d) => {
        const returned = Number(d.items_returned ?? d.items_return ?? 0);
        const outstanding = Number(d.items_outstanding ?? 0);
        const borrowed = Number(d.total_items_borrowed ?? 0);
        acc.borrowed += borrowed;
        acc.returned += returned;
        acc.outstanding += outstanding;
        acc.transactions += Number(d.total_transactions ?? 0);
        return acc;
      },
      { borrowed: 0, returned: 0, outstanding: 0, transactions: 0 }
    );
    return {
      totalBorrowed: totals.borrowed,
      totalReturned: totals.returned,
      totalOutstanding: totals.outstanding,
      totalTransactions: totals.transactions,
      avgReturnRate:
        totals.borrowed > 0
          ? Math.round((totals.returned / totals.borrowed) * 100)
          : 0,
    };
  }, [velocityData]);

  // ── Loading State ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-[380px]" />
          </div>
          <Skeleton className="h-[380px]" />
        </div>

        <Skeleton className="h-48" />
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Error Banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* ── Stat Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Fleet Assets */}
        <StatCard
          icon={Package}
          iconBg="bg-slate-50 border border-slate-200/60"
          iconColor="text-slate-600"
          label="Number of Sections"
          value={totalSections.toLocaleString()}
          sub={`${totalSections} section${totalSections !== 1 ? "s" : ""} tracked`}
        />

        {/* Card 2: System Defect Status */}
        <StatCard
          icon={AlertCircle}
          iconBg="bg-rose-50 border border-rose-100"
          iconColor="text-rose-600"
          label="System Defect Status"
          value={totalDefective.toLocaleString()}
          barPercent={defectRate}
          barColor={
            defectRate > 15
              ? "#e11d48"
              : defectRate > 10
              ? "#f59e0b"
              : "#e11d48"
          }
          barLabel={`${defectRate}% defect rate`}
         
        />

        {/* Card 3: Active Borrowings */}
        <StatCard
          icon={ClipboardList}
          iconBg="bg-slate-50 border border-slate-200/60"
          iconColor="text-slate-600"
          label="Active Borrowings"
          value={activeBorrowings.toLocaleString()}
          sub="Active transactions not yet returned"
          onClick={() => navigate("/borrowing")}
        />

        {/* Card 4: Lab Operational Rate */}
        <StatCard
          icon={ShieldCheck}
          iconBg="bg-emerald-50 border border-emerald-100"
          iconColor="text-emerald-600"
          label="Lab Operational Rate"
          value={`${labOperationalRate}%`}
          barPercent={labOperationalRate}
          barColor="#10b981"
          barLabel={`${labOperationalRate}% operational`}
        />
      </div>

      {/* ── Chart + Asset Allocation Breakdown ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 30-Day Borrowing Velocity Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200/80 bg-white shadow-sm p-6">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                30-Day Borrowing Velocity
              </h2>
              <p className="text-xs text-slate-400 tracking-wide mt-0.5">
                Daily borrowing, returns, and outstanding items
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Avg Return Rate</p>
              <p
                className={`text-xl font-bold ${
                  chartSummary.avgReturnRate >= 70
                    ? "text-emerald-600"
                    : chartSummary.avgReturnRate >= 40
                    ? "text-amber-600"
                    : "text-rose-600"
                }`}
              >
                {chartSummary.avgReturnRate}%
              </p>
            </div>
          </div>

          {/* ── Chart Canvas ────────────────────────────────────────────── */}
          {velocityData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
              <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No borrowing data for the selected period</p>
            </div>
          ) : (
            <>
              <div className="h-[300px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={velocityData}
                    margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="display_date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="total_items_borrowed"
                      name="Total Borrowed"
                      fill="#cbd5e1"
                      maxBarSize={28}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="linear"
                      dataKey="items_returned"
                      name="Returned"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: "#059669" }}
                    />
                    <Line
                      type="linear"
                      dataKey="items_outstanding"
                      name="Outstanding"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      dot={{ fill: "#f43f5e", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: "#e11d48" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <ChartLegend />
            </>
          )}

          {/* ── Metric Footers ──────────────────────────────────────────── */}
          {velocityData.length > 0 && (
            <div className="grid grid-cols-4 mt-5 pt-5 border-t border-slate-100">
              <div className="text-center border-r border-slate-100">
                <p className="text-xl font-mono font-bold text-slate-600">
                  {chartSummary.totalBorrowed}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                  Total Borrowed
                </p>
              </div>
              <div className="text-center border-r border-slate-100">
                <p className="text-xl font-mono font-bold text-emerald-600">
                  {chartSummary.totalReturned}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                  Returned
                </p>
              </div>
              <div className="text-center border-r border-slate-100">
                <p className="text-xl font-mono font-bold text-rose-500">
                  {chartSummary.totalOutstanding}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                  Outstanding
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-mono font-bold text-[#4a1111]">
                  {chartSummary.totalTransactions}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                  Transactions
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Asset Allocation Card (Filterable) ────────────────────────── */}
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden flex flex-col h-full">
          {/* ── Card Header with Filter Dropdown ────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
              Asset Distribution
            </h2>
            <Select value={allocationFilter} onValueChange={setAllocationFilter}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-[#4a1111]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md border-slate-200 bg-white shadow-lg">
                <SelectItem value="all" className="text-xs font-medium">All Circulating Assets</SelectItem>
                <SelectItem value="labs" className="text-xs font-medium">Computer Laboratories</SelectItem>
                {(inventoryTabs || []).map((tab) => (
                  <SelectItem key={tab.id} value={String(tab.id)} className="text-xs font-medium">
                    {tab.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Dynamic Content ──────────────────────────────────────────── */}
          {allocationRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-slate-400 px-5">
              <Package className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm text-center">
                {allocationFilter === "labs"
                  ? "No laboratory data available"
                  : "No inventory data for this filter"}
              </p>
              <p className="text-xs text-slate-300 mt-1">
                {allocationFilter === "labs"
                  ? "Add laboratories and components to populate this view"
                  : "Ensure inventory items exist in this category"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              <div className="px-5 py-5 space-y-5">
                {allocationRows.map((row) => (
                  <SectionStackedBar
                    key={row.id}
                    name={row.name}
                    total={row.total}
                    defective={row.defective}
                    borrowed={row.borrowed}
                    isLab={row.isLab}
                  />
                ))}
              </div>

              {/* ── Contextual Footer Legend ───────────────────────────── */}
              <div className="mt-auto p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center gap-x-5">
                {allocationFilter === "labs" ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      Total PCs
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Defective
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      Available
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Borrowed
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Defective
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Off-Hours Transaction Anomalies ───────────────────────────── */}
      {auditAnomalies.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200/60">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Off-Hours Transaction Anomalies
                </h2>
                <p className="text-xs text-amber-700 mt-0.5">
                  {auditAnomalies.length} unauthorized mutation
                  {auditAnomalies.length !== 1 ? "s" : ""} detected outside
                  business hours
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {auditAnomalies.length} alert
              {auditAnomalies.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y divide-amber-100">
            {auditAnomalies.map((anomaly, idx) => {
              const action = String(
                anomaly.action || "UNKNOWN"
              ).toUpperCase();
              const tableName =
                anomaly.tableName || anomaly.table_name || "—";
              const changedBy =
                anomaly.changedBy || anomaly.changed_by || "—";
              const changeTs =
                anomaly.changeTs || anomaly.change_ts || anomaly.timestamp;

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between px-5 py-3 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        action === "DELETE"
                          ? "bg-rose-100 text-rose-700"
                          : action === "INSERT"
                          ? "bg-emerald-100 text-emerald-700"
                          : action === "UPDATE"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {action}
                    </span>
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {tableName}
                    </span>
                    <span className="text-xs text-slate-400">
                      by {changedBy}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {anomaly.hour !== undefined && (
                      <span className="text-xs text-amber-700 font-medium">
                        {anomaly.hour}:00 UTC
                      </span>
                    )}
                    {changeTs && (
                      <span className="text-xs text-slate-400">
                        {new Date(changeTs).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
