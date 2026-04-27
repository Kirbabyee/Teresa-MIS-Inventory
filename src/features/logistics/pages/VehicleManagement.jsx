import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { active:"bg-green-100 text-green-700", maintenance:"bg-yellow-100 text-yellow-700", retired:"bg-red-100 text-red-700" };

function VehicleModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ plate_number:"", make:"", model:"", year:new Date().getFullYear(), status:"active", driver_name:"", last_maintenance_date:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Vehicle.update(item.id, form);
    else await backend.entities.Vehicle.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Vehicle":"Add Vehicle"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Plate Number *</label><Input className="mt-1" value={form.plate_number} onChange={e=>set("plate_number",e.target.value)}/></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Make</label><Input className="mt-1" value={form.make||""} onChange={e=>set("make",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Model</label><Input className="mt-1" value={form.model||""} onChange={e=>set("model",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Year</label><Input className="mt-1" type="number" value={form.year||""} onChange={e=>set("year",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["active","maintenance","retired"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Assigned Driver</label><Input className="mt-1" value={form.driver_name||""} onChange={e=>set("driver_name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Last Maintenance</label><Input className="mt-1" type="date" value={form.last_maintenance_date||""} onChange={e=>set("last_maintenance_date",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function VehicleManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Vehicle.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Vehicle Management</h1><p className="text-sm text-slate-500 mt-1">Fleet Registry · Driver Assignment · Maintenance Scheduling</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Vehicle</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Plate","Make/Model","Year","Status","Driver","Last Maint.","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No vehicles.</td></tr>:items.map(v=>(
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-900 font-mono">{v.plate_number}</td>
                <td className="px-4 py-3 text-slate-600">{[v.make,v.model].filter(Boolean).join(" ")||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{v.year||"—"}</td>
                <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[v.status]||"bg-gray-100 text-gray-600"}`}>{v.status}</span></td>
                <td className="px-4 py-3 text-slate-600">{v.driver_name||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{v.last_maintenance_date||"—"}</td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={()=>{setEditItem(v);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                  <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Vehicle.delete(v.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <VehicleModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}