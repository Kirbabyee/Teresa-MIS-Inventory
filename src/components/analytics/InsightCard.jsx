import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

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
 * Button-free layout: status dot + title + description.
 *
 * @param {Object} insight - Insight object from allPrescriptiveActions
 */
export default function InsightCard({ insight }) {
  const dotClass = SEVERITY_DOT[insight.severity] || SEVERITY_DOT.info;
  const Icon = SEVERITY_ICON[insight.severity] || SEVERITY_ICON.info;

  return (
    <div className="py-3 flex items-start gap-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors px-1 rounded-md">
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
    </div>
  );
}
