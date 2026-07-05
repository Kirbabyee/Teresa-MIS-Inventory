import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import SmartImporter from "@/components/SmartImporter";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  deleteBorrowerUserFromDb,
  getBorrowerAllowlistFromDb,
  normalizeUserRecord,
  readStoredBorrowerUsers,
  upsertBorrowerUsersToDb,
} from "@/lib/borrowerAllowlistApi";

const SCHOOL_ID_PATTERN = /^\d{2}-\d{5}$/;

const emptyForm = {
  name: "",
  schoolId: "",
  position: "student",
  year: "",
  section: "",
};
const normalizeHeaderKey = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getSheetValue = (row = {}, possibleKeys = []) => {
  const normalizedRow = Object.entries(row || {}).reduce((accumulator, [key, value]) => {
    accumulator[normalizeHeaderKey(key)] = value;
    return accumulator;
  }, {});

  for (const key of possibleKeys) {
    const normalizedKey = normalizeHeaderKey(key);
    const value = normalizedRow[normalizedKey];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
};

export default function StudentDirectory() {
  const [users, setUsers] = useState(readStoredBorrowerUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [showImporterModal, setShowImporterModal] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      const dbUsers = await getBorrowerAllowlistFromDb(users);
      if (active) {
        setUsers(dbUsers);
      }
    };

    loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !query ||
        [user.name, user.schoolId, user.position, user.year, user.section]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesPosition = !roleFilter || user.position === roleFilter;
      return matchesSearch && matchesPosition;
    });
  }, [roleFilter, search, users]);

  const resetForm = () => {
    setForm(emptyForm);
    setFormError("");
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedName = form.name.trim();
    const normalizedSchoolId = formatSchoolId(form.schoolId);
    const normalizedYear = normalizeYear(form.year);
    const normalizedSection = normalizeSection(form.section);

    if (!normalizedName) {
      setFormError("Name is required.");
      return;
    }

    if (!SCHOOL_ID_PATTERN.test(normalizedSchoolId)) {
      setFormError("School ID must follow the format 26-00123.");
      return;
    }

    const existingBorrower = users.some((user) => user.schoolId === normalizedSchoolId);
    if (existingBorrower) {
      setFormError("This school ID is already registered.");
      return;
    }

    if (form.position === "student") {
      if (!normalizedYear) {
        setFormError("Year is required for students.");
        return;
      }

      if (!normalizedSection) {
        setFormError("Section is required for students.");
        return;
      }
    }

    const nextUser = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: normalizedName,
      schoolId: normalizedSchoolId,
      position: form.position,
      year: normalizedYear,
      section: normalizedSection,
    };

    const nextUsers = [nextUser, ...users];
    setSaving(true);
    setFormError("");

    try {
      setUsers(nextUsers);
      await upsertBorrowerUsersToDb(nextUsers);
      const dbUsers = await getBorrowerAllowlistFromDb(nextUsers);
      setUsers(dbUsers);
      toast.success("Borrower added successfully.");
      closeModal();
    } catch (error) {
      setFormError(error?.message || "Unable to save borrower. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const promptDeleteUser = (userId) => {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;
    setDeleteTarget(targetUser);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const userId = deleteTarget.id;
    const targetUser = deleteTarget;
    setDeletingUserId(userId);
    const originalUsers = users;
    const nextUsers = users.filter((user) => user.id !== userId);
    setUsers(nextUsers);
    setDeleteTarget(null);

    try {
      await deleteBorrowerUserFromDb(targetUser.schoolId);
      toast.success("Borrower removed successfully.");
    } catch (error) {
      setUsers(originalUsers);
      toast.error("Unable to delete borrower. Please try again.");
    } finally {
      setDeletingUserId("");
    }
  };

  const handleImportStart = () => {
    setImportMessage("");
    setShowImporterModal(true);
  };

  const handleImporterSave = (activeSections = []) => {
    try {
      const sections = Array.isArray(activeSections) ? activeSections : [];
      const importedUsers = sections.flatMap((section = {}) => {
        const headers = Array.isArray(section.headers) ? section.headers : [];
        const rows = Array.isArray(section.rows) ? section.rows : [];

        return rows
          .map((row = []) => {
            const rowData = headers.reduce((accumulator, header, index) => {
              accumulator[header] = row[index];
              return accumulator;
            }, {});

            return normalizeUserRecord({
              id: undefined,
              name: getSheetValue(rowData, ["name", "full_name", "student_name", "borrower_name"]),
              schoolId: getSheetValue(rowData, ["schoolId", "school_id", "schoolid", "school id", "student_id", "id_number"]),
              position: getSheetValue(rowData, ["position", "role", "type"]),
              year: getSheetValue(rowData, ["year", "year_level", "grade", "level"]),
              section: getSheetValue(rowData, ["section", "section_name", "class_section"]),
            });
          })
          .filter((user) => user.name && user.schoolId)
          .filter((user) => SCHOOL_ID_PATTERN.test(user.schoolId));
      });

      if (importedUsers.length === 0) {
        throw new Error("No valid borrower rows were found in the selected file.");
      }

      const dedupedUsers = importedUsers.filter((user, index, list) => {
        const existing = list.findIndex((candidate) => candidate.schoolId && candidate.schoolId === user.schoolId);
        return index === existing;
      });

      const nextUsers = [...dedupedUsers, ...users];
      setUsers(nextUsers);
      void upsertBorrowerUsersToDb(nextUsers).then(() => {
        getBorrowerAllowlistFromDb(nextUsers).then((dbUsers) => {
          setUsers(dbUsers);
        });
      });
      setImportMessage(`Imported ${dedupedUsers.length} borrower${dedupedUsers.length === 1 ? "" : "s"}.`);
      setShowImporterModal(false);
    } catch (error) {
      setImportMessage(error?.message || "Unable to import the selected file.");
      setShowImporterModal(false);
    }
  };

  const handleExport = () => {
    const exportRows = users.map((user) => ({
      name: user.name,
      school_id: user.schoolId,
      position: user.position,
      year: user.year,
      section: user.section,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Student Directory");
    XLSX.writeFile(workbook, `student-directory-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleImportStart}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#651717]"
            >
              <Plus className="h-4 w-4" />
              Add Borrower
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name, school ID, section..."
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={roleFilter || "__ALL__"} onValueChange={(v) => setRoleFilter(v === "__ALL__" ? "" : v)}>
            <SelectTrigger
              className={"h-9 w-full sm:w-48 rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-600 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"}
            >
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">All</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="faculty">Teacher</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {importMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {importMessage}
          </div>
        ) : null}
      </>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity duration-300">
        <div className="overflow-x-auto">
          <table className="w-full transition-opacity duration-300">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  "Name",
                  "School ID",
                  "Position",
                  "Year",
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide${h === "Position" ? " w-[120px]" : ""}`}
                  >
                    {h}
                  </th>
                ))}
                <th className="pl-0 pr-0.5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-10 text-center text-sm text-slate-500">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <FileSpreadsheet className="h-10 w-10 text-slate-300" />
                      <p>No borrowers yet. Add a borrower manually or import a spreadsheet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className={`transition-colors hover:bg-slate-50`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 bg-slate-300 text-slate-700`}>
                          {user.name?.[0]}
                        </div>
                        <div>
                          <p className={`text-sm font-medium text-slate-900`}>{user.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-slate-600`}>{user.schoolId}</td>
                    <td className="px-4 py-3 w-[120px]">
                      <span
                        className={`inline-flex w-[100px] justify-center text-xs font-semibold px-2 py-1 rounded-md border ${
                          user.position === "faculty"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {user.position === "faculty" ? "Teacher" : "Student"}
                      </span>
                    </td>
                    <td className="pl-0 pr-0.5 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => promptDeleteUser(user.id)}
                          disabled={deletingUserId === user.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${user.name}`}
                        >
                          {deletingUserId === user.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showImporterModal} onOpenChange={(next) => !next && setShowImporterModal(false)}>
        <DialogContent
          className="flex max-h-[85vh] max-w-6xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">Import borrower allowlist</DialogTitle>
            <DialogDescription className="mt-1 text-sm">Upload a CSV or Excel file and review the rows before saving them to the allowlist.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
            <SmartImporter onSave={handleImporterSave} onCancel={() => setShowImporterModal(false)} />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
            <Button type="button" onClick={() => setShowImporterModal(false)} variant="outline" size="sm" className="rounded-lg">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={(next) => !next && closeModal()}>
        <DialogContent
          className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">Add new borrower</DialogTitle>
            <DialogDescription className="mt-1 text-sm">Fill in the details for the student or faculty member who may borrow publicly.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
            {formError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Juan Dela Cruz"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">School ID</label>
                  <Input
                    value={form.schoolId}
                    onChange={(event) => setForm((current) => ({ ...current, schoolId: formatSchoolId(event.target.value) }))}
                    placeholder="26-00123"
                    maxLength={8}
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">Format must be 26-00123.</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Position</label>
                  <Select value={form.position} onValueChange={(v) => setForm((c) => ({ ...c, position: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="faculty">Teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.position === "student" ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Year</label>
                    <Select value={form.year || "__NONE__"} onValueChange={(v) => setForm((c) => ({ ...c, year: v === "__NONE__" ? "" : v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">Select year</SelectItem>
                        <SelectItem value="1st">1st</SelectItem>
                        <SelectItem value="2nd">2nd</SelectItem>
                        <SelectItem value="3rd">3rd</SelectItem>
                        <SelectItem value="4th">4th</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {form.position === "student" ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Section</label>
                  <Input
                    value={form.section}
                    onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))}
                    placeholder="STEM 11-A"
                    required={form.position === "student"}
                  />
                </div>
              ) : null}

              <div className="mt-2" />
            </form>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
            <Button type="button" onClick={closeModal} variant="outline" size="sm" className="rounded-lg">Cancel</Button>
            <Button type="button" onClick={() => document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))} size="sm" className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]">{saving ? "Saving..." : "Save Borrower"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete borrower</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this borrower from the allowlist?
            </AlertDialogDescription>
          </AlertDialogHeader>

          

          <AlertDialogFooter className="gap-3 sm:gap-4 px-4 py-4">
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete borrower</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
