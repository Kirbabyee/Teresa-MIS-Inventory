import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const typeColors = { regular:"bg-red-100 text-red-700", special_non_working:"bg-orange-100 text-orange-700", special_working:"bg-blue-100 text-blue-700" };

function HolidayModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", date:"", type:"regular", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Holiday.update(item.id, form); else await backend.entities.Holiday.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Holiday":"Add Holiday"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Holiday Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Date *</label><Input className="mt-1" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set("type",e.target.value)}>
              <option value="regular">Regular Holiday</option>
              <option value="special_non_working">Special Non-Working</option>
              <option value="special_working">Special Working</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function HolidaySetup() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Holiday.list("date",100); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Holiday Setup</h1><p className="text-sm text-slate-500 mt-1">Regular & Special Non-Working Holidays</p></div>
        <Button onClick={() => { setEditItem(null); setShowModal(true); }} className="gap-2"><Plus className="w-4 h-4"/> Add Holiday</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Date","Holiday","Type","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={4} className="text-center py-12 text-slate-400">No holidays added.</td></tr>:items.map(h=>(
              <tr key={h.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{h.date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{h.name}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColors[h.type]||"bg-gray-100 text-gray-600"}`}>{h.type?.replace(/_/g," ")}</span></td>
                <td className="px-4 py-3 flex gap-1"><button onClick={()=>{setEditItem(h);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Holiday.delete(h.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <HolidayModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}