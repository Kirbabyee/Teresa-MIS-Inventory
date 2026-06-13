import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useInventoryCatalog } from "@/lib/inventoryApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bell,
  Menu,
  Home,
  Package,
  ClipboardList,
  LogOut,
  ChevronDown,
  ChevronRight,
  Users,
  Boxes,
  FlaskConical,
  ShieldAlert,
} from "lucide-react";
const arkLogo = "/folder/teresalogo-removebg-preview.png";
import { useAuth } from "@/lib/AuthContext";
import { useSessionTimeout } from "@/lib/security/sessionTimeout";
import SessionTimeoutModal from "@/components/SessionTimeoutModal";

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";
const SIDEBAR_COLLAPSED_KEY = "layout_sidebar_collapsed";

const isAdminSession = (session) => {
  const role = String(session?.role || session?.account_type || "").toLowerCase();
  return role === "admin" || role === "superadmin";
};

const readSession = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/* ─────────────────────────────────────────────────────────
   Tooltip portal — renders at <body> to escape overflow:hidden
   Uses a two-phase mount to eliminate first-render flicker:
     Phase 1 (measuring): position is captured, element stays display:none
     Phase 2 (visible):   position is set, element fades/slides in via CSS transition
   ───────────────────────────────────────────────────────── */
function TooltipPortal({ label, targetRef, visible }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [phase, setPhase] = useState("hidden"); // "hidden" | "measured" | "visible"
  const rafRef = useRef(null);

  // Phase 1: measure position immediately via useLayoutEffect (before paint)
  // so the tooltip never appears at 0,0 or at the wrong coordinates.
  useLayoutEffect(() => {
    if (!visible || !targetRef?.current) {
      setPhase("hidden");
      return;
    }

    const el = targetRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPos({ top: r.top + r.height / 2, left: r.right + 16 });
      setPhase("measured");
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, targetRef]);

  // Phase 2: after the "measured" frame is painted, kick off the entrance
  // animation on the next animation frame. This guarantees the browser has
  // painted the element at the correct position with opacity-0 *before*
  // the transition to opacity-1 begins — eliminating the flicker.
  useEffect(() => {
    if (phase !== "measured") return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setPhase("visible");
      });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // When hover ends, snap back to hidden immediately (no exit animation
  // needed — the element is pointer-events-none and disappears cleanly).
  useEffect(() => {
    if (!visible) setPhase("hidden");
  }, [visible]);

  // Don't render anything until we have a measured position
  if (phase === "hidden") return null;

  return (
    <span
      className={cn(
        "pointer-events-none fixed z-[9999] -translate-y-1/2 transition-all duration-200 ease-out",
        phase === "visible"
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-1.5"
      )}
      style={{ top: pos.top, left: pos.left }}
      role="tooltip"
    >
      {/* Outer glow / shadow layer */}
      <span className="absolute -inset-px -z-10 rounded-[10px] bg-gradient-to-r from-[#411111]/40 to-[#5a1a1a]/30 blur-md" />

      {/* Main tooltip body */}
      <span className="relative block whitespace-nowrap rounded-[10px] border border-white/10 bg-[#411111] px-3.5 py-2 text-xs font-medium tracking-wide text-white/90 shadow-xl shadow-[#1a0606]/60 antialiased">
        {/* Inner highlight sheen */}
        <span className="pointer-events-none absolute inset-0 rounded-[10px] bg-gradient-to-b from-white/[0.08] to-transparent" />

        {/* Left-pointing caret arrow */}
        <span
          className="absolute right-full top-1/2 -translate-y-1/2"
          aria-hidden="true"
        >
          {/* Arrow shadow / depth */}
          <span className="absolute -inset-px rounded-sm border-[6px] border-transparent border-r-[#2a0a0a]/40 blur-[1px]" />
          {/* Arrow body — seamless match with tooltip bg */}
          <span className="block border-[6px] border-transparent border-r-[#411111]" />
        </span>

        {/* Label text */}
        <span className="relative z-[1]">{label}</span>
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   Nav Item — tooltip via fixed portal (escapes overflow)
   ───────────────────────────────────────────────────────── */
function NavItem({ item, collapsed, setMobileOpen }) {
  const location = useLocation();
  const linkRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const isDirectActive = item.path ? location.pathname === item.path : false;
  const isChildActive = item.children?.some((child) => {
    const childPathname = child.path.split("?")[0];
    return location.pathname === childPathname;
  });
  const isActive = isDirectActive || isChildActive;
  const Icon = item.icon;

  const [isOpen, setIsOpen] = useState(() => item.children && isActive);

  useEffect(() => {
    if (item.children && isActive) setIsOpen(true);
  }, [isActive, item.children]);

  const handleParentClick = (e) => {
    if (item.children) {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else {
      setMobileOpen(false);
    }
  };

  return (
    <div className="relative w-full">
      {/* Parent Link — ref & hover on the Link itself, not the wrapper */}
      <Link
        ref={linkRef}
        to={item.children ? "#" : item.path}
        onClick={handleParentClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
          collapsed ? "justify-center px-2 py-3" : "px-4 py-2.5",
          isActive
            ? "bg-white/10 text-white"
            : "text-white/70 hover:text-white hover:bg-white/[0.06]"
        )}
      >
        <span
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
            isActive
              ? "bg-white/15 text-white shadow-sm"
              : "bg-white/[0.06] text-white/60 group-hover:bg-white/10 group-hover:text-white/90"
          )}
        >
          <Icon className="w-[18px] h-[18px]" />

          {/* Chevron badge — overlaid on icon corner in collapsed mode */}
          {collapsed && item.children && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#411111] border border-white/20 transition-all duration-200",
                isOpen ? "rotate-0" : "-rotate-90"
              )}
            >
              <ChevronDown className="h-2 w-2 text-white/70" />
            </span>
          )}
        </span>

        {!collapsed && (
          <span className="flex-1 truncate tracking-wide">{item.label}</span>
        )}

        {!collapsed && item.children && (
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-md transition-all duration-200",
              isOpen
                ? "rotate-0 text-white/80"
                : "-rotate-90 text-white/40"
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        )}
      </Link>

      {/* Tooltip via portal — escapes overflow:hidden */}
      {collapsed && (
        <TooltipPortal label={item.label} targetRef={linkRef} visible={hovered} />
      )}

      {/* Nested Children Rendering */}
      {isOpen && item.children && (
        <div
          className={cn(
            "mt-1.5 space-y-1.5",
            collapsed ? "ml-0" : "ml-4 pl-5 border-l border-white/20"
          )}
        >
          {item.children.map((child) => {
            const ChildIcon = child.icon;
            const isSubActive = location.pathname === child.path.split("?")[0];

            return (
              <NavChildLink
                key={child.path}
                to={child.path}
                icon={ChildIcon}
                label={child.label}
                isSubActive={isSubActive}
                collapsed={collapsed}
                onClick={() => setMobileOpen(false)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Child link — tooltip via fixed portal
   ───────────────────────────────────────────────────────── */
function NavChildLink({ to, icon: ChildIcon, label, isSubActive, collapsed, onClick }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        to={to}
        onClick={onClick}
        className={cn(
          "relative flex items-center rounded-lg text-xs font-medium transition-all duration-200",
          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
          isSubActive
            ? "text-white bg-white/18 ring-1 ring-white/25"
            : "text-white/65 hover:text-white hover:bg-white/12"
        )}
      >
        <ChildIcon className="w-3 h-3" />
        {!collapsed && <span>{label}</span>}
      </Link>

      {collapsed && (
        <TooltipPortal label={label} targetRef={ref} visible={hovered} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Logout Button — tooltip via fixed portal
   ───────────────────────────────────────────────────────── */
function LogoutButton({ collapsed, onLogout }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onLogout}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
          collapsed ? "justify-center px-2 py-3" : "px-4 py-2.5",
          "text-white/60 hover:text-rose-200 hover:bg-rose-500/10"
        )}
        title="Logout"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
            "bg-white/[0.06] text-white/50 group-hover:bg-rose-500/15 group-hover:text-rose-300"
          )}
        >
          <LogOut className="w-[18px] h-[18px]" />
        </span>
        {!collapsed && <span className="tracking-wide">Logout</span>}
      </button>

      {collapsed && (
        <TooltipPortal label="Logout" targetRef={ref} visible={hovered} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Main Layout
   ───────────────────────────────────────────────────────── */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { logout, isGlobalLoading, globalLoadingMessage } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const { tabs: inventoryTabs } = useInventoryCatalog();
  const navigate = useNavigate();
  const location = useLocation();

  const session = readSession();
  const displayName = session?.displayName || session?.email || "User";
  const displayRole = session?.role || "Employee";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const sectionTitle = useMemo(() => {
    if (location.pathname === "/") return "Dashboard";
    if (location.pathname === "/inventory/laboratory") {
      const params = new URLSearchParams(location.search);
      return params.get("view") === "logs" ? "Computer Lab Logs" : "Computer Lab Inventory";
    }
    const lastSegment = location.pathname.split("/").filter(Boolean).pop();
    if (!lastSegment) return "Workspace";
    return lastSegment
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [location.pathname, location.search]);

  const sectionTitleDisplay = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    const isLogsView = view === "logs";
    const isHistoryView = view === "history";
    if (location.pathname === "/borrowing" && (isHistoryView || isLogsView)) {
      return "Borrowing - History";
    }
    if (!isLogsView) return sectionTitle;
    if (/logs?$/i.test(sectionTitle)) return sectionTitle;
    return `${sectionTitle} - Logs`;
  }, [location.pathname, location.search, sectionTitle]);

  const navItems = useMemo(() => {
    const inventoryChildren = inventoryTabs.map((tab) => ({
      label: tab.name,
      icon: Package,
      path: `/inventory/${tab.slug}${tab.sections?.[0]?.slug ? `?section=${tab.sections[0].slug}` : ""}`,
    }));

    const comlabChild = {
      label: "Computer Laboratories",
      icon: Package,
      path: "/inventory/laboratory",
    };

    if (!inventoryChildren.some((child) => child.path === comlabChild.path)) {
      inventoryChildren.unshift(comlabChild);
    }

    const items = [
      { label: "Dashboard", icon: Home, path: "/" },
      { label: "Inventory", icon: Boxes, path: "/manage/inventory", children: inventoryChildren },
      { label: "Borrowing", icon: ClipboardList, path: "/borrowing" },
    ];

    if (isAdminSession(session)) {
      items.splice(1, 0, {
        label: "Manage",
        icon: Users,
        path: "/manage/accounts",
        children: [
          { label: "User Accounts", icon: Users, path: "/manage/accounts" },
          { label: "Inventory Manager", icon: Boxes, path: "/manage/inventory_manager" },
          { label: "Security", icon: ShieldAlert, path: "/manage/security" },
        ],
      });
    }

    return items;
  }, [inventoryTabs, session]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const doLogout = useCallback(async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event(SESSION_EVENT));
    }
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const handleLogout = async () => {
    await doLogout();
  };

  // ── Session idle detection ───────────────────────────────
  const { isIdle, confirmActive } = useSessionTimeout();

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-[linear-gradient(130deg,#f8fafc_0%,#eef2ff_35%,#ecfeff_100%)]">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed lg:static z-50 h-full flex flex-col transition-all duration-300 ease-in-out",
          collapsed ? "w-[72px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="relative flex flex-col h-full bg-[#411111] shadow-2xl shadow-black/30">
          {/* Vignette overlay */}
          <div
            className="pointer-events-none absolute inset-0 z-0"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.22) 100%)",
            }}
          />
          {/* Subtle dot texture */}
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
            aria-hidden="true"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 0.5px, transparent 0.5px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* ── Header ──────────────────────────────────── */}
          <div className={cn(
            "relative flex items-center p-4 border-b border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300",
            collapsed ? "justify-center" : "justify-between"
          )}>
            {!collapsed && (
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={arkLogo}
                  alt="Ark Logo"
                  className="w-9 h-9 bg-white rounded p-1 object-contain shrink-0"
                />
                <div className="overflow-hidden">
                  <p className="text-white font-bold text-sm leading-tight truncate">CSTA</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* ── Navigation ───────────────────────────────── */}
          <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-hide">
            {navItems.map((item) => (
              <NavItem
                key={item.label}
                item={item}
                collapsed={collapsed}
                setMobileOpen={setMobileOpen}
              />
            ))}
          </nav>

          {/* ── Footer: Logout ───────────────────────────── */}
          <div className="relative z-10 mt-auto border-t border-white/[0.06] p-3">
            <LogoutButton collapsed={collapsed} onLogout={() => setShowLogoutConfirm(true)} />
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/85 supports-[backdrop-filter]:bg-white/70 backdrop-blur-md border-b border-slate-200/80 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-slate-600 hover:bg-slate-100 p-2 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden md:block min-w-0">
              <p className="text-sm md:text-base font-semibold text-slate-900 truncate">{sectionTitleDisplay}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">CSTA MIS</p>
            </div>
          </div>

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
        </header>

        <main className="flex-1 p-6 bg-[radial-gradient(circle_at_top_right,_rgba(148,163,184,0.16),_transparent_45%),linear-gradient(to_bottom,_#f8fafc,_#eef2f7)] overflow-y-auto scrollbar-hide">
          <Outlet />
        </main>
      </div>

      {/* Logout Modal */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Ready to leave?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end your current session at CSTA MIS?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg">Wait, stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-6">
              Confirm Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Session Idle Confirmation Modal */}
      {isIdle && (
        <SessionTimeoutModal onConfirm={confirmActive} />
      )}
    </div>
  );
}
