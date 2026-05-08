import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Edit, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteInventorySection,
  deleteInventoryTab,
  upsertInventorySection,
  upsertInventoryTab,
  useInventoryCatalog,
  callCreateInventoryTable,
  callModifyInventoryTable,
  upsertSetting,
  getInventoryCreateTableEndpoint,
  getInventoryModifyTableEndpoint,
  getTabTableConfig,
  slugify,
  makeUniqueSlug,
} from "@/lib/inventoryApi";
import { isCurrentUserAdmin } from "@/lib/inventoryApi";

const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

const sanitizeNameInput = (value = "") => String(value).replace(/[^a-zA-Z0-9 ]/g, "");
const hasOnlyLettersNumbers = (value = "") => /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9 ]+$/.test(String(value));

const normalizeColumnConfig = (column) => ({
  key: String(column?.key || "").trim(),
  label: String(column?.label || column?.key || "").trim(),
  data_type: String(column?.data_type || column?.type || "text").toLowerCase(),
  visible: column?.visible !== false,
  fieldType: String(column?.fieldType || "text").toLowerCase(),
  options: Array.isArray(column?.options) ? column.options.map((o) => String(o).trim()).filter((o) => o) : [],
  subColumns: Array.isArray(column?.subColumns)
    ? column.subColumns
        .filter((subColumn) => subColumn && subColumn.key)
        .map((subColumn) => ({
          key: String(subColumn.key).trim(),
          label: String(subColumn.label || subColumn.key).trim(),
          fieldType: String(subColumn?.fieldType || "text").toLowerCase(),
          options: Array.isArray(subColumn?.options) ? subColumn.options.map((o) => String(o).trim()).filter((o) => o) : [],
        }))
    : [],
});

const flattenColumnsForDDL = (columns) => {
  const flattened = [];
  for (const col of columns) {
    // Edge functions expect a flat list of { key, type }.
    // If sub-columns exist, we flatten them using the parent type.
    const colType = col.data_type || col.type || "text";
    if (Array.isArray(col.subColumns) && col.subColumns.length > 0) {
      for (const sub of col.subColumns) {
        flattened.push({
          key: `${col.key}_${sub.key}`,
          type: colType,
        });
      }
    } else {
      flattened.push({ key: col.key, type: colType });
    }
  }
  return flattened;
};

const hasNestedFields = (column) => Array.isArray(column?.subColumns) && column.subColumns.length > 0;

function ColumnRowModal({ column, onClose, onSave, existingColumns = [] }) {
  const labelToKey = (l) => l.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const initialSnapshotRef = useRef("");
  const [form, setForm] = useState({
    key: column?.key || "",
    label: column?.label || "",
    data_type: "text", // Data type is always text, not shown in frontend
    visible: column?.visible ?? true,
    fieldType: column?.fieldType || "text",
    options: column?.options || [],
    newOption: "",
    hasSubColumns: column?.subColumns && column.subColumns.length > 0,
    subColumns: column?.subColumns || [],
    newSubColLabel: "",
  });

  const buildColumnSnapshot = (currentForm) =>
    JSON.stringify({
      key: String(currentForm.key || ""),
      label: String(currentForm.label || ""),
      data_type: String(currentForm.data_type || "text"),
      visible: currentForm.visible !== false,
      fieldType: String(currentForm.fieldType || "text"),
      options: Array.isArray(currentForm.options) ? currentForm.options : [],
      newOption: String(currentForm.newOption || ""),
      hasSubColumns: Boolean(currentForm.hasSubColumns),
      subColumns: Array.isArray(currentForm.subColumns)
        ? currentForm.subColumns.map((subColumn) => ({
            key: String(subColumn?.key || ""),
            label: String(subColumn?.label || ""),
            fieldType: String(subColumn?.fieldType || "text"),
            options: Array.isArray(subColumn?.options) ? subColumn.options : [],
          }))
        : [],
      newSubColLabel: String(currentForm.newSubColLabel || ""),
    });

  const hasUnsavedChanges = initialSnapshotRef.current !== buildColumnSnapshot(form);

  useEffect(() => {
    const nextForm = {
      key: column?.key || "",
      label: column?.label || "",
      data_type: "text", // Data type is always text, not shown in frontend
      visible: column?.visible ?? true,
      fieldType: column?.fieldType || "text",
      options: column?.options || [],
      newOption: "",
      hasSubColumns: column?.subColumns && column.subColumns.length > 0,
      subColumns: column?.subColumns || [],
      newSubColLabel: "",
    };

    setForm(nextForm);
    initialSnapshotRef.current = buildColumnSnapshot(nextForm);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
  }, [column]);

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }

    onClose();
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const cancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  const saveColumn = async () => {
    await onSave(form);
  };

  const requestSave = () => {
    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    saveColumn();
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    await saveColumn();
  };

  const cancelSave = () => {
    setShowSaveConfirm(false);
  };

  const addSubColumn = (existingField) => {
    if (existingField) {
      if (form.subColumns.some((sc) => sc.key === existingField.key)) return;
      setForm((c) => ({
        ...c,
        subColumns: [...c.subColumns, { ...existingField }],
      }));
      return;
    }

    const label = form.newSubColLabel.trim();
    if (label) {
      const key = labelToKey(label);
      if (form.subColumns.some((sc) => sc.key === key)) return;

      setForm((c) => ({
        ...c,
        subColumns: [
          ...c.subColumns,
          { key, label, fieldType: "text", options: [] },
        ],
        newSubColLabel: "",
      }));
    }
  };

  const removeSubColumn = (subColKey) => {
    setForm((c) => ({
      ...c,
      subColumns: c.subColumns.filter((sc) => sc.key !== subColKey),
    }));
  };

  const existingFieldsLibrary = useMemo(() => {
    const fields = new Map();
    existingColumns.forEach((col) => {
      if (Array.isArray(col.subColumns)) {
        col.subColumns.forEach((sc) => {
          if (sc.key && sc.label) fields.set(sc.key, sc);
        });
      }
    });
    return Array.from(fields.values()).filter((f) => !form.subColumns.some((sc) => sc.key === f.key));
  }, [existingColumns, form.subColumns]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{column ? "Edit column" : "Add column"}</h3>
            <p className="text-sm text-slate-500">Define a custom column for this tab.</p>
          </div>
          <button type="button" onClick={requestClose} className={iconButtonClass} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Column Name</label>
            <Input
              className="mt-2"
              value={form.label}
              onChange={(e) => setForm((c) => ({ ...c, label: e.target.value, key: labelToKey(e.target.value) }))}
              placeholder="e.g., Keyboard, Mouse, Monitor, etc"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Field Type</label>
            <select
              className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={form.fieldType}
              onChange={(e) => setForm((c) => ({ ...c, fieldType: e.target.value }))}
            >
              <option value="text">Text Input</option>
              <option value="dropdown">Dropdown</option>
            </select>
          </div>

          {form.fieldType === "dropdown" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dropdown Options</label>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Enter option (e.g., Active, Inactive)"
                  value={form.newOption}
                  onChange={(e) => setForm((c) => ({ ...c, newOption: e.target.value }))}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = form.newOption.trim();
                    if (trimmed && !form.options.includes(trimmed)) {
                      setForm((c) => ({
                        ...c,
                        options: [...c.options, trimmed],
                        newOption: "",
                      }));
                    }
                  }}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Add
                </button>
              </div>
              {form.options.length > 0 && (
                <div className="mt-2 space-y-1">
                  {form.options.map((option) => (
                    <div key={option} className="flex items-center justify-between rounded bg-white px-2 py-1">
                      <span className="text-sm text-slate-700">{option}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((c) => ({
                            ...c,
                            options: c.options.filter((o) => o !== option),
                          }))
                        }
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <input
                type="checkbox"
                checked={form.hasSubColumns}
                onChange={(e) => setForm((c) => ({ ...c, hasSubColumns: e.target.checked }))}
              />
              Add sub fields
            </label>

            {form.hasSubColumns && (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Add new nested field</label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Field Name (e.g., Brand)"
                      value={form.newSubColLabel}
                      onChange={(e) => setForm((c) => ({ ...c, newSubColLabel: e.target.value }))}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => addSubColumn()}
                      className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {existingFieldsLibrary.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pick from existing fields</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {existingFieldsLibrary.map((field) => (
                        <button
                          key={field.key}
                          type="button"
                          onClick={() => addSubColumn(field)}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          + {field.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.subColumns.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nested fields</label>
                    <div className="mt-2 space-y-2">
                      {form.subColumns.map((subCol) => (
                        <div key={subCol.key} className="rounded bg-white p-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">{subCol.label}</span>
                            <button
                              type="button"
                              onClick={() => removeSubColumn(subCol.key)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-2 pl-2 border-l-2 border-slate-200">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Field Type</label>
                              <select
                                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                value={subCol.fieldType || "text"}
                                onChange={(e) =>
                                  setForm((c) => ({
                                    ...c,
                                    subColumns: c.subColumns.map((sc) =>
                                      sc.key === subCol.key ? { ...sc, fieldType: e.target.value, options: e.target.value === "dropdown" ? sc.options || [] : [] } : sc
                                    ),
                                  }))
                                }
                              >
                                <option value="text">Text Input</option>
                                <option value="dropdown">Dropdown</option>
                              </select>
                            </div>
                            {(subCol.fieldType === "dropdown" || (subCol.fieldType === undefined && subCol.options?.length > 0)) && (
                              <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dropdown Options</label>
                                <div className="mt-1 flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="Option"
                                    className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    id={`subcol-option-${subCol.key}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const input = document.getElementById(`subcol-option-${subCol.key}`);
                                      const trimmed = (input?.value || "").trim();
                                      if (trimmed && !(subCol.options || []).includes(trimmed)) {
                                        setForm((c) => ({
                                          ...c,
                                          subColumns: c.subColumns.map((sc) =>
                                            sc.key === subCol.key ? { ...sc, options: [...(sc.options || []), trimmed] } : sc
                                          ),
                                        }));
                                        if (input) input.value = "";
                                      }
                                    }}
                                    className="rounded-md bg-#4a1111 px-2 py-1 text-xs font-medium text-white hover:bg-#3f0f0f"
                                  >
                                    Add
                                  </button>
                                </div>
                                {(subCol.options || []).length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {(subCol.options || []).map((opt) => (
                                      <div key={opt} className="flex items-center justify-between rounded bg-slate-50 px-1 py-0.5">
                                        <span className="text-xs text-slate-600">{opt}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setForm((c) => ({
                                              ...c,
                                              subColumns: c.subColumns.map((sc) =>
                                                sc.key === subCol.key ? { ...sc, options: (sc.options || []).filter((o) => o !== opt) } : sc
                                              ),
                                            }))
                                          }
                                          className="text-red-500 hover:text-red-600"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={requestSave} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
            Save Column
          </button>
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Discard changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have unsaved changes. If you close now, those changes will be lost.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelDiscard} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Keep editing
              </button>
              <button type="button" onClick={confirmDiscard} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Save changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to save these changes?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelSave} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={confirmSave} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionModal({ section, onClose, onSave }) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const initialSnapshotRef = useRef("");
  const [form, setForm] = useState({
    name: section?.name || "",
    description: section?.description || "",
  });

  const sectionValidation = useMemo(() => {
    const errors = { name: "" };
    const trimmedName = String(form.name || "").trim();

    if (!trimmedName) {
      errors.name = "Section name is required.";
    } else if (!hasOnlyLettersNumbers(trimmedName)) {
      errors.name = "Section name may only contain letters, numbers, and spaces.";
    }

    return errors;
  }, [form.name]);

  const isSectionSaveDisabled = Boolean(sectionValidation.name);

  const buildSectionSnapshot = (currentForm) =>
    JSON.stringify({
      name: String(currentForm.name || ""),
      description: String(currentForm.description || ""),
    });

  const hasUnsavedChanges = initialSnapshotRef.current !== buildSectionSnapshot(form);

  useEffect(() => {
    const nextForm = {
      name: section?.name || "",
      description: section?.description || "",
    };

    setForm(nextForm);
    initialSnapshotRef.current = buildSectionSnapshot(nextForm);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
  }, [section]);

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }

    onClose();
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const cancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  const saveSection = async () => {
    await onSave(form);
  };

  const requestSave = () => {
    if (isSectionSaveDisabled) {
      return;
    }

    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    saveSection();
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    await saveSection();
  };

  const cancelSave = () => {
    setShowSaveConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{section ? "Edit section" : "Add section"}</h3>
            <p className="text-sm text-slate-500">Sections belong to a tab and hold the inventory items.</p>
          </div>
          <button type="button" onClick={requestClose} className={iconButtonClass} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Section name</label>
            <Input
              className="mt-2"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Laboratory 1"
            />
            {sectionValidation.name ? (
              <p className="mt-2 text-sm text-rose-600">{sectionValidation.name}</p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description</label>
            <Textarea
              className="mt-2 min-h-[110px]"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Optional description"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={isSectionSaveDisabled}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Section
          </button>
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Discard changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have unsaved changes. If you close now, those changes will be lost.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelDiscard} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Keep editing
              </button>
              <button type="button" onClick={confirmDiscard} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Save changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to save these changes?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelSave} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={confirmSave} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabModal({ tab, onClose, onSave }) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initialSnapshotRef = useRef("");
  const [tabForm, setTabForm] = useState({
    name: tab?.name || "",
    slug: tab?.slug || "",
    description: tab?.description || "",
  });
  const [sections, setSections] = useState(tab?.sections || []);
  const [columns, setColumns] = useState(tab?.columns || []);
  const [editingSectionIndex, setEditingSectionIndex] = useState(null);
  const [editingColumnIndex, setEditingColumnIndex] = useState(null);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [sectionToEdit, setSectionToEdit] = useState(null);
  const [columnToEdit, setColumnToEdit] = useState(null);

  const tabValidation = useMemo(() => {
    const errors = { name: "", columns: "", sections: "" };
    const trimmedName = tabForm.name.trim();

    if (!trimmedName) {
      errors.name = "Tab name is required.";
    } else if (!hasOnlyLettersNumbers(trimmedName)) {
      errors.name = "Tab name may only contain letters, numbers, and spaces.";
    }

    if (!tab?.id && columns.length === 0) {
      errors.columns = "New tabs must include at least one column.";
    }

    if (sections.length === 0) {
      errors.sections = "At least one section is required.";
    }

    return errors;
  }, [tabForm.name, columns, sections, tab?.id]);

  const isSaveDisabled = Boolean(tabValidation.name || tabValidation.columns || tabValidation.sections || isSaving);

  const buildTabSnapshot = (currentTabForm, currentSections, currentColumns) =>
    JSON.stringify({
      tabForm: {
        name: String(currentTabForm.name || ""),
        slug: String(currentTabForm.slug || ""),
        description: String(currentTabForm.description || ""),
      },
      sections: (currentSections || []).map((section) => ({
        id: section?.id || null,
        name: String(section?.name || ""),
        slug: String(section?.slug || ""),
        description: String(section?.description || ""),
      })),
      columns: (currentColumns || []).map((column) => {
        const normalized = normalizeColumnConfig(column);
        return {
          key: normalized.key,
          label: normalized.label,
          data_type: normalized.data_type,
          visible: normalized.visible,
          subColumns: (normalized.subColumns || []).map((subColumn) => ({
            key: String(subColumn?.key || ""),
            label: String(subColumn?.label || ""),
          })),
        };
      }),
    });

  const hasUnsavedChanges =
    initialSnapshotRef.current !== buildTabSnapshot(tabForm, sections, columns);

  useEffect(() => {
    const nextTabForm = {
      name: tab?.name || "",
      slug: tab?.slug || "",
      description: tab?.description || "",
    };
    const nextSections = tab?.sections || [];
    const nextColumns = tab?.id ? [] : tab?.columns || [];

    setTabForm(nextTabForm);
    setSections(nextSections);
    setColumns(nextColumns);
    setEditingSectionIndex(null);
    setEditingColumnIndex(null);
    setSectionToEdit(null);
    setColumnToEdit(null);
    setShowSectionModal(false);
    setShowColumnModal(false);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
    setHasUserInteracted(false);
    initialSnapshotRef.current = buildTabSnapshot(nextTabForm, nextSections, nextColumns);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    const loadTabConfig = async () => {
      if (!tab?.id) return;

      try {
        const config = await getTabTableConfig(tab.id);
        if (!cancelled && config?.columns) {
          setColumns((config.columns || []).filter((column) => column && column.key).map((column) => normalizeColumnConfig(column)));
        }
      } catch (error) {
        console.warn("Failed to load tab config:", error);
      }
    };

    loadTabConfig();

    return () => {
      cancelled = true;
    };
  }, [tab?.id]);

  const editSection = (index) => {
    const current = sections[index];
    if (!current) return;
    setEditingSectionIndex(index);
    setSectionToEdit(current);
    setShowSectionModal(true);
  };

  const deleteSection = (index) => {
    setSections((currentSections) => currentSections.filter((_, currentIndex) => currentIndex !== index));
    if (editingSectionIndex === index) setEditingSectionIndex(null);
  };

  const editColumn = (index) => {
    const current = columns[index];
    if (!current) return;
    setEditingColumnIndex(index);
    setColumnToEdit(current);
    setShowColumnModal(true);
  };

  const deleteColumn = (index) => {
    setColumns((currentColumns) => currentColumns.filter((_, currentIndex) => currentIndex !== index));
    if (editingColumnIndex === index) setEditingColumnIndex(null);
  };

  const saveSectionFromModal = async (sectionForm) => {
    const nextSection = {
      ...(sectionToEdit || {}),
      name: String(sectionForm.name || "").trim(),
      slug: slugify(sectionForm.name || ""),
      description: String(sectionForm.description || "").trim(),
    };

    setSections((currentSections) => {
      if (editingSectionIndex === null) return [...currentSections, nextSection];

      return currentSections.map((section, index) =>
        index === editingSectionIndex ? nextSection : section
      );
    });
    setErrors((current) => ({ ...current, sections: "" }));
    setShowSectionModal(false);
    setSectionToEdit(null);
    setEditingSectionIndex(null);
  };

  const saveColumnFromModal = async (columnForm) => {
    const normalizedColumn = normalizeColumnConfig({
      ...(columnToEdit || {}),
      ...columnForm,
      key: slugify(columnForm.label || "").replace(/-/g, "_"),
      label: String(columnForm.label || "").trim(),
      subColumns: (columnForm.subColumns || []).map((subColumn) => ({
        ...subColumn,
        key: slugify(subColumn.label || subColumn.key || "").replace(/-/g, "_"),
        label: String(subColumn.label || "").trim(),
      })),
    });

    setColumns((currentColumns) => {
      if (editingColumnIndex === null) return [...currentColumns, normalizedColumn];

      return currentColumns.map((column, index) =>
        index === editingColumnIndex ? normalizedColumn : column
      );
    });
    setErrors((current) => ({ ...current, columns: "" }));
    setShowColumnModal(false);
    setColumnToEdit(null);
    setEditingColumnIndex(null);
  };

  const handleSaveTab = () => {
    onSave({ ...tabForm, sections, columns });
  };

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }

    onClose();
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const cancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  const requestSave = () => {
    setHasUserInteracted(true);
    if (tabValidation.name || tabValidation.columns || tabValidation.sections) {
      return;
    }

    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    handleSaveTab();
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    setIsSaving(true);
    try {
      await handleSaveTab();
    } finally {
      setIsSaving(false);
    }
  };

  const cancelSave = () => {
    setShowSaveConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{tab ? "Edit inventory tab" : "Add inventory tab"}</h3>
          </div>
          <button type="button" onClick={requestClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tab name</label>
            <Input
              className="mt-2"
              value={tabForm.name}
              onChange={(event) => {
                setTabForm((current) => ({ ...current, name: event.target.value }));
                setHasUserInteracted(true);
              }}
              placeholder=""
            />
            {hasUserInteracted && tabValidation.name ? (
              <p className="mt-2 text-sm text-rose-600">{tabValidation.name}</p>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description (Optional)</label>
            <Textarea
              className="mt-2 min-h-[96px]"
              value={tabForm.description}
              onChange={(event) => setTabForm((current) => ({ ...current, description: event.target.value }))}
              placeholder=""
            />
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Sections</h4>
              {hasUserInteracted && tabValidation.sections ? (
                <p className="mt-1 text-sm text-rose-600">{tabValidation.sections}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setSectionToEdit(null);
                setEditingSectionIndex(null);
                setShowSectionModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#3f0f0f]"
            >
              <Plus className="h-4 w-4" />
              Add Section
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Section Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sections.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={3}>
                      Add atleast one or more sections.
                    </td>
                  </tr>
                ) : (
                  sections.map((currentSection, index) => (
                    <tr key={currentSection.id || currentSection.slug || index} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{currentSection.name}</td>
                      <td className="px-4 py-3 text-slate-600">{currentSection.description || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editSection(index)} className={iconButtonClass} title="Edit Section">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteSection(index)} className={iconButtonClass} title="Delete Section">
                            <Trash2 className="h-4 w-4 text-rose-500" />
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

        <div className="border-t border-slate-200 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Columns</h4>
              {hasUserInteracted && tabValidation.columns ? (
                <p className="mt-1 text-sm text-rose-600">{tabValidation.columns}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setColumnToEdit(null);
                setEditingColumnIndex(null);
                setShowColumnModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#3f0f0f]"
            >
              <Plus className="h-4 w-4" />
              Add Column
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                 
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {columns.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                       Add at least one column.
                    </td>
                  </tr>
                ) : (
                  columns.map((currentColumn, index) => (
                    <tr key={currentColumn.id || currentColumn.key || index} className="hover:bg-slate-50">          
                      <td className="px-4 py-3 text-slate-600">{currentColumn.label}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editColumn(index)} className={iconButtonClass} title="Edit Column">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteColumn(index)} className={iconButtonClass} title="Delete Column">
                            <Trash2 className="h-4 w-4 text-rose-500" />
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

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={isSaveDisabled}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Tab"}
          </button>
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Discard changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have unsaved changes. If you close now, those changes will be lost.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelDiscard} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Keep editing
              </button>
              <button type="button" onClick={confirmDiscard} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Save changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to save these changes?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelSave} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={confirmSave} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSectionModal && (
        <SectionModal
          section={sectionToEdit}
          onClose={() => {
            setShowSectionModal(false);
            setSectionToEdit(null);
            setEditingSectionIndex(null);
          }}
          onSave={(form) => {
            try {
              console.log("SectionModal onSave called with:", form);
              
              const name = form.name.trim();
              console.log("Section name:", name);
              
              if (!name) {
                console.warn("Section name is empty, returning");
                alert("Section name is required.");
                return;
              }

              setSections((currentSections) => {
                const currentSection = editingSectionIndex !== null ? currentSections[editingSectionIndex] : null;
                const nextSlug = makeUniqueSlug(
                  name,
                  currentSections.map((section) => section.slug),
                  currentSection?.slug || "",
                );

                const nextSection = currentSection
                  ? { ...currentSection, name, slug: nextSlug, description: form.description.trim() }
                  : { name, slug: nextSlug, description: form.description.trim() };

                const nextSections = [...currentSections];
                if (editingSectionIndex !== null && nextSections[editingSectionIndex]) {
                  console.log("Updating existing section at index:", editingSectionIndex);
                  nextSections[editingSectionIndex] = nextSection;
                } else {
                  console.log("Adding new section to sections array");
                  nextSections.push(nextSection);
                }

                console.log("Updated sections:", nextSections);
                return nextSections;
              });

              console.log("Section saved successfully, closing modal");
              setShowSectionModal(false);
              setSectionToEdit(null);
              setEditingSectionIndex(null);
            } catch (err) {
              console.error("Error saving section:", err);
              alert(`Error saving section: ${err.message}`);
            }
          }}
        />
      )}
      {showColumnModal && (
        <ColumnRowModal
          column={columnToEdit}
          existingColumns={columns}
          onClose={() => {
            setShowColumnModal(false);
            setColumnToEdit(null);
            setEditingColumnIndex(null);
          }}
          onSave={(colForm) => {
            try {
              console.log("ColumnRowModal onSave called with:", colForm);
              
              const label = (colForm.label || "").trim();
              console.log("Column label:", label);
              
              if (!label) {
                console.warn("Column label is empty, returning");
                alert("Column name is required.");
                return;
              }

              // Auto-generate key from label if not provided
              const labelToKey = (l) => l.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
              const key = labelToKey(label);
              console.log("Generated column key:", key);
              
              if (!key) {
                console.warn("Column key generated from label is invalid");
                alert("Column name contains only special characters. Please use alphanumeric characters.");
                return;
              }

              console.log("Normalizing column config...");
              const nextColumn = normalizeColumnConfig({ ...colForm, key, label });
              console.log("Normalized column:", nextColumn);

              setColumns((currentColumns) => {
                const next = [...currentColumns];
                if (editingColumnIndex !== null && next[editingColumnIndex]) {
                  console.log("Updating existing column at index:", editingColumnIndex);
                  next[editingColumnIndex] = nextColumn;
                } else {
                  console.log("Adding new column to columns array");
                  next.push(nextColumn);
                }
                console.log("Updated columns array:", next);
                return next;
              });

              console.log("Column saved successfully, closing modal");
              setShowColumnModal(false);
              setColumnToEdit(null);
              setEditingColumnIndex(null);
            } catch (err) {
              console.error("Error saving column:", err);
              alert(`Error saving column: ${err.message}`);
            }
          }}
        />
      )}
    </div>
  );
}

export default function Inventory() {
  const { tabs, loading, error, refetch } = useInventoryCatalog();
  const [showModal, setShowModal] = useState(false);
  const [editingSlug, setEditingSlug] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteTab, setPendingDeleteTab] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const editingTab = useMemo(() => tabs.find((tab) => tab.slug === editingSlug) || null, [tabs, editingSlug]);
  const ddlEndpoint = getInventoryCreateTableEndpoint();

  const handleSave = async (form) => {
    // Validate required fields
    if (!form.name || !form.name.trim()) {
      alert("Please enter a tab name.");
      return;
    }

    // For new tabs, require at least one column
    if (!editingTab && (!form.columns || form.columns.length === 0)) {
      alert("New tabs must have at least one column.");
      return;
    }

    const currentTab = editingTab;
    const savedTab = await upsertInventoryTab({
      id: currentTab?.id,
      name: form.name.trim(),
      slug: form.slug || form.name,
      description: form.description.trim(),
      sort_order: currentTab?.sort_order || tabs.length + 1,
    });

    const existingSections = currentTab?.sections || [];
    const keptSectionIds = [];

    for (let index = 0; index < form.sections.length; index += 1) {
      const section = form.sections[index];
      const savedSection = await upsertInventorySection({
        id: section.id,
        tabId: savedTab.id,
        name: section.name.trim(),
        slug: section.slug || section.name,
        description: section.description?.trim() || "",
        sort_order: index + 1,
      });
      keptSectionIds.push(savedSection.id);
    }

    for (const section of existingSections) {
      if (!keptSectionIds.includes(section.id)) {
        await deleteInventorySection(section.id);
      }
    }

    // Handle column modifications for existing tabs
    if (currentTab) {
      try {
        // Get the existing tab config to compare columns
        const existingConfig = await getTabTableConfig(currentTab.id);
        const updatedColumns = (form.columns || [])
          .filter((col) => col && col.key)
          .map((col) => normalizeColumnConfig(col));
        const tabConfig = { tableName: existingConfig?.tableName, columns: updatedColumns };

        const tableName = existingConfig?.tableName;
        if (tableName && updatedColumns.length > 0) {
          const modifyEndpoint = getInventoryModifyTableEndpoint();
          // Ensure columns are flattened for the SQL generation (DDL)
          const flattened = flattenColumnsForDDL(updatedColumns);
          console.log("Modifying table:", tableName, "with columns:", flattened);
          await callModifyInventoryTable(modifyEndpoint, tableName, "sync", flattened);
          console.log("Table columns modified successfully");
        }

        // Always persist the latest column config, including nested field metadata.
        try {
          window.localStorage.setItem(`inventory.tab_table.${currentTab.id}`, JSON.stringify(tabConfig));
          console.log("Tab config saved to localStorage");
        } catch (storageErr) {
          console.warn("Failed to update localStorage config:", storageErr);
        }

        try {
          const settingResult = await upsertSetting(`inventory.tab_table.${currentTab.id}`, tabConfig);
          console.log("Tab config persisted to inventory_settings:", settingResult);
        } catch (settingErr) {
          console.error("Failed to update inventory_settings config:", settingErr);
          alert(`Warning: Column config may not have saved. Error: ${settingErr.message}`);
        }
      } catch (err) {
        console.error("Failed to modify table columns:", err);
        alert(`Failed to modify table columns: ${err.message || err}`);
        refetch();
        return;
      }
    }

    // If creating a new tab, create the physical table and persist tab->table mapping
    if (!currentTab) {
      try {
        const tableName = `inventory_${String(savedTab.name || "tab")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_]+/g, "_")
          .replace(/^_+|_+$/g, "")}`;
        const cols = (form.columns || [])
          .filter((it) => it && it.key)
          .map((it) => normalizeColumnConfig(it));
        
        if (!cols || cols.length === 0) {
          throw new Error("No valid columns provided for table creation.");
        }

        const endpoint = ddlEndpoint;
        console.log("Creating inventory table:", tableName, "with columns:", cols);

        // Flatten columns so the Edge Function creates physical sub-columns in the DB
        const flattened = flattenColumnsForDDL(cols);
        console.log("Flattened columns for DDL:", flattened);
        
        await callCreateInventoryTable(endpoint, tableName, flattened);
        console.log("Physical table created successfully");

        // persist mapping and create-time template columns for this tab
        const tabConfig = { tableName, columns: cols };
        try {
          window.localStorage.setItem(`inventory.tab_table.${savedTab.id}`, JSON.stringify(tabConfig));
          console.log("Tab config saved to localStorage");
        } catch (storageError) {
          console.warn("Failed to write tab config to localStorage:", storageError);
        }

        try {
          const settingResult = await upsertSetting(`inventory.tab_table.${savedTab.id}`, tabConfig);
          console.log("Tab config persisted to inventory_settings:", settingResult);
        } catch (settingError) {
          console.error("Failed to persist tab config to inventory_settings:", settingError);
          // Don't rollback on settings error - the physical table was created successfully
          alert(`Warning: Table created but settings may not have saved. Error: ${settingError.message}`);
        }
      } catch (err) {
        // keep tab creation strict: rollback tab if physical table setup fails
        console.error("Table creation failed, rolling back:", err);
        try {
          await deleteInventoryTab(savedTab.id);
        } catch (rollbackError) {
          console.warn("Rollback failed after table creation error:", rollbackError);
        }

        console.warn("Failed to create physical table:", err);
        alert(`Tab creation failed: ${err.message || err}`);
        refetch();
        return;
      }
    }

    // Close modal and refresh only after all operations complete successfully
    setShowModal(false);
    setEditingSlug("");
    refetch();
  };

  const handleDelete = (tab) => {
    setPendingDeleteTab(tab);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteTab?.id) return;
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await deleteInventoryTab(pendingDeleteTab.id);
      setPendingDeleteTab(null);
      refetch();
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteTab(null);
  };

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const admin = await isCurrentUserAdmin();
        if (!cancelled) setIsAdmin(admin);
      } catch (err) {
        if (!cancelled) setIsAdmin(false);
      }
    };
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inventory tabs...</div>
      </div>
    );
  }

  return (
    <>
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Manager</h1>
          <p className="text-slate-500 text-sm">{tabs.length} total tabs</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="gap-2 bg-[#4a1111] hover:bg-[#3f0f0f]"
        >
          <Plus className="w-4 h-4" /> Add Tab
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Sections</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {tabs.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={4}>
                    No inventory tabs yet. Add Laboratory or any custom tab from the modal.
                  </td>
                </tr>
              ) : (
                tabs.map((tab) => (
                  <tr key={tab.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{tab.name}</td>
                    <td className="px-4 py-3 text-slate-600">{tab.description || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{tab.sections?.length || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/inventory/${tab.slug}${tab.sections?.[0]?.slug ? `?section=${tab.sections[0].slug}` : ""}`}
                          className={iconButtonClass}
                          title="Open Tab"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSlug(tab.slug);
                            setShowModal(true);
                          }}
                          className={iconButtonClass}
                          title="Edit Tab"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tab)}
                          className={iconButtonClass}
                          title="Delete Tab"
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
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

      {showModal && (
        <TabModal
          tab={editingTab}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Confirm delete</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete {pendingDeleteTab?.name || "this tab"}? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}