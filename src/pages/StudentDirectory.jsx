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

const formatSchoolId = (value = "") => {
  const digitsOnly = String(value).replace(/\D/g, "").slice(0, 7);
  if (digitsOnly.length <= 2) return digitsOnly;
  return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
};

const normalizeYear = (value = "") => String(value).trim();

const normalizeSection = (value = "") => String(value).trim();

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
  const [positionFilter, setPositionFilter] = useState("all");
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

      const matchesPosition = positionFilter === "all" || user.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [positionFilter, search, users]);

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
      <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#4a1111]/10 px-3 py-1 text-sm font-medium text-[#4a1111]">
              <Users className="h-4 w-4" />
              Borrower Allowlist
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Manage approved borrowers</h1>
            <p className="mt-2 text-sm text-slate-600">
              Add the students and faculty members who are allowed to borrow through the public borrowing form.
            </p>
          </div>

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
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, school ID, section..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-[#4a1111] focus:bg-white"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">Position</span>
            <select
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4a1111]"
            >
              <option value="all">All</option>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>
          </label>
        </div>

        {importMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {importMessage}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">School ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Position</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Year</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Section</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <FileSpreadsheet className="h-10 w-10 text-slate-300" />
                      <p>No borrowers yet. Add a borrower manually or import a spreadsheet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.schoolId}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          user.position === "faculty"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {user.position === "faculty" ? "Faculty" : "Student"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.year}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.section}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => promptDeleteUser(user.id)}
                        disabled={deletingUserId === user.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete ${user.name}`}
                      >
                        {deletingUserId === user.id ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImporterModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-6xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Import borrower allowlist</h2>
                <p className="mt-1 text-sm text-slate-600">Upload a CSV or Excel file and review the rows before saving them to the allowlist.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowImporterModal(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-6">
              <SmartImporter onSave={handleImporterSave} onCancel={() => setShowImporterModal(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Add new borrower</h2>
                <p className="mt-1 text-sm text-slate-600">Fill in the details for the student or faculty member who may borrow publicly.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {formError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="font-medium">Name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4a1111]"
                    placeholder="Juan Dela Cruz"
                    required
                  />
                </label>

                <label className="space-y-1 text-sm text-slate-700">
                  <span className="font-medium">School ID</span>
                  <input
                    value={form.schoolId}
                    onChange={(event) => setForm((current) => ({ ...current, schoolId: formatSchoolId(event.target.value) }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4a1111]"
                    placeholder="26-00123"
                    maxLength={8}
                    required
                  />
                  <p className="text-xs text-slate-500">Format must be 26-00123.</p>
                </label>

                <label className="space-y-1 text-sm text-slate-700">
                  <span className="font-medium">Position</span>
                  <select
                    value={form.position}
                    onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4a1111]"
                  >
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                  </select>
                </label>

                {form.position === "student" ? (
                  <label className="space-y-1 text-sm text-slate-700">
                    <span className="font-medium">Year</span>
                    <select
                      value={form.year}
                      onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4a1111]"
                      required={form.position === "student"}
                    >
                      <option value="">Select year</option>
                      <option value="1st">1st</option>
                      <option value="2nd">2nd</option>
                      <option value="3rd">3rd</option>
                      <option value="4th">4th</option>
                    </select>
                  </label>
                ) : null}
              </div>

              {form.position === "student" ? (
                <label className="block space-y-1 text-sm text-slate-700">
                  <span className="font-medium">Section</span>
                  <input
                    value={form.section}
                    onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#4a1111]"
                    placeholder="STEM 11-A"
                    required={form.position === "student"}
                  />
                </label>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651717] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Borrower"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Confirm deletion</h2>
                <p className="mt-1 text-sm text-slate-600">Are you sure you want to remove this borrower from the allowlist?</p>
              </div>
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Name:</span> {deleteTarget.name}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">School ID:</span> {deleteTarget.schoolId}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Delete borrower
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
