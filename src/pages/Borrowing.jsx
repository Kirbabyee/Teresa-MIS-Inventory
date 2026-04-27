import { Link } from "react-router-dom";

export default function Borrowing() {
  return (
    <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Borrowing</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/inventory"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go to Inventory
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </Link>
          </div>
        </div>
        <p className="mt-3 text-slate-600">Borrowing page content here.</p>
      </div>
    </div>
  );
}
