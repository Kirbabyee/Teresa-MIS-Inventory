import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SalesReports() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { backend.entities.SalesOrder.list("-order_date",500).then(d=>{setOrders(d);setLoading(false);}); }, []);
  const totalRevenue = orders.filter(o=>["confirmed","invoiced","paid"].includes(o.status)).reduce((s,o)=>s+Number(o.total_amount||0),0);
  const paid = orders.filter(o=>o.status==="paid").reduce((s,o)=>s+Number(o.total_amount||0),0);
  const pending = orders.filter(o=>["confirmed","invoiced"].includes(o.status)).length;
  const monthly = Object.values(orders.reduce((acc,o)=>{
    if(!o.order_date) return acc;
    const m = o.order_date.substring(0,7);
    if(!acc[m]) acc[m]={month:m,amount:0};
    acc[m].amount += Number(o.total_amount||0);
    return acc;
  },{})).sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Sales Reports</h1><p className="text-sm text-slate-500 mt-1">Revenue Tracking · Billing Status · Client Analytics</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Revenue","₱"+totalRevenue.toLocaleString()],["Collected","₱"+paid.toLocaleString()],["Pending Orders",pending]].map(([l,v])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          {monthly.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Monthly Sales Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>"₱"+Number(v).toLocaleString()}/><Line type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} dot={false} name="Sales"/></LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}