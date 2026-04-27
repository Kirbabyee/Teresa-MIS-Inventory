import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function LogisticsReports() {
  const [deliveries, setDeliveries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([backend.entities.Delivery.list(), backend.entities.Vehicle.list()])
      .then(([d,v])=>{ setDeliveries(d); setVehicles(v); setLoading(false); });
  }, []);
  const byStatus = ["pending","in_transit","delivered","failed","returned"].map(s=>({
    status: s.replace("_"," "), count: deliveries.filter(d=>d.status===s).length
  })).filter(s=>s.count>0);
  const onTime = deliveries.filter(d=>d.status==="delivered").length;
  const active = vehicles.filter(v=>v.status==="active").length;
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Logistics Reports</h1><p className="text-sm text-slate-500 mt-1">Delivery Performance · Fleet Utilization · Cost Analysis</p></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[["Total Deliveries",deliveries.length],["Completed",onTime],["Active Vehicles",active]].map(([l,v])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold text-slate-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          {byStatus.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Deliveries by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byStatus}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="status" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#f97316" radius={[4,4,0,0]} name="Count"/></BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}