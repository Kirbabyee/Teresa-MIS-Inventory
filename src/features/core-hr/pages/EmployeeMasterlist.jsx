import { useState, useEffect } from "react";
import { supabase } from "@/api/backendClient";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmployeeModal from "@/components/EmployeeModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusColors = {
  probationary: "bg-yellow-100 text-yellow-700",
  regular: "bg-green-100 text-green-700",
  contractual: "bg-blue-100 text-blue-700",
  resigned: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

export default function EmployeeMasterlist() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [departmentsById, setDepartmentsById] = useState({});
  const [positionsById, setPositionsById] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const [empResult, deptResult, posResult] = await Promise.all([
        supabase
          .from("employees")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("departments").select("id, name"),
        supabase.from("positions").select("id, title"),
      ]);

      if (empResult.error) throw empResult.error;
      if (deptResult.error) throw deptResult.error;
      if (posResult.error) throw posResult.error;

      setEmployees(empResult.data || []);

      const deptMap = {};
      (deptResult.data || []).forEach((d) => {
        deptMap[d.id] = d.name;
      });
      setDepartmentsById(deptMap);

      const posMap = {};
      (posResult.data || []).forEach((p) => {
        posMap[p.id] = p.title;
      });
      setPositionsById(posMap);
    } catch (error) {
      console.error("Failed to load employees:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", deleteCandidate.id);
      if (error) {
        if (error.code === "23503") {
          alert(
            "Cannot delete this employee because there are related records. Delete related records first."
          );
        } else {
          throw error;
        }
      } else {
        setDeleteCandidate(null);
        load();
      }
    } catch (error) {
      console.error("Delete failed:", error.message);
      alert("Failed to delete employee.");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = employees.filter((e) => {
    const matchSearch =
      !search ||
      `${e.first_name} ${e.last_name} ${e.employee_code}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Employee Masterlist
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Employment Status Tracking
          </p>
        </div>
        <Button
          onClick={() => {
            setEditEmployee(null);
            setShowModal(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" /> Add Employee
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          {[
            "probationary",
            "regular",
            "contractual",
            "resigned",
            "terminated",
          ].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                {[
                  "Code",
                  "Name",
                  "Department",
                  "Position",
                  "Status",
                  "Hire Date",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-12 text-slate-400"
                  >
                    No employees found.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {e.employee_code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {e.first_name} {e.last_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {departmentsById[e.department_id] || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {positionsById[e.position_id] || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          statusColors[e.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {e.hire_date
                        ? new Date(e.hire_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 flex gap-1">
                      <button
                        onClick={() => {
                          setEditEmployee(e);
                          setShowModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteCandidate(e)}
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

      {showModal && (
        <EmployeeModal
          employee={editEmployee}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}

      <AlertDialog open={!!deleteCandidate} onOpenChange={() => setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteCandidate?.first_name} {deleteCandidate?.last_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}