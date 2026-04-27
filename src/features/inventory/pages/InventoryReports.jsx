import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function InventoryReports() {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([backend.entities.InventoryItem.list(), backend.entities.StockMovement.list()])
      .then(([i,m])=>{ setItems(i); setMovements(m); setLoading(false); });
  }, []);
  const totalItems = items.length;
  const totalValue = items.reduce((s,i)=>s+Number(i.unit_cost||0)*Number(i.current_stock||0),0);
  const lowStock = items.filter(i=>Number(i.current_stock||0)<=Number(i.reorder_level||0)).length;
  const byCategory = Object.values(items.reduce((acc,i)=>{
    const cat=i.category||"Uncategorized";
    if(!acc[cat]) acc[cat]={category:cat,count:0};
    acc[cat].count++;
    return acc;
  },{}));
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Inventory Reports</h1><p className="text-sm text-slate-500 mt-1">Aging · Turnover · Consumption · Reorder Forecasting</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total SKUs",totalItems],["Inventory Value","₱"+totalValue.toLocaleString()],["Low Stock Items",lowStock]].map(([l,v])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          {byCategory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Items by Category</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byCategory}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="category" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#0ea5e9" radius={[4,4,0,0]} name="Items"/></BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-900">Inventory Valuation by Item</h3></div>
            <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Item","Category","Unit Cost","Stock","Total Value"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{items.length===0?<tr><td colSpan={5} className="text-center py-12 text-slate-400">No items.</td></tr>:[...items].sort((a,b)=>Number(b.unit_cost||0)*Number(b.current_stock||0)-Number(a.unit_cost||0)*Number(a.current_stock||0)).map(i=>(
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{i.name}</td>
                  <td className="px-4 py-3 text-slate-600">{i.category||"—"}</td>
                  <td className="px-4 py-3">₱{Number(i.unit_cost||0).toLocaleString()}</td>
                  <td className="px-4 py-3">{i.current_stock||0} {i.unit||""}</td>
                  <td className="px-4 py-3 font-bold text-blue-700">₱{(Number(i.unit_cost||0)*Number(i.current_stock||0)).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}