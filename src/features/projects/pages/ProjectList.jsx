import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { active:"bg-green-100 text-green-700", completed:"bg-blue-100 text-blue-700", on_hold:"bg-yellow-100 text-yellow-700", cancelled:"bg-red-100 text-red-700" };

function ProjectModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", client_name:"", status:"active", start_date:"", end_date:"", budget:0, description:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Project.update(item.id, form);
    else await backend.entities.Project.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Project":"New Project"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Project Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Client</label><Input className="mt-1" value={form.client_name||""} onChange={e=>set("client_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["active","completed","on_hold","cancelled"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Start Date</label><Input className="mt-1" type="date" value={form.start_date||""} onChange={e=>set("start_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">End Date</label><Input className="mt-1" type="date" value={form.end_date||""} onChange={e=>set("end_date",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Budget (₱)</label><Input className="mt-1" type="number" value={form.budget||""} onChange={e=>set("budget",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ProjectList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Project.list("-start_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Projects</h1><p className="text-sm text-slate-500 mt-1">Project Register · Timeline · Budget · Client Linking</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Project</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.length===0?<div className="col-span-3 text-center py-16 text-slate-400">No projects yet.</div>:items.map(p=>(
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={()=>{setEditItem(p);setShowModal(true);}}>
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.status]||"bg-gray-100 text-gray-600"}`}>{p.status?.replace("_"," ")}</span>
                <button onClick={e=>{e.stopPropagation();if(!confirm("Delete?"))return;backend.entities.Project.delete(p.id).then(load);}} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-4 h-4"/></button>
              </div>
              <h3 className="font-semibold text-slate-900 mt-3">{p.name}</h3>
              {p.client_name && <p className="text-sm text-slate-500 mt-0.5">Client: {p.client_name}</p>}
              {p.budget > 0 && <p className="text-sm font-semibold text-slate-700 mt-1">₱{Number(p.budget).toLocaleString()}</p>}
              {(p.start_date || p.end_date) && <p className="text-xs text-slate-400 mt-2">{p.start_date||"?"} → {p.end_date||"Ongoing"}</p>}
            </div>
          ))}
        </div>
      )}
      {showModal && <ProjectModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}