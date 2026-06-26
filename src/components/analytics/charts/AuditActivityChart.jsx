import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-3 shadow-xl min-w-[180px]">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#4a1111]" />
            <span className="text-xs text-slate-500">Total Changes</span>
          </div>
          <span className="text-sm font-bold text-slate-800">
            {payload[0]?.value || 0}
          </span>
        </div>
        {payload[0]?.payload && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-500">Inserts</span>
              </div>
              <span className="text-xs font-semibold text-emerald-600">
                {payload[0].payload.insert || 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                <span className="text-xs text-slate-500">Updates</span>
              </div>
              <span className="text-xs font-semibold text-indigo-600">
                {payload[0].payload.update || 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="text-xs text-slate-500">Deletes</span>
              </div>
              <span className="text-xs font-semibold text-rose-600">
                {payload[0].payload.delete || 0}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuditActivityChart({ dailyChanges }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Audit Activity
          </h3>
          <p className="text-xs text-slate-400">
            Daily inventory change volume
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4a1111]" />
            <span className="text-[11px] text-slate-500">Total</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-slate-500">Insert</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="text-[11px] text-slate-500">Delete</span>
          </span>
        </div>
      </div>

      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dailyChanges || []}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4a1111" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4a1111" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#4a1111"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorTotal)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
