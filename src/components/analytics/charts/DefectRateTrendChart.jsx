import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload || {};
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-3 shadow-xl">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-xs text-slate-500">Defect Rate</span>
          </div>
          <span className="text-sm font-bold text-rose-600">
            {data.defectRate}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="text-xs text-slate-500">Total Changes</span>
          </div>
          <span className="text-sm font-bold text-slate-700">
            {data.total}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DefectRateTrendChart({ data }) {
  const hasData = data && data.length > 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-6 flex flex-col justify-between h-[320px] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800">
          Defect Rate Trend
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Percentage of changes indicating defective status
        </p>
      </div>

      {/* ── Chart / Placeholder ────────────────────────────────────────── */}
      {hasData ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={15}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                label={{
                  value: "Warning",
                  position: "right",
                  fill: "#f59e0b",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={10}
                stroke="#fbbf24"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              <Line
                type="monotone"
                dataKey="defectRate"
                stroke="#e11d48"
                strokeWidth={2}
                dot={{ fill: "#e11d48", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: "#be123c" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs font-medium">No defects reported over this period</p>
          <p className="text-[10px] text-slate-300 mt-1">Data will appear as inventory changes are logged</p>
        </div>
      )}
    </div>
  );
}
