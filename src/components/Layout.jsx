import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import arkLogo from "@/assets/imgs/ark-logo.png";
import { supabase } from "@/api/supabaseClient";

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

function NavItem({ item, collapsed, setMobileOpen }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const Icon = item.icon;

  // Check if current path matches this item or any of its children
  const isDirectActive = item.path ? location.pathname === item.path : false;
  const isChildActive = item.children?.some((child) => {
    const childPathname = child.path.split("?")[0];
    return location.pathname === childPathname;
  });
  const isActive = isDirectActive || isChildActive;

  // Auto-expand if a child is active
  useEffect(() => {
    if (item.children && isActive) setIsOpen(true);
  }, [isActive, item.children]);

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <Link
          to={item.children ? "#" : item.path}
          title={collapsed ? item.label : undefined}
          onClick={(e) => {
            if (item.children) {
              e.preventDefault();
              setIsOpen(!isOpen);
            } else {
              setMobileOpen(false); // Close mobile menu on click
            }
          }}
          className={cn(
            "group relative flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
            isActive
              ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.22),rgba(255,255,255,0.12))] text-white shadow-sm ring-1 ring-white/30"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
              isActive
                ? "bg-white/20 ring-white/25"
                : "bg-white/5 ring-white/15 group-hover:bg-white/15"
            )}
          >
            <Icon className="w-4 h-4" />
          </span>

          {item.children && (
            <>
              {/* Chevron background highlight when hovered */}
              <span
                className={cn(
                  "pointer-events-none absolute rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                  "h-8 w-8 bg-black/50",
                  collapsed ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : "hidden"
                )}
              />
              {/* Chevron icon */}
              <span
                className={cn(
                  "pointer-events-none absolute text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                  collapsed
                    ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "right-2 top-1/2 -translate-y-1/2"
                )}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </>
          )}

          {!collapsed && (
            <div className="flex flex-1 items-center justify-between">
              <span>{item.label}</span>
            </div>
          )}
        </Link>
      </div>

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
              <Link
                key={child.path}
                to={child.path}
                title={collapsed ? child.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center rounded-lg text-xs font-medium transition-all duration-200",
                  collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                  isSubActive
                    ? "text-white bg-white/18 ring-1 ring-white/25"
                    : "text-white/65 hover:text-white hover:bg-white/12"
                )}
              >
                <ChildIcon className="w-3 h-3" />
                {!collapsed && <span>{child.label}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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
    const lastSegment = location.pathname.split("/").filter(Boolean).pop();
    if (!lastSegment) return "Workspace";

    return lastSegment
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [location.pathname]);

  const navItems = useMemo(() => {
    const inventoryChildren = inventoryTabs.map((tab) => ({
      label: tab.name,
      icon: Package,
      path: `/inventory/${tab.slug}${tab.sections?.[0]?.slug ? `?section=${tab.sections[0].slug}` : ""}`,
    }));

    const items = [
      {
        label: "Dashboard",
        icon: Home,
        path: "/",
      },
      {
        label: "Inventory",
        icon: Boxes,
        path: "/manage/inventory",
        children: inventoryChildren,
      },
      {
        label: "Borrowing",
        icon: ClipboardList,
        path: "/borrowing",
      },
    ];

    if (isAdminSession(session)) {
      items.splice(1, 0, {
        label: "Manage",
        icon: Users,
        path: "/employees",
        children: [
          {
            label: "User Accounts",
            icon: Users,
            path: "/manage/accounts",
          },
          {
            label: "Inventory Manager",
            icon: Boxes,
            path: "/manage/inventory",
          },
          //{
          //  label: "Inventory Table Test",
          //  icon: FlaskConical,
          //  path: "/manage/inventory-table-test",
          //},
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

  const handleLogout = async () => {
    await supabase.auth.signOut();

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event(SESSION_EVENT));
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-[linear-gradient(130deg,#f8fafc_0%,#eef2ff_35%,#ecfeff_100%)]">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Sidebar */}
      <aside
        className={cn(
          "fixed lg:static z-50 h-full bg-[#2b0707]/95 backdrop-blur-xl border-r border-white/15 transition-all duration-300 flex flex-col shadow-xl overflow-visible",
          collapsed ? "w-20" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
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

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto overflow-x-visible p-3 space-y-1.5 scrollbar-hide">
          {navItems.map((item) => (
            <NavItem 
                key={item.label} 
                item={item} 
                collapsed={collapsed} 
                setMobileOpen={setMobileOpen} 
            />
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="relative p-3 border-t border-white/10 bg-gradient-to-t from-white/[0.04] to-transparent">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ring-1 ring-white/15",
              "text-white/85 bg-white/[0.06] hover:bg-red-500/20 hover:text-red-200"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
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
              <p className="text-sm md:text-base font-semibold text-slate-900 truncate">{sectionTitle}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">ST Teresa MIS</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Clock Section */}
            <div className="hidden md:flex flex-col items-end leading-tight border-r border-slate-200 pr-4 mr-1">
              <p className="text-sm font-semibold text-slate-900">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(now)}
              </p>
              <p className="text-xs font-mono text-slate-500">
                {now.toLocaleTimeString()}
              </p>
            </div>

            {/* Notification Button */}
            <button className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
            </button>

            {/* User Profile */}
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

        {/* Page Content */}
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
              Are you sure you want to end your current session at Ark Industries?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg">Wait, stay</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-6"
            >
              Confirm Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
