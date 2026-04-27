import { Link } from "react-router-dom";

export default function Inventory() {
  return (
    <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/borrowing"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go to Borrowing
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </Link>
          </div>
        </div>
        <p className="mt-3 text-slate-600">Inventory page content here.</p>
      </div>
    </div>
  );
}
