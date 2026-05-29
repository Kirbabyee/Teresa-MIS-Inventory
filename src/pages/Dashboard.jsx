import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ClipboardList, Cpu, Package, RotateCcw, Trophy } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchBorrowingRecords, markOverdueBorrowingRecords } from "@/lib/borrowingApi";
import { getTabTableConfig, useInventoryCatalog } from "@/lib/inventoryApi";

const defaultBorrowingStats = {
  borrowedToday: 0,
  unreturned: 0,
  defectiveReturned: [],
  mostBorrowedItem: null,
};

const COMPUTER_LABS_TAB = {
  id: "computer-laboratories",
  name: "Computer Laboratories",
  slug: "laboratory",
  isComputerLabs: true,
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

  return {
    borrowedToday,
    unreturned,
    defectiveReturned,
    mostBorrowedItem,
  };
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [labs, setLabs] = useState([]);
  const [overall, setOverall] = useState({ total: 0, defective: 0 });
  const [borrowingStats, setBorrowingStats] = useState(defaultBorrowingStats);
  const [error, setError] = useState("");
  const { tabs: inventoryTabs, loading: tabsLoading, error: tabsError } = useInventoryCatalog();
  const [selectedTabSlug, setSelectedTabSlug] = useState("");
  const dashboardTabs = useMemo(() => [COMPUTER_LABS_TAB, ...inventoryTabs], [inventoryTabs]);

  const defectiveRate = overall.total
    ? Math.round((overall.defective / overall.total) * 100)
    : 0;
  const activeDashboardTab = dashboardTabs.find((tab) => tab.slug === selectedTabSlug) || COMPUTER_LABS_TAB;
  const isComputerLabsSelected = activeDashboardTab.isComputerLabs;

  // Handle tab selection from URL params
  useEffect(() => {
    if (dashboardTabs.length === 0) return;

    const urlTab = searchParams.get("tab");
    if (urlTab && urlTab !== selectedTabSlug && dashboardTabs.some(tab => tab.slug === urlTab)) {
      setSelectedTabSlug(urlTab);
    } else if (!urlTab && !selectedTabSlug && dashboardTabs.length > 0) {
      // Auto-select first tab if none selected and tabs exist
      setSelectedTabSlug(dashboardTabs[0].slug);
    }
  }, [searchParams, selectedTabSlug, dashboardTabs]);

  // Main data loading effect - now depends on selected tab
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        await markOverdueBorrowingRecords({ days: 3 });
        const borrowingRecords = await fetchBorrowingRecords({ status: null });
        const borrowingSummary = summarizeBorrowingRecords(borrowingRecords);

        // If no tab selected, show empty state
        if (!selectedTabSlug) {
          if (!cancelled) {
            setLabs([]);
            setOverall({ total: 0, defective: 0 });
            setBorrowingStats(borrowingSummary);
            setLoading(false);
          }
          return;
        }

        // Get the selected tab info
        const selectedTab = dashboardTabs.find(tab => tab.slug === selectedTabSlug);
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

          if (labErr) {
            console.error("Error fetching laboratories:", labErr);
            throw labErr;
          }

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
              grouped[labId][computerKey] = {
                defectiveComponentCount: 0,
              };
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
          const grouped = sectionData.reduce((accumulator, section) => {
            accumulator[section.id] = {
              id: section.id,
              label: section.name,
              total: 0,
              defective: 0,
              path: `/inventory/${selectedTab.slug}?section=${section.slug}&defectiveOnly=1`,
            };
            return accumulator;
          }, {});

          if (sectionIds.length > 0) {
            const tabConfig = await getTabTableConfig(selectedTab.id);
            const tableName = tabConfig?.tableName;

            if (!tableName) {
              console.warn(`No table is configured for ${selectedTab.name}. Showing sections only.`);
            } else {
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
          setOverall({
            total: overallTotal,
            defective: totalDefectiveCount,
          });
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
    return () => { cancelled = true; };
  }, [selectedTabSlug, dashboardTabs]); // Re-fetch when tab or inventory tabs change

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
              role="status"
              aria-label="Loading dashboard data"
            />

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {error && (
        <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-700 border border-rose-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="md:flex md:gap-6">
        <div className="md:w-1/2 min-w-0 space-y-4">
          {/* Tab Selection */}
          {!tabsLoading && !tabsError && dashboardTabs.length > 0 ? (
            <div className="max-w-full overflow-x-auto pb-1">
              <div className="flex flex-wrap items-center gap-2">
                {dashboardTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSelectedTabSlug(tab.slug);
                      // Update URL params to reflect selection
                      const params = new URLSearchParams(searchParams);
                      params.set("tab", tab.slug);
                      setSearchParams(params, { replace: true });
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab.slug === selectedTabSlug
                        ? "bg-[#4a1111] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>
          ) : tabsLoading ? (
            <div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-500 animate-pulse">
                Loading tabs...
              </div>
            </div>
          ) : tabsError ? (
            <div>
              <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-700 border border-rose-100">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{tabsError}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-500">
                No inventory tabs found. Add one from the inventory manager.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Total PCs Card */}
            <div className="group rounded-xl bg-gradient-to-r from-white to-slate-50 p-6 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#4a1111]">
                    {isComputerLabsSelected ? (
                      <Cpu className="h-4 w-4 text-white" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-white">
                        <rect width="9" height="6" x="6" y="14" rx="2" />
                        <rect width="16" height="6" x="6" y="4" rx="2" />
                        <path d="M2 2v20" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{isComputerLabsSelected ? "Total PCs" : "Total Items"}</p>
                </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="text-3xl font-extrabold text-slate-900 text-center">
                    {overall.total.toLocaleString()}
                  </p>
                </div>

              {/*<p className="text-xs text-slate-400">{isComputerLabsSelected ? "Across all labs" : "Across selected tab"}</p> */}  
              </div>
              {overall.total > 0 && (
                <div className="mt-4">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-[#4a1111]"
                      style={{ width: `${Math.min(defectiveRate, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Defective rate: {defectiveRate}%</p>
                </div>
              )}
            </div>

            {/* Defective Components Card */}
            <div className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible">
                <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-500">
                    <AlertCircle className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{isComputerLabsSelected ? "Defective Components" : "Defective Items"}</p>
                </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="text-3xl font-extrabold text-rose-600 text-center">
                    {overall.defective.toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-slate-400">{isComputerLabsSelected ? "Total defective parts" : "Marked defective"}</p>
              </div>
            </div>

            {/* Labs Card */}
            <div className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible">
                <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-700">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{isComputerLabsSelected ? "Labs" : "Sections"}</p>
                </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="text-3xl font-extrabold text-slate-900 text-center">
                    {labs.length.toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-slate-400">{isComputerLabsSelected ? "Active laboratories" : "Active sections"}</p>
              </div>
            </div>
          </div>

          {/* Lab Details Table */}
          <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-lg transition hover:shadow-xl">
            {labs.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No laboratories found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">NAME</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{isComputerLabsSelected ? "NUMBER OF PC" : "ITEMS"}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{isComputerLabsSelected ? "DEFECTIVE COMPONENTS" : "DEFECTIVE ITEMS"}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {labs.map((lab) => (
                      <tr
                        key={lab.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => navigate(lab.path || `/inventory/laboratory?labId=${lab.id}&defectiveOnly=1`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(lab.path || `/inventory/laboratory?labId=${lab.id}&defectiveOnly=1`); }}
                      >
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium text-slate-800 hover:text-slate-600 hover:underline">
                            {lab.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {lab.total}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <span className={lab.defective > 0 ? "text-rose-600" : "text-slate-600"}>
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

        {/* Borrowing Overview */}
        <div className="md:w-1/2 min-w-0 mt-12">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div
                className="group rounded-xl bg-white p-6 pb-11 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible"
                onClick={() => navigate("/borrowing")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/borrowing"); }}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#4a1111]">
                      <ClipboardList className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">Borrowed Today</p>
                  </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="text-3xl font-extrabold text-slate-900 text-center">
                    {borrowingStats.borrowedToday.toLocaleString()}
                  </p>
                </div>
                  <p className="text-xs text-slate-400">Total items</p>
                </div>
              </div>

              <div
                className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible"
                onClick={() => navigate("/borrowing")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/borrowing"); }}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-500">
                      <RotateCcw className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">Unreturned</p>
                  </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="text-3xl font-extrabold text-rose-600 text-center">
                    {borrowingStats.unreturned.toLocaleString()}
                  </p>
                </div>
                  <p className="text-xs text-slate-400">Still borrowed</p>
                </div>
              </div>

              <div
                className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition relative overflow-visible"
                onClick={() => navigate("/borrowing")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/borrowing"); }}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber-500">
                      <Trophy className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">Most Borrowed</p>
                  </div>
                <div className="flex items-baseline gap-1 justify-center">
                  <p className="truncate text-[25px] font-extrabold text-slate-900 text-center">
                    {borrowingStats.mostBorrowedItem?.label || "No items yet"}
                  </p>
                </div>
                  <p className="text-xs text-slate-400">
                    {borrowingStats.mostBorrowedItem
                      ? `${borrowingStats.mostBorrowedItem.count.toLocaleString()} borrowed`
                      : "No borrowing records"}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-lg transition hover:shadow-xl cursor-pointer"
              onClick={() => navigate("/borrowing?view=history")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/borrowing?view=history"); }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Defective Items Returned</p>
                  <p className="text-xs text-slate-400">Items marked defective during return</p>
                </div>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                  {borrowingStats.defectiveReturned.length.toLocaleString()}
                </span>
              </div>

              {borrowingStats.defectiveReturned.length === 0 ? (
                <div className="p-8 text-center">
                  <AlertCircle className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No defective returned items</p>
                </div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                  {borrowingStats.defectiveReturned.map((item) => (
                    <div key={item.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{item.item}</p>
                          <p className="mt-1 text-xs text-slate-500">Borrower: {item.borrower}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Returned: {item.returnedAt ? new Date(item.returnedAt).toLocaleString() : "N/A"}
                          </p>
                        </div>
                        <span className="flex-none rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                          Defective
                        </span>
                      </div>
                      {item.remarks ? (
                        <p className="mt-2 text-xs text-slate-600">{item.remarks}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
