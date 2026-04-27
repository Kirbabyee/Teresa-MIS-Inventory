import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function DeptModal({ dept, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", head_employee_name: "", description: "", ...dept });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => { setSaving(true); if (dept?.id) await backend.entities.Department.update(dept.id, form); else await backend.entities.Department.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{dept ? "Edit Department" : "Add Department"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Name *</label><Input className="mt-1" value={form.name} onChange={e => set("name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Department Head</label><Input className="mt-1" value={form.head_employee_name || ""} onChange={e => set("head_employee_name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.description || ""} onChange={e => set("description", e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>
      </div>
    </div>
  );
}

function PosModal({ pos, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", salary_grade: "", base_salary_min: "", base_salary_max: "", department_name: "", ...pos });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => { setSaving(true); if (pos?.id) await backend.entities.Position.update(pos.id, form); else await backend.entities.Position.create(form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b"><h2 className="text-lg font-semibold">{pos ? "Edit Position" : "Add Position"}</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button></div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Title *</label><Input className="mt-1" value={form.title} onChange={e => set("title", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Salary Grade</label><Input className="mt-1" value={form.salary_grade || ""} onChange={e => set("salary_grade", e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Min Salary</label><Input className="mt-1" type="number" value={form.base_salary_min || ""} onChange={e => set("base_salary_min", Number(e.target.value))}/></div>
            <div><label className="text-xs font-medium text-slate-600">Max Salary</label><Input className="mt-1" type="number" value={form.base_salary_max || ""} onChange={e => set("base_salary_max", Number(e.target.value))}/></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Department</label><Input className="mt-1" value={form.department_name || ""} onChange={e => set("department_name", e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>
      </div>
    </div>
  );
}

export default function OrganizationSetup() {
  const [tab, setTab] = useState("orgchart");
  const [depts, setDepts] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const load = async () => { setLoading(true); const [d, p, e] = await Promise.all([backend.entities.Department.list(), backend.entities.Position.list(), backend.entities.Employee.filter({ status: "regular" })]); setDepts(d); setPositions(p); setEmployees(e); setLoading(false); };
  useEffect(() => { load(); }, []);
  const delDept = async (id) => { if (!confirm("Delete?")) return; await backend.entities.Department.delete(id); load(); };
  const delPos = async (id) => { if (!confirm("Delete?")) return; await backend.entities.Position.delete(id); load(); };
  const initials = (e) => `${e.first_name?.[0]||""}${e.last_name?.[0]||""}`.toUpperCase();
  const grouped = depts.map(d => ({ ...d, members: employees.filter(e => e.department_name === d.name) }));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Organization Setup</h1><p className="text-sm text-slate-500 mt-1">Org Chart, Departments & Position/Salary Grade</p></div>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {[["orgchart","Org Chart"],["departments","Departments"],["positions","Positions & Salary Grades"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===k ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <>
          {tab === "orgchart" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">{d.name[0]}</div>
                    <div><p className="font-semibold text-slate-900 text-sm">{d.name}</p>{d.head_employee_name && <p className="text-xs text-slate-500">Head: {d.head_employee_name}</p>}</div>
                  </div>
                  <div className="space-y-1">{d.members.slice(0,5).map(e => (
                    <div key={e.id} className="flex items-center gap-2"><div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center text-xs font-medium text-slate-600">{initials(e)}</div><span className="text-xs text-slate-700">{e.first_name} {e.last_name}</span></div>
                  ))}{d.members.length > 5 && <p className="text-xs text-slate-400">+{d.members.length-5} more</p>}{d.members.length===0 && <p className="text-xs text-slate-400 italic">No members</p>}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "departments" && (
            <div>
              <div className="flex justify-end mb-4"><Button onClick={() => { setEditItem(null); setModal("dept"); }} className="gap-2"><Plus className="w-4 h-4"/> Add Department</Button></div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Department","Head","Description","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{depts.length===0?<tr><td colSpan={4} className="text-center py-12 text-slate-400">No departments.</td></tr>:depts.map(d=>(
                    <tr key={d.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{d.name}</td><td className="px-4 py-3 text-slate-600">{d.head_employee_name||"—"}</td><td className="px-4 py-3 text-slate-500 max-w-xs truncate">{d.description||"—"}</td>
                      <td className="px-4 py-3 flex gap-1"><button onClick={() => {setEditItem(d);setModal("dept");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={() => delDept(d.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "positions" && (
            <div>
              <div className="flex justify-end mb-4"><Button onClick={() => { setEditItem(null); setModal("pos"); }} className="gap-2"><Plus className="w-4 h-4"/> Add Position</Button></div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr>{["Title","Salary Grade","Min","Max","Department","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{positions.length===0?<tr><td colSpan={6} className="text-center py-12 text-slate-400">No positions.</td></tr>:positions.map(p=>(
                    <tr key={p.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{p.title}</td><td className="px-4 py-3 text-slate-600">{p.salary_grade||"—"}</td><td className="px-4 py-3 text-slate-600">{p.base_salary_min?`₱${Number(p.base_salary_min).toLocaleString()}`:"—"}</td><td className="px-4 py-3 text-slate-600">{p.base_salary_max?`₱${Number(p.base_salary_max).toLocaleString()}`:"—"}</td><td className="px-4 py-3 text-slate-500">{p.department_name||"—"}</td>
                      <td className="px-4 py-3 flex gap-1"><button onClick={() => {setEditItem(p);setModal("pos");}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button><button onClick={() => delPos(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {modal==="dept" && <DeptModal dept={editItem} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }}/>}
      {modal==="pos" && <PosModal pos={editItem} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }}/>}
    </div>
  );
}