import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ClientModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", industry:"", contact_person:"", email:"", phone:"", address:"", status:"active", notes:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Client.update(item.id, form);
    else await backend.entities.Client.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Client":"Add Client"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Client Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Industry</label><Input className="mt-1" value={form.industry||""} onChange={e=>set("industry",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Contact Person</label><Input className="mt-1" value={form.contact_person||""} onChange={e=>set("contact_person",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Email</label><Input className="mt-1" type="email" value={form.email||""} onChange={e=>set("email",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Phone</label><Input className="mt-1" value={form.phone||""} onChange={e=>set("phone",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Address</label><Input className="mt-1" value={form.address||""} onChange={e=>set("address",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["active","inactive","prospect"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ClientManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Client.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = items.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()));
  const statusColors = { active:"bg-green-100 text-green-700", inactive:"bg-gray-100 text-gray-600", prospect:"bg-blue-100 text-blue-700" };
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Client Management</h1><p className="text-sm text-slate-500 mt-1">Client Database · Contact Info · Account Status · History</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Client</Button>
      </div>
      <Input placeholder="Search clients…" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Client","Industry","Contact","Email","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No clients found.</td></tr>:filtered.map(c=>(
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.industry||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.contact_person||"—"}</td>
                <td className="px-4 py-3 text-slate-500">{c.email||"—"}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[c.status]||"bg-gray-100 text-gray-600"}`}>{c.status}</span></td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={()=>{setEditItem(c);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                  <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Client.delete(c.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <ClientModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}