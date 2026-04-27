import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899"];
const statusColors = { probationary:"bg-yellow-100 text-yellow-700", regular:"bg-green-100 text-green-700", contractual:"bg-blue-100 text-blue-700", resigned:"bg-gray-100 text-gray-600", terminated:"bg-red-100 text-red-700" };

export default function HeadcountReport() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { backend.entities.Employee.list("-created_date",1000).then(d=>{ setEmployees(d); setLoading(false); }); }, []);

  const byDept = employees.reduce((acc,e)=>{ const k=e.department_name||"Unassigned"; acc[k]=(acc[k]||0)+1; return acc; },{});
  const byStatus = employees.reduce((acc,e)=>{ acc[e.status]=(acc[e.status]||0)+1; return acc; },{});
  const deptData = Object.entries(byDept).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  const statusData = Object.entries(byStatus).map(([name,value])=>({name,value}));
  const active = employees.filter(e=>!["resigned","terminated"].includes(e.status)).length;

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Headcount Report</h1><p className="text-sm text-slate-500 mt-1">Employee count breakdown by department and status</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[["Total Employees",employees.length,"bg-blue-600"],["Active",active,"bg-green-600"],["Regular",byStatus.regular||0,"bg-purple-600"],["Probationary",byStatus.probationary||0,"bg-yellow-500"]].map(([l,v,c])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
                <p className="text-3xl font-bold" style={{color: c.replace("bg-","").includes("-600")?"":"inherit"}}>{v}</p>
                <p className="text-sm text-slate-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Headcount by Department</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={deptData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} name="Count"/></BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Employment Status Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie><Tooltip/></PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Department Breakdown</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Department","Total","Regular","Probationary","Contractual","% of Total"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{deptData.map(d=>{
                const dEmps = employees.filter(e=>(e.department_name||"Unassigned")===d.name);
                return (
                  <tr key={d.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 font-bold text-center">{d.count}</td>
                    <td className="px-4 py-3 text-center text-green-700">{dEmps.filter(e=>e.status==="regular").length}</td>
                    <td className="px-4 py-3 text-center text-yellow-700">{dEmps.filter(e=>e.status==="probationary").length}</td>
                    <td className="px-4 py-3 text-center text-blue-700">{dEmps.filter(e=>e.status==="contractual").length}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{employees.length?((d.count/employees.length)*100).toFixed(1)+"%" : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}