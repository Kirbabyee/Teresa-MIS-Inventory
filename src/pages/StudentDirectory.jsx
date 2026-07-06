import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  FileSpreadsheet,
  Edit,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Trash2,
  UserCheck,
  UserX,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteBorrowerUserFromDb,
  getBorrowerAllowlistFromDb,
  normalizeUserRecord,
  readStoredBorrowerUsers,
  setBorrowerUserActiveInDb,
  updateBorrowerUserInDb,
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

const defaultBorrowerStatus = true;
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

const buildDuplicatePreview = (importedUsers = [], existingUsers = []) => {
  const existingBySchoolId = new Map(
    (existingUsers || [])
      .filter((user) => user?.schoolId)
      .map((user) => [user.schoolId, user])
  );
  const importCounts = (importedUsers || []).reduce((accumulator, user) => {
    const schoolId = user?.schoolId;
    if (schoolId) {
      accumulator[schoolId] = (accumulator[schoolId] || 0) + 1;
    }
    return accumulator;
  }, {});

  const previewEntries = (importedUsers || []).flatMap((user, index) => {
    const schoolId = user?.schoolId;
    if (!schoolId) return [];

    const duplicateInImport = (importCounts[schoolId] || 0) > 1;
    const existingUser = existingBySchoolId.get(schoolId);

    if (!duplicateInImport && !existingUser) return [];

    return [
      {
        id: `${schoolId}-${index}`,
        sourceIndex: index,
        name: user?.name || `Borrower ${index + 1}`,
        originalSchoolId: schoolId,
        editedSchoolId: schoolId,
        reason: existingUser
          ? duplicateInImport
            ? "already in allowlist and repeated in import"
            : "already in allowlist"
          : "repeated in import",
        existingName: existingUser?.name || "",
      },
    ];
  });

  return previewEntries.sort((left, right) => left.originalSchoolId.localeCompare(right.originalSchoolId));
};

const sortBorrowersByStatus = (items = []) => {
  return [...items].sort((left, right) => {
    const leftInactive = left?.isActive === false ? 1 : 0;
    const rightInactive = right?.isActive === false ? 1 : 0;
    return leftInactive - rightInactive;
  });
};

export default function StudentDirectory() {
  const [users, setUsers] = useState(readStoredBorrowerUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 7;
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [duplicatePreview, setDuplicatePreview] = useState([]);
  const [pendingImportedUsers, setPendingImportedUsers] = useState([]);
  const [showImporterModal, setShowImporterModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      const dbUsers = await getBorrowerAllowlistFromDb(users, { includeInactive: true });
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

    return sortBorrowersByStatus(users).filter((user) => {
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

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(pageStartIndex, pageEndIndex);

  const visiblePageNumbers = (() => {
    const maxVisible = 3;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const offset = Math.min(Math.max(page - 2, 0), totalPages - maxVisible);
    const startPage = offset + 1;
    return Array.from({ length: maxVisible }, (_, index) => startPage + index);
  })();

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const resetForm = () => {
    setForm(emptyForm);
    setFormError("");
    setEditingUser(null);
  };

  const openModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setForm({
        name: user.name || "",
        schoolId: user.schoolId || "",
        position: user.position || "student",
        year: user.year || "",
        section: user.section || "",
      });
      setFormError("");
    } else {
      resetForm();
    }
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
    const currentEditingId = editingUser?.id || "";

    if (!normalizedName) {
      setFormError("Name is required.");
      return;
    }

    if (!SCHOOL_ID_PATTERN.test(normalizedSchoolId)) {
      setFormError("School ID must follow the format 26-00123.");
      return;
    }

    const existingBorrower = users.some((user) => user.schoolId === normalizedSchoolId && user.id !== currentEditingId);
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
      id: editingUser?.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: normalizedName,
      schoolId: normalizedSchoolId,
      position: form.position,
      year: normalizedYear,
      section: normalizedSection,
      isActive: editingUser?.isActive ?? defaultBorrowerStatus,
    };

    const nextUsers = editingUser
      ? users.map((user) => (user.id === editingUser.id ? nextUser : user))
      : [nextUser, ...users];
    setSaving(true);
    setFormError("");

    try {
      setUsers(nextUsers);
      if (editingUser) {
        await updateBorrowerUserInDb(nextUser);
      } else {
        await upsertBorrowerUsersToDb(nextUsers);
      }
      const dbUsers = await getBorrowerAllowlistFromDb(nextUsers, { includeInactive: true });
      setUsers(dbUsers);
      toast.success(editingUser ? "Borrower updated successfully." : "Borrower added successfully.");
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

  const promptStatusChange = (userId) => {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;
    setStatusTarget(targetUser);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const cancelStatusChange = () => {
    setStatusTarget(null);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;

    const userId = statusTarget.id;
    const targetUser = statusTarget;
    const wasActive = targetUser.isActive !== false;
    const nextIsActive = !wasActive;
    setStatusChanging(true);
    const originalUsers = users;
    const nextUsers = users.map((user) =>
      user.id === userId ? { ...user, isActive: nextIsActive } : user
    );
    setUsers(nextUsers);
    setStatusTarget(null);

    try {
      await setBorrowerUserActiveInDb(targetUser.schoolId, nextIsActive);
      const dbUsers = await getBorrowerAllowlistFromDb(nextUsers, { includeInactive: true });
      setUsers(dbUsers);
      toast.success(
        nextIsActive
          ? "Borrower reactivated successfully."
          : "Borrower deactivated successfully."
      );
    } catch (error) {
      setUsers(originalUsers);
      toast.error(`Unable to ${nextIsActive ? "reactivate" : "deactivate"} borrower. Please try again.`);
    } finally {
      setStatusChanging(false);
    }
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
    setDuplicatePreview([]);
    setPendingImportedUsers([]);
    setShowDuplicateModal(false);
    setShowImporterModal(true);
  };

  const handleDuplicateSchoolIdChange = (entryId, nextValue) => {
    setDuplicatePreview((currentPreview) =>
      currentPreview.map((entry) => (entry.id === entryId ? { ...entry, editedSchoolId: nextValue } : entry))
    );
  };

  const applyEditedImport = async (importedUsers = []) => {
    const previewWithEdits = duplicatePreview.map((entry) => ({
      ...entry,
      editedSchoolId: entry.editedSchoolId ?? entry.schoolId,
    }));

    const importedUsersWithEdits = (importedUsers || []).map((user, index) => {
      const duplicateEntry = previewWithEdits.find((entry) => entry.sourceIndex === index);
      const editedSchoolId = duplicateEntry?.editedSchoolId?.trim();
      return {
        ...user,
        schoolId: editedSchoolId && editedSchoolId !== user.schoolId ? editedSchoolId : user.schoolId,
      };
    });

    const normalizedImportedUsers = importedUsersWithEdits
      .map((user) => normalizeUserRecord(user))
      .filter((user) => user.name && user.schoolId && SCHOOL_ID_PATTERN.test(user.schoolId));

    const existingSchoolIds = new Set((users || []).map((user) => user.schoolId));
    const schoolIdCounts = normalizedImportedUsers.reduce((accumulator, user) => {
      const schoolId = user.schoolId;
      if (schoolId) {
        accumulator[schoolId] = (accumulator[schoolId] || 0) + 1;
      }
      return accumulator;
    }, {});
    const duplicateSchoolIds = new Set(
      Object.entries(schoolIdCounts)
        .filter(([, count]) => count > 1)
        .map(([schoolId]) => schoolId)
    );

    const safeImportedUsers = normalizedImportedUsers.filter(
      (user) => !duplicateSchoolIds.has(user.schoolId) && !existingSchoolIds.has(user.schoolId)
    );
    const nextUsers = [...safeImportedUsers, ...users];
    const nextDuplicatePreview = buildDuplicatePreview(normalizedImportedUsers, users);

    setDuplicatePreview(nextDuplicatePreview);
    setPendingImportedUsers([]);
    setShowDuplicateModal(false);
    setUsers(nextUsers);

    if (safeImportedUsers.length > 0) {
      await upsertBorrowerUsersToDb(nextUsers);
      const dbUsers = await getBorrowerAllowlistFromDb(nextUsers, { includeInactive: true });
      setUsers(dbUsers);
    }

    if (nextDuplicatePreview.length > 0) {
      setImportMessage(`Imported ${safeImportedUsers.length} borrower${safeImportedUsers.length === 1 ? "" : "s"}. ${nextDuplicatePreview.length} duplicate school ID${nextDuplicatePreview.length === 1 ? "" : "s"} were skipped.`);
    } else {
      setImportMessage(`Imported ${safeImportedUsers.length} borrower${safeImportedUsers.length === 1 ? "" : "s"}.`);
    }
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

      const nextDuplicatePreview = buildDuplicatePreview(importedUsers, users);
      setPendingImportedUsers(importedUsers);
      setDuplicatePreview(nextDuplicatePreview);

      if (nextDuplicatePreview.length > 0) {
        setImportMessage("Duplicate school IDs were detected. Review the affected rows below to continue importing the rest.");
        setShowDuplicateModal(true);
        setShowImporterModal(false);
        return;
      }

      void applyEditedImport(importedUsers);
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
      is_active: user.isActive !== false,
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

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name, school ID, section..."
              className="pl-9 bg-white min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={roleFilter || "__ALL__"} onValueChange={(v) => setRoleFilter(v === "__ALL__" ? "" : v)}>
            <SelectTrigger
              className={"h-9 w-full sm:w-48 rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-600 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-shrink-0"}
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
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide${h === "Position" ? " w-[120px]" : ""}`}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
                paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`transition-colors ${user.isActive === false ? "bg-slate-100 text-slate-400 opacity-75 grayscale" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${user.isActive === false ? "bg-slate-200 text-slate-400" : "bg-slate-300 text-slate-700"}`}>
                          {user.name?.[0]}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${user.isActive === false ? "text-slate-500" : "text-slate-900"}`}>{user.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${user.isActive === false ? "text-slate-400" : "text-slate-600"}`}>{user.schoolId}</td>
                    <td className="px-4 py-3 w-[120px]">
                      <span
                        className={`inline-flex w-[100px] justify-center text-xs font-semibold px-2 py-1 rounded-md border ${
                          user.position === "faculty"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {user.position === "faculty" ? "Faculty" : "Student"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Open actions for ${user.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => openModal(user)}>
                              <Edit className="h-4 w-4" />
                              Edit borrower
                            </DropdownMenuItem>

                            <DropdownMenuItem onSelect={() => promptStatusChange(user.id)}>
                              {user.isActive === false ? (
                                <UserCheck className="h-4 w-4" />
                              ) : (
                                <UserX className="h-4 w-4" />
                              )}
                              {user.isActive === false ? "Reactivate borrower" : "Deactivate borrower"}
                            </DropdownMenuItem>

                            {user.isActive === false ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => promptDeleteUser(user.id)}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                  disabled={deletingUserId === user.id}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {deletingUserId === user.id ? "Deleting..." : "Delete borrower"}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredUsers.length > 0 ? (
          <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
            <div className="text-sm text-slate-500">
              Showing {Math.min(pageStartIndex + 1, filteredUsers.length)}–{Math.min(pageEndIndex, filteredUsers.length)} of {filteredUsers.length}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {visiblePageNumbers.map((pageNumber) => {
                const isActive = page === pageNumber;
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={isActive ? "rounded-md px-3 py-1 text-sm transition bg-[#4a1111] text-primary-foreground" : "rounded-md px-3 py-1 text-sm transition text-foreground hover:bg-accent hover:text-accent-foreground"}
                  >
                    {pageNumber}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || totalPages === 0}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
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

      <Dialog open={showDuplicateModal} onOpenChange={(next) => {
        if (!next) {
          setShowDuplicateModal(false);
          if (pendingImportedUsers.length > 0) {
            void applyEditedImport(pendingImportedUsers);
          }
        }
      }}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">Review duplicate school IDs</DialogTitle>
            <DialogDescription className="mt-1 text-sm">Only the conflicting rows below need attention. The other imported borrowers will be saved automatically.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5 sm:px-8">
            {duplicatePreview.length === 0 ? (
              <p className="text-sm text-slate-500">No duplicate school IDs need review.</p>
            ) : (
              duplicatePreview.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{entry.name}</p>
                      <p className="text-xs text-amber-700">
                        Current ID: {entry.originalSchoolId}
                        {entry.existingName ? ` · Existing borrower: ${entry.existingName}` : ""}
                        {` · ${entry.reason}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-amber-800">Edit ID</label>
                      <Input
                        value={entry.editedSchoolId ?? entry.originalSchoolId}
                        onChange={(event) => handleDuplicateSchoolIdChange(entry.id, event.target.value)}
                        className="h-8 w-28 border-amber-200 bg-white"
                        placeholder="26-00123"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
            <Button type="button" onClick={() => {
              setShowDuplicateModal(false);
              if (pendingImportedUsers.length > 0) {
                void applyEditedImport(pendingImportedUsers);
              }
            }} variant="outline" size="sm" className="rounded-lg">Import the rest</Button>
            <Button type="button" onClick={() => void applyEditedImport(pendingImportedUsers)} size="sm" className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]">Apply fixes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={(next) => !next && closeModal()}>
        <DialogContent
          className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {editingUser ? "Edit borrower" : "Add new borrower"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              {editingUser
                ? "Update the details for this borrower."
                : "Fill in the details for the student or faculty member who may borrow publicly."}
            </DialogDescription>
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
                      <SelectItem value="faculty">Faculty</SelectItem>
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
            <Button type="button" onClick={() => document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))} size="sm" className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]">{saving ? "Saving..." : editingUser ? "Update Borrower" : "Save Borrower"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open && !statusChanging) cancelStatusChange();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive === false ? "Reactivate Borrower" : "Deactivate Borrower"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.isActive === false
                ? `Reactivate ${statusTarget?.name || "this borrower"}'s account so they can borrow again.`
                : `Deactivate ${statusTarget?.name || "this borrower"}'s account? They will no longer be able to borrow until reactivated.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusChanging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={statusChanging}
              className={statusTarget?.isActive === false ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
            >
              {statusChanging
                ? statusTarget?.isActive === false
                  ? "Reactivating..."
                  : "Deactivating..."
                : statusTarget?.isActive === false
                  ? "Reactivate"
                  : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingUserId) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Borrower</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Permanently delete the borrower record for ${deleteTarget.name || "this borrower"}? This action cannot be undone.`
                : "Delete this borrower?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingUserId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={Boolean(deletingUserId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingUserId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
