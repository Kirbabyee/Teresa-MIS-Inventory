import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function PromotionModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name:"", previous_position_name:"", new_position_name:"", effective_date:"", remarks:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.PromotionHistory.update(item.id, form); else await backend.entities.PromotionHistory.create({...form, employee_id:"manual"}); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Promotion":"Add Promotion Record"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee *</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Previous Position</label><Input className="mt-1" value={form.previous_position_name||""} onChange={e=>set("previous_position_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">New Position *</label><Input className="mt-1" value={form.new_position_name||""} onChange={e=>set("new_position_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Effective Date *</label><Input className="mt-1" type="date" value={form.effective_date} onChange={e=>set("effective_date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Remarks</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.remarks||""} onChange={e=>set("remarks",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function PromotionHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.PromotionHistory.list("-effective_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Promotion History</h1><p className="text-sm text-slate-500 mt-1">Career Progression & Promotion Records</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Record</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="space-y-3">
          {items.length===0 ? <div className="text-center py-16 text-slate-400">No promotion records.</div> : items.map(p=>(
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-md" onClick={()=>{setEditItem(p);setShowModal(true);}}>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-green-600"/></div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{p.employee_name||"—"}</p>
                <p className="text-sm text-slate-500">{p.previous_position_name||"N/A"} → <span className="font-medium text-green-700">{p.new_position_name||"—"}</span></p>
                {p.remarks && <p className="text-xs text-slate-400 mt-1">{p.remarks}</p>}
              </div>
              <p className="text-sm text-slate-500 shrink-0">{p.effective_date}</p>
            </div>
          ))}
        </div>
      )}
      {showModal && <PromotionModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}