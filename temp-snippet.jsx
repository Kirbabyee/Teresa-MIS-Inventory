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
