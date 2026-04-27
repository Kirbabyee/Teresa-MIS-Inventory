import { useState, useEffect } from "react";
import { supabase } from "@/api/backendClient";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SalaryModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    employee_id: "",
    basic_pay: "",
    de_minimis_allowance: 0,
    ...item,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id || null,
        basic_pay: Number(form.basic_pay),
        de_minimis_allowance: Number(form.de_minimis_allowance),
      };

      if (item?.id) {
        await supabase
          .from("salary_profiles")
          .update(payload)
          .eq("id", item.id);
      } else {
        await supabase.from("salary_profiles").insert([payload]);
      }
      onSaved();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">
            {item ? "Edit Salary" : "Add Salary Profile"}
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">
              Employee ID (UUID) *
            </label>
            <Input
              className="mt-1"
              value={form.employee_id || ""}
              onChange={(e) => set("employee_id", e.target.value)}
              placeholder="Enter Employee ID"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Basic Pay (₱) *
            </label>
            <Input
              className="mt-1"
              type="number"
              value={form.basic_pay || ""}
              onChange={(e) => set("basic_pay", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              De Minimis Allowance (₱)
            </label>
            <Input
              className="mt-1"
              type="number"
              value={form.de_minimis_allowance || 0}
              onChange={(e) =>
                set("de_minimis_allowance", Number(e.target.value))
              }
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.employee_id}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AllowanceModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    employee_id: "",
    allowance_name: "",
    amount: "",
    frequency: "monthly",
    is_taxable: false,
    ...item,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id || null,
        allowance_name: form.allowance_name,
        amount: Number(form.amount),
        frequency: form.frequency,
        is_taxable: form.is_taxable,
      };

      if (item?.id) {
        await supabase
          .from("employee_allowances")
          .update(payload)
          .eq("id", item.id);
      } else {
        await supabase.from("employee_allowances").insert([payload]);
      }
      onSaved();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">
            {item ? "Edit Allowance" : "Add Allowance"}
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">
              Employee ID (UUID) *
            </label>
            <Input
              className="mt-1"
              value={form.employee_id || ""}
              onChange={(e) => set("employee_id", e.target.value)}
              placeholder="Enter Employee ID"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Allowance Name *
            </label>
            <Input
              className="mt-1"
              placeholder="Meal, Rice, Transportation..."
              value={form.allowance_name || ""}
              onChange={(e) => set("allowance_name", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Amount (₱) *
            </label>
            <Input
              className="mt-1"
              type="number"
              value={form.amount || ""}
              onChange={(e) => set("amount", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Frequency
            </label>
            <select
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value)}
            >
              {["daily", "weekly", "semi_monthly", "monthly"].map((f) => (
                <option key={f} value={f}>
                  {f.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_taxable || false}
              onChange={(e) => set("is_taxable", e.target.checked)}
            />
            <span className="text-sm">Taxable</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.employee_id || !form.allowance_name}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SalaryAndAllowances() {
  const [tab, setTab] = useState("salary");
  const [salaries, setSalaries] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        supabase
          .from("salary_profiles")
          .select("*, employees(first_name, last_name)"),
        supabase
          .from("employee_allowances")
          .select("*, employees(first_name, last_name)"),
      ]);
      setSalaries(sRes.data || []);
      setAllowances(aRes.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Salary & Allowances
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Salary Structure Setup, Allowances & Incentives
          </p>
        </div>
        <Button
          onClick={() => {
            setEditItem(null);
            setModal(tab === "salary" ? "salary" : "allowance");
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />{" "}
          {tab === "salary" ? "Add Salary Profile" : "Add Allowance"}
        </Button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {[
          ["salary", "Salary Profiles"],
          ["allowances", "Allowances & Incentives"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === "salary" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {["Employee", "Basic Pay", "De Minimis", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salaries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-12 text-slate-400"
                      >
                        No salary profiles.
                      </td>
                    </tr>
                  ) : (
                    salaries.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {s.employees ? (
                            `${s.employees.first_name} ${s.employees.last_name}`
                          ) : (
                            <span className="text-slate-400">
                              ID: {s.employee_id?.slice(0, 8)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-green-700">
                          ₱{Number(s.basic_pay || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          ₱
                          {Number(s.de_minimis_allowance || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          <button
                            onClick={() => {
                              setEditItem(s);
                              setModal("salary");
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete?")) return;
                              await supabase
                                .from("salary_profiles")
                                .delete()
                                .eq("id", s.id);
                              load();
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {tab === "allowances" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {[
                      "Employee",
                      "Allowance",
                      "Amount",
                      "Frequency",
                      "Taxable",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allowances.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-12 text-slate-400"
                      >
                        No allowances.
                      </td>
                    </tr>
                  ) : (
                    allowances.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {a.employees ? (
                            `${a.employees.first_name} ${a.employees.last_name}`
                          ) : (
                            <span className="text-slate-400">
                              ID: {a.employee_id?.slice(0, 8)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {a.allowance_name}
                        </td>
                        <td className="px-4 py-3 font-semibold text-green-700">
                          ₱{Number(a.amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600 capitalize">
                          {(a.frequency || "").replace("_", " ")}
                        </td>
                        <td className="px-4 py-3">
                          {a.is_taxable ? (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                              Taxable
                            </span>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                              Non-taxable
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          <button
                            onClick={() => {
                              setEditItem(a);
                              setModal("allowance");
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete?")) return;
                              await supabase
                                .from("employee_allowances")
                                .delete()
                                .eq("id", a.id);
                              load();
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {modal === "salary" && (
        <SalaryModal
          item={editItem}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "allowance" && (
        <AllowanceModal
          item={editItem}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
