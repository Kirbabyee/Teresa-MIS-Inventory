import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, X, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LogModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name:"", type:"TIME_IN", device_timestamp:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => { setSaving(true); await backend.entities.AttendanceLog.create({ employee_id:"manual", type:form.type, device_timestamp: form.device_timestamp || new Date().toISOString(), calculated_server_time: new Date().toISOString(), is_within_geofence:false, biometric_verified:false, is_offline_sync:false }); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">Manual Log Entry</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee</label><Input className="mt-1" value={form.employee_name} onChange={e=>set("employee_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Log Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set("type",e.target.value)}>
              {["TIME_IN","TIME_OUT","BREAK_START","BREAK_END"].map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Timestamp</label><Input className="mt-1" type="datetime-local" value={form.device_timestamp} onChange={e=>set("device_timestamp",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save Log"}</Button></div>
      </div>
    </div>
  );
}

export default function AttendanceLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [showModal, setShowModal] = useState(false);

  const load = async () => { setLoading(true); const d = await backend.entities.AttendanceLog.list("-device_timestamp",500); setLogs(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = dateFilter ? logs.filter(l => l.device_timestamp?.startsWith(dateFilter)) : logs;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Attendance Logs</h1><p className="text-sm text-slate-500 mt-1">Time Log Upload, Late/Undertime Monitoring</p></div>
        <Button onClick={() => setShowModal(true)} className="gap-2"><Plus className="w-4 h-4"/> Manual Entry</Button>
      </div>
      <div className="flex gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-slate-600"><label>Date:</label><Input type="date" className="w-44" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div>
        <Button variant="outline" size="sm" onClick={() => setDateFilter("")}>Show All</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>{["Employee","Type","Device Time","Server Time","Geofence","Biometric","Offline","Late?"].map(h=><th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length===0 ? <tr><td colSpan={8} className="text-center py-12 text-slate-400">No logs found.</td></tr> : filtered.map(l=>{
                const dt = l.device_timestamp ? new Date(l.device_timestamp) : null;
                const isLate = dt && l.type==="TIME_IN" && dt.getHours()>=9;
                return (
                  <tr key={l.id} className={`hover:bg-slate-50 ${isLate?"bg-red-50":""}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{l.employee_name||l.employee_id?.slice(0,8)||"—"}</td>
                    <td className="px-3 py-2.5"><span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{l.type}</span></td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{dt?.toLocaleString("en-PH")||"—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{l.calculated_server_time?new Date(l.calculated_server_time).toLocaleTimeString("en-PH"):"—"}</td>
                    <td className="px-3 py-2.5 text-center">{l.is_within_geofence?<span className="text-green-600 text-xs font-medium">✓</span>:<span className="text-red-500 text-xs">✗</span>}</td>
                    <td className="px-3 py-2.5 text-center">{l.biometric_verified?<span className="text-green-600 text-xs font-medium">✓</span>:<span className="text-slate-400 text-xs">—</span>}</td>
                    <td className="px-3 py-2.5 text-center">{l.is_offline_sync?<span className="text-orange-500 text-xs font-medium">Offline</span>:<span className="text-slate-400 text-xs">—</span>}</td>
                    <td className="px-3 py-2.5">{isLate&&<span className="flex items-center gap-1 text-red-600 text-xs font-medium"><AlertTriangle className="w-3 h-3"/>Late</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showModal && <LogModal onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}