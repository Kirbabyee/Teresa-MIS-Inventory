import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X, Check, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";

const statusColors = { pending:"bg-yellow-100 text-yellow-700", approved:"bg-green-100 text-green-700", rejected:"bg-red-100 text-red-700" };

function LeaveModal({ item, onClose, onSaved, canCreate }) {
  const [form, setForm] = useState({ employee_name:"", leave_type:"vacation", start_date:"", end_date:"", total_days:1, reason:"", status:"pending", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!item?.id && !canCreate) {
      alert("Super admin can only review/respond to leave requests.");
      return;
    }
    setSaving(true);
    if (item?.id) await backend.entities.LeaveRequest.update(item.id, form);
    else await backend.entities.LeaveRequest.create({ ...form, employee_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Leave":"File Leave"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Leave Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.leave_type} onChange={e=>set("leave_type",e.target.value)}>
              {["vacation","sick","emergency","maternity","paternity","bereavement"].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Start Date</label><Input className="mt-1" type="date" value={form.start_date} onChange={e=>set("start_date",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">End Date</label><Input className="mt-1" type="date" value={form.end_date} onChange={e=>set("end_date",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Total Days</label><Input className="mt-1" type="number" value={form.total_days||1} onChange={e=>set("total_days",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Reason</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.reason||""} onChange={e=>set("reason",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["pending","approved","rejected"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

function OTModal({ item, onClose, onSaved, canCreate }) {
  const [form, setForm] = useState({ employee_name:"", date:"", requested_hours:1, reason:"", status:"pending", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!item?.id && !canCreate) {
      alert("Super admin can only review/respond to overtime requests.");
      return;
    }
    setSaving(true);
    if (item?.id) await backend.entities.OvertimeRequest.update(item.id, form);
    else await backend.entities.OvertimeRequest.create({ ...form, employee_id:"manual" });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit OT":"File Overtime"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name||""} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Date</label><Input className="mt-1" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Requested Hours</label><Input className="mt-1" type="number" step="0.5" value={form.requested_hours} onChange={e=>set("requested_hours",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Reason</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.reason||""} onChange={e=>set("reason",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["pending","approved","rejected"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function LeaveAndOvertime() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";

  const [tab, setTab] = useState("leave");
  const [leaves, setLeaves] = useState([]);
  const [ot, setOt] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => { setLoading(true); const [l,o] = await Promise.all([backend.entities.LeaveRequest.list("-created_date",300), backend.entities.OvertimeRequest.list("-created_date",300)]); setLeaves(l); setOt(o); setLoading(false); };
  useEffect(() => { load(); }, []);

  const approveLeave = async (id) => { await backend.entities.LeaveRequest.update(id,{status:"approved"}); load(); };
  const rejectLeave = async (id) => { await backend.entities.LeaveRequest.update(id,{status:"rejected"}); load(); };
  const approveOT = async (id) => { await backend.entities.OvertimeRequest.update(id,{status:"approved"}); load(); };
  const rejectOT = async (id) => { await backend.entities.OvertimeRequest.update(id,{status:"rejected"}); load(); };

  const filteredLeaves = statusFilter==="all" ? leaves : leaves.filter(l=>l.status===statusFilter);
  const filteredOT = statusFilter==="all" ? ot : ot.filter(o=>o.status===statusFilter);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Leave & Overtime</h1><p className="text-sm text-slate-500 mt-1">Filing & Approval Workflows</p></div>
        {!isSuperAdmin && (
          <Button onClick={() => { setEditItem(null); setModal(tab==="leave"?"leave":"ot"); }} className="gap-2"><Plus className="w-4 h-4"/> {tab==="leave"?"File Leave":"File OT"}</Button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2 border-b border-slate-200">
          {[["leave","Leave Requests"],["overtime","Overtime Requests"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===k?"border-blue-600 text-blue-600":"border-transparent text-slate-500 hover:text-slate-900"}`}>{l}</button>
          ))}
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          {["pending","approved","rejected"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {tab==="leave" ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr>{["Employee","Type","Start","End","Days","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredLeaves.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No leave requests.</td></tr>:filteredLeaves.map(l=>(
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{l.employee_name||l.employee_id?.slice(0,8)||"—"}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{l.leave_type}</td>
                  <td className="px-4 py-3 text-slate-600">{l.start_date}</td>
                  <td className="px-4 py-3 text-slate-600">{l.end_date}</td>
                  <td className="px-4 py-3 text-center font-medium">{l.total_days||"—"}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[l.status]}`}>{l.status}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    {l.status==="pending"&&<><button onClick={()=>approveLeave(l.id)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><Check className="w-4 h-4"/></button><button onClick={()=>rejectLeave(l.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Reject"><XCircle className="w-4 h-4"/></button></>}
                    <button onClick={()=>{setEditItem(l);setModal("leave");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs">Edit</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr>{["Employee","Date","Hours","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredOT.length===0?<tr><td colSpan={5} className="text-center py-12 text-slate-400">No overtime requests.</td></tr>:filteredOT.map(o=>(
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{o.employee_name||o.employee_id?.slice(0,8)||"—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.date}</td>
                  <td className="px-4 py-3 text-center font-medium">{o.requested_hours}h</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[o.status]}`}>{o.status}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    {o.status==="pending"&&<><button onClick={()=>approveOT(o.id)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><Check className="w-4 h-4"/></button><button onClick={()=>rejectOT(o.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Reject"><XCircle className="w-4 h-4"/></button></>}
                    <button onClick={()=>{setEditItem(o);setModal("ot");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs">Edit</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      {modal==="leave" && <LeaveModal item={editItem} canCreate={!isSuperAdmin} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {modal==="ot" && <OTModal item={editItem} canCreate={!isSuperAdmin} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
    </div>
  );
}