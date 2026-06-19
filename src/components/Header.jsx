import React from "react";
import { Menu } from "lucide-react";

export default function Header({
  isPublic = false,
  setMobileOpen = () => {},
  sectionTitleDisplay = "",
  now = new Date(),
  initials = "U",
  displayName = "User",
  displayRole = "Employee",
}) {
  const baseClasses = isPublic
    ? "bg-[#411111] text-white px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-30 border-b border-[#5a1a1a]"
    : "bg-white/85 supports-[backdrop-filter]:bg-white/70 backdrop-blur-md border-b border-slate-200/80 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-30";

  return (
    <header className={baseClasses}>
      <div className="flex items-center gap-3 min-w-0">
        {!isPublic && (
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-600 hover:bg-slate-100 p-2 rounded-lg"
            aria-label="Open sidebar"
          >
            <Menu className="w-6 h-6" />
          </button>
        )}

        <div className="hidden md:block min-w-0">
          <p className={isPublic ? "text-sm md:text-base font-semibold text-white truncate" : "text-sm md:text-base font-semibold text-slate-900 truncate"}>{sectionTitleDisplay}</p>
          <p className={isPublic ? "text-[11px] uppercase tracking-[0.12em] text-slate-300" : "text-[11px] uppercase tracking-[0.12em] text-slate-500"}>CSTA MIS</p>
        </div>
      </div>

      {!isPublic ? (
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end leading-tight border-r border-slate-200 pr-4 mr-1">
            <p className="text-sm font-semibold text-slate-900">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short", month: "short", day: "numeric", year: "numeric",
              }).format(now)}
            </p>
            <p className="text-xs font-mono text-slate-500">{now.toLocaleTimeString()}</p>
          </div>

          <div className="flex items-center gap-3 pl-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2b0707,#5a1717)] text-sm font-bold text-white ring-4 ring-[#2b0707]/15 shadow-sm">
              {initials || "U"}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{displayRole}</p>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
