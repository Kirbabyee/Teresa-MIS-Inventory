import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

export default function AttritionReport() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { backend.entities.Employee.list("-hire_date",1000).then(d=>{ setEmployees(d); setLoading(false); }); }, []);

  const separated = employees.filter(e => ["resigned","terminated"].includes(e.status));
  const active = employees.filter(e => !["resigned","terminated"].includes(e.status));
  const attritionRate = employees.length ? ((separated.length/employees.length)*100).toFixed(1) : 0;

  const byDept = employees.reduce((acc,e)=>{
    const dept = e.department_name||"Unassigned";
    if (!acc[dept]) acc[dept] = { name:dept, active:0, separated:0 };
    if (["resigned","terminated"].includes(e.status)) acc[dept].separated++; else acc[dept].active++;
    return acc;
  },{});
  const deptData = Object.values(byDept).filter(d=>d.separated>0).sort((a,b)=>b.separated-a.separated);

  const byMonth = separated.reduce((acc,e)=>{
    const month = e.updated_date ? new Date(e.updated_date).toLocaleDateString("en-PH",{month:"short",year:"numeric"}) : "Unknown";
    acc[month] = (acc[month]||0)+1;
    return acc;
  },{});
  const monthData = Object.entries(byMonth).map(([month,count])=>({month,count})).slice(-12);

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Attrition Report</h1><p className="text-sm text-slate-500 mt-1">Resigned & terminated employee trends</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[["Total Headcount",employees.length,"text-slate-900"],["Active",active.length,"text-green-700"],["Separated",separated.length,"text-red-600"],["Attrition Rate",`${attritionRate}%`,"text-orange-600"]].map(([l,v,c])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-center">
                <p className={`text-3xl font-bold ${c}`}>{v}</p><p className="text-sm text-slate-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
          {monthData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Separations by Month</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot name="Separations"/></LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {deptData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Attrition by Department</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/><Bar dataKey="active" fill="#10b981" name="Active"/><Bar dataKey="separated" fill="#ef4444" name="Separated"/></BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Recent Separations</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Employee","Department","Status","Hire Date"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{separated.slice(0,20).map(e=>(
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3 text-slate-600">{e.department_name||"—"}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${e.status==="resigned"?"bg-orange-100 text-orange-700":"bg-red-100 text-red-700"}`}>{e.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{e.hire_date||"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}