import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { active:"bg-red-100 text-red-700", resolved:"bg-green-100 text-green-700", appealed:"bg-yellow-100 text-yellow-700" };

function DisciplinaryModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name:"", incident_date:"", violation_type:"", description:"", sanction:"", status:"active", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.DisciplinaryRecord.update(item.id, form); else await backend.entities.DisciplinaryRecord.create({...form, employee_id:"manual"}); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Record":"New Disciplinary Record"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee *</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Incident Date *</label><Input className="mt-1" type="date" value={form.incident_date} onChange={e=>set("incident_date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Violation Type *</label><Input className="mt-1" placeholder="Tardiness, Insubordination..." value={form.violation_type} onChange={e=>set("violation_type",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Sanction *</label><Input className="mt-1" placeholder="Verbal Warning, Written Warning, Suspension..." value={form.sanction} onChange={e=>set("sanction",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["active","resolved","appealed"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function DisciplinaryAction() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.DisciplinaryRecord.list("-incident_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Disciplinary Action</h1><p className="text-sm text-slate-500 mt-1">Disciplinary Records & Case Monitoring</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Record</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Employee","Date","Violation","Sanction","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No records.</td></tr>:items.map(d=>(
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{d.employee_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.incident_date}</td>
                <td className="px-4 py-3 text-slate-700">{d.violation_type}</td>
                <td className="px-4 py-3 text-slate-600">{d.sanction}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[d.status]}`}>{d.status}</span></td>
                <td className="px-4 py-3 flex gap-1"><button onClick={()=>{setEditItem(d);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.DisciplinaryRecord.delete(d.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <DisciplinaryModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}