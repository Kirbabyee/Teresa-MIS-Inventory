import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const TIER_COLORS = ["#94a3b8", "#fbbf24", "#f97316", "#ef4444", "#dc2626", "#991b1b"];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload || {};
  const labels = [
    "Normal",
    "Tier 1 — Warning",
    "Tier 2 — Elevated",
    "Tier 3 — High",
    "Tier 4 — Severe",
    "Tier 5 — Permanent",
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-3 shadow-xl">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {labels[data.tier] || `Tier ${data.tier}`}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-slate-500">Active Lockouts</span>
        <span className="text-sm font-bold text-slate-800">{data.count}</span>
      </div>
    </div>
  );
}

export default function SecurityThreatChart({ activeLockouts, highTierLockouts, permanentBans }) {
  // Build tier distribution data
  const data = [
    { tier: 0, label: "Normal", count: Math.max((activeLockouts || 0) - (highTierLockouts || 0), 0) },
    { tier: 1, label: "Warning", count: Math.max(Math.min((highTierLockouts || 0), (activeLockouts || 0) - (permanentBans || 0)), 0) },
    { tier: 2, label: "Elevated", count: 0 },
    { tier: 3, label: "High", count: Math.max(Math.min((highTierLockouts || 0) - (permanentBans || 0), 2), 0) },
    { tier: 4, label: "Severe", count: 0 },
    { tier: 5, label: "Permanent", count: permanentBans || 0 },
    // Show at least the current state
    { tier: -1, label: "Current Active", count: activeLockouts || 0 },
  ];

  // Only show the summary bar for now
  const summaryData = [
    { label: "Active", value: activeLockouts || 0, color: "#f97316" },
    { label: "High Severity", value: highTierLockouts || 0, color: "#ef4444" },
    { label: "Permanent", value: permanentBans || 0, color: "#991b1b" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Security Threat Level
          </h3>
          <p className="text-xs text-slate-400">
            Active lockouts by severity
          </p>
        </div>
      </div>

      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={summaryData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Lockouts" barSize={36} radius={[0, 6, 6, 0]}>
              {summaryData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
