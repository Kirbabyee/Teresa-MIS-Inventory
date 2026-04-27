import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, X, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { draft:"bg-gray-100 text-gray-600", processing:"bg-yellow-100 text-yellow-700", finalized:"bg-blue-100 text-blue-700", paid:"bg-green-100 text-green-700" };

function PeriodModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", start_date:"", end_date:"", pay_date:"", processing_status:"draft", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.PayrollPeriod.update(item.id, form); else await backend.entities.PayrollPeriod.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Period":"New Payroll Period"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Period Name</label><Input className="mt-1" placeholder="e.g. May 1-15 2026" value={form.name||""} onChange={e=>set("name",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Start Date *</label><Input className="mt-1" type="date" value={form.start_date} onChange={e=>set("start_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">End Date *</label><Input className="mt-1" type="date" value={form.end_date} onChange={e=>set("end_date",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Pay Date</label><Input className="mt-1" type="date" value={form.pay_date||""} onChange={e=>set("pay_date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.processing_status} onChange={e=>set("processing_status",e.target.value)}>
              {["draft","processing","finalized","paid"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function PayrollProcessing() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const d = await backend.entities.PayrollPeriod.list("-start_date",50); setPeriods(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Payroll Processing</h1><p className="text-sm text-slate-500 mt-1">OT Comp · SSS · PhilHealth · Pag-IBIG · Tax · Loan Deductions</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Period</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[["Active Periods", periods.filter(p=>p.processing_status!=="paid").length,"bg-blue-50 text-blue-700"],["Finalized",periods.filter(p=>p.processing_status==="finalized").length,"bg-purple-50 text-purple-700"],["Paid",periods.filter(p=>p.processing_status==="paid").length,"bg-green-50 text-green-700"]].map(([l,v,c])=>(
          <div key={l} className={`rounded-xl p-4 ${c} flex items-center justify-between`}><span className="font-medium text-sm">{l}</span><span className="text-2xl font-bold">{v}</span></div>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Period","Start","End","Pay Date","Total Gross","Total Net","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{periods.length===0?<tr><td colSpan={8} className="text-center py-12 text-slate-400">No payroll periods.</td></tr>:periods.map(p=>(
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{p.name||`${p.start_date} - ${p.end_date}`}</td>
                <td className="px-4 py-3 text-slate-600">{p.start_date}</td>
                <td className="px-4 py-3 text-slate-600">{p.end_date}</td>
                <td className="px-4 py-3 text-slate-600">{p.pay_date||"—"}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{p.total_gross?`₱${Number(p.total_gross).toLocaleString()}`:"—"}</td>
                <td className="px-4 py-3 font-semibold text-green-700">{p.total_net?`₱${Number(p.total_net).toLocaleString()}`:"—"}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.processing_status]}`}>{p.processing_status}</span></td>
                <td className="px-4 py-3"><button onClick={()=>{setEditItem(p);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
        <div className="flex items-start gap-3"><Calculator className="w-5 h-5 text-blue-600 mt-0.5 shrink-0"/><div><p className="font-semibold text-blue-900">Automatic Deduction Computation</p><p className="text-sm text-blue-700 mt-1">SSS, PhilHealth, and Pag-IBIG contributions are computed per government contribution tables. Withholding tax uses TRAIN Law schedules. Overtime compensation applies 125% (regular) or 130% (rest day) multipliers. Loan deductions are deducted per period as configured.</p></div></div>
      </div>
      {showModal && <PeriodModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}