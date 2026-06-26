import { useMemo } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

// ─── Thresholds ──────────────────────────────────────────────────────────
const DEFECT_RATE_THRESHOLD = 15; // % — rate at which brand is flagged
const MIN_SAMPLE = 2; // minimum items to include brand in analysis

// ─── Risk Weighting ──────────────────────────────────────────────────────
// Risk score = defectRate * log2(defective + 1)
// This ensures a brand with 50/100 defective (score ~330) ranks
// far above a brand with 1/2 defective (score ~50), even at same rate.
const riskScore = (defectRate, defective) =>
  Math.round(defectRate * Math.log2(defective + 1));

// ─── Detect defective status from dynamic table row fields ────────────────
function isDefective(item) {
  const statusStr = String(
    item.status || item.condition || item.item_status || ""
  ).toLowerCase();
  const dataStr = String(
    item.data
      ? JSON.stringify(item.data)
      : item.remarks || item.notes || item.details || ""
  ).toLowerCase();
  return statusStr.includes("defect") || dataStr.includes("defect");
}

// ─── Extract quantity from item ────────────────────────────────────────────
// Quantity can live as a direct column (dynamic tables) or inside data.quantity
// (legacy inventory_items). Defaults to 1 when absent.
function getItemQuantity(item) {
  const direct = Number(item.quantity);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const nested = Number(item.data?.quantity);
  if (Number.isFinite(nested) && nested > 0) return nested;
  return 1;
}

// ─── Risk Badge Component ────────────────────────────────────────────────
function RiskBadge({ defectRate, defectiveCount, score }) {
  // High risk: high rate AND meaningful quantity (score > 100)
  if (defectRate > DEFECT_RATE_THRESHOLD && score > 100) {
    return (
      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wide ml-2">
        Freeze Orders
      </span>
    );
  }
  // Medium risk: elevated rate or moderate quantity
  if (defectRate > 10 || (defectiveCount >= 3 && score > 40)) {
    return (
      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wide ml-2">
        Caution
      </span>
    );
  }
  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────
/**
 * Brand Reliability Index — high-density risk ledger layout.
 * Risk score factors in both defect rate and absolute defective quantity
 * so that brands with many defective units rank higher than those with
 * the same rate but only a few items.
 *
 * @param {Array} itemDetails - Flat array of all inventory items with
 *   { id, brand, status, data, section_id, ... } fields.
 * @param {number} [threshold=15] - Defect % threshold for "High Risk" badge
 */
export default function BrandReliabilityMatrix({
  itemDetails = [],
  threshold = DEFECT_RATE_THRESHOLD,
}) {
  // ── Aggregate by brand ──────────────────────────────────────────────────
  const brandData = useMemo(() => {
    const brandMap = new Map();

    for (const item of itemDetails) {
      const brand = String(
        item.brand || item.manufacturer || item.make || "Unknown"
      ).trim();
      if (!brand || brand === "Unknown" || brand === "") continue;

      if (!brandMap.has(brand)) {
        brandMap.set(brand, {
          brand,
          total: 0,
          defective: 0,
        });
      }

      const entry = brandMap.get(brand);
      const qty = getItemQuantity(item);
      entry.total += qty;
      if (isDefective(item)) entry.defective += qty;
    }

    return [...brandMap.values()]
      .filter((b) => b.total >= MIN_SAMPLE)
      .map((b) => {
        const defectRate =
          b.total > 0
            ? Math.round((b.defective / b.total) * 10000) / 100
            : 0;
        const score = riskScore(defectRate, b.defective);
        return {
          ...b,
          defectRate,
          score,
          isHighRisk: defectRate > threshold && score > 100,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [itemDetails, threshold]);

  // ── Empty state ─────────────────────────────────────────────────────────
  if (brandData.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
            Brand Reliability Index
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-slate-400 px-5">
          <ShieldCheck className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">No brand data available</p>
          <p className="text-xs text-slate-300 mt-1">
            Add inventory items with brand details to populate this analysis
          </p>
        </div>
      </div>
    );
  }

  // ── Summary stats ───────────────────────────────────────────────────────
  const highRiskCount = brandData.filter((b) => b.isHighRisk).length;
  const totalDefective = brandData.reduce((s, b) => s + b.defective, 0);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase font-sans">
          Brand Reliability Index
        </h3>
        {highRiskCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-600">
            <AlertTriangle className="h-3 w-3" />
            {highRiskCount} High Risk
          </span>
        )}
      </div>

      {/* ── Brand Rows ──────────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        {brandData.map((b) => (
          <div
            key={b.brand}
            className="py-3 flex items-center justify-between border-b border-slate-100 last:border-0"
          >
            {/* Left: Brand name + risk badge */}
            <div className="flex items-center min-w-0 flex-1">
              <span className="text-xs font-bold text-slate-800 truncate">
                {b.brand}
              </span>
              <RiskBadge
                defectRate={b.defectRate}
                defectiveCount={b.defective}
                score={b.score}
              />
            </div>

            {/* Right: Metrics */}
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <span className="text-xs font-mono font-bold text-slate-600">
                {b.defectRate}%
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {b.defective}/{b.total}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/30 text-[10px] text-slate-400">
        {brandData.length} brand{brandData.length !== 1 ? "s" : ""} tracked
        &nbsp;·&nbsp; {totalDefective} total defective
        &nbsp;·&nbsp; Threshold: {threshold}%
      </div>
    </div>
  );
}
