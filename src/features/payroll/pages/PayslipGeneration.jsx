import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X, Search, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function PayslipModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name:"", period_name:"", department_name:"", gross_pay:0, overtime_pay:0, allowances:0, sss_deduction:0, philhealth_deduction:0, pagibig_deduction:0, tax_deduction:0, loan_deductions:0, net_pay:0, ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>{const nf={...f,[k]:v}; nf.total_deductions=(Number(nf.sss_deduction)||0)+(Number(nf.philhealth_deduction)||0)+(Number(nf.pagibig_deduction)||0)+(Number(nf.tax_deduction)||0)+(Number(nf.loan_deductions)||0); nf.net_pay=(Number(nf.gross_pay)||0)+(Number(nf.overtime_pay)||0)+(Number(nf.allowances)||0)-nf.total_deductions; return nf; });
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Payslip.update(item.id, form); else await backend.entities.Payslip.create({...form, employee_id:"manual", period_id:"manual"}); onSaved(); };
  const numField = (k, label) => (<div><label className="text-xs font-medium text-slate-600">{label}</label><Input className="mt-1" type="number" value={form[k]||""} onChange={e=>set(k,Number(e.target.value))}/></div>);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Payslip":"New Payslip"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Department</label><Input className="mt-1" value={form.department_name||""} onChange={e=>set("department_name",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Period</label><Input className="mt-1" value={form.period_name||""} onChange={e=>set("period_name",e.target.value)}/></div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Earnings</p>
          <div className="grid grid-cols-3 gap-3">{numField("gross_pay","Basic Pay (₱)")}{numField("overtime_pay","Overtime Pay (₱)")}{numField("allowances","Allowances (₱)")}</div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Deductions</p>
          <div className="grid grid-cols-3 gap-3">{numField("sss_deduction","SSS (₱)")}{numField("philhealth_deduction","PhilHealth (₱)")}{numField("pagibig_deduction","Pag-IBIG (₱)")}</div>
          <div className="grid grid-cols-2 gap-3">{numField("tax_deduction","Withholding Tax (₱)")}{numField("loan_deductions","Loan Deductions (₱)")}</div>
          <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between"><span className="font-semibold text-slate-700">Net Pay</span><span className="text-xl font-bold text-green-700">₱{Number(form.net_pay||0).toLocaleString()}</span></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function PayslipGeneration() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Payslip.list("-created_date",500); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = items.filter(i => !search || (i.employee_name||"").toLowerCase().includes(search.toLowerCase()) || (i.period_name||"").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Payslip Generation</h1><p className="text-sm text-slate-500 mt-1">Generate & View Employee Payslips</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Payslip</Button>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><Input className="pl-9" placeholder="Search employee or period..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Employee","Department","Period","Gross","Deductions","Net Pay","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No payslips found.</td></tr>:filtered.map(p=>(
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{p.employee_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.department_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.period_name||"—"}</td>
                <td className="px-4 py-3 text-slate-700">₱{Number(p.gross_pay||0).toLocaleString()}</td>
                <td className="px-4 py-3 text-red-600">₱{Number(p.total_deductions||0).toLocaleString()}</td>
                <td className="px-4 py-3 font-bold text-green-700">₱{Number(p.net_pay||0).toLocaleString()}</td>
                <td className="px-4 py-3 flex gap-1"><button onClick={()=>{setEditItem(p);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs">Edit</button><button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Printer className="w-4 h-4"/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <PayslipModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}