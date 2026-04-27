import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function TimesheetModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ project_name:"", employee_name:"", date:"", hours_worked:8, task_description:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    await backend.entities.ProjectTimesheet.create({ ...form, project_id:"manual", employee_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">Log Time</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Project</label><Input className="mt-1" value={form.project_name} onChange={e=>set("project_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Date *</label><Input className="mt-1" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Hours *</label><Input className="mt-1" type="number" step="0.5" value={form.hours_worked} onChange={e=>set("hours_worked",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Task Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={3} value={form.task_description||""} onChange={e=>set("task_description",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ProjectTimesheets() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const load = async () => { setLoading(true); const d = await backend.entities.ProjectTimesheet.list("-date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const totalHours = items.reduce((s,i)=>s+Number(i.hours_worked||0),0);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Project Timesheets</h1><p className="text-sm text-slate-500 mt-1">Daily Time Logging · Project Costing · Manpower Tracking</p></div>
        <Button onClick={()=>setShowModal(true)} className="gap-2"><Plus className="w-4 h-4"/> Log Time</Button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm inline-block">
        <p className="text-sm text-slate-500">Total Hours Logged</p>
        <p className="text-2xl font-bold text-slate-900">{totalHours.toLocaleString()}h</p>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Project","Employee","Date","Hours","Task"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={5} className="text-center py-12 text-slate-400">No time entries.</td></tr>:items.map(t=>(
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{t.project_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{t.employee_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{t.date}</td>
                <td className="px-4 py-3 font-bold">{t.hours_worked}h</td>
                <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{t.task_description||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <TimesheetModal onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}