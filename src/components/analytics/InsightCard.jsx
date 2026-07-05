import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from "lucide-react";

const SEVERITY_DOT = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-indigo-500",
  success: "bg-emerald-500",
};

const SEVERITY_ICON = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
  success: CheckCircle,
};

/**
 * Single insight row in the Prescriptive Decision Ledger.
 * Status dot + title + description + dismiss (X) button.
 *
 * @param {Object} insight - Insight object from allPrescriptiveActions
 * @param {Function} onDismiss - Callback to dismiss/remove this insight
 */
export default function InsightCard({ insight, onDismiss }) {
  const dotClass = SEVERITY_DOT[insight.severity] || SEVERITY_DOT.info;
  const Icon = SEVERITY_ICON[insight.severity] || SEVERITY_ICON.info;

  return (
    <div className="py-3 flex items-start gap-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors px-1 rounded-md group">
      {/* Colored dot */}
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${
            insight.severity === "critical"
              ? "text-rose-500"
              : insight.severity === "warning"
              ? "text-amber-500"
              : "text-indigo-500"
          }`} />
          <p className="text-xs font-bold text-slate-800 truncate">
            {insight.title}
          </p>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          {insight.message}
        </p>
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="mt-1 shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 transition-all"
          title="Dismiss advisory"
          aria-label="Dismiss advisory"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
