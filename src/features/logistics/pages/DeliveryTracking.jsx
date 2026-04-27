import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, X, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusColors = { pending:"bg-yellow-100 text-yellow-700", in_transit:"bg-blue-100 text-blue-700", delivered:"bg-green-100 text-green-700", failed:"bg-red-100 text-red-700", returned:"bg-purple-100 text-purple-700" };

function DeliveryModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ reference_number:"", origin:"", destination:"", scheduled_date:"", status:"pending", driver_name:"", vehicle_plate:"", notes:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Delivery.update(item.id, form);
    else await backend.entities.Delivery.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Delivery":"New Delivery"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Reference #</label><Input className="mt-1" value={form.reference_number||""} onChange={e=>set("reference_number",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Origin</label><Input className="mt-1" value={form.origin||""} onChange={e=>set("origin",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Destination *</label><Input className="mt-1" value={form.destination||""} onChange={e=>set("destination",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Scheduled Date</label><Input className="mt-1" type="date" value={form.scheduled_date||""} onChange={e=>set("scheduled_date",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["pending","in_transit","delivered","failed","returned"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Driver</label><Input className="mt-1" value={form.driver_name||""} onChange={e=>set("driver_name",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Vehicle Plate</label><Input className="mt-1" value={form.vehicle_plate||""} onChange={e=>set("vehicle_plate",e.target.value)}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function DeliveryTracking() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Delivery.list("-scheduled_date",200); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Delivery Tracking</h1><p className="text-sm text-slate-500 mt-1">Outbound Logistics · Driver Assignment · Status Tracking · POD</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> New Delivery</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="space-y-3">
          {items.length===0?<div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">No deliveries recorded.</div>:items.map(d=>(
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-md" onClick={()=>{setEditItem(d);setShowModal(true);}}>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0"><Truck className="w-5 h-5 text-orange-600"/></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{d.reference_number||"No Ref"} — {d.destination}</p>
                <p className="text-sm text-slate-500">{d.origin||"—"} → {d.destination} · {d.scheduled_date}</p>
                {d.driver_name && <p className="text-xs text-slate-400">Driver: {d.driver_name} {d.vehicle_plate?`(${d.vehicle_plate})`:""}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${statusColors[d.status]||"bg-gray-100 text-gray-600"}`}>{d.status?.replace("_"," ")}</span>
            </div>
          ))}
        </div>
      )}
      {showModal && <DeliveryModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}