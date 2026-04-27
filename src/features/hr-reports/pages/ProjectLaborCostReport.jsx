import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function ProjectLaborCostReport() {
  const [allocations, setAllocations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { Promise.all([backend.entities.TimesheetAllocation?.list("-date",1000)||Promise.resolve([]), backend.entities.Project.list()]).then(([a,p])=>{ setAllocations(a); setProjects(p); setLoading(false); }); }, []);

  const byProject = projects.map(p => {
    const allocs = allocations.filter(a => a.project_id === p.id || a.project_name === p.name);
    const totalHours = allocs.reduce((s,a)=>s+Number(a.hours_worked||0),0);
    return { name: p.name, hours: totalHours, employees: new Set(allocs.map(a=>a.employee_id)).size };
  }).filter(p=>p.hours>0).sort((a,b)=>b.hours-a.hours);

  const totalHours = allocations.reduce((s,a)=>s+Number(a.hours_worked||0),0);

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Project Labor Cost Report</h1><p className="text-sm text-slate-500 mt-1">Labor hours and cost allocation per project</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Projects",projects.length],["Total Labor Hours",totalHours.toLocaleString()],["Active Projects",projects.filter(p=>p.status==="active").length]].map(([l,v])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          {byProject.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Labor Hours by Project</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byProject}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="hours" fill="#8b5cf6" radius={[4,4,0,0]} name="Hours"/></BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Project Labor Allocation</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Project","Status","Total Hours","# Employees"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{byProject.length===0?<tr><td colSpan={4} className="text-center py-12 text-slate-400">No project labor data. Add timesheet allocations to see data here.</td></tr>:byProject.map(p=>(
                <tr key={p.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">{projects.find(x=>x.name===p.name)?.status||"—"}</td>
                  <td className="px-4 py-3 font-bold text-purple-700">{p.hours}h</td>
                  <td className="px-4 py-3 text-center">{p.employees}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}