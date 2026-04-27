import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const typeColors = { in:"bg-green-100 text-green-700", out:"bg-red-100 text-red-700", transfer:"bg-blue-100 text-blue-700", adjustment:"bg-purple-100 text-purple-700" };

function MovementModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ item_name:"", movement_type:"in", quantity:0, movement_date:"", reference:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    await backend.entities.StockMovement.create({ ...form, item_id:"manual", performed_by:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">Record Stock Movement</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Item Name *</label><Input className="mt-1" value={form.item_name} onChange={e=>set("item_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Movement Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.movement_type} onChange={e=>set("movement_type",e.target.value)}>
              {["in","out","transfer","adjustment"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Quantity *</label><Input className="mt-1" type="number" value={form.quantity} onChange={e=>set("quantity",Number(e.target.value))}/></div>
            <div><label className="text-xs font-medium text-slate-600">Date</label><Input className="mt-1" type="date" value={form.movement_date} onChange={e=>set("movement_date",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Reference</label><Input className="mt-1" placeholder="PO#, DR#…" value={form.reference||""} onChange={e=>set("reference",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function StockMovements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const load = async () => { setLoading(true); const d = await backend.entities.StockMovement.list("-movement_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Stock Movements</h1><p className="text-sm text-slate-500 mt-1">Issuances · Receipts · Transfers · Adjustments</p></div>
        <Button onClick={()=>setShowModal(true)} className="gap-2"><Plus className="w-4 h-4"/> Record Movement</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Item","Type","Qty","Date","Reference","Notes"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No movements recorded.</td></tr>:items.map(m=>(
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{m.item_name||"—"}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${typeColors[m.movement_type]||"bg-gray-100 text-gray-600"}`}>{m.movement_type}</span></td>
                <td className="px-4 py-3 font-bold">{m.quantity}</td>
                <td className="px-4 py-3 text-slate-600">{m.movement_date}</td>
                <td className="px-4 py-3 text-slate-500">{m.reference||"—"}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{m.notes||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <MovementModal onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}