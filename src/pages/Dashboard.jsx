import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Cpu,
  Package,
  RotateCcw,
  Trophy,
  TrendingUp,
  CircleAlert,
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
import { supabase } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  fetchBorrowingRecords,
  fetchBorrowingVelocity,
  markOverdueBorrowingRecords,
} from "@/lib/borrowingApi";
import { getTabTableConfig, useInventoryCatalog } from "@/lib/inventoryApi";

// ─── Custom Tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload || {};
  const returned = Number(data.items_returned ?? data.items_return ?? 0);
  const outstanding = Number(data.items_outstanding ?? 0);
  const total = Number(data.total_items_borrowed ?? 0);
  const transactions = Number(data.total_transactions ?? 0);
  const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-4 shadow-xl min-w-[220px]">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {label}
      </p>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-500">Returned</span>
          </div>
          <span className="text-sm font-bold text-emerald-600">{returned}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="text-xs text-slate-500">Outstanding</span>
          </div>
          <span className="text-sm font-bold text-rose-500">{outstanding}</span>
        </div>

        <div className="border-t border-slate-100 pt-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <span className="text-xs text-slate-500">Total Borrowed</span>
            </div>
            <span className="text-sm font-bold text-slate-800">{total}</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-slate-500">Transactions</span>
            </div>
            <span className="text-sm font-bold text-amber-600">{transactions}</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
          <span className="text-xs text-slate-400">Return Rate</span>
          <span className={`text-xs font-bold ${returnRate >= 70 ? "text-emerald-600" : returnRate >= 40 ? "text-amber-600" : "text-rose-600"}`}>
            {returnRate}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Legend ──────────────────────────────────────────────────────
function ChartLegend() {
  const items = [
    { color: "#34d399", label: "Returned", dotClass: "bg-emerald-400" },
    { color: "#fb7185", label: "Outstanding", dotClass: "bg-rose-400" },
    { color: "#818cf8", label: "Transactions", dotClass: "bg-indigo-400" },
  ];

  return (
    <div className="flex items-center justify-center gap-6 mt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
          <span className="text-[11px] text-slate-500 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card Components ───────────────────────────────────────────────
function InventoryStatCard({ icon: Icon, iconBg, label, value, accent, barPercent, barColor, sub }) {
  return (
    <div className="group rounded-xl bg-white p-5 shadow-sm border border-slate-200/80 hover:shadow-md hover:border-slate-300/80 transition-all duration-200">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
        </div>
        <p className={`text-3xl font-extrabold ${accent || "text-slate-900"}`}>
          {value}
        </p>
        {barPercent !== undefined ? (
          <div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(barPercent, 100)}%`, backgroundColor: barColor || "#4a1111" }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">{barPercent}% defective rate</p>
          </div>
        ) : null}
        {sub ? <p className="text-[11px] text-slate-400">{sub}</p> : null}
      </div>
    </div>
  );
}

function BorrowingStatCard({ icon: Icon, iconBg, label, value, sub, onClick, accent }) {
  return (
    <div
      className="group rounded-xl bg-white p-5 shadow-sm border border-slate-200/80 hover:shadow-md hover:border-slate-300/80 transition-all duration-200 cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
        </div>
        <p className={`text-3xl font-extrabold ${accent || "text-slate-900"}`}>
          {value ?? 0}
        </p>
        <p className="text-[11px] text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

// ─── Main Dashboard ─────────────────────────────────────────────────────
const COMPUTER_LABS_TAB = {
  id: "computer-laboratories",
  name: "Computer Laboratories",
  slug: "laboratory",
  isComputerLabs: true,
};

const defaultBorrowingStats = {
  borrowedToday: 0,
  unreturned: 0,
  defectiveReturned: [],
  mostBorrowedItem: null,
};

const getBorrowedQuantity = (item = {}) => {
  const quantityDetail = (item.details || []).find((detail) => {
    const key = String(detail.key || "").toLowerCase();
    const label = String(detail.label || "").toLowerCase();
    return key === "quantity" || label === "quantity";
  });
  const quantity = Number(quantityDetail?.value ?? item.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const isSameLocalDay = (value, date = new Date()) => {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
};

const isDefectiveBorrowingItem = (item = {}) => {
  const values = [
    item.returnCondition,
    item.returnRemarks,
    ...(item.details || []).map((detail) => detail.value),
  ];
  return values.some((value) => String(value || "").toLowerCase().includes("defect"));
};

const summarizeBorrowingRecords = (records = []) => {
  const borrowedToday = records.reduce((total, record) => {
    if (!isSameLocalDay(record.date)) return total;
    return total + (record.items || []).reduce((sum, item) => sum + getBorrowedQuantity(item), 0);
  }, 0);

  const unreturned = records.reduce((total, record) => {
    const status = String(record.status || "").toLowerCase();
    if (!["borrowed", "not_returned"].includes(status)) return total;
    return total + (record.items || []).reduce((sum, item) => sum + getBorrowedQuantity(item), 0);
  }, 0);

  const defectiveReturned = records.flatMap((record) => {
    const status = String(record.status || "").toLowerCase();
    if (!["returned", "returned_late"].includes(status)) return [];
    return (record.items || [])
      .filter(isDefectiveBorrowingItem)
      .map((item) => ({
        id: `${record.id}-${item.id}`,
        item: item.label || "Item",
        borrower: record.name || "Unknown borrower",
        returnedAt: record.returnedAt,
        remarks: item.returnRemarks || "Defective",
      }));
  });

  const itemCounts = new Map();
  records.forEach((record) => {
    (record.items || []).forEach((item) => {
      const label = item.label || "Item";
      const quantity = getBorrowedQuantity(item);
      itemCounts.set(label, (itemCounts.get(label) || 0) + quantity);
    });
  });

  const mostBorrowedItem = [...itemCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)[0] || null;

  return { borrowedToday, unreturned, defectiveReturned, mostBorrowedItem };
};

const isDefectiveValue = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized.includes("DEFECT") || normalized.includes("BROKEN");
};

const getInventoryQuantity = (item = {}) => {
  const quantityValue = item.quantity ?? item.data?.quantity ?? 1;
  const quantity = Number(quantityValue);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const isDefectiveRecord = (record = {}) =>
  Object.entries(record).some(([key, value]) => {
    if (["id", "section_id", "created_at", "updated_at", "sort_order"].includes(key)) return false;
    if (value && typeof value === "object") return isDefectiveRecord(value);
    return isDefectiveValue(value);
  });

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [labs, setLabs] = useState([]);
  const [overall, setOverall] = useState({ total: 0, defective: 0 });
  const [borrowingStats, setBorrowingStats] = useState(defaultBorrowingStats);
  const [error, setError] = useState("");
  const { tabs: inventoryTabs, loading: tabsLoading, error: tabsError } = useInventoryCatalog();
  const [selectedTabSlug, setSelectedTabSlug] = useState("");
  const dashboardTabs = useMemo(() => [COMPUTER_LABS_TAB, ...inventoryTabs], [inventoryTabs]);

  // Borrowing velocity chart data (fetched from Supabase, last 30 days)
  const [velocityData, setVelocityData] = useState([]);
  const [velocityLoading, setVelocityLoading] = useState(true);
  const [velocityError, setVelocityError] = useState("");

  const defectiveRate = overall.total
    ? Math.round((overall.defective / overall.total) * 100)
    : 0;
  const activeDashboardTab = dashboardTabs.find((tab) => tab.slug === selectedTabSlug) || COMPUTER_LABS_TAB;
  const isComputerLabsSelected = activeDashboardTab.isComputerLabs;

  // ─── Derived chart metrics ──────────────────────────────────────────
  const chartSummary = useMemo(() => {
    const data = velocityData;
    if (!data.length) return { totalBorrowed: 0, totalReturned: 0, totalOutstanding: 0, totalTransactions: 0, avgReturnRate: 0 };
    const totals = data.reduce(
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
      avgReturnRate: totals.borrowed > 0 ? Math.round((totals.returned / totals.borrowed) * 100) : 0,
    };
  }, [velocityData]);

  // ─── Tab selection ─────────────────────────────────────────────────
  useEffect(() => {
    if (dashboardTabs.length === 0) return;
    if (!selectedTabSlug && dashboardTabs.length > 0) {
      setSelectedTabSlug(dashboardTabs[0].slug);
    }
  }, [selectedTabSlug, dashboardTabs]);

  // ─── Data loading ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        // Fetch borrowing velocity in parallel with other dashboard data
        setVelocityLoading(true);
        setVelocityError("");
        const velocityPromise = fetchBorrowingVelocity({ days: 30 }).then(
          (result) => {
            if (!cancelled) {
              setVelocityData(result);
              setVelocityLoading(false);
            }
          },
          (err) => {
            console.error("Failed to fetch borrowing velocity:", err);
            if (!cancelled) {
              setVelocityError(err.message || "Failed to load velocity data");
              setVelocityLoading(false);
            }
          }
        );

        await markOverdueBorrowingRecords({ days: 3 });
        const borrowingRecords = await fetchBorrowingRecords({ status: null });
        const borrowingSummary = summarizeBorrowingRecords(borrowingRecords);

        // Ensure velocity fetch completes before we finish loading
        await velocityPromise;

        if (!selectedTabSlug) {
          if (!cancelled) {
            setLabs([]);
            setOverall({ total: 0, defective: 0 });
            setBorrowingStats(borrowingSummary);
            setLoading(false);
          }
          return;
        }

        const selectedTab = dashboardTabs.find((tab) => tab.slug === selectedTabSlug);
        if (!selectedTab) {
          if (!cancelled) {
            setLabs([]);
            setOverall({ total: 0, defective: 0 });
            setBorrowingStats(borrowingSummary);
            setLoading(false);
          }
          return;
        }

        let labSummaries = [];
        let overallTotal = 0;
        let totalDefectiveCount = 0;

        if (selectedTab.isComputerLabs) {
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
            if (isDefectiveValue(comp.status)) {
              totalDefectiveCount++;
              grouped[labId][computerKey].defectiveComponentCount += 1;
            }
          }

          labSummaries = (labRows || [])
            .map((lab) => {
              const pcs = Object.values(grouped[lab.id] || {});
              const total = pcs.length;
              const defective = pcs.reduce((sum, pc) => sum + pc.defectiveComponentCount, 0);
              overallTotal += total;
              return {
                id: lab.id,
                label: lab.name || `Laboratory ${lab.lab_number}`,
                total,
                defective,
                path: `/inventory/laboratory?labId=${lab.id}&defectiveOnly=1`,
              };
            })
            .filter((lab) => lab.total > 0 || lab.defective > 0);
        } else {
          const sectionData = selectedTab.sections || [];
          const sectionIds = sectionData.map((section) => section.id);
          const grouped = sectionData.reduce((acc, section) => {
            acc[section.id] = {
              id: section.id,
              label: section.name,
              total: 0,
              defective: 0,
              path: `/inventory/${selectedTab.slug}?section=${section.slug}&defectiveOnly=1`,
            };
            return acc;
          }, {});

          if (sectionIds.length > 0) {
            const tabConfig = await getTabTableConfig(selectedTab.id);
            const tableName = tabConfig?.tableName;

            if (tableName) {
              let allItems = [];
              let from = 0;
              const batchSize = 1000;

              while (true) {
                const { data, error } = await supabase
                  .from(tableName)
                  .select("*")
                  .in("section_id", sectionIds)
                  .range(from, from + batchSize - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;
                allItems = [...allItems, ...data];
                from += batchSize;
                if (data.length < batchSize) break;
              }

              for (const item of allItems) {
                if (!grouped[item.section_id]) continue;
                const quantity = getInventoryQuantity(item);
                grouped[item.section_id].total += quantity;
                overallTotal += quantity;
                if (isDefectiveRecord(item)) {
                  grouped[item.section_id].defective += quantity;
                  totalDefectiveCount += quantity;
                }
              }
            }
          }

          labSummaries = Object.values(grouped);
        }

        if (!cancelled) {
          setLabs(labSummaries);
          setOverall({ total: overallTotal, defective: totalDefectiveCount });
          setBorrowingStats(borrowingSummary);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cancelled) setError(err.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedTabSlug, dashboardTabs]);

  // ─── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
            role="status"
            aria-label="Loading dashboard data"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 border border-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          DUAL-ZONE LAYOUT: Inventory (left) | Borrowing (right)
         ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ═══════════════════════════════════════════════════════════════
            LEFT HALF — INVENTORY SECTION
           ═══════════════════════════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">
          {/* Tab Selection */}
          {!tabsLoading && !tabsError && dashboardTabs.length > 0 ? (
            <div className="max-w-full overflow-x-auto pb-1">
              <div className="flex flex-wrap items-center gap-2">
                {dashboardTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedTabSlug(tab.slug)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      tab.slug === selectedTabSlug
                        ? "bg-[#4a1111] text-white shadow-sm"
                        : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>
          ) : tabsLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : tabsError ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{tabsError}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-500">
              No inventory tabs found. Add one from the inventory manager.
            </div>
          )}

          {/* Inventory Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InventoryStatCard
              icon={isComputerLabsSelected ? Cpu : Package}
              iconBg="bg-[#4a1111]"
              label={isComputerLabsSelected ? "Total PCs" : "Total Stock"}
              value={overall.total.toLocaleString()}
              accent="text-slate-900"
              barPercent={defectiveRate}
              barColor="#e11d48"
              sub={isComputerLabsSelected ? "Across all labs" : "All sections"}
            />
            <InventoryStatCard
              icon={CircleAlert}
              iconBg="bg-rose-500"
              label={isComputerLabsSelected ? "Defective Components" : "Defective Items"}
              value={overall.defective.toLocaleString()}
              accent="text-rose-600"
              sub={isComputerLabsSelected ? "Total defective parts" : "Marked defective"}
            />
            <InventoryStatCard
              icon={Boxes}
              iconBg="bg-slate-700"
              label={isComputerLabsSelected ? "Labs" : "Sections"}
              value={labs.length.toLocaleString()}
              accent="text-slate-900"
              sub={isComputerLabsSelected ? "Active laboratories" : "Active sections"}
            />
          </div>

          {/* Lab / Section Details Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {labs.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No data found for this tab</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {isComputerLabsSelected ? "PCs" : "Items"}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {isComputerLabsSelected ? "Defective" : "Defective"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {labs.map((lab) => (
                      <tr
                        key={lab.id}
                        className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                        onClick={() => navigate(lab.path || `/inventory/laboratory?labId=${lab.id}&defectiveOnly=1`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            navigate(lab.path || `/inventory/laboratory?labId=${lab.id}&defectiveOnly=1`);
                        }}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900">
                          {lab.label}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{lab.total}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <span className={lab.defective > 0 ? "text-rose-600" : "text-slate-400"}>
                            {lab.defective}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ═══════════════════════════════════════════════════════════════
            RIGHT HALF — BORROWING SECTION
           ═══════════════════════════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">
          <div className="hidden lg:block h-9" aria-hidden="true" />

          {/* Borrowing Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <BorrowingStatCard
              icon={ClipboardList}
              iconBg="bg-[#4a1111]"
              label="Borrowed Today"
              value={borrowingStats.borrowedToday}
              sub="Items borrowed today"
              onClick={() => navigate("/borrowing")}
            />
            <BorrowingStatCard
              icon={RotateCcw}
              iconBg="bg-rose-500"
              label="Unreturned"
              value={borrowingStats.unreturned}
              sub="Still borrowed"
              accent="text-rose-600"
              onClick={() => navigate("/borrowing")}
            />
            <BorrowingStatCard
              icon={Trophy}
              iconBg="bg-amber-500"
              label="Most Borrowed"
              value={borrowingStats.mostBorrowedItem?.label || "—"}
              sub={
                borrowingStats.mostBorrowedItem
                  ? `${borrowingStats.mostBorrowedItem.count} borrows`
                  : "No records"
              }
              onClick={() => navigate("/borrowing")}
            />
          </div>

          {/* ─── Inventory Velocity Combo Chart ──────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">Inventory Velocity</p>
                <p className="text-[11px] text-slate-400">30-day borrowing flow — returned vs outstanding</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1">
                <TrendingUp className="h-3 w-3 text-indigo-500" />
                <span className="text-[11px] font-semibold text-indigo-600">
                  {chartSummary.avgReturnRate}% return rate
                </span>
              </div>
            </div>

            {/* Chart Summary Row */}
            <div className="grid grid-cols-4 border-b border-slate-100 divide-x divide-slate-100">
              {[
                { label: "Total Borrowed", value: chartSummary.totalBorrowed, color: "text-slate-800" },
                { label: "Returned", value: chartSummary.totalReturned, color: "text-emerald-600" },
                { label: "Outstanding", value: chartSummary.totalOutstanding, color: "text-rose-500" },
                { label: "Transactions", value: chartSummary.totalTransactions, color: "text-indigo-600" },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Recharts ComposedChart */}
            <div className="p-4 pt-2">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart
                  data={velocityData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradientReturned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradientOutstanding" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#fb7185" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradientLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

                  <XAxis
                    dataKey="display_date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />

                  {/* Left Y-Axis — stacked bars */}
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={36}
                  />

                  {/* Right Y-Axis — line overlay */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={36}
                  />

                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />

                  {/* Stacked bars: returned (bottom) + outstanding (top) */}
                  <Bar
                    yAxisId="left"
                    dataKey="items_returned"
                    stackId="items"
                    fill="url(#gradientReturned)"
                    radius={[0, 0, 0, 0]}
                    name="Returned"
                    maxBarSize={32}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="items_outstanding"
                    stackId="items"
                    fill="url(#gradientOutstanding)"
                    radius={[4, 4, 0, 0]}
                    name="Outstanding"
                    maxBarSize={32}
                  />

                  {/* Overlay line: total transactions */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="total_transactions"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#818cf8", stroke: "#fff", strokeWidth: 2 }}
                    name="Transactions"
                  />
                </ComposedChart>
              </ResponsiveContainer>

              <ChartLegend />
            </div>
          </div>

          {/* Defective Items Returned */}
          <div
            className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden cursor-pointer hover:border-slate-300 transition-colors"
            onClick={() => navigate("/borrowing?view=history")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/borrowing?view=history");
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">Defective Items Returned</p>
                <p className="text-[11px] text-slate-400">Items marked defective during return</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
                  {borrowingStats.defectiveReturned.length}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {borrowingStats.defectiveReturned.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No defective returned items</p>
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100">
                {borrowingStats.defectiveReturned.map((item) => (
                  <div key={item.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.item}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Borrower: {item.borrower}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Returned:{" "}
                          {item.returnedAt
                            ? new Date(item.returnedAt).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        Defective
                      </span>
                    </div>
                    {item.remarks ? (
                      <p className="mt-1.5 text-xs text-slate-500">{item.remarks}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
