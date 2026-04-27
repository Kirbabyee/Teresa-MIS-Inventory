import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function LeaveBalanceReport() {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => { backend.entities.LeaveBalance.list("-year",500).then(d=>{ setBalances(d); setLoading(false); }); }, []);

  const filtered = balances.filter(b => {
    const matchYear = !year || b.year === year;
    const matchSearch = !search || (b.employee_name||"").toLowerCase().includes(search.toLowerCase());
    return matchYear && matchSearch;
  });

  const typeColors = { vacation:"bg-blue-100 text-blue-700", sick:"bg-red-100 text-red-700", emergency:"bg-orange-100 text-orange-700", maternity:"bg-pink-100 text-pink-700", paternity:"bg-cyan-100 text-cyan-700", bereavement:"bg-gray-100 text-gray-700" };

  return (
    <div className="p-6 space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-900">Leave Balance Report</h1><p className="text-sm text-slate-500 mt-1">Allocated vs Used leave days per employee</p></div>
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><Input className="pl-9" placeholder="Search employee..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={year} onChange={e=>setYear(Number(e.target.value))}>
          {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>{["Employee","Leave Type","Year","Allocated","Used","Remaining","% Used"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No leave balance records.</td></tr>:filtered.map(b=>{
              const remaining = (b.allocated_days||0)-(b.used_days||0);
              const pct = b.allocated_days ? ((b.used_days||0)/b.allocated_days*100).toFixed(0) : 0;
              return (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{b.employee_name||"—"}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${typeColors[b.leave_type]||"bg-gray-100 text-gray-600"}`}>{b.leave_type}</span></td>
                  <td className="px-4 py-3 text-slate-600">{b.year}</td>
                  <td className="px-4 py-3 text-center font-medium">{b.allocated_days}</td>
                  <td className="px-4 py-3 text-center text-orange-600 font-medium">{b.used_days||0}</td>
                  <td className="px-4 py-3 text-center font-bold text-green-700">{remaining}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2"><div className="flex-1 bg-slate-100 rounded-full h-2"><div className="bg-blue-500 rounded-full h-2 transition-all" style={{width:`${Math.min(pct,100)}%`}}/></div><span className="text-xs text-slate-500 w-8">{pct}%</span></div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}