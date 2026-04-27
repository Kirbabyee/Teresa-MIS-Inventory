import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X, Bell, MessageSquare, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const priorityColors = { low: "bg-gray-100 text-gray-600", normal: "bg-blue-100 text-blue-700", high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700" };
const taskStatusColors = { pending: "bg-yellow-100 text-yellow-700", in_progress: "bg-blue-100 text-blue-700", completed: "bg-green-100 text-green-700", cancelled: "bg-gray-100 text-gray-500" };

function AnnouncementModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", content: "", target_department_name: "", priority: "normal", is_pinned: false, ...item });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.Announcement.update(item.id, form); else await backend.entities.Announcement.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item ? "Edit Announcement" : "New Announcement"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Title *</label><Input className="mt-1" value={form.title} onChange={e => set("title", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Content *</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={4} value={form.content} onChange={e => set("content", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Target Department</label><Input className="mt-1" placeholder="Leave blank for all" value={form.target_department_name||""} onChange={e => set("target_department_name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Priority</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={e => set("priority", e.target.value)}>
              {["low","normal","high","urgent"].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_pinned||false} onChange={e => set("is_pinned", e.target.checked)}/><span className="text-sm">Pin announcement</span></label>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

function TaskModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", description: "", employee_name: "", assigned_by_name: "", status: "pending", priority: "medium", due_date: "", ...item });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => { setSaving(true); if (item?.id) await backend.entities.EmployeeTask.update(item.id, form); else await backend.entities.EmployeeTask.create({ ...form, employee_id: "manual" }); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{item ? "Edit Task" : "New Task"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Task Title *</label><Input className="mt-1" value={form.title} onChange={e => set("title", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Assigned To</label><Input className="mt-1" value={form.employee_name||""} onChange={e => set("employee_name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Assigned By</label><Input className="mt-1" value={form.assigned_by_name||""} onChange={e => set("assigned_by_name", e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => set("status", e.target.value)}>
                {["pending","in_progress","completed","cancelled"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-slate-600">Priority</label>
              <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={e => set("priority", e.target.value)}>
                {["low","medium","high"].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Due Date</label><Input className="mt-1" type="date" value={form.due_date||""} onChange={e => set("due_date", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description||""} onChange={e => set("description", e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?"Saving...":"Save"}</Button></div>
      </div>
    </div>
  );
}

export default function InternalComms() {
  const [tab, setTab] = useState("announcements");
  const [announcements, setAnnouncements] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const [a, t] = await Promise.all([backend.entities.Announcement.list("-created_date",100), backend.entities.EmployeeTask.list("-created_date",200)]); setAnnouncements(a); setTasks(t); setLoading(false); };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Internal Communications</h1><p className="text-sm text-slate-500 mt-1">Announcements, Tasks & Push Notifications</p></div>
        <Button onClick={() => { setEditItem(null); setModal(tab === "tasks" ? "task" : "announcement"); }} className="gap-2"><Plus className="w-4 h-4"/> {tab === "tasks" ? "New Task" : "New Announcement"}</Button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {[["announcements","Announcements",MessageSquare],["tasks","Employee Tasks",CheckSquare],["notifications","Push Notifications",Bell]].map(([k,l,Icon])=>(
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===k?"border-blue-600 text-blue-600":"border-transparent text-slate-500 hover:text-slate-900"}`}><Icon className="w-4 h-4"/>{l}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          {tab === "announcements" && (
            <div className="space-y-3">
              {announcements.length===0 ? <div className="text-center py-16 text-slate-400">No announcements.</div> : announcements.map(a => (
                <div key={a.id} className={`bg-white rounded-xl border p-4 shadow-sm ${a.is_pinned ? "border-blue-300" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">{a.is_pinned && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Pinned</span>}<span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${priorityColors[a.priority]}`}>{a.priority}</span></div>
                      <p className="font-semibold text-slate-900">{a.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{a.content}</p>
                      {a.target_department_name && <p className="text-xs text-slate-400 mt-1">→ {a.target_department_name}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => {setEditItem(a);setModal("announcement");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                      <button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.Announcement.delete(a.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "tasks" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Title","Assigned To","Priority","Status","Due Date","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{tasks.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No tasks.</td></tr>:tasks.map(t=>(
                  <tr key={t.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{t.title}</td><td className="px-4 py-3 text-slate-600">{t.employee_name||"—"}</td>
                    <td className="px-4 py-3"><span className="text-xs font-medium capitalize">{t.priority}</span></td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${taskStatusColors[t.status]}`}>{t.status?.replace("_"," ")}</span></td>
                    <td className="px-4 py-3 text-slate-500">{t.due_date||"—"}</td>
                    <td className="px-4 py-3 flex gap-1"><button onClick={()=>{setEditItem(t);setModal("task");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={async()=>{if(!confirm("Delete?"))return;await backend.entities.EmployeeTask.delete(t.id);load();}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {tab === "notifications" && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
              <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
              <h3 className="font-semibold text-slate-700">Push Notifications Config</h3>
              <p className="text-sm text-slate-500 mt-1">Configure FCM device tokens and notification settings per employee. Employees with an <code className="bg-slate-100 px-1 rounded">fcm_device_token</code> on their record will receive push notifications automatically.</p>
            </div>
          )}
        </>
      )}
      {modal==="announcement" && <AnnouncementModal item={editItem} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {modal==="task" && <TaskModal item={editItem} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
    </div>
  );
}