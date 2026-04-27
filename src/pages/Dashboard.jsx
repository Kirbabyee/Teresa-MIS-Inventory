import { ClipboardList, Home, Package } from "lucide-react";
import { Link } from "react-router-dom";

const cards = [
  {
    label: "Dashboard",
    value: "Active",
    icon: Home,
    link: "/",
    color: "bg-[#2E6F40]",
  },
  {
    label: "Borrowing",
    value: "Open",
    icon: ClipboardList,
    link: "/borrowing",
    color: "bg-amber-500",
  },
  {
    label: "Inventory",
    value: "Ready",
    icon: Package,
    link: "/inventory",
    color: "bg-slate-700",
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quick access to your enabled modules.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.link}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
                </div>
                <div className={`${card.color} rounded-xl p-3 shadow-sm`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
