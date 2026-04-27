import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"", sku:"", category:"", unit:"", reorder_level:0, unit_cost:0, description:"", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true);
    if (item?.id) await backend.entities.InventoryItem.update(item.id, form);
    else await backend.entities.InventoryItem.create(form);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white"><h2 className="text-lg font-semibold">{item?"Edit Item":"Add Item"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Item Name *</label><Input className="mt-1" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">SKU/Code</label><Input className="mt-1" value={form.sku||""} onChange={e=>set("sku",e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Category</label><Input className="mt-1" value={form.category||""} onChange={e=>set("category",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Unit of Measure</label><Input className="mt-1" placeholder="pcs, kg, L…" value={form.unit||""} onChange={e=>set("unit",e.target.value)}/></div>
            <div><label className="text-xs font-medium text-slate-600">Unit Cost (₱)</label><Input className="mt-1" type="number" value={form.unit_cost||""} onChange={e=>set("unit_cost",Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Reorder Level</label><Input className="mt-1" type="number" value={form.reorder_level||""} onChange={e=>set("reorder_level",Number(e.target.value))}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e=>set("description",e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function ItemMasterlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const load = async () => { setLoading(true); const d = await backend.entities.InventoryItem.list(); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = items.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Item Masterlist</h1><p className="text-sm text-slate-500 mt-1">SKU Management · UOM · Reorder Levels · Valuation</p></div>
        <Button onClick={()=>{setEditItem(null);setShowModal(true);}} className="gap-2"><Plus className="w-4 h-4"/> Add Item</Button>
      </div>
      <Input placeholder="Search by name or SKU…" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Name","SKU","Category","Unit","Unit Cost","Reorder Lvl","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.length===0?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No items found.</td></tr>:filtered.map(i=>(
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{i.name}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{i.sku||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{i.category||"—"}</td>
                <td className="px-4 py-3 text-slate-600">{i.unit||"—"}</td>
                <td className="px-4 py-3 font-semibold">₱{Number(i.unit_cost||0).toLocaleString()}</td>
                <td className="px-4 py-3 text-center">{i.reorder_level||0}</td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={()=>{setEditItem(i);setShowModal(true);}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                  <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.InventoryItem.delete(i.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showModal && <ItemModal item={editItem} onClose={()=>setShowModal(false)} onSaved={()=>{setShowModal(false);load();}}/>}
    </div>
  );
}