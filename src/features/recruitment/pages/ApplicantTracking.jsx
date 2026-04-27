import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STAGES = ["applied","screening","interview","offer","hired","rejected"];
const stageColors = { applied:"bg-slate-100 text-slate-700", screening:"bg-yellow-100 text-yellow-700", interview:"bg-blue-100 text-blue-700", offer:"bg-purple-100 text-purple-700", hired:"bg-green-100 text-green-700", rejected:"bg-red-100 text-red-700" };

function ApplicantModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name:"", last_name:"", email:"", phone:"", job_posting_title:"", status:"applied", source:"", notes:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Applicant.update(item.id, form); else await backend.entities.Applicant.create({...form, job_posting_id: form.job_posting_id||"manual"}); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Applicant":"Add Applicant"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">First Name *</label><Input className="mt-1" value={form.first_name} onChange={e=>set("first_name",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Last Name *</label><Input className="mt-1" value={form.last_name} onChange={e=>set("last_name",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Email</label><Input className="mt-1" type="email" value={form.email||""} onChange={e=>set("email",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Phone</label><Input className="mt-1" value={form.phone||""} onChange={e=>set("phone",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Applying For</label><Input className="mt-1" value={form.job_posting_title||""} onChange={e=>set("job_posting_title",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Source</label><Input className="mt-1" placeholder="Referral, LinkedIn, Indeed..." value={form.source||""} onChange={e=>set("source",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Stage</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {STAGES.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={3} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ApplicantTracking() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const d = await backend.entities.Applicant.list("-created_date",500); setApplicants(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const grouped = STAGES.reduce((acc, s) => ({ ...acc, [s]: applicants.filter(a => a.status===s) }), {});
  const advance = async (a) => {
    const idx = STAGES.indexOf(a.status);
    if (idx < STAGES.length-2) { await backend.entities.Applicant.update(a.id, { status: STAGES[idx+1] }); load(); }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Applicant Tracking</h1><p className="text-sm text-slate-500 mt-1">Interview Monitoring & Hiring Approval Workflow</p></div>
        <Button onClick={() => { setEditItem(null); setShowModal(true); }} className="gap-2"><Plus className="w-4 h-4"/> Add Applicant</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => (
            <div key={stage} className="min-w-56 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${stageColors[stage]}`}>{stage}</span>
                <span className="text-xs text-slate-400">{grouped[stage].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[stage].map(a => (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm cursor-pointer hover:shadow-md" onClick={() => {setEditItem(a);setShowModal(true);}}>
                    <p className="font-medium text-slate-900 text-sm">{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.job_posting_title||"—"}</p>
                    {a.source && <p className="text-xs text-slate-400">{a.source}</p>}
                    {stage !== "hired" && stage !== "rejected" && (
                      <button onClick={e=>{e.stopPropagation();advance(a);}} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline">Advance <ChevronRight className="w-3 h-3"/></button>
                    )}
                  </div>
                ))}
                {grouped[stage].length===0 && <div className="bg-slate-50 rounded-lg p-3 text-center text-xs text-slate-400">Empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <ApplicantModal item={editItem} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }}/>}
    </div>
  );
}