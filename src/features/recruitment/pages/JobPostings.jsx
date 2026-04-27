import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { open: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-600", on_hold: "bg-yellow-100 text-yellow-700" };

function PostingModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", department_name: "", description: "", requirements: "", salary_range: "", status: "open", positions_available: 1, ...item });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.JobPosting.update(item.id, form); else await backend.entities.JobPosting.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item ? "Edit Posting" : "New Job Posting"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Job Title *</label><Input className="mt-1" value={form.title} onChange={e => set("title", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Department</label><Input className="mt-1" value={form.department_name||""} onChange={e => set("department_name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Salary Range</label><Input className="mt-1" placeholder="e.g. ₱25,000 - ₱35,000" value={form.salary_range||""} onChange={e => set("salary_range", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Positions Available</label><Input className="mt-1" type="number" value={form.positions_available||1} onChange={e => set("positions_available", Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => set("status", e.target.value)}>
              {["open","closed","on_hold"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description *</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={3} value={form.description} onChange={e => set("description", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Requirements</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={3} value={form.requirements||""} onChange={e => set("requirements", e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function JobPostings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const d = await backend.entities.JobPosting.list("-created_date", 200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Job Postings</h1><p className="text-sm text-slate-500 mt-1">Open Positions & Recruitment Pipeline</p></div>
        <Button onClick={() => { setEditItem(null); setShowModal(true); }} className="gap-2"><Plus className="w-4 h-4"/> New Posting</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.length===0 ? <div className="col-span-3 text-center py-16 text-slate-400">No job postings.</div> : items.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.status]}`}>{p.status.replace("_"," ")}</span>
                <div className="flex gap-1"><button onClick={() => {setEditItem(p);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.JobPosting.delete(p.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></div>
              </div>
              <h3 className="font-semibold text-slate-900">{p.title}</h3>
              <p className="text-sm text-slate-500 mt-0.5">{p.department_name||"No department"}</p>
              {p.salary_range && <p className="text-sm text-green-600 font-medium mt-1">{p.salary_range}</p>}
              <p className="text-sm text-slate-600 mt-2 line-clamp-2">{p.description}</p>
              {p.positions_available && <p className="text-xs text-slate-400 mt-2">{p.positions_available} position(s) available</p>}
            </div>
          ))}
        </div>
      )}
      {showModal && <PostingModal item={editItem} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }}/>}
    </div>
  );
}