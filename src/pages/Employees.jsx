import { useState, useEffect } from "react";
import { supabase } from "@/api/base44Client"; // <-- Clean Supabase import
import { useAuth } from "@/lib/AuthContext";
import { canAccessPage } from "@/lib/pageAccess";
import {
  Plus,
  Search,
  Edit,
  Building2,
  MapPin,
  Briefcase,
  UserCog,
  Mail,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
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
import EmployeeModal from "@/components/EmployeeModal";
import EmployeeAssignmentModal from "@/components/EmployeeAssignmentModal";
const statusColors = {
  pending_invite: "bg-slate-100 text-slate-700",
  regular: "bg-green-100 text-green-700",
  probationary: "bg-yellow-100 text-yellow-700",
  contractual: "bg-blue-100 text-blue-700",
  resigned: "bg-gray-100 text-gray-700",
  terminated: "bg-red-100 text-red-700",
};

const POSITION_LINK_TABLE_CANDIDATES = [
  "employee_positions",
  "employee_position_assignments",
];

export default function Employees() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  const pageAccess = user?.page_access || [];

  const [employees, setEmployees] = useState([]);
  const [departmentsById, setDepartmentsById] = useState({});
  const [projectSitesById, setProjectSitesById] = useState({});
  const [positionsById, setPositionsById] = useState({});
  const [employeePositionMap, setEmployeePositionMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [assignmentAction, setAssignmentAction] = useState(null);
  const [assignmentEmployee, setAssignmentEmployee] = useState(null);
  const [accountToggleCandidate, setAccountToggleCandidate] = useState(null);
  const [togglingAccount, setTogglingAccount] = useState(false);
  const [inviteInfoByEmployee, setInviteInfoByEmployee] = useState({});
  const [resendingInviteId, setResendingInviteId] = useState(null);
  const [supportsAccountActive, setSupportsAccountActive] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError("");

      const [employeesResult, departmentsResult, projectSitesResult, positionsResult, accountActiveProbe] =
        await Promise.all([
          supabase
            .from("employees")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase.from("departments").select("id, name"),
          supabase.from("project_sites").select("id, name, location"),
          supabase.from("positions").select("id, title"),
          supabase.from("employees").select("is_account_active").limit(1),
        ]);

      if (employeesResult.error) throw employeesResult.error;
      if (departmentsResult.error) throw departmentsResult.error;
      if (projectSitesResult.error) throw projectSitesResult.error;
      if (positionsResult.error) throw positionsResult.error;

      const deptMap = (departmentsResult.data || []).reduce((acc, dept) => {
        acc[dept.id] = dept;
        return acc;
      }, {});
      const posMap = (positionsResult.data || []).reduce((acc, pos) => {
        acc[pos.id] = pos;
        return acc;
      }, {});
      const siteMap = (projectSitesResult.data || []).reduce((acc, site) => {
        acc[site.id] = site;
        return acc;
      }, {});

      setEmployees(employeesResult.data || []);
      setDepartmentsById(deptMap);
      setProjectSitesById(siteMap);
      setPositionsById(posMap);
      setSupportsAccountActive(!accountActiveProbe.error);

      const employeeIds = (employeesResult.data || []).map((row) => row.id);
      if (employeeIds.length > 0) {
        const invitesResult = await supabase
          .from("employee_auth_invites")
          .select("employee_id, expires_at, used_at, created_at")
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false });

        if (!invitesResult.error) {
          const inviteMap = (invitesResult.data || []).reduce((acc, row) => {
            const key = String(row.employee_id);
            if (!acc[key]) acc[key] = row;
            return acc;
          }, {});
          setInviteInfoByEmployee(inviteMap);
        } else {
          setInviteInfoByEmployee({});
        }
      } else {
        setInviteInfoByEmployee({});
      }

      let positionLinkTable = null;
      for (const tableName of POSITION_LINK_TABLE_CANDIDATES) {
        const probe = await supabase
          .from(tableName)
          .select("employee_id, position_id")
          .limit(1);
        if (!probe.error) {
          positionLinkTable = tableName;
          break;
        }
      }

      if (positionLinkTable && (employeesResult.data || []).length > 0) {
        const employeeIds = (employeesResult.data || []).map((row) => row.id);
        const assignmentsResult = await supabase
          .from(positionLinkTable)
          .select("employee_id, position_id")
          .in("employee_id", employeeIds);

        if (!assignmentsResult.error) {
          const grouped = (assignmentsResult.data || []).reduce((acc, row) => {
            const employeeId = String(row.employee_id);
            const title = posMap[row.position_id]?.title;
            if (!title) return acc;
            if (!acc[employeeId]) acc[employeeId] = [];
            if (!acc[employeeId].includes(title)) acc[employeeId].push(title);
            return acc;
          }, {});
          setEmployeePositionMap(grouped);
        } else {
          setEmployeePositionMap({});
        }
      } else {
        setEmployeePositionMap({});
      }
    } catch (error) {
      console.error("Error loading employees:", error.message);
      setLoadError(error.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getAccountActiveValue = (emp) => {
    if (!supportsAccountActive) return true;
    return emp?.is_account_active !== false;
  };

  const handleToggleAccountActive = async () => {
    if (!accountToggleCandidate?.id) return;

    if (!supportsAccountActive) {
      alert("Account activation toggle is unavailable because employees.is_account_active column does not exist.");
      return;
    }

    try {
      setTogglingAccount(true);
      const nextValue = !getAccountActiveValue(accountToggleCandidate);
      const { error } = await supabase
        .from("employees")
        .update({ is_account_active: nextValue })
        .eq("id", accountToggleCandidate.id);

      if (error) throw error;
      setAccountToggleCandidate(null);
      await load();
    } catch (error) {
      console.error("Account activation toggle failed:", error.message);
      alert(`Failed to update account activation: ${error.message}`);
    } finally {
      setTogglingAccount(false);
    }
  };

  const openAssignment = (action, employee) => {
    setAssignmentAction(action);
    setAssignmentEmployee(employee);
  };

  const getPositionTitles = (emp) => {
    const multiple = employeePositionMap[String(emp.id)] || [];
    if (multiple.length > 0) return multiple;

    const singleTitle =
      positionsById[emp.position_id]?.title || emp.position_name || null;
    return singleTitle ? [singleTitle] : [];
  };

  const isAccountActivated = (emp) => {
    return Boolean(emp?.auth_id);
  };

  const getDisplayedStatus = (emp) => {
    if (!isAccountActivated(emp)) return "pending_invite";
    return emp.status || "—";
  };

  const getDisplayedStatusLabel = (status) => {
    if (status === "pending_invite") return "Pending Invite";
    return status;
  };

  const canShowResendInvite = (emp) => {
    return !isAccountActivated(emp);
  };

  const filtered = employees.filter((e) => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    const displayedStatus = getDisplayedStatus(e);
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      (e.employee_code || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || displayedStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleResendInvite = async (emp) => {
    if (!emp?.id) return;
    if (!emp.email) {
      alert("Employee has no email. Add an email first before sending invite.");
      return;
    }

    try {
      setResendingInviteId(emp.id);

      const displayName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "Team Member";
      const positionTitles = getPositionTitles(emp);
      const positionLabel = positionTitles.length > 0 ? positionTitles[0] : "";
      const departmentLabel = departmentsById[emp.department_id]?.name || emp.department_name || "";
      const projectSiteLabel = projectSitesById[emp.project_site_id]?.name || emp.project_site_name || "";

      await createEmployeeInviteAndSendEmail({
        employeeId: emp.id,
        email: emp.email,
        toName: displayName,
        role: positionLabel || "Employee",
        positionName: positionLabel,
        departmentName: departmentLabel,
        projectSiteName: projectSiteLabel,
      });

      await load();
      alert("Activation invite sent.");
    } catch (error) {
      console.error("Resend invite failed:", error.message);
      alert(`Failed to send invite: ${error.message}`);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Employee Masterlist
          </h1>
          <p className="text-slate-500 text-sm">
            {employees.length} total employees
          </p>
        </div>
        {canAccessPage(isSuperAdmin, pageAccess, "/employees") && (
          <Button
            onClick={() => {
              setEditEmployee(null);
              setShowModal(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name or code..."
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 bg-white"
        >
          <option value="">All Statuses</option>
          <option value="pending_invite">Pending Invite</option>
          <option value="regular">Regular</option>
          <option value="probationary">Probationary</option>
          <option value="contractual">Contractual</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loadError && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error loading employees: {loadError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>No employees found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    "Code",
                    "Name",
                    "Department",
                    "Project Site",
                    "Position",
                    "Status",
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
                {filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-slate-600 font-medium">
                      {emp.employee_code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs shrink-0">
                          {emp.first_name?.[0]}
                          {emp.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {emp.first_name} {emp.last_name}
                          </p>
                          {/* Note: SQL schema didn't have email in the employee table initially, but we map it if it exists */}
                          {emp.email && (
                            <p className="text-xs text-slate-400">
                              {emp.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {departmentsById[emp.department_id]?.name ||
                        emp.department_name ||
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {projectSitesById[emp.project_site_id]?.name ||
                        emp.project_site_name ||
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getPositionTitles(emp).length > 0 ? (
                        <span className="text-sm text-slate-700">
                          {getPositionTitles(emp).join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const displayedStatus = getDisplayedStatus(emp);
                        return (
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full border ${statusColors[displayedStatus] || "bg-gray-100 text-gray-700 border-gray-200"} ${displayedStatus === "regular" ? "border-green-200" : ""} ${displayedStatus === "probationary" ? "border-yellow-200" : ""} ${displayedStatus === "pending_invite" ? "border-slate-300" : ""}`}
                      >
                        {getDisplayedStatusLabel(displayedStatus)}
                      </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canShowResendInvite(emp) && (
                          <button
                            onClick={() => handleResendInvite(emp)}
                            disabled={!emp.email || resendingInviteId === emp.id}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={emp.email ? "Resend activation invite" : "Add employee email to send invite"}
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openAssignment("position", emp)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Assign Position"
                        >
                          <Briefcase className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openAssignment("department", emp)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Assign Department"
                        >
                          <Building2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openAssignment("projectSite", emp)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Assign Project Site"
                        >
                          <MapPin className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => openAssignment("status", emp)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Assign Employment Status"
                        >
                          <UserCog className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditEmployee(emp);
                            setShowModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit Employee"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setAccountToggleCandidate(emp)}
                          className={`p-1.5 rounded transition-colors ${getAccountActiveValue(emp) ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-green-600 hover:bg-green-50"}`}
                          title={getAccountActiveValue(emp) ? "Deactivate account" : "Activate account"}
                        >
                          {getAccountActiveValue(emp) ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {assignmentAction && assignmentEmployee && (
        <EmployeeAssignmentModal
          employee={assignmentEmployee}
          action={assignmentAction}
          onClose={() => {
            setAssignmentAction(null);
            setAssignmentEmployee(null);
          }}
          onSaved={() => {
            setAssignmentAction(null);
            setAssignmentEmployee(null);
            load();
          }}
        />
      )}

      <AlertDialog
        open={Boolean(accountToggleCandidate)}
        onOpenChange={(open) => {
          if (!open && !togglingAccount) setAccountToggleCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getAccountActiveValue(accountToggleCandidate)
                ? "Deactivate Employee Account"
                : "Activate Employee Account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accountToggleCandidate
                ? `${getAccountActiveValue(accountToggleCandidate) ? "Deactivate" : "Activate"} ${accountToggleCandidate.first_name || ""} ${accountToggleCandidate.last_name || ""}'s account?`
                : "Update account activation status?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingAccount}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleAccountActive}
              disabled={togglingAccount}
              className={getAccountActiveValue(accountToggleCandidate) ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            >
              {togglingAccount
                ? "Saving..."
                : getAccountActiveValue(accountToggleCandidate)
                  ? "Deactivate"
                  : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
