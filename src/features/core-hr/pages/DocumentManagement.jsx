import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";
import { Plus, Trash2, X, Download, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DOC_TYPES = ["Resume","Contract","NBI Clearance","Medical Certificate","SSS","PhilHealth","Pag-IBIG","TIN","Birth Certificate","Diploma","Transcript","Other"];

function UploadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ employee_name: "", document_type: "Resume", notes: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!file) return alert("Please select a file.");
    setSaving(true);
    const { file_url } = await backend.integrations.Core.UploadFile({ file });
    await backend.entities.EmployeeDocument.create({ ...form, employee_id: "manual", file_url, file_name: file.name });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Employee Name</label><Input className="mt-1" value={form.employee_name} onChange={e => set("employee_name", e.target.value)}/></div>
          <div><label className="text-xs font-medium text-slate-600">Document Type</label>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.document_type} onChange={e => set("document_type", e.target.value)}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-slate-600">File</label><input type="file" className="mt-1 block w-full text-sm text-slate-600" onChange={e => setFile(e.target.files[0])}/></div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Uploading..." : "Upload"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentManagement() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const load = async () => { setLoading(true); const d = await backend.entities.EmployeeDocument.list("-created_date", 500); setDocs(d); setLoading(false); };
  useEffect(() => { load(); }, []);
  const del = async (id) => { if (!confirm("Delete?")) return; await backend.entities.EmployeeDocument.delete(id); load(); };

  const filtered = docs.filter(d => {
    const matchS = !search || (d.employee_name || "").toLowerCase().includes(search.toLowerCase());
    const matchT = typeFilter === "all" || d.document_type === typeFilter;
    return matchS && matchT;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Document Management</h1><p className="text-sm text-slate-500 mt-1">201 File Management</p></div>
        <Button onClick={() => setShowModal(true)} className="gap-2"><Plus className="w-4 h-4"/> Upload Document</Button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><Input className="pl-9" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)}/></div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? <div className="col-span-3 text-center py-16 text-slate-400">No documents found.</div> : filtered.map(d => (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-blue-600"/></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{d.file_name || d.document_type}</p>
                  <p className="text-xs text-slate-500">{d.employee_name} · {d.document_type}</p>
                  {d.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{d.notes}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <a href={d.file_url} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" size="sm" className="w-full gap-1"><Download className="w-3 h-3"/> Download</Button></a>
                <button onClick={() => del(d.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <UploadModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }}/>}
    </div>
  );
}