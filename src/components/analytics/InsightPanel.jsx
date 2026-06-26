import { useState, useCallback } from "react";
import { AlertTriangle, AlertCircle, Info, Filter } from "lucide-react";
import InsightCard from "./InsightCard";

const FILTERS = [
  { key: "all", label: "All", icon: Filter },
  { key: "critical", label: "Critical", icon: AlertTriangle },
  { key: "warning", label: "Warning", icon: AlertCircle },
  { key: "info", label: "Info", icon: Info },
];

/**
 * Prescriptive Decision Ledger — filterable, high-density list of
 * operational advisories for the internal loan ecosystem.
 *
 * @param {Array} insights - Array of insight objects from allPrescriptiveActions
 */
export default function InsightPanel({ insights }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const handleDismiss = useCallback((id) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const filtered = insights.filter((i) => {
    if (dismissedIds.has(i.id)) return false;
    if (activeFilter === "all") return true;
    return i.severity === activeFilter;
  });

  const counts = {
    all: insights.filter((i) => !dismissedIds.has(i.id)).length,
    critical: insights.filter(
      (i) => i.severity === "critical" && !dismissedIds.has(i.id)
    ).length,
    warning: insights.filter(
      (i) => i.severity === "warning" && !dismissedIds.has(i.id)
    ).length,
    info: insights.filter(
      (i) => i.severity === "info" && !dismissedIds.has(i.id)
    ).length,
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
          Prescriptive Decision Ledger
        </h3>
        <span className="text-[11px] font-semibold text-slate-400">
          {filtered.length} advisory{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Filter Tabs ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-5 pt-3 pb-1">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-[#4a1111] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <Icon className="h-3 w-3" />
              {f.label}
              {counts[f.key] > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {counts[f.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Insight Rows ───────────────────────────────────────────────── */}
      <div className="px-5 pb-4 flex-1 overflow-auto scrollbar-thin max-h-[420px]">
        {filtered.length === 0 ? (
          <div className="text-center py-8">
            <Info className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              No advisories match the current filter.
            </p>
          </div>
        ) : (
          filtered.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))
        )}
      </div>
    </div>
  );
}
