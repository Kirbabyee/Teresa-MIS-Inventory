import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function PayrollSummaryReport() {
  const [payslips, setPayslips] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { Promise.all([backend.entities.Payslip.list("-created_date",500), backend.entities.PayrollPeriod.list("-start_date",20)]).then(([ps,pp])=>{ setPayslips(ps); setPeriods(pp); setLoading(false); }); }, []);

  const byPeriod = periods.map(p => {
    const pSlips = payslips.filter(s => s.period_id === p.id || s.period_name === p.name);
    return { name: p.name||p.start_date, gross: pSlips.reduce((s,x)=>s+Number(x.gross_pay||0),0), net: pSlips.reduce((s,x)=>s+Number(x.net_pay||0),0), deductions: pSlips.reduce((s,x)=>s+Number(x.total_deductions||0),0), count: pSlips.length };
  }).filter(p => p.count > 0);

  const totalGross = payslips.reduce((s,p)=>s+Number(p.gross_pay||0),0);
  const totalNet = payslips.reduce((s,p)=>s+Number(p.net_pay||0),0);
  const avgNet = payslips.length ? totalNet/payslips.length : 0;

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Payroll Summary Report</h1><p className="text-sm text-slate-500 mt-1">Payroll summary across all periods</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Gross Paid",`₱${totalGross.toLocaleString()}`,"text-slate-900"],["Total Net Released",`₱${totalNet.toLocaleString()}`,"text-green-700"],["Avg Net Pay/Employee",`₱${Math.round(avgNet).toLocaleString()}`,"text-blue-700"]].map(([l,v,c])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className={`text-2xl font-bold mt-1 ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          {byPeriod.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Gross vs Net by Payroll Period</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byPeriod}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`₱${(v/1000).toFixed(0)}k`}/><Tooltip formatter={v=>`₱${Number(v).toLocaleString()}`}/><Legend/><Bar dataKey="gross" fill="#94a3b8" radius={[4,4,0,0]} name="Gross Pay"/><Bar dataKey="net" fill="#10b981" radius={[4,4,0,0]} name="Net Pay"/></BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Period Summary</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Period","# Payslips","Total Gross","Total Deductions","Total Net"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{byPeriod.length===0?<tr><td colSpan={5} className="text-center py-12 text-slate-400">No period data.</td></tr>:byPeriod.map(p=>(
                <tr key={p.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-center">{p.count}</td>
                  <td className="px-4 py-3 text-slate-700">₱{p.gross.toLocaleString()}</td>
                  <td className="px-4 py-3 text-red-600">₱{p.deductions.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-green-700">₱{p.net.toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}