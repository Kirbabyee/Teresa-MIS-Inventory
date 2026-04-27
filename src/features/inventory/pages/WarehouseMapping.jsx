import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function WarehouseModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", location:"", type:"main", capacity:0, manager_name:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.Warehouse.update(item.id, form);
    else await backend.entities.Warehouse.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item?"Edit Warehouse":"Add Warehouse"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Location/Address</label><Input className="mt-1" value={form.location||""} onChange={e=>set("location",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set("type",e.target.value)}>
              {["main","site","satellite"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Capacity</label><Input className="mt-1" type="number" value={form.capacity||""} onChange={e=>set("capacity",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Manager</label><Input className="mt-1" value={form.manager_name||""} onChange={e=>set("manager_name",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function WarehouseMapping() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.Warehouse.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Warehouse Mapping</h1><p className="text-sm text-slate-500 mt-1">Main · Site · Satellite Warehouses · Bin Locations</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Warehouse</Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.length===0?<div className="col-span-3 text-center py-16 text-slate-400">No warehouses configured.</div>:items.map(w=>(
            <div key={w.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Warehouse className="w-5 h-5 text-blue-600"/></div>
                <div className="flex gap-1">
                  <button onClick={()=>{setEditItem(w);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                  <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Warehouse.delete(w.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 mt-3">{w.name}</h3>
              <p className="text-sm text-slate-500">{w.location||"No location"}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{w.type}</span>
                {w.manager_name && <span className="text-xs text-slate-500">Mgr: {w.manager_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <WarehouseModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}