import { useEffect, useState } from "react";
import { supabase } from "@/api/backendClient";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const ACTION_CONFIG = {
  department: {
    title: "Assign Department",
    description: "Choose the department for this employee.",
    fieldCandidates: ["department_id", "department_name"],
    label: "Department",
    lookup: async () =>
      supabase.from("departments").select("id, name").order("name"),
    optionLabel: (item) => item.name,
  },
  projectSite: {
    title: "Assign Project Site",
    description: "Choose the project site for this employee.",
    fieldCandidates: ["project_site_id", "project_site_name"],
    label: "Project Site",
    lookup: async () =>
      supabase.from("project_sites").select("id, name, location").order("name"),
    optionLabel: (item) => `${item.name}${item.location ? ` - ${item.location}` : ""}`,
  },
  position: {
    title: "Assign Position",
    description: "Choose the position for this employee.",
    fieldCandidates: ["position_id", "position_name"],
    label: "Position",
    lookup: async () =>
      supabase.from("positions").select("*").order("title"),
    optionLabel: (item) => item.title,
  },
  status: {
    title: "Assign Employment Status",
    description: "Choose the employment status for this employee.",
    fieldCandidates: ["status"],
    label: "Employment Status",
    lookup: async () => Promise.resolve({ data: [] }),
    optionLabel: null,
  },
};

const STATUS_OPTIONS = ["probationary", "regular", "contractual", "resigned", "terminated"];
const MULTI_LINK_TABLE_CANDIDATES = {
  position: ["employee_positions", "employee_position_assignments"],
  department: ["employee_departments", "employee_department_assignments"],
  projectSite: ["employee_project_sites", "employee_project_site_assignments"],
};

const LINK_FIELD_BY_ACTION = {
  position: "position_id",
  department: "department_id",
  projectSite: "project_site_id",
};

function getAvailableField(employee, fieldCandidates) {
  for (const field of fieldCandidates) {
    if (Object.prototype.hasOwnProperty.call(employee || {}, field)) return field;
  }
  return fieldCandidates[0];
}

export default function EmployeeAssignmentModal({ employee, action, onClose, onSaved }) {
  const config = ACTION_CONFIG[action];
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState("");
  const [multiMode, setMultiMode] = useState(false);
  const [assignmentLinkTable, setAssignmentLinkTable] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingRemoveItem, setPendingRemoveItem] = useState(null);
  const [singleCleared, setSingleCleared] = useState(false);
  const [projectSiteLinkMode, setProjectSiteLinkMode] = useState("id");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  const fieldName = config ? getAvailableField(employee, config.fieldCandidates) : null;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!config) return;
      setError("");
      setMultiMode(false);
      setAssignmentLinkTable(null);
      setSelectedIds([]);
      setPendingRemoveItem(null);
      setSingleCleared(false);

      let detectedLinkTable = null;
      const isPositionAction = action === "position";
      if (isPositionAction && MULTI_LINK_TABLE_CANDIDATES[action]?.length) {
        const linkField = LINK_FIELD_BY_ACTION[action];
        for (const tableName of MULTI_LINK_TABLE_CANDIDATES[action]) {
          const probe = await supabase
            .from(tableName)
            .select(`employee_id, ${linkField}`)
            .limit(1);
          if (!probe.error) {
            detectedLinkTable = tableName;
            break;
          }
        }

        if (detectedLinkTable && mounted) {
          setMultiMode(true);
          setAssignmentLinkTable(detectedLinkTable);
        }
      }

      if (action === "status") {
        if (mounted) {
          setOptions([]);
          setValue(employee?.status || "");
        }
        return;
      }

      let linkMode = projectSiteLinkMode;
      if (action === "projectSite") {
        const [idProbe, nameProbe] = await Promise.all([
          supabase.from("employees").select("project_site_id").limit(1),
          supabase.from("employees").select("project_site_name").limit(1),
        ]);

        if (idProbe.error && nameProbe.error) {
          if (mounted) {
            setError("Project site column is not available in the employees table.");
            setOptions([]);
            setValue("");
            setProjectSiteLinkMode("none");
          }
          return;
        }

        linkMode = !idProbe.error ? "id" : "name";
        if (mounted) setProjectSiteLinkMode(linkMode);
      }

      const result = await config.lookup();
      if (!mounted) return;

      if (result.error) {
        setError(result.error.message || "Failed to load options.");
        return;
      }

      let rows = result.data || [];

      if (action === "position") {
        const deptId = employee?.department_id ? String(employee.department_id) : "";
        const deptName = employee?.department_name
          ? String(employee.department_name).trim().toLowerCase()
          : "";
        const hasDepartmentMapping = rows.some(
          (row) => row?.department_id || row?.department_name,
        );

        if (!deptId && !deptName) {
          rows = [];
          setError("Assign a department first before assigning a position.");
        } else if (hasDepartmentMapping) {
          rows = rows.filter((row) => {
            const rowDeptId = row?.department_id ? String(row.department_id) : "";
            const rowDeptName = row?.department_name
              ? String(row.department_name).trim().toLowerCase()
              : "";

            if (deptId && rowDeptId) return rowDeptId === deptId;
            if (deptName && rowDeptName) return rowDeptName === deptName;
            return false;
          });

          if (rows.length === 0) {
            setError("No positions are available for this employee's assigned department.");
          }
        }
      }

      setOptions(rows);

      if (detectedLinkTable && LINK_FIELD_BY_ACTION[action]) {
        const linkField = LINK_FIELD_BY_ACTION[action];
        const assigned = await supabase
          .from(detectedLinkTable)
          .select(linkField)
          .eq("employee_id", employee?.id);

        if (assigned.error) {
          setError(assigned.error.message || "Failed to load assigned items.");
          setSelectedIds([]);
        } else {
          setSelectedIds(
            (assigned.data || []).map((row) => String(row[linkField])).filter(Boolean),
          );
        }

        setValue(employee?.[fieldName] || "");
        return;
      }

      if (isListAssignableAction) {
        const fallbackIds = [];

        if (action === "position") {
          if (employee?.position_id) fallbackIds.push(String(employee.position_id));
          else if (employee?.position_name) {
            const match = rows.find((row) => row.title === employee.position_name);
            if (match?.id) fallbackIds.push(String(match.id));
          }
        }

        if (action === "department") {
          if (employee?.department_id) fallbackIds.push(String(employee.department_id));
        }

        if (action === "projectSite") {
          if (linkMode === "id" && employee?.project_site_id) {
            fallbackIds.push(String(employee.project_site_id));
          }
        }

        setSelectedIds(fallbackIds);
        setValue(employee?.[fieldName] || "");
        return;
      }

      if (action === "projectSite") {
        setValue(
          linkMode === "name"
            ? employee?.project_site_name || ""
            : employee?.project_site_id || "",
        );
      } else {
        setValue(employee?.[fieldName] || "");
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [action, employee, fieldName, projectSiteLinkMode, config]);

  if (!config) return null;

  const isListAssignableAction = ["position", "department", "projectSite"].includes(action);
  const isPositionAction = action === "position";
  const hasProjectSiteAssigned = Boolean(
    employee?.project_site_id || employee?.project_site_name,
  );
  const projectSiteResetNotice =
    action === "projectSite"
      ? "Changing project site will reset department and position assignments."
      : "";
  const departmentPrerequisiteWarning =
    action === "department" && !hasProjectSiteAssigned
      ? "Assign a project site first before assigning a department."
      : "";

  const persist = async () => {
    if (!employee?.id) return;

    if (action === "status" && !value) return;
    if (action === "department" && !hasProjectSiteAssigned) {
      setError("Assign a project site first before assigning a department.");
      return;
    }

    setSaving(true);
    try {
      if (isPositionAction && LINK_FIELD_BY_ACTION[action]) {
        const linkField = LINK_FIELD_BY_ACTION[action];
        const normalizedIds = selectedIds.map((id) => String(id));
        const selectedItems = options.filter((row) => normalizedIds.includes(String(row.id)));

        if (assignmentLinkTable) {
          const { error: deleteError } = await supabase
            .from(assignmentLinkTable)
            .delete()
            .eq("employee_id", employee.id);
          if (deleteError) throw deleteError;

          if (normalizedIds.length > 0) {
            const rows = normalizedIds.map((selectedId) => ({
              employee_id: employee.id,
              [linkField]: selectedId,
            }));
            const { error: insertError } = await supabase
              .from(assignmentLinkTable)
              .insert(rows);
            if (insertError) throw insertError;
          }
        }

        const primary = selectedItems[0] || null;
        const updateCandidates = {
          position: ["position_id", "position_name"],
          department: ["department_id", "department_name"],
          projectSite: ["project_site_id", "project_site_name"],
        };
        const probes = await Promise.all(
          (updateCandidates[action] || []).map((field) =>
            supabase.from("employees").select(field).limit(1),
          ),
        );

        const employeeUpdatePayload = {};
        (updateCandidates[action] || []).forEach((field, idx) => {
          if (probes[idx]?.error) return;

          if (field.endsWith("_id")) {
            employeeUpdatePayload[field] = primary ? primary.id : null;
            return;
          }

          if (field === "position_name") {
            employeeUpdatePayload[field] = primary ? primary.title : null;
            return;
          }

          if (field === "department_name") {
            employeeUpdatePayload[field] = primary ? primary.name : null;
            return;
          }

          if (field === "project_site_name") {
            employeeUpdatePayload[field] = primary ? primary.name : null;
          }
        });

        if (
          action === "projectSite" &&
          !Object.prototype.hasOwnProperty.call(employeeUpdatePayload, "project_site_id") &&
          Object.prototype.hasOwnProperty.call(employeeUpdatePayload, "project_site_name")
        ) {
          employeeUpdatePayload.project_site_name = primary ? primary.name : null;
        }

        // Add multi-position support: Save all selected positions to position_ids and position_names arrays
        if (action === "position") {
          const positionIdProbe = await supabase.from("employees").select("position_ids").limit(1);
          const positionNameProbe = await supabase.from("employees").select("position_names").limit(1);
          
          if (!positionIdProbe.error) {
            employeeUpdatePayload.position_ids = normalizedIds.length > 0 ? normalizedIds : [];
          }
          if (!positionNameProbe.error) {
            employeeUpdatePayload.position_names = selectedItems.length > 0 ? selectedItems.map(item => item.title) : [];
          }
        }

        if (Object.keys(employeeUpdatePayload).length > 0) {
          const { error: employeeUpdateError } = await supabase
            .from("employees")
            .update(employeeUpdatePayload)
            .eq("id", employee.id);
          if (employeeUpdateError) throw employeeUpdateError;
        }

        setShowConfirm(false);
        onSaved();
        return;
      }

      const payload =
        action === "projectSite"
          ? projectSiteLinkMode === "name"
            ? { project_site_name: value || null }
            : { project_site_id: value || null }
          : { [fieldName]: value || null };

      if (action === "projectSite") {
        const probes = await Promise.all([
          supabase.from("employees").select("department_id").limit(1),
          supabase.from("employees").select("department_name").limit(1),
          supabase.from("employees").select("position_id").limit(1),
          supabase.from("employees").select("position_name").limit(1),
          supabase.from("employees").select("position_ids").limit(1),
          supabase.from("employees").select("position_names").limit(1),
        ]);

        if (!probes[0].error) payload.department_id = null;
        if (!probes[1].error) payload.department_name = null;
        if (!probes[2].error) payload.position_id = null;
        if (!probes[3].error) payload.position_name = null;
        if (!probes[4].error) payload.position_ids = [];
        if (!probes[5].error) payload.position_names = [];
      }

      if (action === "department") {
        const probes = await Promise.all([
          supabase.from("employees").select("position_id").limit(1),
          supabase.from("employees").select("position_name").limit(1),
          supabase.from("employees").select("position_ids").limit(1),
          supabase.from("employees").select("position_names").limit(1),
        ]);

        if (!probes[0].error) payload.position_id = null;
        if (!probes[1].error) payload.position_name = null;
        if (!probes[2].error) payload.position_ids = [];
        if (!probes[3].error) payload.position_names = [];
      }

      if (action === "projectSite" || action === "department") {
        for (const tableName of MULTI_LINK_TABLE_CANDIDATES.position || []) {
          const probe = await supabase
            .from(tableName)
            .select("employee_id, position_id")
            .limit(1);

          if (probe.error) continue;

          const { error: clearLinkError } = await supabase
            .from(tableName)
            .delete()
            .eq("employee_id", employee.id);
          if (clearLinkError) throw clearLinkError;
          break;
        }
      }

      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", employee.id);
      if (error) throw error;
      setShowConfirm(false);
      onSaved();
    } catch (err) {
      console.error("Failed to assign employee field:", err.message);
      setError(err.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const removeSelectedItem = (itemId) => {
    const nextId = String(itemId);
    setSelectedIds((prev) => prev.filter((id) => id !== nextId));
    setValue("");
    setSingleCleared(true);
    setPendingRemoveItem(null);
  };

  const currentAssignments = (() => {
    if (!isListAssignableAction) return [];

    if (selectedIds.length > 0) {
      return selectedIds
        .map((selectedId) => {
          const match = options.find((item) => String(item.id) === String(selectedId));
          return match
            ? {
                id: String(match.id),
                label: config.optionLabel(match),
              }
            : null;
        })
        .filter(Boolean);
    }

    const selected = options.find((item) => String(item.id) === String(value));
    if (selected) {
      return [{ id: String(selected.id), label: config.optionLabel(selected) }];
    }

    if (singleCleared) return [];

    if (action === "position" && employee?.position_name) {
      return [{ id: "legacy", label: employee.position_name }];
    }
    if (action === "department" && employee?.department_name) {
      return [{ id: "legacy", label: employee.department_name }];
    }
    if (action === "projectSite" && employee?.project_site_name) {
      return [{ id: "legacy", label: employee.project_site_name }];
    }

    return [];
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">{config.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {employee?.first_name} {employee?.last_name}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">{config.description}</p>
          {projectSiteResetNotice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {projectSiteResetNotice}
            </div>
          )}
          {departmentPrerequisiteWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {departmentPrerequisiteWarning}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {isListAssignableAction && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                Current {config.label}{config.label.endsWith("s") ? "" : "s"}
              </p>
              {currentAssignments.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No assigned {config.label.toLowerCase()} yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">{config.label}</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentAssignments.map((item, idx) => (
                        <tr key={`${item.id}-${item.label}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                          <td className="px-3 py-2 text-slate-700">{item.label}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setPendingRemoveItem(item)}
                              className="inline-flex items-center justify-center rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title={`Remove ${item.label}`}
                            >
                              <span className="text-base font-semibold leading-none">-</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {config.label}
            </label>
            {action === "status" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : isPositionAction ? (
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    >
                      <span className="truncate text-left">
                        {selectedIds.length > 0
                          ? `${selectedIds.length} ${config.label.toLowerCase()}${selectedIds.length > 1 ? "s" : ""} selected`
                          : `Select ${config.label.toLowerCase()}${config.label.endsWith("s") ? "" : "s"}`}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
                    align="start"
                  >
                    <DropdownMenuLabel>
                      Available {config.label}{config.label.endsWith("s") ? "" : "s"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {options.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-slate-400">
                        No {config.label.toLowerCase()} found.
                      </div>
                    ) : (
                      options.map((item) => {
                        const itemId = String(item.id);
                        const checked = selectedIds.includes(itemId);
                        return (
                          <DropdownMenuCheckboxItem
                            key={item.id}
                            checked={checked}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={(isChecked) => {
                              setSelectedIds((prev) => {
                                if (isChecked) {
                                  return prev.includes(itemId) ? prev : [...prev, itemId];
                                }
                                return prev.filter((id) => id !== itemId);
                              });
                              setSingleCleared(false);
                            }}
                          >
                            {config.optionLabel(item)}
                          </DropdownMenuCheckboxItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click to select one or more {config.label.toLowerCase()}.
                </p>
              </div>
            ) : (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger disabled={action === "department" && !hasProjectSiteAssigned}>
                  <SelectValue placeholder={`Select ${config.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={
                        action === "projectSite" && projectSiteLinkMode === "name"
                          ? item.name
                          : String(item.id)
                      }
                    >
                      {config.optionLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={
              saving ||
              (action === "status" && !value) ||
              (action === "department" && !hasProjectSiteAssigned)
            }
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {config.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this employee&apos;s {config.label.toLowerCase()}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Review Details</AlertDialogCancel>
            <AlertDialogAction onClick={persist} disabled={saving}>
              {saving ? "Saving..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingRemoveItem)}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {config.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {pendingRemoveItem?.label} from this employee&apos;s assigned {config.label.toLowerCase()}{config.label.endsWith("s") ? "" : "s"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => removeSelectedItem(pendingRemoveItem?.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
