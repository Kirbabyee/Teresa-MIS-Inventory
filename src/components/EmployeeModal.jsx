import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/backendClient";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const initialForm = {
  employee_code: "",
  first_name: "",
  last_name: "",
  middle_name: "",
  email: "",
  phone: "+63",
  department_id: "",
  project_site_id: "",
  project_site_name: "",
  position_id: "",
  status: "probationary",
  hire_date: "",
  address: "",
  sss_number: "",
  philhealth_number: "",
  pagibig_number: "",
  tin_number: "",
  emergency_contact_name: "",
  emergency_contact_phone: "+63",
};

const POSITION_LINK_TABLE_CANDIDATES = [
  "employee_positions",
  "employee_position_assignments",
];

const GOVERNMENT_ID_RULES = {
  sss_number: { label: "SSS", lengths: [10] },
  philhealth_number: { label: "PhilHealth", lengths: [12] },
  pagibig_number: { label: "Pag-IBIG", lengths: [12] },
  tin_number: { label: "TIN", lengths: [9, 12] },
};

const EMPLOYEE_CODE_YEAR_DIGITS = 4;
const EMPLOYEE_CODE_SEQUENCE_DIGITS = 3;

const ADD_EMPLOYEE_STEPS = [
  {
    title: "Profile",
    description: "Identity and contact details",
  },
  {
    title: "Assignment",
    description: "Site, department, position, and status",
  },
  {
    title: "HR Details",
    description: "Address, IDs, and emergency contact",
  },
];

function extractEmployeeCodeSequence(code, year) {
  const value = String(code || "").trim();
  const pattern = new RegExp(`^${year}(\\d+)$`);
  const match = value.match(pattern);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function formatEmployeeCode(year, sequence) {
  return `${year}${String(sequence).padStart(EMPLOYEE_CODE_SEQUENCE_DIGITS, "0")}`;
}

function nextEmployeeCodeFromLatest(latestCode, year) {
  const currentSequence = extractEmployeeCodeSequence(latestCode, year) || 0;
  return formatEmployeeCode(year, currentSequence + 1);
}

function getStepFields(stepIndex, isEditing) {
  const stepFields = [
    ["employee_code", "first_name", "last_name", "middle_name", "email", "phone", "hire_date"],
    ["project_site_id", "project_site_name", "department_id", "position_id", "status"],
    ["address", "sss_number", "philhealth_number", "pagibig_number", "tin_number", "emergency_contact_name", "emergency_contact_phone"],
  ];

  if (isEditing) return [];
  return stepFields[stepIndex] || [];
}

export default function EmployeeModal({ employee, onClose, onSaved }) {
  const isEditing = Boolean(employee?.id);
  const [currentStep, setCurrentStep] = useState(0);

  const [form, setForm] = useState({ ...initialForm, ...employee });
  const [cleanForm, setCleanForm] = useState({ ...initialForm, ...employee });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [projectSites, setProjectSites] = useState([]);
  const [projectSiteLinkMode, setProjectSiteLinkMode] = useState("id");

  const [selectedPositionIds, setSelectedPositionIds] = useState([]);
  const [multiPositionMode, setMultiPositionMode] = useState(false);
  const [positionLinkTable, setPositionLinkTable] = useState(null);

  useEffect(() => {
    setForm({ ...initialForm, ...employee });
    setCleanForm({ ...initialForm, ...employee });
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setSelectedPositionIds([]);
    setCurrentStep(0);
  }, [employee]);

  useEffect(() => {
    if (isEditing) return;

    let isActive = true;

    const generateEmployeeCode = async () => {
      const year = new Date().getFullYear();
      const { data, error } = await supabase
        .from("employees")
        .select("employee_code")
        .like("employee_code", `${year}%`)
        .order("employee_code", { ascending: false })
        .limit(1);

      const nextCode = error
        ? formatEmployeeCode(year, 1)
        : nextEmployeeCodeFromLatest(data?.[0]?.employee_code, year);

      if (!isActive) return;

      setForm((prev) => ({ ...prev, employee_code: nextCode }));
      setCleanForm((prev) => ({ ...prev, employee_code: nextCode }));
    };

    generateEmployeeCode();

    return () => {
      isActive = false;
    };
  }, [isEditing, employee?.id]);

  useEffect(() => {
    const loadLookups = async () => {
      const [deptRes, siteRes, projectIdProbe] = await Promise.all([
        supabase.from("departments").select("id, name").order("name"),
        supabase
          .from("project_sites")
          .select("id, name, location")
          .order("name"),
        supabase.from("employees").select("project_site_id").limit(1),
      ]);

      let posRes = null;
      const positionSelectCandidates = [
        "id, title, department_id, department_name",
        "id, title, department_id",
        "id, title, department_name",
        "id, title",
      ];

      for (const selectCols of positionSelectCandidates) {
        const probe = await supabase
          .from("positions")
          .select(selectCols)
          .order("title");

        if (!probe.error) {
          posRes = {
            ...probe,
            data: (probe.data || []).map((row) => ({
              ...row,
              department_id: row.department_id || null,
              department_name: row.department_name || null,
            })),
          };
          break;
        }
      }

      if (!deptRes.error) setDepartments(deptRes.data || []);
      if (posRes && !posRes.error) setPositions(posRes.data || []);
      if (!siteRes.error) setProjectSites(siteRes.data || []);

      if (!projectIdProbe.error) {
        setProjectSiteLinkMode("id");
      } else {
        const projectNameProbe = await supabase
          .from("employees")
          .select("project_site_name")
          .limit(1);
        setProjectSiteLinkMode(projectNameProbe.error ? "none" : "name");
      }

      let linkTable = null;
      for (const tableName of POSITION_LINK_TABLE_CANDIDATES) {
        const probe = await supabase
          .from(tableName)
          .select("employee_id, position_id")
          .limit(1);
        if (!probe.error) {
          linkTable = tableName;
          break;
        }
      }

      setMultiPositionMode(Boolean(linkTable));
      setPositionLinkTable(linkTable);
    };

    loadLookups();
  }, []);

  const normalizePhone = (value) => {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("63")) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    return digits ? "+63" + digits : "+63";
  };

  const normalize = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "+63" ? null : trimmed;
  };

  const isValidEmail = (value) => {
    const email = String(value || "").trim();
    if (!email) return true;
    return /^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(email);
  };

  const validatePhone = (value) => {
    if (!value || value === "+63") return null;
    if (!value.startsWith("+63")) return "Phone must start with +63.";
    const digits = value.slice(3);
    if (!/^\d+$/.test(digits)) return "Phone accepts numbers only.";
    if (digits.length !== 10) return "Phone must be +63 followed by 10 digits.";
    return null;
  };

  const validateGovernmentId = (key, value) => {
    if (!value) return null;
    const rule = GOVERNMENT_ID_RULES[key];
    if (!rule) return null;
    const digits = String(value).replace(/\D/g, "");
    if (!rule.lengths.includes(digits.length)) {
      return rule.label + " must be " + rule.lengths.join(" or ") + " digits.";
    }
    return null;
  };

  const validateForm = (f) => {
    const next = {};

    if (!f.employee_code?.trim())
      next.employee_code = "Employee code is required.";
    if (!f.first_name?.trim()) next.first_name = "First name is required.";
    if (!f.last_name?.trim()) next.last_name = "Last name is required.";
    if (!f.status?.trim()) next.status = "Employment status is required.";
    if (!isEditing && !f.email?.trim())
      next.email = "Email is required for activation invite.";
    if (f.email && !isValidEmail(f.email)) next.email = "Enter a valid email.";

    const phoneError = validatePhone(f.phone);
    if (phoneError) next.phone = phoneError;

    if (f.emergency_contact_name && !f.emergency_contact_phone) {
      next.emergency_contact_phone = "Emergency contact phone is required.";
    } else {
      const emergencyPhoneError = validatePhone(f.emergency_contact_phone);
      if (emergencyPhoneError)
        next.emergency_contact_phone = emergencyPhoneError;
    }

    Object.keys(GOVERNMENT_ID_RULES).forEach((key) => {
      const err = validateGovernmentId(key, f[key]);
      if (err) next[key] = err;
    });

    if (f.hire_date) {
      const selected = new Date(f.hire_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected > today)
        next.hire_date = "Hire date cannot be in the future.";
    }

    return next;
  };

  const setValue = (key, rawValue) => {
    let value = rawValue;

    if (key === "phone" || key === "emergency_contact_phone") {
      value = normalizePhone(rawValue);
    }

    if (GOVERNMENT_ID_RULES[key]) {
      value = String(rawValue || "")
        .replace(/\D/g, "")
        .slice(0, 12);
    }

    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setErrors(validateForm(next));
      return next;
    });
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const showError = (key) => (touched[key] || submitted) && errors[key];

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(cleanForm);
  }, [form, cleanForm]);

  const selectedProjectSiteValue =
    projectSiteLinkMode === "id"
      ? form.project_site_id
      : form.project_site_name;
  const hasProjectSiteSelection = Boolean(selectedProjectSiteValue);
  const hasDepartmentSelection = Boolean(
    form.department_id || form.department_name,
  );

  const selectedDepartmentName =
    departments.find((dept) => String(dept.id) === String(form.department_id))
      ?.name ||
    form.department_name ||
    "";

  const filteredPositions = useMemo(() => {
    if (!hasDepartmentSelection) return [];

    const normalizedDepartmentName = selectedDepartmentName
      .trim()
      .toLowerCase();
    const hasDepartmentMapping = positions.some(
      (position) => position?.department_id || position?.department_name,
    );

    // Some schemas store position rows without department mapping.
    // In that case, do not hide the list; show all positions.
    if (!hasDepartmentMapping) return positions;

    const matches = positions.filter((position) => {
      const depId = position.department_id
        ? String(position.department_id)
        : "";
      const depName = position.department_name
        ? String(position.department_name).trim().toLowerCase()
        : "";

      if (form.department_id && depId)
        return String(form.department_id) === depId;
      if (normalizedDepartmentName && depName)
        return normalizedDepartmentName === depName;
      return false;
    });

    return matches;
  }, [
    positions,
    hasDepartmentSelection,
    form.department_id,
    selectedDepartmentName,
  ]);

  const selectedPositionLabels = positions
    .filter((position) => selectedPositionIds.includes(String(position.id)))
    .map((position) => position.title);

  const requestSaveConfirmation = () => {
    const next = validateForm(form);
    setErrors(next);
    setSubmitted(true);
    if (Object.keys(next).length > 0) return;
    setShowSaveConfirm(true);
  };

  const handleNextStep = () => {
    const nextErrors = validateForm(form);
    const currentFields = getStepFields(currentStep, isEditing);
    const stepErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(([key]) => currentFields.includes(key)),
    );

    setErrors(nextErrors);
    setTouched((prev) => {
      const next = { ...prev };
      currentFields.forEach((key) => {
        next[key] = true;
      });
      return next;
    });

    if (Object.keys(stepErrors).length > 0) return;
    setCurrentStep((prev) => Math.min(prev + 1, ADD_EMPLOYEE_STEPS.length - 1));
  };

  const handlePreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const addBasicFields = [
    { key: "employee_code", label: "Employee Code", required: true },
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "middle_name", label: "Middle Name" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "hire_date", label: "Hire Date", type: "date" },
  ];
  const addHrFields = [
    { key: "address", label: "Address" },
    { key: "sss_number", label: "SSS Number" },
    { key: "philhealth_number", label: "PhilHealth Number" },
    { key: "pagibig_number", label: "Pag-IBIG Number" },
    { key: "tin_number", label: "TIN Number" },
    { key: "emergency_contact_name", label: "Emergency Contact" },
    { key: "emergency_contact_phone", label: "Emergency Contact Phone" },
  ];

  const renderField = (field) => {
    const isAutoEmployeeCode = !isEditing && field.key === "employee_code";

    return (
      <div key={field.key}>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {field.label}
          {field.required ? " *" : ""}
        </label>
        <Input
          type={field.type || "text"}
          value={form[field.key] || ""}
          placeholder={isAutoEmployeeCode ? "Auto-generated" : field.label}
          onChange={(e) => setValue(field.key, e.target.value)}
          onBlur={() =>
            setTouched((prev) => ({ ...prev, [field.key]: true }))
          }
          inputMode={
            field.key === "phone" ||
            field.key === "emergency_contact_phone" ||
            GOVERNMENT_ID_RULES[field.key]
              ? "numeric"
              : undefined
          }
          readOnly={isAutoEmployeeCode}
          className={`${showError(field.key) ? "border-red-400 focus-visible:ring-red-400" : ""} ${isAutoEmployeeCode ? "bg-slate-100 text-slate-500" : ""}`.trim()}
        />
        {isAutoEmployeeCode ? (
          <p className="mt-1 text-xs text-slate-500">
            Auto-generated in YYYY### format.
          </p>
        ) : showError(field.key) ? (
          <p className="mt-1 text-xs text-red-600">
            {errors[field.key]}
          </p>
        ) : null}
      </div>
    );
  };

  const persistEmployee = async () => {
    setSaving(true);
    try {
      const primaryPositionId = !isEditing
        ? selectedPositionIds[0] || normalize(form.position_id)
        : normalize(form.position_id);

      const payload = {
        employee_code: normalize(form.employee_code),
        first_name: normalize(form.first_name),
        last_name: normalize(form.last_name),
        middle_name: normalize(form.middle_name),
        email: normalize(form.email),
        phone: normalize(form.phone),
        department_id: normalize(form.department_id),
        position_id: primaryPositionId,
        status: normalize(form.status),
        hire_date: normalize(form.hire_date),
        address: normalize(form.address),
        sss_number: normalize(form.sss_number),
        philhealth_number: normalize(form.philhealth_number),
        pagibig_number: normalize(form.pagibig_number),
        tin_number: normalize(form.tin_number),
        emergency_contact_name: normalize(form.emergency_contact_name),
        emergency_contact_phone: normalize(form.emergency_contact_phone),
      };

      if (projectSiteLinkMode === "id")
        payload.project_site_id = normalize(form.project_site_id);
      if (projectSiteLinkMode === "name")
        payload.project_site_name = normalize(form.project_site_name);

      if (employee?.id) {
        // On edit: also save multi-position arrays if available
        const positionIdProbe = await supabase.from("employees").select("position_ids").limit(1);
        const positionNameProbe = await supabase.from("employees").select("position_names").limit(1);
        
        if (!positionIdProbe.error) {
          payload.position_ids = selectedPositionIds.length > 0 ? selectedPositionIds : [];
        }
        if (!positionNameProbe.error) {
          payload.position_names = selectedPositionLabels.length > 0 ? selectedPositionLabels : [];
        }

        const { error } = await supabase
          .from("employees")
          .update(payload)
          .eq("id", employee.id);
        if (error) throw error;

        // Also update link table if in multi-position mode
        if (multiPositionMode && positionLinkTable) {
          const { error: deleteError } = await supabase
            .from(positionLinkTable)
            .delete()
            .eq("employee_id", employee.id);
          if (deleteError) throw deleteError;

          if (selectedPositionIds.length > 0) {
            const rows = selectedPositionIds.map((positionId) => ({
              employee_id: employee.id,
              position_id: positionId,
            }));
            const { error: insertError } = await supabase
              .from(positionLinkTable)
              .insert(rows);
            if (insertError) throw insertError;
          }
        }
      } else {
        // For new employees: also include multi-position arrays
        const positionIdProbe = await supabase.from("employees").select("position_ids").limit(1);
        const positionNameProbe = await supabase.from("employees").select("position_names").limit(1);
        
        if (!positionIdProbe.error && selectedPositionIds.length > 0) {
          payload.position_ids = selectedPositionIds;
        }
        if (!positionNameProbe.error && selectedPositionLabels.length > 0) {
          payload.position_names = selectedPositionLabels;
        }

        const { data: insertedEmployee, error } = await supabase
          .from("employees")
          .insert([payload])
          .select("id")
          .single();
        if (error) throw error;

        const chartAccountCode =
          String(payload.employee_code || "").trim() || String(insertedEmployee.id);
        const chartAccountName =
          `${payload.first_name || ""} ${payload.last_name || ""}`.trim() ||
          payload.email ||
          chartAccountCode;

        const existingChartAccount = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("account_code", chartAccountCode)
          .maybeSingle();

        if (existingChartAccount.error) throw existingChartAccount.error;

        if (!existingChartAccount.data) {
          const chartInsert = await supabase
            .from("chart_of_accounts")
            .insert([
              {
                account_code: chartAccountCode,
                account_name: chartAccountName,
                account_type: "employee",
              },
            ]);

          if (chartInsert.error) throw chartInsert.error;
        }

        if (
          multiPositionMode &&
          positionLinkTable &&
          insertedEmployee?.id &&
          selectedPositionIds.length > 0
        ) {
          const rows = selectedPositionIds.map((positionId) => ({
            employee_id: insertedEmployee.id,
            position_id: positionId,
          }));
          const { error: positionErr } = await supabase
            .from(positionLinkTable)
            .insert(rows);
          if (positionErr) throw positionErr;
        }

        if (!payload.email)
          throw new Error(
            "Employee email is required to send activation link.",
          );

        try {
          const displayName = (
            (payload.first_name || "") +
            " " +
            (payload.last_name || "")
          ).trim();
          const roleLabel =
            positions.find(
              (position) => String(position.id) === String(payload.position_id),
            )?.title || "Employee";
          const departmentLabel =
            departments.find(
              (dept) => String(dept.id) === String(payload.department_id),
            )?.name || "";
          const siteLabel =
            projectSiteLinkMode === "id"
              ? projectSites.find(
                  (site) => String(site.id) === String(payload.project_site_id),
                )?.name || ""
              : payload.project_site_name || "";

          await createEmployeeInviteAndSendEmail({
            employeeId: insertedEmployee.id,
            email: payload.email,
            toName: displayName || "Team Member",
            role: roleLabel,
            departmentName: departmentLabel,
            projectSiteName: siteLabel,
            positionName: roleLabel,
          });
        } catch (inviteError) {
          if (multiPositionMode && positionLinkTable) {
            await supabase
              .from(positionLinkTable)
              .delete()
              .eq("employee_id", insertedEmployee.id);
          }
          await supabase
            .from("chart_of_accounts")
            .delete()
            .eq("account_code", chartAccountCode);
          await supabase
            .from("employees")
            .delete()
            .eq("id", insertedEmployee.id);
          throw inviteError;
        }
      }

      onSaved();
    } catch (error) {
      console.error("Failed to save employee:", error.message);
      if (error.code === "23505") {
        setErrors((prev) => ({
          ...prev,
          employee_code: "Employee code already exists.",
        }));
      } else {
        alert("Failed to save employee: " + error.message);
      }
    } finally {
      setSaving(false);
      setShowSaveConfirm(false);
    }
  };

  const fields = [
    { key: "employee_code", label: "Employee Code", required: true },
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "middle_name", label: "Middle Name" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "hire_date", label: "Hire Date", type: "date" },
    { key: "address", label: "Address" },
    { key: "sss_number", label: "SSS Number" },
    { key: "philhealth_number", label: "PhilHealth Number" },
    { key: "pagibig_number", label: "Pag-IBIG Number" },
    { key: "tin_number", label: "TIN Number" },
    { key: "emergency_contact_name", label: "Emergency Contact" },
    { key: "emergency_contact_phone", label: "Emergency Contact Phone" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit Employee" : "Add Employee"}
          </h2>
          <button
            type="button"
            onClick={() =>
              hasUnsavedChanges ? setShowCloseConfirm(true) : onClose()
            }
          >
            <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!isEditing ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {ADD_EMPLOYEE_STEPS.map((step, index) => {
                  const isActive = index === currentStep;
                  const isComplete = index < currentStep;
                  return (
                    <button
                      key={step.title}
                      type="button"
                      onClick={() => {
                        if (index <= currentStep) setCurrentStep(index);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${isActive ? "border-[#2E6F40] bg-white text-slate-900 shadow-sm" : isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                        Step {index + 1}
                      </p>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-xs text-slate-500">{step.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">
                    {ADD_EMPLOYEE_STEPS[currentStep].title}
                  </p>
                  <p className="text-slate-500">
                    {ADD_EMPLOYEE_STEPS[currentStep].description}
                  </p>
                </div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.18em]">
                  {currentStep + 1} / {ADD_EMPLOYEE_STEPS.length}
                </p>
              </div>
            </div>
          ) : null}

          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map(renderField)}
            </div>
          ) : currentStep === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addBasicFields.map(renderField)}
            </div>
          ) : currentStep === 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Project Site (Optional)
                </label>
                {projectSiteLinkMode === "none" ? (
                  <div className="w-full border border-dashed border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500">
                    Project site column is not available in the employees table.
                  </div>
                ) : (
                  <Select
                    value={String(
                      projectSiteLinkMode === "id"
                        ? form.project_site_id || ""
                        : form.project_site_name || "",
                    )}
                    onValueChange={(value) => {
                      setForm((prev) => ({
                        ...prev,
                        project_site_id:
                          projectSiteLinkMode === "id"
                            ? value
                            : prev.project_site_id,
                        project_site_name:
                          projectSiteLinkMode === "name"
                            ? value
                            : prev.project_site_name,
                        department_id: "",
                        position_id: "",
                      }));
                      setSelectedPositionIds([]);
                      setTouched((prev) => ({
                        ...prev,
                        project_site_id: true,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="Select project site" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectSites.map((site) => (
                        <SelectItem
                          key={site.id}
                          value={String(
                            projectSiteLinkMode === "id" ? site.id : site.name,
                          )}
                        >
                          {site.name}
                          {site.location ? " - " + site.location : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Department (Optional)
                </label>
                <Select
                  value={String(form.department_id || "")}
                  disabled={!hasProjectSiteSelection}
                  onValueChange={(departmentId) => {
                    setForm((prev) => ({
                      ...prev,
                      department_id: departmentId,
                      position_id: "",
                    }));
                    setSelectedPositionIds([]);
                    setTouched((prev) => ({ ...prev, department_id: true }));
                  }}
                >
                  <SelectTrigger className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-400">
                    <SelectValue
                      placeholder={
                        hasProjectSiteSelection
                          ? "Select department"
                          : "Select project site first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Positions (Optional)
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!hasDepartmentSelection}
                      className="mt-0 flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <span className="truncate text-left">
                        {!hasDepartmentSelection
                          ? "Select department first"
                          : selectedPositionLabels.length === 0
                            ? "Select positions"
                            : selectedPositionLabels.length + " selected"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto p-1">
                    {filteredPositions.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-slate-500">
                        No positions found for selected department.
                      </div>
                    ) : (
                      filteredPositions.map((position) => {
                        const id = String(position.id);
                        return (
                          <DropdownMenuCheckboxItem
                            key={position.id}
                            checked={selectedPositionIds.includes(id)}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...selectedPositionIds, id]
                                : selectedPositionIds.filter(
                                    (value) => value !== id,
                                  );
                              setSelectedPositionIds(next);
                              setForm((prev) => ({
                                ...prev,
                                position_id: next[0] || "",
                              }));
                              setTouched((prev) => ({
                                ...prev,
                                position_id: true,
                              }));
                            }}
                          >
                            {position.title}
                          </DropdownMenuCheckboxItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-[11px] text-slate-500 mt-1">
                  {multiPositionMode
                    ? "Select one or more roles for this employee."
                    : "Select one role. Multiple assignment table is not available in this schema."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Employment Status *
                </label>
                <Select
                  value={form.status}
                  onValueChange={(value) => {
                    setValue("status", value);
                    setTouched((prev) => ({ ...prev, status: true }));
                  }}
                >
                  <SelectTrigger
                    className={
                      "w-full bg-white " +
                      (showError("status")
                        ? "border-red-400"
                        : "border-slate-200")
                    }
                  >
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "probationary",
                      "regular",
                      "contractual",
                      "resigned",
                      "terminated",
                    ].map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showError("status") ? (
                  <p className="mt-1 text-xs text-red-600">{errors.status}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addHrFields.map(renderField)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t">
          <Button
            variant="outline"
            onClick={() =>
              hasUnsavedChanges ? setShowCloseConfirm(true) : onClose()
            }
          >
            Cancel
          </Button>
          {isEditing ? (
            <Button onClick={requestSaveConfirmation} disabled={saving}>
              {saving ? "Saving..." : "Save Employee"}
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              {currentStep > 0 ? (
                <Button variant="outline" onClick={handlePreviousStep}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : null}
              {currentStep < ADD_EMPLOYEE_STEPS.length - 1 ? (
                <Button onClick={handleNextStep}>
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={requestSaveConfirmation} disabled={saving}>
                  {saving ? "Saving..." : "Save Employee"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isEditing ? "Confirm Employee Update" : "Confirm New Employee"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isEditing
                ? "Are you sure the edited employee information is correct?"
                : "Are you sure the employee information is correct before adding this record?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              Review Details
            </AlertDialogCancel>
            <AlertDialogAction onClick={persistEmployee} disabled={saving}>
              {saving
                ? "Saving..."
                : isEditing
                  ? "Confirm Update"
                  : "Confirm Add"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without
              saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
