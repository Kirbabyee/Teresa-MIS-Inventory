import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444"];

export default function ProjectReports() {
  const [projects, setProjects] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([backend.entities.Project.list(), backend.entities.ProjectTimesheet.list()])
      .then(([p,t])=>{ setProjects(p); setTimesheets(t); setLoading(false); });
  }, []);
  const byStatus = ["active","completed","on_hold","cancelled"].map(s=>({ name:s.replace("_"," "), value:projects.filter(p=>p.status===s).length })).filter(x=>x.value>0);
  const totalBudget = projects.reduce((s,p)=>s+Number(p.budget||0),0);
  const totalHours = timesheets.reduce((s,t)=>s+Number(t.hours_worked||0),0);
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Project Reports</h1><p className="text-sm text-slate-500 mt-1">Portfolio Overview · Budget Utilization · Schedule Performance</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Projects",projects.length],["Total Budget","₱"+totalBudget.toLocaleString()],["Total Hours Logged",totalHours+"h"]].map(([l,v])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byStatus.length>0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Projects by Status</h3>
                <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={byStatus} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name" label>{byStatus.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Legend/><Tooltip/></PieChart></ResponsiveContainer>
              </div>
            )}
            {projects.length>0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Budget by Project (Top 10)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[...projects].sort((a,b)=>Number(b.budget||0)-Number(a.budget||0)).slice(0,10).map(p=>({name:p.name,budget:Number(p.budget||0)}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:9}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>"₱"+Number(v).toLocaleString()}/><Bar dataKey="budget" fill="#6366f1" radius={[4,4,0,0]} name="Budget"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}