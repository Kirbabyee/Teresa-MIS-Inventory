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
