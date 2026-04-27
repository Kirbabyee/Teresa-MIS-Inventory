import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { accredited:"bg-green-100 text-green-700", pending:"bg-yellow-100 text-yellow-700", blacklisted:"bg-red-100 text-red-700" };

function SupplierModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", status:"accredited", payment_terms:"", performance_rating:5, contact_person:"", email:"", phone:"", address:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Supplier.update(item.id, form); else await backend.entities.Supplier.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Supplier":"Add Supplier"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Supplier Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["accredited","pending","blacklisted"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Payment Terms</label><Input className="mt-1" placeholder="Net 30, Net 15, COD..." value={form.payment_terms||""} onChange={e=>set("payment_terms",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Performance Rating (1-5)</label><Input className="mt-1" type="number" min="1" max="5" step="0.1" value={form.performance_rating||5} onChange={e=>set("performance_rating",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Contact Person</label><Input className="mt-1" value={form.contact_person||""} onChange={e=>set("contact_person",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Email</label><Input className="mt-1" type="email" value={form.email||""} onChange={e=>set("email",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Phone</label><Input className="mt-1" value={form.phone||""} onChange={e=>set("phone",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function SupplierManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Supplier.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Supplier Management</h1><p className="text-sm text-slate-500 mt-1">Masterlist · Accreditation · Terms · Ratings · Contract Monitoring</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Supplier</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Supplier","Status","Payment Terms","Rating","Contact","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No suppliers.</td></tr>:items.map(s=>(
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[s.status]||"bg-gray-100 text-gray-600"}`}>{s.status}</span></td>
                <td className="px-4 py-3 text-slate-600">{s.payment_terms||"—"}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400"/><span className="font-medium">{s.performance_rating||5}</span></div></td>
                <td className="px-4 py-3 text-slate-500">{s.contact_person||"—"}</td>
                <td className="px-4 py-3 flex gap-1"><button onClick={()=>{setEditItem(s);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Supplier.delete(s.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <SupplierModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}