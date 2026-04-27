import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { pending:"bg-yellow-100 text-yellow-700", accepted:"bg-green-100 text-green-700", declined:"bg-red-100 text-red-700", withdrawn:"bg-gray-100 text-gray-600" };

function OfferModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ applicant_name:"", position_title:"", offered_salary:0, start_date:"", status:"pending", notes:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.JobOffer.update(item.id, form); else await backend.entities.JobOffer.create({...form, applicant_id: form.applicant_id||"manual"}); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Offer":"New Job Offer"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Applicant</label><Input className="mt-1" value={form.applicant_name||""} onChange={e=>set("applicant_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Position</label><Input className="mt-1" value={form.position_title||""} onChange={e=>set("position_title",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Offered Salary (₱)</label><Input className="mt-1" type="number" value={form.offered_salary||""} onChange={e=>set("offered_salary",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Start Date</label><Input className="mt-1" type="date" value={form.start_date||""} onChange={e=>set("start_date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["pending","accepted","declined","withdrawn"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function JobOffers() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.JobOffer.list("-created_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Job Offers</h1><p className="text-sm text-slate-500 mt-1">Job Offer Issuance & Tracking</p></div>
        <Button onClick={() => { setEditItem(null); setShowModal(true); }} className="gap-2"><Plus className="w-4 h-4"/> New Offer</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="space-y-3">
          {items.length===0 ? <div className="text-center py-16 text-slate-400">No job offers.</div> : items.map(o=>(
            <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:shadow-md" onClick={()=>{setEditItem(o);setShowModal(true);}}>
              <div><p className="font-semibold text-slate-900">{o.applicant_name||"—"}</p><p className="text-sm text-slate-500">{o.position_title||"—"} · Start: {o.start_date||"TBD"}</p>{o.notes&&<p className="text-xs text-slate-400 mt-1 line-clamp-1">{o.notes}</p>}</div>
              <div className="flex items-center gap-4 shrink-0"><p className="font-bold text-green-700">₱{(o.offered_salary||0).toLocaleString()}</p><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[o.status]}`}>{o.status}</span></div>
            </div>
          ))}
        </div>
      )}
      {showModal && <OfferModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}