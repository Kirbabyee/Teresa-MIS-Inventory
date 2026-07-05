import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Package } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Premium Palette ─────────────────────────────────────────────────────
const PALETTE = [
  "#14b8a6", // teal
  "#3b82f6", // bright blue
  "#1e3a8a", // navy
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

const TOP_N = 4; // top N variants shown individually; the rest collapse into "Others"

/**
 * Aggregates flat borrowing-items records into a stacked bar chart format.
 *
 * When `mode === "all"`, only the top 4 most-borrowed variants (by total volume)
 * are kept as individual stacked rows; every remaining variant is collapsed
 * into a 5th row named "Others".
 *
 * Input: [{ sectionName, variant, quantity }, ...]
 * Output: [{ sectionName, VariantA: n, VariantB: m, ... }, ...]
 */
function aggregateChartData(records, mode = "all") {
  if (!records || records.length === 0) return { chartData: [], variants: [] };

  const sectionMap = new Map();

  for (const r of records) {
    const section = r.sectionName || "Custom Item";
    const variant = (r.variant || "Uncategorized").trim();
    const qty = Number(r.quantity) || 1;

    if (!sectionMap.has(section)) {
      sectionMap.set(section, new Map());
    }
    const variantMap = sectionMap.get(section);
    variantMap.set(variant, (variantMap.get(variant) || 0) + qty);
  }

  // Collect unique variants, sorted by total volume descending
  const variantTotals = new Map();
  for (const variantMap of sectionMap.values()) {
    for (const [v, qty] of variantMap) {
      variantTotals.set(v, (variantTotals.get(v) || 0) + qty);
    }
  }
  const sortedVariants = [...variantTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);

  // In "all" mode, keep top N variants and collapse the rest into "Others"
  const variants =
    mode === "all" ? sortedVariants.slice(0, TOP_N) : sortedVariants;
  const hasOthers = mode === "all" && sortedVariants.length > TOP_N;

  const chartData = [...sectionMap.entries()].map(([sectionName, variantMap]) => {
    const row = { sectionName };
    for (const v of variants) {
      row[v] = variantMap.get(v) || 0;
    }
    if (hasOthers) {
      let others = 0;
      for (const v of sortedVariants.slice(TOP_N)) {
        others += variantMap.get(v) || 0;
      }
      row.Others = others;
    }
    return row;
  });

  return { chartData, variants: hasOthers ? [...variants, "Others"] : variants };
}

function wrapLabel(value, maxChars = 12) {
  if (!value) return [""];
  const words = String(value).split(" ");
  const lines = [];
  let current = "";

  const flushCurrent = () => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    flushCurrent();
    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    let fragment = word;
    while (fragment.length > maxChars) {
      lines.push(fragment.slice(0, maxChars));
      fragment = fragment.slice(maxChars);
    }
    current = fragment;
  }

  flushCurrent();
  return lines;
}

function WrappedXAxisTick({ x, y, payload, width }) {
  const lines = wrapLabel(payload.value, 12);
  return (
    <g transform={`translate(${x},${y + 10})`}>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        fill="#64748b"
        fontSize={10}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={0} dy={index === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function CustomLegend({ payload = [] }) {
  if (!payload || !payload.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
      {payload.map((p) => (
        <div
          key={p.value}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            maxWidth: 140,
            whiteSpace: "normal",
            fontSize: 11,
            color: "#475569",
          }}
        >
          <span style={{ width: 10, height: 10, background: p.color, display: "inline-block", borderRadius: 2 }} />
          <span style={{ overflowWrap: "break-word" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm p-3 shadow-xl min-w-[160px]">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry, i) => {
          if (!entry.value) return null;
          return (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-[11px] text-slate-600 truncate">{entry.name}</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 shrink-0">
                {entry.value}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase">Total</span>
        <span className="text-xs font-semibold text-slate-800">{total}</span>
      </div>
    </div>
  );
}

export default function ItemBorrowingAnalysisChart({ borrowingItems = [], loading = false }) {
  const [activeSection, setActiveSection] = useState("all");

  // Derive unique sections from raw data (always available, even before filter)
  const sections = useMemo(() => {
    const set = new Set();
    for (const r of borrowingItems) {
      if (r.sectionName) set.add(r.sectionName);
    }
    return [...set].sort();
  }, [borrowingItems]);

  // Filter raw data, then aggregate
  const filteredItems = useMemo(() => {
    if (activeSection === "all") return borrowingItems;
    return borrowingItems.filter((r) => r.sectionName === activeSection);
  }, [borrowingItems, activeSection]);

  const { chartData, variants } = useMemo(
    () => aggregateChartData(filteredItems, activeSection === "all" ? "all" : "section"),
    [filteredItems, activeSection]
  );

  const hasData = chartData.length > 0 && variants.length > 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col h-[360px] justify-between">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
            Item Borrowing Analysis
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
            Borrow volume by section & item
          </p>
        </div>
        <Select value={activeSection} onValueChange={setActiveSection}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 focus:ring-2 focus:ring-[#4a1111]/30 focus:border-[#4a1111]/40 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200 bg-white shadow-lg">
            <SelectItem value="all" className="text-xs font-medium">All Sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s} value={s} className="text-xs font-medium">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Chart / Placeholder ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#14b8a6] animate-spin" />
        </div>
      ) : hasData ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="sectionName"
                tick={<WrappedXAxisTick />}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
                interval={0}
                height={chartData.length > 6 ? 60 : 40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              {activeSection === "all" ? (
                <p className="text-[10px] text-slate-500 font-medium pt-1 pb-0.5">
                  Each bar represents a section; each stacked row within a column is the top most borrowed item.
                </p>
              ) : (
                <Legend content={CustomLegend} />
              )}
              {variants.map((variant, index) => (
                <Bar
                  key={variant}
                  dataKey={variant}
                  stackId={activeSection === "all" ? "a" : undefined}
                  fill={PALETTE[index % PALETTE.length]}
                  radius={
                    activeSection === "all" && index === variants.length - 1
                      ? [3, 3, 0, 0]
                      : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <Package className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs font-medium">No borrowing records found for this period</p>
          <p className="text-[10px] text-slate-300 mt-1">Data will appear as items are borrowed</p>
        </div>
      )}
    </div>
  );
}