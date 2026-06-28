import { useState, useMemo } from "react";
import {
  ShieldAlert,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  Search,
  RefreshCw,
  Clock,
  Users,
  Wrench,
  Activity,
  BarChart3,
  Package,
} from "lucide-react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { usePrescriptiveInsights } from "@/hooks/usePrescriptiveInsights";
import AnalyticsStatCard from "@/components/analytics/AnalyticsStatCard";
import TimeRangeSelector from "@/components/analytics/TimeRangeSelector";
import InsightPanel from "@/components/analytics/InsightPanel";
import ItemBorrowingAnalysisChart from "@/components/analytics/charts/ItemBorrowingAnalysisChart";
import BorrowingComplianceChart from "@/components/analytics/charts/BorrowingComplianceChart";


// ─── Skeleton Loader ─────────────────────────────────────────────────────
function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 ${className}`}
    />
  );
}

// ─── Section Header ──────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div>
      <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
        {title}
      </h3>
      {subtitle && (
        <p className="text-[10px] text-slate-400 font-normal font-sans mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState("30");

  const {
    defectBySection,
    borrowingCompliance,
    securityThreat,
    topBorrowers,
    auditAnomalies,
    defectTrend,
    inventoryUtilization,
    itemDetails,
    borrowingItemsBySection,
    defectiveReturns,
    loading,
    error,
    lastUpdated,
    refetch,
  } = useAnalytics(timeRange);

  // ── Brand Reliability Data ────────────────────────────────────────────────
  // Groups items by brand, calculates defect rate per unit (respecting quantity)
  const brandReliability = useMemo(() => {
    const brandMap = new Map();
    for (const item of itemDetails || []) {
      const brand = String(
        item.brand || item.manufacturer || item.make || ""
      ).trim();
      if (!brand || brand === "Unknown" || brand === "") continue;

      // Get quantity — items can represent multiple units
      const quantityValue = item.quantity ?? item.data?.quantity ?? 1;
      const quantity = Number(quantityValue);
      const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

      if (!brandMap.has(brand)) {
        brandMap.set(brand, { total: 0, defective: 0 });
      }
      const entry = brandMap.get(brand);
      entry.total += qty;

      // Check if item is defective
      const statusStr = String(item.status || item.condition || item.item_status || "").toLowerCase();
      const dataStr = String(
        item.data ? JSON.stringify(item.data) :
        item.remarks || item.notes || item.details || ""
      ).toLowerCase();
      if (statusStr.includes("defect") || statusStr.includes("broken") || dataStr.includes("defect") || dataStr.includes("broken")) {
        entry.defective += qty;
      }
    }

    return Array.from(brandMap.entries())
      .map(([brand, data]) => ({
        brand,
        total: data.total,
        defective: data.defective,
        defectRate: data.total > 0 ? Math.round((data.defective / data.total) * 10000) / 100 : 0,
      }))
      .filter((b) => b.total >= 3) // minimum 3 units to qualify
      .sort((a, b) => b.defectRate - a.defectRate)
      .slice(0, 10);
  }, [itemDetails]);

  // Build analytics data object for prescriptive engine
  const analyticsData = useMemo(
    () => ({
      inventoryUtilization,
      itemDetails,
      borrowing: borrowingCompliance,
      security: securityThreat,
      topBorrowers,
      audit: auditAnomalies,
    }),
    [inventoryUtilization, itemDetails, borrowingCompliance, securityThreat, topBorrowers, auditAnomalies]
  );

  const { criticalCount, warningCount, infoCount, hasCritical } =
    usePrescriptiveInsights(analyticsData);

  // ── Unified Prescriptive Actions (Explicit Calculation) ─────────────────
  const allPrescriptiveActions = useMemo(() => {
    const actions = [];

    // ── Type 1: Category Failure Rates → "Assess Equipment Health" ──────
    for (const section of defectBySection) {
      if (section.defectRate > 15) {
        actions.push({
          id: `health-${section.sectionName}`,
          severity: "critical",
          type: "maintenance",
          title: "Assess Equipment Health",
          message: `${section.sectionName} (${section.tabName}) has a ${section.defectRate}% defect rate (${section.defective}/${section.total} units logged). Schedule a technical lab review to fix or retire these units.`,
        });
      } else if (section.defectRate > 10) {
        actions.push({
          id: `health-warning-${section.sectionName}`,
          severity: "warning",
          type: "maintenance",
          title: "Assess Equipment Health",
          message: `${section.sectionName} (${section.tabName}) defect rate at ${section.defectRate}% (${section.defective}/${section.total} units). Approaching critical threshold — schedule preventive review.`,
        });
      }
    }

    // ── Type 2: High Allocation/Borrowing Rates → "Monitor Allocation Capacity" ──
    for (const section of inventoryUtilization) {
      if (section.utilizationRate > 80 && section.available > 0) {
        actions.push({
          id: `allocation-${section.sectionId}`,
          severity: "info",
          type: "loan_activity",
          title: "Monitor Allocation Capacity",
          message: `${section.sectionName} (${section.tabName}) utilization is at ${section.utilizationRate}% (${section.borrowed}/${section.total} units out). Monitor upcoming return deadlines to ensure availability for other lab sessions.`,
        });
      }
    }

    // ── Type 3: Brand Reliability Issues → "Review Brand Performance" ────
    const brandMap = new Map();
    for (const item of itemDetails) {
      const brand = String(
        item.brand || item.manufacturer || item.make || "Unknown"
      ).trim();
      if (!brand || brand === "Unknown" || brand === "") continue;

      if (!brandMap.has(brand)) {
        brandMap.set(brand, { total: 0, defective: 0 });
      }
      const entry = brandMap.get(brand);

      const directQty = Number(item.quantity);
      const qty =
        Number.isFinite(directQty) && directQty > 0
          ? directQty
          : Number.isFinite(Number(item.data?.quantity)) && Number(item.data?.quantity) > 0
          ? Number(item.data.quantity)
          : 1;
      entry.total += qty;

      const statusStr = String(item.status || item.condition || item.item_status || "").toLowerCase();
      const dataStr = String(
        item.data
          ? JSON.stringify(item.data)
          : item.remarks || item.notes || item.details || ""
      ).toLowerCase();
      if (statusStr.includes("defect") || dataStr.includes("defect")) {
        entry.defective += qty;
      }
    }

    const BRAND_DEFECT_THRESHOLD = 15;
    const BRAND_MIN_SAMPLE = 3;
    for (const [brandName, data] of brandMap.entries()) {
      if (data.total < BRAND_MIN_SAMPLE) continue;
      const brandDefectRate = Math.round((data.defective / data.total) * 10000) / 100;

      if (brandDefectRate > BRAND_DEFECT_THRESHOLD) {
        actions.push({
          id: `brand-${brandName}`,
          severity: brandDefectRate > 30 ? "critical" : "warning",
          type: "vendor_audit",
          title: "Review Brand Performance",
          message: `${brandName} has logged a ${brandDefectRate}% failure rate (${data.defective}/${data.total} units). Consider setting this brand's stock aside for an audit before future distributions.`,
        });
      }
    }

    // ── Type 4: Predictive Exhaustion → "Anticipated Item Deficit" ──────
    for (const section of inventoryUtilization) {
      const available = section.available || 0;
      const borrowed = section.borrowed || 0;
      const total = section.total || 0;
      const utilization = section.utilizationRate || 0;

      if (utilization > 70 && available < 5 && total > 0) {
        const borrowPace = borrowed / 30;
        const daysLeft = borrowPace > 0 ? Math.round(available / borrowPace) : 999;

        if (daysLeft < 30) {
          actions.push({
            id: `deficit-${section.sectionId}`,
            severity: "warning",
            type: "stock_velocity",
            title: "Anticipated Item Deficit",
            message: `${section.sectionName} (${section.tabName}) — current high-velocity checkout trends indicate this item pool could face localized exhaustion within 14 days.`,
          });
        }
      }
    }

    // ── Type 5: Frequently Borrowed Custom Items → "Consider Inventory Integration" ──
    // Aggregate custom items (no inventory) by name and flag those borrowed frequently
    const customItemTotals = new Map();
    for (const r of borrowingItemsBySection) {
      const section = r.sectionName || "Custom Item";
      if (section === "Custom Item" || section === "Uncategorized") {
        const name = r.variant || "Uncategorized";
        customItemTotals.set(name, (customItemTotals.get(name) || 0) + (Number(r.quantity) || 1));
      }
    }
    for (const [name, count] of customItemTotals) {
      if (count >= 3) {
        actions.push({
          id: `custom-item-${name}`,
          severity: "info",
          type: "inventory_integration",
          title: "Consider Inventory Integration",
          message: `"${name}" has been borrowed ${count} times but is not tracked in any inventory section. Consider adding it to the inventory system for better tracking and accountability.`,
        });
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    return actions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [defectBySection, inventoryUtilization, itemDetails, borrowingItemsBySection]);

  // ── Derived Stats ──────────────────────────────────────────────────────

  // Overall defect rate
  const overallDefectRate = useMemo(() => {
    if (!defectBySection.length) return 0;
    const total = defectBySection.reduce((s, d) => s + d.total, 0);
    const defective = defectBySection.reduce((s, d) => s + d.defective, 0);
    return total > 0 ? Math.round((defective / total) * 10000) / 100 : 0;
  }, [defectBySection]);

  // Average utilization
  const avgUtilization = useMemo(() => {
    if (!inventoryUtilization.length) return 0;
    return Math.round(
      inventoryUtilization.reduce((s, d) => s + d.utilizationRate, 0) /
        inventoryUtilization.length
    );
  }, [inventoryUtilization]);

  // Most borrowed item (variant with highest total quantity)
  const mostBorrowedItem = useMemo(() => {
    if (!borrowingItemsBySection.length) return { name: "—", count: 0, isCustom: false };
    const totals = new Map();
    for (const r of borrowingItemsBySection) {
      const v = r.variant || "Uncategorized";
      const section = r.sectionName || "Custom Item";
      const isCustom = section === "Custom Item";
      const key = `${v}::${section}`;
      if (!totals.has(key)) {
        totals.set(key, { name: v, section, count: 0, isCustom });
      }
      totals.get(key).count += Number(r.quantity) || 1;
    }
    let top = { name: "—", count: 0, isCustom: false, section: "" };
    for (const entry of totals.values()) {
      if (entry.count > top.count) top = entry;
    }
    return top;
  }, [borrowingItemsBySection]);

  // Most borrowed section (category with highest total quantity)
  const mostBorrowedSection = useMemo(() => {
    if (!borrowingItemsBySection.length) return { name: "—", count: 0 };
    const totals = new Map();
    for (const r of borrowingItemsBySection) {
      const s = r.sectionName || "Custom Item";
      totals.set(s, (totals.get(s) || 0) + (Number(r.quantity) || 1));
    }
    let top = { name: "—", count: 0 };
    for (const [name, count] of totals) {
      if (count > top.count) top = { name, count };
    }
    return top;
  }, [borrowingItemsBySection]);

  // Most defective brand
  const mostDefectiveBrand = useMemo(() => {
    if (!itemDetails.length) return { name: "—", rate: 0, defective: 0, total: 0 };
    const brandMap = new Map();

    // Helper: extract brand from item.data JSONB array
    const getBrandFromData = (data) => {
      if (!Array.isArray(data)) return null;
      const brandEntry = data.find(
        (d) =>
          d &&
          String(d.key || "")
            .toLowerCase()
            .includes("brand")
      );
      const val = brandEntry ? String(brandEntry.value || "").trim() : null;
      return val || null;
    };

    for (const item of itemDetails) {
      const brand = String(
        item.brand ||
          item.manufacturer ||
          item.make ||
          getBrandFromData(item.data) ||
          ""
      ).trim();
      if (!brand) continue;
      if (!brandMap.has(brand)) {
        brandMap.set(brand, { brand, total: 0, defective: 0 });
      }
      const entry = brandMap.get(brand);
      const directQty = Number(item.quantity);
      const qty =
        Number.isFinite(directQty) && directQty > 0
          ? directQty
          : Number.isFinite(Number(item.data?.quantity)) &&
            Number(item.data?.quantity) > 0
          ? Number(item.data.quantity)
          : 1;
      entry.total += qty;
      // Match BrandReliabilityMatrix defect detection
      const statusStr = String(
        item.status || item.condition || item.item_status || ""
      ).toLowerCase();
      const dataStr = String(
        item.data
          ? JSON.stringify(item.data)
          : item.remarks || item.notes || item.details || ""
      ).toLowerCase();
      if (statusStr.includes("defect") || dataStr.includes("defect")) {
        entry.defective += qty;
      }
    }
    // Risk score = defectRate * log2(defective + 1)
    // Weights absolute defective quantity so a brand with many defective
    // units ranks higher than one with the same rate but fewer items.
    let top = { name: "—", rate: 0, defective: 0, total: 0, score: -1 };
    for (const b of brandMap.values()) {
      if (b.total < 1) continue;
      const rate = (b.defective / b.total) * 100;
      const score = Math.round(rate * Math.log2(b.defective + 1));
      if (score > top.score) {
        top = {
          name: b.brand,
          rate: Math.round(rate * 100) / 100,
          defective: b.defective,
          total: b.total,
          score,
        };
      }
    }
    return top;
  }, [itemDetails]);

  // Repeat offenders
  const repeatOffenders = useMemo(() => {
    return (topBorrowers || []).filter((u) => u.late > 3).length;
  }, [topBorrowers]);

  // Top borrower name
  const topBorrowerName = topBorrowers?.[0]?.name || "—";


  // ── Insight Action Handler ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#4a1111]" />
            Analytics & Insights
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Comprehensive overview of your inventory, borrowing, and security data
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
          <p className="text-sm text-rose-700">
            Some analytics failed to load: {error}
          </p>
        </div>
      )}

      {/* ── Critical Alert Banner ────────────────────────────────────── */}
      {hasCritical && (
        <div className="flex items-center gap-3 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-800">
              {criticalCount} Critical Insight{criticalCount !== 1 ? "s" : ""} Requiring Attention
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              Review the Prescriptive Insights panel below for recommended actions.
            </p>
          </div>
        </div>
      )}

      {/* ── Stat Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))
        ) : (
          <>
            {/* Most Borrowed Item */}
            <AnalyticsStatCard
              icon={Package}
              iconBg="bg-slate-50 border border-slate-200/60"
              iconColor="text-slate-600"
              label="Most Borrowed Item"
              value={mostBorrowedItem.name}
              subtext={
                mostBorrowedItem.isCustom
                  ? `${mostBorrowedItem.count} borrows · Custom Item`
                  : `${mostBorrowedItem.count} borrows`
              }
            />

            {/* Most Borrowed Category */}
            <AnalyticsStatCard
              icon={TrendingUp}
              iconBg="bg-slate-50 border border-slate-200/60"
              iconColor="text-slate-600"
              label="Most Borrowed Category"
              value={mostBorrowedSection.name}
              subtext={`${mostBorrowedSection.count} total borrows`}
            />

            {/* Defective Returns */}
            <AnalyticsStatCard
              icon={Wrench}
              iconBg="bg-rose-50 border border-rose-100"
              iconColor="text-rose-600"
              label="Defective Returns"
              value={defectiveReturns}
              subtext="Items returned as defective"
            />

            {/* Most Defective Brand */}
            <AnalyticsStatCard
              icon={Users}
              iconBg="bg-slate-50 border border-slate-200/60"
              iconColor="text-slate-600"
              label="Most Defective Brand"
              value={mostDefectiveBrand.name}
              subtext={
                mostDefectiveBrand.name !== "—"
                  ? `${mostDefectiveBrand.rate}% defect rate · ${mostDefectiveBrand.defective}/${mostDefectiveBrand.total} units`
                  : "No brand data available"
              }
            />

            {/* Return Compliance */}
            <AnalyticsStatCard
              icon={ClipboardList}
              iconBg="bg-blue-50 border border-blue-100"
              iconColor="text-blue-600"
              label="Return Compliance"
              value={`${borrowingCompliance?.complianceRate ?? "—"}%`}
              subtext={
                borrowingCompliance
                  ? `${borrowingCompliance.onTimeReturns} on-time / ${borrowingCompliance.lateReturns} late`
                  : "Loading..."
              }
            />

            {/* Brand Defect Rate */}
            <AnalyticsStatCard
              icon={Wrench}
              iconBg="bg-rose-50 border border-rose-100"
              iconColor="text-rose-600"
              label="Top Brand Defect Rate"
              value={brandReliability.length > 0 ? `${brandReliability[0].defectRate}%` : "—"}
              subtext={brandReliability.length > 0 ? `${brandReliability[0].brand} (${brandReliability[0].defective}/${brandReliability[0].total})` : "No brand data"}
            />
          </>
        )}
      </div>

      {/* ── Charts Section ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {loading ? (
          <>
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
          </>
        ) : (
          <>
            <ItemBorrowingAnalysisChart
              borrowingItems={borrowingItemsBySection}
              loading={loading}
            />
            {/* Most Borrowed Assets Leaderboard */}
            <MostBorrowedAssetsLeaderboard borrowingItems={borrowingItemsBySection} />
            {/* Borrowing Return Breakdown */}
            <BorrowingComplianceChart
              complianceRate={borrowingCompliance?.complianceRate}
              onTime={borrowingCompliance?.onTimeReturns}
              late={borrowingCompliance?.lateReturns}
              outstanding={borrowingCompliance?.outstanding}
            />
            {/* Top Borrowers Table */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between h-[360px] overflow-hidden">
              <div>
                <SectionHeader
                  title="Compliance Rate Table"
                  subtitle="Ranked by borrowing volume (90 days, min. 3 borrows)"
                />
              </div>
              <div className="flex-1 overflow-auto scrollbar-thin">
                <table className="w-full">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-left border-b border-slate-100">Name</th>
                      <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Borrows</th>
                      <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Unreturned Items</th>
                      <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Defective Returns</th>
                      <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-right border-b border-slate-100">Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topBorrowers || []).slice(0, 10).map((user, i) => (
                      <tr key={i} className="border-b border-slate-100/70 last:border-0 hover:bg-slate-50/40 transition-colors">
                        <td className="py-2 px-3 text-left">
                          <span className="block text-xs font-semibold text-slate-800 truncate max-w-[160px]">{user.name}</span>
                          <span className="block text-[10px] text-slate-400 capitalize">{user.role || "—"}</span>
                        </td>
                        <td className="py-2 px-3 text-xs font-bold font-mono text-slate-700 text-center">{user.totalBorrows}</td>
                        <td className="py-2 px-3 text-xs font-bold font-mono text-slate-700 text-center">{user.unreturned || 0}</td>
                        <td className="py-2 px-3 text-xs font-bold font-mono text-center">
                          <span className={user.defectiveReturns > 0 ? "text-rose-600" : "text-slate-400"}>
                            {user.defectiveReturns || 0}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className={`inline-flex items-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                            user.complianceRate >= 85
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}>
                            {user.complianceRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!topBorrowers || topBorrowers.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                          No borrowing data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Prescriptive Decision Ledger (Full-Width) ── */}
      {!loading && (
        <InsightPanel insights={allPrescriptiveActions} />
      )}

      {/* ── Detailed Tables ──────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Defective Items by Section */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between h-[360px] overflow-hidden">
            <div>
              <SectionHeader
                title="Defect Rate by Section"
                subtitle="Items flagged as defective"
              />
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-left border-b border-slate-100">Section</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Total</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Defective</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-right border-b border-slate-100">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(defectBySection || [])
                    .sort((a, b) => b.defectRate - a.defectRate)
                    .slice(0, 8)
                    .map((section, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100/70 last:border-0 hover:bg-slate-50/40 transition-colors"
                      >
                        <td className="py-2 px-3 text-left">
                          <span className="block text-xs font-semibold text-slate-800 truncate max-w-[160px]">{section.sectionName}</span>
                          <span className="block text-[10px] text-slate-400">{section.tabName}</span>
                        </td>
                        <td className="py-2 px-3 text-xs font-bold font-mono text-slate-700 text-center">{section.total}</td>
                        <td className="py-2 px-3 text-xs font-bold font-mono text-center">
                          <span className={section.defective > 0 ? "text-rose-600" : "text-slate-400"}>
                            {section.defective}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className={`inline-flex items-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                            section.defectRate > 15
                              ? "bg-rose-50 text-rose-600 border border-rose-100"
                              : section.defectRate > 10
                              ? "bg-amber-50 text-amber-600 border border-amber-100"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          }`}>
                            {section.defectRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  {(!defectBySection || defectBySection.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-10 text-center text-xs text-slate-400"
                      >
                        No inventory data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Brand Reliability Index */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between h-[360px] overflow-hidden">
            <div>
              <SectionHeader
                title="Brand Reliability Index"
                subtitle="Top brands by defect rate (min. 3 items)"
              />
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-left border-b border-slate-100">Brand</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Total</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-center border-b border-slate-100">Defective</th>
                    <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 py-2 px-3 text-right border-b border-slate-100">Defective Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {brandReliability.map((b, i) => (
                    <tr key={i} className="border-b border-slate-100/70 last:border-0 hover:bg-slate-50/40 transition-colors">
                      <td className="py-2 px-3 text-xs font-semibold text-slate-800 truncate max-w-[160px]">{b.brand}</td>
                      <td className="py-2 px-3 text-xs font-bold font-mono text-slate-700 text-center">{b.total}</td>
                      <td className="py-2 px-3 text-xs font-bold font-mono text-center">
                        <span className={b.defective > 0 ? "text-rose-600" : "text-slate-400"}>
                          {b.defective}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={`inline-flex items-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          b.defectRate > 15
                            ? "bg-rose-50 text-rose-600 border border-rose-100"
                            : b.defectRate > 10
                            ? "bg-amber-50 text-amber-600 border border-amber-100"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        }`}>
                          {b.defectRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {brandReliability.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-xs text-slate-400">
                        No brand data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Anomalies ──────────────────────────────────────────── */}
      {!loading && auditAnomalies && auditAnomalies.offHoursCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm p-5">
          <SectionHeader
            icon={AlertTriangle}
            title="Audit Anomalies"
            subtitle={`${auditAnomalies.offHoursCount} changes detected outside business hours`}
          />
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {auditAnomalies.offHoursChanges.slice(0, 10).map((change, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      change.action === "DELETE"
                        ? "bg-rose-100 text-rose-700"
                        : change.action === "INSERT"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    {change.action}
                  </span>
                  <span className="text-slate-700 font-medium">
                    {change.tableName}
                  </span>
                  <span className="text-slate-400">by {change.changedBy || "unknown"}</span>
                </div>
                <span className="text-slate-400">
                  {new Date(change.changeTs).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Most Borrowed Assets Leaderboard ─────────────────────────────────────
function MostBorrowedAssetsLeaderboard({ borrowingItems = [] }) {
  const topAssets = useMemo(() => {
    if (!borrowingItems.length) return [];
    const totals = new Map();
    for (const r of borrowingItems) {
      const name = r.variant || "Uncategorized";
      const section = r.sectionName || "Custom Item";
      const key = `${name}::${section}`;
      if (!totals.has(key)) {
        totals.set(key, { name, section, count: 0 });
      }
      totals.get(key).count += Number(r.quantity) || 1;
    }
    return [...totals.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [borrowingItems]);

  const maxCount = topAssets[0]?.count || 1;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between h-[360px] overflow-hidden">
      {/* Header */}
      <div>
        <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
          Most Borrowed Assets
        </h3>
        <p className="text-[10px] text-slate-400 font-normal font-sans mt-0.5">
          Top performing units by transaction frequency
        </p>
      </div>

      {/* List — vertically centered */}
      <div className="flex-1 flex flex-col justify-center">
        {topAssets.length > 0 ? (
          <>
            {topAssets.map((asset, i) => {
              const isCustom =
                !asset.section ||
                asset.section === "Custom Item" ||
                asset.section === "Uncategorized";
              return (
                <div
                  key={`${asset.name}-${asset.section}`}
                  className="py-2.5 flex items-center justify-between border-b border-slate-100/70 last:border-0"
                >
                  {/* Left: Rank + Asset */}
                  <div className="flex items-center min-w-0">
                    <span className="w-4 text-xs font-bold font-mono text-slate-400 text-center mr-3">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                        {isCustom ? "Custom Item" : asset.section}
                      </p>
                    </div>
                  </div>

                  {/* Right: Count Badge */}
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shrink-0 ml-3">
                    Borrowed {asset.count} {asset.count === 1 ? "time" : "times"}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <p className="text-xs font-medium">
              No borrowing transaction trends recorded yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}