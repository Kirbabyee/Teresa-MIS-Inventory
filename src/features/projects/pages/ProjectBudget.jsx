import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function BudgetModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ project_name:"", category:"labor", budgeted_amount:0, actual_amount:0, notes:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    await backend.entities.ProjectBudgetItem.create({ ...form, project_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">Add Budget Line</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Project</label><Input className="mt-1" value={form.project_name} onChange={e=>set("project_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Category</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e=>set("category",e.target.value)}>
              {["labor","materials","equipment","subcontract","overhead","contingency"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Budgeted (₱)</label><Input className="mt-1" type="number" value={form.budgeted_amount} onChange={e=>set("budgeted_amount",Number(e.target.value))}/></div>
            <div><label className="text-xs font-medium text-slate-600">Actual (₱)</label><Input className="mt-1" type="number" value={form.actual_amount} onChange={e=>set("actual_amount",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ProjectBudget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const load = async () => { setLoading(true); const d = await backend.entities.ProjectBudgetItem.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const totalBudgeted = items.reduce((s,i)=>s+Number(i.budgeted_amount||0),0);
  const totalActual = items.reduce((s,i)=>s+Number(i.actual_amount||0),0);
  const variance = totalBudgeted - totalActual;
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Project Budget Tracking</h1><p className="text-sm text-slate-500 mt-1">Budget vs Actual · Variance · Cost Categories</p></div>
        <Button onClick={()=>setShowModal(true)} className="gap-2"><Plus className="w-4 h-4"/> Add Line</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[["Total Budgeted","₱"+totalBudgeted.toLocaleString()],["Total Actual","₱"+totalActual.toLocaleString()],["Variance",(variance>=0?"+ ":"- ")+"₱"+Math.abs(variance).toLocaleString()]].map(([l,v],idx)=>(
          <div key={l} className={`bg-white rounded-xl border p-5 shadow-sm ${idx===2?(variance>=0?"border-green-200":"border-red-200"):"border-slate-200"}`}>
            <p className="text-sm text-slate-500">{l}</p><p className={`text-2xl font-bold mt-1 ${idx===2?(variance>=0?"text-green-700":"text-red-600"):"text-slate-900"}`}>{v}</p>
          </div>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Project","Category","Budgeted","Actual","Variance"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={5} className="text-center py-12 text-slate-400">No budget lines.</td></tr>:items.map(i=>{
              const v = Number(i.budgeted_amount||0)-Number(i.actual_amount||0);
              return (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{i.project_name||"—"}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{i.category}</td>
                  <td className="px-4 py-3">₱{Number(i.budgeted_amount||0).toLocaleString()}</td>
                  <td className="px-4 py-3">₱{Number(i.actual_amount||0).toLocaleString()}</td>
                  <td className={`px-4 py-3 font-semibold ${v>=0?"text-green-700":"text-red-600"}`}>{v>=0?"+":""}{v.toLocaleString()}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {showModal && <BudgetModal onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}