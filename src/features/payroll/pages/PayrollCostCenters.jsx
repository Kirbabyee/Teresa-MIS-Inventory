import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

export default function PayrollCostCenters() {
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([backend.entities.Payslip.list("-created_date",500), backend.entities.Employee.list()]).then(([ps, es]) => { setPayslips(ps); setEmployees(es); setLoading(false); });
  }, []);

  const byDept = payslips.reduce((acc, p) => {
    const dept = p.department_name || "Unassigned";
    if (!acc[dept]) acc[dept] = { name: dept, gross: 0, net: 0, count: 0 };
    acc[dept].gross += Number(p.gross_pay||0);
    acc[dept].net += Number(p.net_pay||0);
    acc[dept].count++;
    return acc;
  }, {});
  const deptData = Object.values(byDept).sort((a,b) => b.gross-a.gross);
  const totalGross = payslips.reduce((s,p) => s+Number(p.gross_pay||0), 0);
  const totalNet = payslips.reduce((s,p) => s+Number(p.net_pay||0), 0);

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Payroll Cost Centers</h1><p className="text-sm text-slate-500 mt-1">Payroll Summary · Cost Center per Payroll / Project / Employee</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Gross Payroll",`₱${totalGross.toLocaleString()}`,"bg-blue-50 text-blue-900"],["Total Net Payroll",`₱${totalNet.toLocaleString()}`,"bg-green-50 text-green-900"],["Total Deductions",`₱${(totalGross-totalNet).toLocaleString()}`,"bg-red-50 text-red-900"]].map(([l,v,c])=>(
              <div key={l} className={`rounded-xl p-5 ${c}`}><p className="text-sm font-medium opacity-70">{l}</p><p className="text-2xl font-bold mt-1">{v}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Gross Pay by Department</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={deptData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`₱${(v/1000).toFixed(0)}k`}/><Tooltip formatter={v=>`₱${Number(v).toLocaleString()}`}/><Bar dataKey="gross" fill="#3b82f6" radius={[4,4,0,0]} name="Gross Pay"/></BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Cost Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={deptData} dataKey="gross" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {deptData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie><Tooltip formatter={v=>`₱${Number(v).toLocaleString()}`}/></PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Cost Center Summary</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Department/Cost Center","Payslips","Total Gross","Total Net","Total Deductions","Avg Net"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{deptData.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No data.</td></tr>:deptData.map((d,i)=>(
                <tr key={d.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{background:COLORS[i%COLORS.length]}}/>{d.name}</td>
                  <td className="px-4 py-3 text-center">{d.count}</td>
                  <td className="px-4 py-3 text-slate-700">₱{d.gross.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">₱{d.net.toLocaleString()}</td>
                  <td className="px-4 py-3 text-red-600">₱{(d.gross-d.net).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">₱{d.count?Math.round(d.net/d.count).toLocaleString():"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}