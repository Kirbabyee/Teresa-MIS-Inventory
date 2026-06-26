import { useMemo } from "react";

export default function BorrowingComplianceChart({ complianceRate, onTime, late, outstanding }) {
  const total = (onTime || 0) + (late || 0) + (outstanding || 0);

  // Build conic-gradient segments for the donut ring
  const segments = useMemo(() => {
    if (total === 0) return [];
    const onTimePct = ((onTime || 0) / total) * 100;
    const latePct = ((late || 0) / total) * 100;
    const outstandingPct = 100 - onTimePct - latePct;

    const result = [];
    let offset = 0;

    if (onTimePct > 0) {
      result.push({ color: "#10b981", start: offset, end: offset + onTimePct });
      offset += onTimePct;
    }
    if (latePct > 0) {
      result.push({ color: "#f59e0b", start: offset, end: offset + latePct });
      offset += latePct;
    }
    if (outstandingPct > 0) {
      result.push({ color: "#f43f5e", start: offset, end: 100 });
    }
    return result;
  }, [onTime, late, outstanding, total]);

  const gradientStops = segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ");

  const displayRate = complianceRate ?? "—";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between h-[360px] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
          Return Breakdown
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
          {total} total return{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Body: Donut (left) + Legend (right) ───────────────────────── */}
      <div className="flex items-center gap-12 p-6 max-w-xl mx-auto">
        {/* Left: Donut Ring */}
        <div className="relative shrink-0">
          <div
            className="h-32 w-32 rounded-full"
            style={{
              background: `conic-gradient(${gradientStops})`,
              WebkitMask: "radial-gradient(farthest-side, transparent 55%, #000 56%)",
              mask: "radial-gradient(farthest-side, transparent 55%, #000 56%)",
            }}
          />
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-800">
              {displayRate}%
            </span>
            <span className="text-[10px] text-slate-400 uppercase font-bold">
              On-Time
            </span>
          </div>
        </div>

        {/* Right: High-Density Legend */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between w-48 py-1.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-slate-600 font-medium text-xs">On Time</span>
            </div>
            <span className="font-sans font-medium text-xs text-slate-600">
              {onTime || 0} {onTime === 1 ? "Item" : "Items"}
            </span>
          </div>
          <div className="flex items-center justify-between w-48 py-1.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-slate-600 font-medium text-xs">Late</span>
            </div>
            <span className="font-sans font-medium text-xs text-slate-600">
              {late || 0} {late === 1 ? "Item" : "Items"}
            </span>
          </div>
          <div className="flex items-center justify-between w-48 py-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="text-slate-600 font-medium text-xs">Outstanding</span>
            </div>
            <span className="font-sans font-medium text-xs text-slate-600">
              {outstanding || 0} {outstanding === 1 ? "Item" : "Items"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom KPI Grid ────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Average Delay</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">1.2 Days</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Most Late Asset Type</p>
          <p className="text-sm font-semibold text-amber-600 mt-0.5">Peripherals</p>
        </div>
      </div>
    </div>
  );
}
