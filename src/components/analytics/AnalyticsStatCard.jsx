import { TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";

/**
 * Reusable analytics stat card with optional sparkline and change indicator.
 *
 * @param {React.Component} icon - Lucide icon component
 * @param {string} iconBg - Tailwind bg class for the icon circle
 * @param {string} label - Small label text above the value
 * @param {string|number} value - Main stat value (large text)
 * @param {number} [change] - Percentage change to display
 * @param {'up'|'down'|'neutral'} [changeDirection] - Direction of change
 * @param {string} [subtext] - Small subtext below the value
 * @param {Array} [trend] - Sparkline data array [{value: number}, ...]
 * @param {Function} [onClick] - Optional click handler
 */
export default function AnalyticsStatCard({
  icon: Icon,
  iconBg = "bg-slate-50 border border-slate-200/60",
  iconColor = "text-slate-600",
  label,
  value,
  change,
  changeDirection = "neutral",
  subtext,
  trend,
  onClick,
}) {
  return (
    <div
      className={`group rounded-xl bg-white p-4 shadow-sm border border-slate-200/80 transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        onClick
          ? "cursor-pointer hover:shadow-md hover:border-slate-300/80"
          : "hover:shadow-md hover:border-slate-300/80"
      }`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-2.5">
        {/* Header: icon + label + change */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
            >
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 leading-tight uppercase tracking-wide">
              {label}
            </p>
          </div>

          {change !== undefined && (
            <span
              className={`text-[10px] font-semibold flex items-center gap-0.5 ${
                changeDirection === "up"
                  ? "text-emerald-600"
                  : changeDirection === "down"
                  ? "text-rose-600"
                  : "text-slate-500"
              }`}
            >
              {changeDirection === "up" && (
                <TrendingUp className="h-3 w-3" />
              )}
              {changeDirection === "down" && (
                <TrendingDown className="h-3 w-3" />
              )}
              {change}%
            </span>
          )}
        </div>

        {/* Value — uniform typography, truncates long strings */}
        <p className="text-xl font-bold font-sans text-slate-800 tracking-tight block truncate mt-1">
          {value}
        </p>

        {/* Sparkline */}
        {trend && trend.length > 1 && (
          <div className="h-8 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#4a1111"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Subtext — uniform pill badge */}
        {subtext && (
          <div className="mt-1">
            <span className="inline-flex items-center text-[10px] font-medium tracking-wide text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 lowercase first-letter:uppercase">
              {subtext}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
