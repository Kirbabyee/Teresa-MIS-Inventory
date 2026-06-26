import { Calendar } from "lucide-react";

const OPTIONS = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "all", label: "All" },
];

/**
 * Time range toggle selector for analytics.
 *
 * @param {number|'all'} value - Current selected value
 * @param {Function} onChange - Callback when selection changes
 */
export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-slate-400" />
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              String(value) === String(opt.value)
                ? "bg-white text-[#4a1111] shadow-sm font-semibold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
