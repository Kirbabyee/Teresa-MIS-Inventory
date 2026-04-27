import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { unpaid:"bg-red-100 text-red-700", partial:"bg-yellow-100 text-yellow-700", paid:"bg-green-100 text-green-700", overdue:"bg-orange-100 text-orange-700" };

function APModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ supplier_name:"", invoice_number:"", invoice_date:"", due_date:"", amount:0, paid_amount:0, status:"unpaid", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.AccountPayable.update(item.id, form);
    else await backend.entities.AccountPayable.create({ ...form, supplier_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit AP":"New Payable"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Supplier</label><Input className="mt-1" value={form.supplier_name||""} onChange={e=>set("supplier_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Invoice #</label><Input className="mt-1" value={form.invoice_number||""} onChange={e=>set("invoice_number",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Invoice Date</label><Input className="mt-1" type="date" value={form.invoice_date||""} onChange={e=>set("invoice_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Due Date</label><Input className="mt-1" type="date" value={form.due_date||""} onChange={e=>set("due_date",e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Amount (₱)</label><Input className="mt-1" type="number" value={form.amount||""} onChange={e=>set("amount",Number(e.target.value))}/></div>
            <div><label className="text-xs font-medium text-slate-600">Paid (₱)</label><Input className="mt-1" type="number" value={form.paid_amount||""} onChange={e=>set("paid_amount",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["unpaid","partial","paid","overdue"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function AccountsPayable() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.AccountPayable.list("-invoice_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const totalOwed = items.filter(i=>i.status!=="paid").reduce((s,i)=>s+Number(i.amount||0)-Number(i.paid_amount||0),0);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Accounts Payable</h1><p className="text-sm text-slate-500 mt-1">Supplier Invoices · Payment Tracking · Aging</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Payable</Button>
      </div>
      <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm inline-block">
        <p className="text-sm text-slate-500">Total Outstanding</p>
        <p className="text-2xl font-bold text-red-600">₱{totalOwed.toLocaleString()}</p>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Supplier","Invoice #","Invoice Date","Due Date","Amount","Paid","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={8} className="text-center py-12 text-slate-400">No payables.</td></tr>:items.map(a=>(
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{a.supplier_name||"—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{a.invoice_number||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{a.invoice_date||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{a.due_date||"—"}</td>
                <td className="px-4 py-3 font-semibold">₱{Number(a.amount||0).toLocaleString()}</td>
                <td className="px-4 py-3">₱{Number(a.paid_amount||0).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[a.status]||"bg-gray-100 text-gray-600"}`}>{a.status}</span></td>
                <td className="px-4 py-3"><button onClick={()=>{setEditItem(a);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs underline">Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <APModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}