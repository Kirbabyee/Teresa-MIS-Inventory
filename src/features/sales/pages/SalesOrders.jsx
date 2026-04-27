import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { draft:"bg-gray-100 text-gray-600", confirmed:"bg-blue-100 text-blue-700", invoiced:"bg-purple-100 text-purple-700", paid:"bg-green-100 text-green-700", cancelled:"bg-red-100 text-red-700" };

function SOModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ client_name:"", order_date:"", delivery_date:"", total_amount:0, status:"draft", notes:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.SalesOrder.update(item.id, form);
    else await backend.entities.SalesOrder.create({ ...form, client_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Sales Order":"New Sales Order"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Client</label><Input className="mt-1" value={form.client_name||""} onChange={e=>set("client_name",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Order Date *</label><Input className="mt-1" type="date" value={form.order_date||""} onChange={e=>set("order_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Delivery Date</label><Input className="mt-1" type="date" value={form.delivery_date||""} onChange={e=>set("delivery_date",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Total Amount (₱)</label><Input className="mt-1" type="number" value={form.total_amount||""} onChange={e=>set("total_amount",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["draft","confirmed","invoiced","paid","cancelled"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function SalesOrders() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.SalesOrder.list("-order_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Sales Orders</h1><p className="text-sm text-slate-500 mt-1">SO Management · Approval · Billing Integration</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New SO</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Client","Order Date","Delivery Date","Amount","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No sales orders.</td></tr>:items.map(o=>(
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{o.client_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{o.order_date}</td>
                <td className="px-4 py-3 text-slate-600">{o.delivery_date||"—"}</td>
                <td className="px-4 py-3 font-semibold">₱{Number(o.total_amount||0).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[o.status]||"bg-gray-100 text-gray-600"}`}>{o.status}</span></td>
                <td className="px-4 py-3"><button onClick={()=>{setEditItem(o);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <SOModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}