import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function KPIModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ metric_name:"", target_value:"", unit:"", description:"", department_name:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.KPIDefinition.update(item.id, form); else await backend.entities.KPIDefinition.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit KPI":"Add KPI"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Metric Name *</label><Input className="mt-1" value={form.metric_name} onChange={e=>set("metric_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Department</label><Input className="mt-1" value={form.department_name||""} onChange={e=>set("department_name",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Target Value *</label><Input className="mt-1" value={form.target_value} onChange={e=>set("target_value",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Unit</label><Input className="mt-1" placeholder="%, pts, hrs..." value={form.unit||""} onChange={e=>set("unit",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

function EvalModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name:"", evaluator_name:"", period_start:"", period_end:"", total_score:"", feedback:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Evaluation.update(item.id, form); else await backend.entities.Evaluation.create({...form, employee_id:"manual", evaluator_id:"manual"}); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Evaluation":"New Evaluation"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Evaluator</label><Input className="mt-1" value={form.evaluator_name||""} onChange={e=>set("evaluator_name",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Period Start</label><Input className="mt-1" type="date" value={form.period_start||""} onChange={e=>set("period_start",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Period End</label><Input className="mt-1" type="date" value={form.period_end||""} onChange={e=>set("period_end",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Total Score (out of 5)</label><Input className="mt-1" type="number" min="0" max="5" step="0.1" value={form.total_score||""} onChange={e=>set("total_score",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Feedback</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={3} value={form.feedback||""} onChange={e=>set("feedback",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function KPIAppraisals() {
  const [tab, setTab] = useState("kpi");
  const [kpis, setKpis] = useState([]);
  const [evals, setEvals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const [k,e] = await Promise.all([backend.entities.KPIDefinition.list(),backend.entities.Evaluation.list("-created_date",200)]); setKpis(k); setEvals(e); setLoading(false); };
  useEffect(() => { load(); }, []);

  const renderStars = (score) => {
    const n = Math.round(Number(score)||0);
    return <div className="flex gap-0.5">{[1,2,3,4,5].map(i=><Star key={i} className={`w-4 h-4 ${i<=n?"fill-yellow-400 text-yellow-400":"text-slate-200"}`}/>)}</div>;
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">KPI & Appraisals</h1><p className="text-sm text-slate-500 mt-1">KPI Setup & Performance Evaluation Forms</p></div>
        <Button onClick={()=>{setEditItem(null);setModal(tab==="kpi"?"kpi":"eval");}} className="gap-2"><Plus className="w-4 h-4"/> {tab==="kpi"?"Add KPI":"New Evaluation"}</Button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {[["kpi","KPI Definitions"],["evaluations","Evaluations"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===k?"border-blue-600 text-blue-600":"border-transparent text-slate-500 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          {tab==="kpi" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {kpis.length===0?<div className="col-span-3 text-center py-16 text-slate-400">No KPIs defined.</div>:kpis.map(k=>(
                <div key={k.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-slate-900">{k.metric_name}</p>
                    <div className="flex gap-1"><button onClick={()=>{setEditItem(k);setModal("kpi");}} className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.KPIDefinition.delete(k.id);load();}} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4"/></button></div>
                  </div>
                  <p className="text-xs text-slate-500">{k.department_name||"All Departments"}</p>
                  <div className="mt-2 flex items-center gap-2"><span className="text-lg font-bold text-blue-600">{k.target_value}</span>{k.unit&&<span className="text-xs text-slate-500">{k.unit}</span>}</div>
                  {k.description&&<p className="text-xs text-slate-400 mt-1">{k.description}</p>}
                </div>
              ))}
            </div>
          )}
          {tab==="evaluations" && (
            <div className="space-y-3">
              {evals.length===0?<div className="text-center py-16 text-slate-400">No evaluations.</div>:evals.map(e=>(
                <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:shadow-md" onClick={()=>{setEditItem(e);setModal("eval");}}>
                  <div><p className="font-semibold text-slate-900">{e.employee_name||"—"}</p><p className="text-sm text-slate-500">by {e.evaluator_name||"—"} · {e.period_start} – {e.period_end}</p>{e.feedback&&<p className="text-xs text-slate-400 mt-1 line-clamp-1">{e.feedback}</p>}</div>
                  <div className="shrink-0 text-right">{renderStars(e.total_score)}<p className="text-xs text-slate-400 mt-1">{e.total_score||"—"}/5</p></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {modal==="kpi" && <KPIModal item={editItem} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {modal==="eval" && <EvalModal item={editItem} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
    </div>
  );
}