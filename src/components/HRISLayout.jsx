import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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
  X,
  Home,
  Package,
  ClipboardList,
  LogOut,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";
import arkLogo from "@/assets/imgs/ark-logo.png";

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";

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

const navItems = [
  {
    label: "Dashboard",
    icon: Home,
    path: "/",
  },
  {label: "Manage", 
    icon: Home, 
    path: "/employees", children: [{
      label : "User Accounts", 
      icon: Users, 
      path: "/manage/accounts"
    }, 
    {
      label: "Laboratories",
      icon: Package,
      path: "/inventory",
    }]
  },
  {
    label: "Inventory",
    icon: ClipboardList,
    children: [
      {
        label: "Laboratory 1",
        icon: Package,
        path: "/laboratory/laboratory-1",
      },
      {
        label: "Laboratory 2",
        icon: Package,
        path: "/laboratory/laboratory-2",
      },
      {
        label: "Laboratory 3",
        icon: Package,
        path: "/laboratory/laboratory-3",
      },
      {
        label: "Laboratory 4",
        icon: Package,
        path: "/laboratory/laboratory-4",
      },
      {
        label: "Laboratory 5",
        icon: Package,
        path: "/laboratory/laboratory-5",
      },
    ],
  },
  {
    label: "Borrowing",
    icon: ClipboardList,
    path: "/borrowing",
  },
];

function NavItem({ item, collapsed, setMobileOpen }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const Icon = item.icon;

  // Check if current path matches this item or any of its children
  const isDirectActive = location.pathname === item.path;
  const isChildActive = item.children?.some((child) => location.pathname === child.path);
  const isActive = isDirectActive || isChildActive;

  // Auto-expand if a child is active
  useEffect(() => {
    if (isChildActive) setIsOpen(true);
  }, [isChildActive]);

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <Link
          to={item.children ? "#" : item.path}
          onClick={(e) => {
            if (item.children) {
              e.preventDefault();
              setIsOpen(!isOpen);
            } else {
              setMobileOpen(false); // Close mobile menu on click
            }
          }}
          className={cn(
            "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            isActive
              ? "bg-white/20 text-white shadow-sm"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <div className="flex flex-1 items-center justify-between">
              <span>{item.label}</span>
              {item.children && (
                <div className="transition-transform duration-200">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Nested Children Rendering */}
      {!collapsed && isOpen && item.children && (
        <div className="mt-1 ml-4 pl-5 border-l border-white/10 space-y-1">
          {item.children.map((child) => {
            const ChildIcon = child.icon;
            const isSubActive = location.pathname === child.path;
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  isSubActive
                    ? "text-white bg-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <ChildIcon className="w-4 h-4" />
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HRISLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event(SESSION_EVENT));
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
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
          "fixed lg:static z-50 h-full bg-[#170000] transition-all duration-300 flex flex-col shadow-xl",
          collapsed ? "w-20" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className={cn(
          "flex items-center p-4 border-b border-white/10 transition-all duration-300",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <img
                src={arkLogo}
                alt="Ark Logo"
                className="w-9 h-9 bg-white rounded p-1 object-contain shrink-0"
              />
              <div className="overflow-hidden">
                <p className="text-white font-bold text-sm leading-tight truncate">Sta. Teresa de Avila</p>
                <p className="text-white/70 text-[10px] uppercase tracking-wider mt-0.5">Management</p>
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
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
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
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "text-white/80 hover:bg-red-500/20 hover:text-red-200"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-600 hover:bg-slate-100 p-2 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-4 ml-auto">
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
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2E6F40] text-sm font-bold text-white ring-2 ring-[#2E6F40]/10">
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
        <main className="flex-1 overflow-hidden p-6 bg-slate-50/50">
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