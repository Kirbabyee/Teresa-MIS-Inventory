import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { draft:"bg-gray-100 text-gray-600", posted:"bg-green-100 text-green-700", reversed:"bg-red-100 text-red-700" };

function JEModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ entry_date:"", reference:"", description:"", total_debit:0, total_credit:0, status:"draft", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.JournalEntry.update(item.id, form);
    else await backend.entities.JournalEntry.create({ ...form, prepared_by:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit JE":"New Journal Entry"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Entry Date *</label><Input className="mt-1" type="date" value={form.entry_date||""} onChange={e=>set("entry_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Reference</label><Input className="mt-1" value={form.reference||""} onChange={e=>set("reference",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Total Debit (₱)</label><Input className="mt-1" type="number" value={form.total_debit||""} onChange={e=>set("total_debit",Number(e.target.value))}/></div>
            <div><label className="text-xs font-medium text-slate-600">Total Credit (₱)</label><Input className="mt-1" type="number" value={form.total_credit||""} onChange={e=>set("total_credit",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["draft","posted","reversed"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function JournalEntries() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.JournalEntry.list("-entry_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Journal Entries</h1><p className="text-sm text-slate-500 mt-1">General Ledger · Debit/Credit · Posting · Audit Trail</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Entry</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Date","Reference","Description","Debit","Credit","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No journal entries.</td></tr>:items.map(j=>(
              <tr key={j.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{j.entry_date}</td>
                <td className="px-4 py-3 font-mono text-xs">{j.reference||"—"}</td>
                <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{j.description||"—"}</td>
                <td className="px-4 py-3 font-semibold">₱{Number(j.total_debit||0).toLocaleString()}</td>
                <td className="px-4 py-3 font-semibold">₱{Number(j.total_credit||0).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[j.status]||"bg-gray-100 text-gray-600"}`}>{j.status}</span></td>
                <td className="px-4 py-3"><button onClick={()=>{setEditItem(j);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs underline">Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <JEModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}