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
	{
		label: "Borrowing",
		icon: ClipboardList,
		path: "/borrowing",
	},
	{
		label: "Inventory",
		icon: Package,
		path: "/inventory",
	},
];

function NavItem({ item, collapsed }) {
	const location = useLocation();
	const Icon = item.icon;
	const active = location.pathname === item.path;

	return (
		<Link
			to={item.path}
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
				active
					? "bg-white/20 text-white shadow-sm"
					: "text-white/80 hover:bg-white/10 hover:text-white",
			)}
		>
			<Icon className="w-5 h-5 shrink-0" />
			{!collapsed && <span>{item.label}</span>}
		</Link>
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
		<div className="flex h-screen bg-slate-100">
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}

			<aside
				className={cn(
					"fixed lg:static z-50 h-full bg-[#2E6F40] transition-all duration-300 flex flex-col shadow-xl",
					collapsed ? "w-16" : "w-64",
					mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
				)}
			>
				<div className="flex items-center justify-between p-4 border-b border-white/10">
					{!collapsed && (
						<div className="flex items-center gap-3">
							<img
								src={arkLogo}
								alt="Ark Logo"
								className="w-9 h-9 bg-white rounded p-1 object-contain shrink-0"
							/>
							<div>
								<p className="text-white font-bold text-lg leading-tight">Ark Industries</p>
								<p className="text-white/70 text-xs mt-0.5">Management System</p>
							</div>
						</div>
					)}
					<button
						onClick={() => setCollapsed(!collapsed)}
						className="hidden lg:flex text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
					>
						<Menu className="w-5 h-5" />
					</button>
					<button
						onClick={() => setMobileOpen(false)}
						className="lg:hidden text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<nav className="flex-1 overflow-y-auto p-3 space-y-1">
					{navItems.map((item) => (
						<NavItem key={item.label} item={item} collapsed={collapsed} />
					))}
				</nav>

				<div className="p-3 border-t border-white/10">
					<button
						onClick={() => setShowLogoutConfirm(true)}
						className={cn(
							"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
							"text-white/80 hover:bg-white/10 hover:text-white",
						)}
						title="Logout"
					>
						<LogOut className="w-5 h-5 shrink-0" />
						{!collapsed && <span>Logout</span>}
					</button>
				</div>
			</aside>

			<div className="flex-1 flex flex-col overflow-hidden">
				<header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
					<button
						onClick={() => setMobileOpen(true)}
						className="lg:hidden text-slate-600"
					>
						<Menu className="w-6 h-6" />
					</button>
					<div className="flex items-center gap-3 ml-auto">
						<div className="hidden sm:flex flex-col items-end leading-tight mr-1">
							<p className="text-sm font-semibold text-slate-900">
								{new Intl.DateTimeFormat(undefined, {
									weekday: "short",
									month: "short",
									day: "numeric",
									year: "numeric",
								}).format(now)}
							</p>
							<p className="text-xs text-slate-500">
								{new Intl.DateTimeFormat(undefined, {
									hour: "numeric",
									minute: "2-digit",
									second: "2-digit",
								}).format(now)}
							</p>
						</div>
						<button className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
							<Bell className="w-5 h-5" />
							<span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2E6F40] rounded-full"></span>
						</button>
						<div className="hidden sm:flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E6F40] text-sm font-bold text-white">
								{initials || "U"}
							</div>
							<div className="leading-tight">
								<p className="text-sm font-semibold text-slate-900">{displayName}</p>
								<p className="text-xs text-slate-500 capitalize">{displayRole}</p>
							</div>
						</div>
					</div>
				</header>

				<main className="flex-1 overflow-auto">
					<Outlet />
				</main>
			</div>

			<AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm Logout</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to log out of the ERP system?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
