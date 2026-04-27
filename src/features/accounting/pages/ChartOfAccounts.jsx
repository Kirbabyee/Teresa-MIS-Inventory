import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const typeColors = { asset:"bg-blue-100 text-blue-700", liability:"bg-red-100 text-red-700", equity:"bg-purple-100 text-purple-700", revenue:"bg-green-100 text-green-700", expense:"bg-orange-100 text-orange-700" };

function AccountModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ account_code:"", name:"", type:"asset", parent_account:"", description:"", is_active:true, ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Account.update(item.id, form);
    else await backend.entities.Account.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Account":"Add Account"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Account Code *</label><Input className="mt-1" value={form.account_code} onChange={e=>set("account_code",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Type</label>
              <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set("type",e.target.value)}>
                {["asset","liability","equity","revenue","expense"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Account Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Parent Account</label><Input className="mt-1" placeholder="e.g. Current Assets" value={form.parent_account||""} onChange={e=>set("parent_account",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="active" checked={form.is_active!==false} onChange={e=>set("is_active",e.target.checked)} className="rounded"/><label htmlFor="active" className="text-sm text-slate-600">Active</label></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ChartOfAccounts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filter, setFilter] = useState("all");
  const load = async () => { setLoading(true); const d = await backend.entities.Account.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = filter==="all" ? items : items.filter(i=>i.type===filter);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Chart of Accounts</h1><p className="text-sm text-slate-500 mt-1">Account Codes · Types · Parent-Child · Activation</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Account</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {["all","asset","liability","equity","revenue","expense"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter===f?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Code","Account Name","Type","Parent","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No accounts found.</td></tr>:filtered.map(a=>(
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">{a.account_code}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${typeColors[a.type]||"bg-gray-100 text-gray-600"}`}>{a.type}</span></td>
                <td className="px-4 py-3 text-slate-500">{a.parent_account||"—"}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.is_active!==false?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{a.is_active!==false?"Active":"Inactive"}</span></td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={()=>{setEditItem(a);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                  <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Account.delete(a.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <AccountModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}