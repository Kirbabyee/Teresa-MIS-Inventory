import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { AlertTriangle } from "lucide-react";

export default function StockLevels() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { backend.entities.InventoryItem.list().then(d=>{setItems(d);setLoading(false);}); }, []);
  const low = items.filter(i => Number(i.current_stock||0) <= Number(i.reorder_level||0));
  return (
    <div className="p-6 space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-900">Stock Levels</h1><p className="text-sm text-slate-500 mt-1">Real-time Inventory · Reorder Alerts · By Warehouse/Location</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          {low.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"/>
              <div><p className="font-semibold text-amber-800">Low Stock Alert</p><p className="text-sm text-amber-700 mt-0.5">{low.length} item(s) at or below reorder level: {low.map(i=>i.name).join(", ")}</p></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Item","SKU","Category","Current Stock","Reorder Level","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No items. Add items in the Item Masterlist first.</td></tr>:items.map(i=>{
                const cur = Number(i.current_stock||0);
                const lvl = Number(i.reorder_level||0);
                const isLow = cur <= lvl;
                return (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{i.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{i.sku||"—"}</td>
                    <td className="px-4 py-3 text-slate-600">{i.category||"—"}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{cur} {i.unit||""}</td>
                    <td className="px-4 py-3 text-slate-500">{lvl} {i.unit||""}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLow?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>{isLow?"Low Stock":"OK"}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}