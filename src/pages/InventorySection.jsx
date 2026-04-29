import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Edit, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  upsertInventoryItem,
  useInventoryCatalog,
} from "@/lib/inventoryApi";

// Utility functions
const normalizeSubColumns = (subColumns = [], parentKey = "") => {
  if (!Array.isArray(subColumns)) {
    return [];
  }
  
  return subColumns
    .filter((subColumn) => subColumn && subColumn.key)
    .map((subColumn) => {
      const key = String(subColumn.key).trim();
      return {
        key,
        label: String(subColumn.label || subColumn.key).trim(),
        data_type: String(subColumn.data_type || subColumn.type || "text").toLowerCase(),
        physicalKey: `${parentKey}_${key}`,
      };
    })
    .filter((subColumn) => subColumn.key);
};

const normalizeTemplateColumns = (columns = []) => {
  if (!Array.isArray(columns)) {
    return [];
  }
  
  return columns
    .filter((column) => column && column.key)
    .map((column) => {
      const key = String(column.key).trim();
      return {
        key,
        label: String(column.label || column.key).trim(),
        data_type: String(column.data_type || column.type || "text").toLowerCase(),
        visible: column.visible !== false,
        subColumns: normalizeSubColumns(column.subColumns, key),
      };
    })
    .filter((column) => column.key);
};

const castValueByType = (value, dataType) => {
  if (dataType === "boolean" || dataType === "bool") {
    return Boolean(value);
  }

  if (dataType === "int" || dataType === "integer") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (dataType === "float" || dataType === "number" || dataType === "numeric") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (dataType === "date") {
    return value ? String(value) : null;
  }

  return value == null ? "" : String(value);
};

const formatCellValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const modalCloseButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

const legacyTableColumns = [
  { key: "computer_number", label: "Computer #" },
  { key: "type", label: "Type" },
  { key: "brand", label: "Brand" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
];

const componentRowPriority = ["brand", "description", "remarks", "status"];

const normalizeForMatch = (value = "") =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const numbersOnly = (value = "") => String(value).replace(/\D/g, "");

const isComputerIdentifierColumn = (column) => {
  const text = normalizeForMatch(`${column.key} ${column.label}`);
  return (
    !column.subColumns?.length &&
    /(computerno|computernumber|pcno|pcnumber|assetno|assetnumber)/.test(text)
  );
};

const isComputerNumberField = (field) => {
  const text = normalizeForMatch(`${field?.key || ""} ${field?.label || ""}`);
  return /(computerno|computernumber|pcno|pcnumber)/.test(text);
};

const getRowSortIndex = (field) => {
  const text = normalizeForMatch(`${field.key} ${field.label}`);
  const priorityIndex = componentRowPriority.findIndex((key) => text.includes(key));
  return priorityIndex === -1 ? componentRowPriority.length : priorityIndex;
};

// Item Modal Component
function ItemModal({ section, item, onClose, onSaved, tableName, templateColumns, existingItems = [] }) {
  const useTemplate = Array.isArray(templateColumns) && templateColumns.length > 0;
  const [legacyForm, setLegacyForm] = useState(() => ({
    computerNumber: item?.computer_number ?? "",
    type: item?.type || "",
    brand: item?.brand || "",
    description: item?.description || "",
    status: item?.status || "",
  }));
  const [dynamicForm, setDynamicForm] = useState({});
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const totalPages = 3;

  const templatePages = useMemo(() => {
    if (!useTemplate) return [];

    const totalInputs = templateColumns.reduce(
      (count, column) => count + (column.subColumns?.length || 1),
      0
    );
    const maxPerPage = Math.max(1, Math.ceil(totalInputs / totalPages));
    const pages = [];
    let current = [];
    let currentCount = 0;

    for (const column of templateColumns) {
      const columnInputs = column.subColumns?.length || 1;
      if (
        current.length > 0 &&
        currentCount + columnInputs > maxPerPage &&
        pages.length < totalPages - 1
      ) {
        pages.push(current);
        current = [];
        currentCount = 0;
      }
      current.push(column);
      currentCount += columnInputs;
    }

    pages.push(current);
    while (pages.length < totalPages) {
      pages.push([]);
    }

    return pages;
  }, [templateColumns, totalPages, useTemplate]);

  const currentTemplateColumns = useMemo(
    () => templatePages[step - 1] || templatePages[0] || [],
    [templatePages, step]
  );

  const legacyFormFields = [
    { key: "computerNumber", label: "Computer #", type: "number" },
    { key: "type", label: "Type", type: "text" },
    { key: "brand", label: "Brand", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const legacyPages = [
    ["computerNumber", "type"],
    ["brand", "status"],
    ["description"],
  ];

  const currentLegacyFields = legacyFormFields.filter((field) =>
    legacyPages[step - 1]?.includes(field.key)
  );

  const isNumberType = (type) =>
    ["int", "integer", "float", "number", "numeric"].includes(type);

  const getTemplateComputerColumn = (columns = templateColumns) =>
    columns.find((column) => isComputerNumberField(column)) || null;

  const hasDuplicateComputerNumber = (value, key) => {
    const cleanedValue = numbersOnly(value);
    if (!cleanedValue) return false;

    return existingItems.some((existingItem) => {
      if (!existingItem || existingItem.id === item?.id) return false;
      const existingValue = key
        ? existingItem?.[key]
        : existingItem?.computer_number ?? existingItem?.computerNumber;
      return numbersOnly(existingValue) === cleanedValue;
    });
  };

  const validateTemplateColumns = (columnsToValidate = templateColumns) => {
    const nextErrors = {};

    for (const column of columnsToValidate) {
      if (column.subColumns && column.subColumns.length > 0) {
        for (const subColumn of column.subColumns) {
          const value = dynamicForm[subColumn.physicalKey];
          const label = subColumn.label || subColumn.key;

          if (subColumn.data_type === "boolean" || subColumn.data_type === "bool") {
            continue;
          }

          if (value === undefined || value === null || String(value).trim() === "") {
            nextErrors[subColumn.physicalKey] = `${label} is required.`;
            continue;
          }

          if (isComputerNumberField(subColumn) && !/^\d+$/.test(String(value))) {
            nextErrors[subColumn.physicalKey] = `${label} must contain numbers only.`;
            continue;
          }

          if (isNumberType(subColumn.data_type) && Number.isNaN(Number(value))) {
            nextErrors[subColumn.physicalKey] = `${label} must be a valid number.`;
          }
        }
      } else {
        const value = dynamicForm[column.key];
        const label = column.label || column.key;

        if (column.data_type === "boolean" || column.data_type === "bool") {
          continue;
        }

        if (value === undefined || value === null || String(value).trim() === "") {
          nextErrors[column.key] = `${label} is required.`;
          continue;
        }

        if (isComputerNumberField(column) && !/^\d+$/.test(String(value))) {
          nextErrors[column.key] = `${label} must contain numbers only.`;
          continue;
        }

        if (isNumberType(column.data_type) && Number.isNaN(Number(value))) {
          nextErrors[column.key] = `${label} must be a valid number.`;
        }
      }
    }

    return nextErrors;
  };

  const validateLegacyFields = (fieldsToValidate = legacyFormFields) => {
    const nextErrors = {};

    for (const field of fieldsToValidate) {
      const value = legacyForm[field.key];
      if (field.key === "description") {
        if (!value || !String(value).trim()) {
          nextErrors.description = "Description is required.";
        }
        continue;
      }

      if (!value || String(value).trim() === "") {
        nextErrors[field.key] = `${field.label} is required.`;
        continue;
      }

      if (field.key === "computerNumber" && !/^\d+$/.test(String(value))) {
        nextErrors[field.key] = `${field.label} must contain numbers only.`;
      }
    }

    return nextErrors;
  };

  const validateStep = (validateAll = false) => {
    const nextErrors = useTemplate
      ? validateTemplateColumns(validateAll ? templateColumns : currentTemplateColumns)
      : validateLegacyFields(validateAll ? legacyFormFields : currentLegacyFields);

    if (useTemplate) {
      const computerColumn = getTemplateComputerColumn(
        validateAll ? templateColumns : currentTemplateColumns
      );
      if (computerColumn) {
        const value = dynamicForm[computerColumn.key];
        if (
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "" &&
          hasDuplicateComputerNumber(value, computerColumn.key)
        ) {
          nextErrors[computerColumn.key] = `${computerColumn.label} already exists in this section.`;
        }
      }
    } else {
      const shouldValidateComputerNumber =
        validateAll || currentLegacyFields.some((field) => field.key === "computerNumber");
      if (
        shouldValidateComputerNumber &&
        legacyForm.computerNumber &&
        hasDuplicateComputerNumber(legacyForm.computerNumber)
      ) {
        nextErrors.computerNumber = "Computer # already exists in this section.";
      }
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  useEffect(() => {
    if (useTemplate) {
      const nextForm = {};
      for (const column of templateColumns) {
        if (column.subColumns && column.subColumns.length > 0) {
          for (const subColumn of column.subColumns) {
            nextForm[subColumn.physicalKey] = item?.[subColumn.physicalKey] ?? "";
          }
        } else {
          nextForm[column.key] = item?.[column.key] ?? "";
        }
      }
      setDynamicForm(nextForm);
      setErrors({});
      setStep(1);
      return;
    }

    setLegacyForm({
      computerNumber: item?.computer_number ?? "",
      type: item?.type || "",
      brand: item?.brand || "",
      description: item?.description || "",
      status: item?.status || "",
    });
    setErrors({});
  }, [item, templateColumns, useTemplate]);

  const requestSave = () => {
    const nextErrors = validateStep(true);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (useTemplate) {
      if (!tableName) {
        throw new Error("Physical table is not ready yet. Please wait for the table mapping to load.");
      }
    }

    setShowSaveConfirm(true);
  };

  const save = async () => {
    setSaving(true);

    try {
      if (useTemplate) {
        const recordData = {};
        for (const column of templateColumns) {
          if (column.subColumns && column.subColumns.length > 0) {
            for (const subColumn of column.subColumns) {
              recordData[subColumn.physicalKey] = castValueByType(
                dynamicForm[subColumn.physicalKey],
                subColumn.data_type
              );
            }
          } else {
            recordData[column.key] = castValueByType(dynamicForm[column.key], column.data_type);
          }
        }

        await upsertInventoryItem({
          id: item?.id,
          sectionId: section.id,
          tableName,
          recordData,
        });
        setShowSaveConfirm(false);
        onSaved();
        return;
      }

      await upsertInventoryItem({
        id: item?.id,
        sectionId: section.id,
        computerNumber: Number(legacyForm.computerNumber || 0),
        type: legacyForm.type,
        brand: legacyForm.brand.trim(),
        description: legacyForm.description.trim(),
        status: legacyForm.status.trim(),
        tableName,
      });
      setShowSaveConfirm(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {item ? "Edit item" : "Add item"}
                </h3>
                <p className="text-sm text-slate-500">
                  {useTemplate
                    ? "This form follows the tab template columns."
                    : "This matches the legacy laboratory component flow."}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                Page {step} of {totalPages}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={modalCloseButtonClass}
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          {useTemplate ? (
            currentTemplateColumns.map((column) =>
              column.subColumns && column.subColumns.length > 0 ? (
                <div
                  key={column.key}
                  className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <h4 className="text-sm font-semibold text-slate-700">
                    {column.label}
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    {column.subColumns.map((subColumn) => (
                      <div key={subColumn.physicalKey}>
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {subColumn.label}
                        </label>
                        <Input
                          className="mt-2"
                          type={
                            isComputerNumberField(subColumn)
                              ? "text"
                              : subColumn.data_type === "date"
                              ? "date"
                              : ["int", "integer", "float", "number", "numeric"].includes(
                                  subColumn.data_type
                                )
                              ? "number"
                              : "text"
                          }
                          inputMode={isComputerNumberField(subColumn) ? "numeric" : undefined}
                          pattern={isComputerNumberField(subColumn) ? "[0-9]*" : undefined}
                          value={dynamicForm[subColumn.physicalKey] ?? ""}
                          onChange={(event) => {
                            const nextValue = isComputerNumberField(subColumn)
                              ? numbersOnly(event.target.value)
                              : event.target.value;
                            setDynamicForm((current) => ({
                              ...current,
                              [subColumn.physicalKey]: nextValue,
                            }));
                            setErrors((current) => ({
                              ...current,
                              [subColumn.physicalKey]: undefined,
                            }));
                          }}
                        />
                        {errors[subColumn.physicalKey] ? (
                          <p className="mt-1 text-xs text-rose-600">
                            {errors[subColumn.physicalKey]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  key={column.key}
                  className={column.data_type === "text" ? "md:col-span-2" : ""}
                >
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {column.label}
                  </label>
                  {column.data_type === "boolean" || column.data_type === "bool" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(dynamicForm[column.key])}
                        onChange={(event) =>
                          setDynamicForm((current) => ({
                            ...current,
                            [column.key]: event.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-slate-600">
                        {dynamicForm[column.key] ? "True" : "False"}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Input
                        className="w-full"
                        type={
                          isComputerNumberField(column)
                            ? "text"
                            : column.data_type === "date"
                            ? "date"
                            : ["int", "integer", "float", "number", "numeric"].includes(
                                column.data_type
                              )
                            ? "number"
                            : "text"
                        }
                        inputMode={isComputerNumberField(column) ? "numeric" : undefined}
                        pattern={isComputerNumberField(column) ? "[0-9]*" : undefined}
                        value={dynamicForm[column.key] ?? ""}
                        onChange={(event) => {
                          const nextValue = isComputerNumberField(column)
                            ? numbersOnly(event.target.value)
                            : event.target.value;
                          setDynamicForm((current) => ({
                            ...current,
                            [column.key]: nextValue,
                          }));
                          setErrors((current) => ({
                            ...current,
                            [column.key]: undefined,
                          }));
                        }}
                      />
                      {errors[column.key] ? (
                        <p className="mt-1 text-xs text-rose-600">
                          {errors[column.key]}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            )
          ) : (
            currentLegacyFields.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <Textarea
                    className="mt-2 min-h-[120px]"
                    value={legacyForm.description}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setLegacyForm((current) => ({
                        ...current,
                        description: nextValue,
                      }));
                      setErrors((current) => ({
                        ...current,
                        description: undefined,
                      }));
                    }}
                  />
                ) : (
                  <Input
                    className="mt-2"
                    type={field.key === "computerNumber" ? "text" : field.type}
                    min={field.type === "number" ? "1" : undefined}
                    inputMode={field.key === "computerNumber" ? "numeric" : undefined}
                    pattern={field.key === "computerNumber" ? "[0-9]*" : undefined}
                    value={legacyForm[field.key]}
                    onChange={(event) => {
                      const nextValue =
                        field.key === "computerNumber"
                          ? numbersOnly(event.target.value)
                          : event.target.value;
                      setLegacyForm((current) => ({
                        ...current,
                        [field.key]: nextValue,
                      }));
                      setErrors((current) => ({
                        ...current,
                        [field.key]: undefined,
                      }));
                    }}
                  />
                )}
                {errors[field.key] ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors[field.key]}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Previous
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            {item && step < totalPages && (
              <button
                type="button"
                onClick={requestSave}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Quick Save
              </button>
            )}
            {step < totalPages ? (
              <button
                type="button"
                onClick={() => {
                  const pageErrors = validateStep();
                  if (Object.keys(pageErrors).length === 0) {
                    setStep((current) => Math.min(totalPages, current + 1));
                  }
                }}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={requestSave}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Save Component
              </button>
            )}
          </div>
        </div>
      </div>

      {showSaveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 className="text-lg font-semibold text-slate-900">
                {item ? "Save changes?" : "Add item?"}
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                {item
                  ? "This will update the inventory item with your latest changes."
                  : "This will add the new item to the selected inventory section."}
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowSaveConfirm(false)}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-400"
              >
                {saving ? "Saving..." : item ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Component
export default function InventorySection() {
  const { sectionSlug: tabSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabs, loading: tabsLoading, error: tabsError } = useInventoryCatalog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSectionSlug, setSelectedSectionSlug] = useState("");
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tabTableName, setTabTableName] = useState("");
  const [templateColumns, setTemplateColumns] = useState([]);
  const [viewMode, setViewMode] = useState("table");
  const [gridEditMode, setGridEditMode] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const requestDelete = (itemId) => {
    setPendingDeleteId(itemId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;

    setDeletingId(pendingDeleteId);
    await deleteInventoryItem(pendingDeleteId, tabTableName || null);
    setDeletingId(null);
    setPendingDeleteId(null);
    setSuccessMessage("Inventory item deleted successfully.");
    setRefreshKey((current) => current + 1);
  };

  const tab = useMemo(
    () => tabs.find((currentTab) => currentTab.slug === tabSlug) || null,
    [tabs, tabSlug]
  );
  const selectedSection = useMemo(
    () =>
      tab?.sections?.find((section) => section.slug === selectedSectionSlug) ||
      null,
    [tab, selectedSectionSlug]
  );
  const sections = tab?.sections || [];
  const visibleTemplateColumns = useMemo(
    () => templateColumns.filter((column) => column.visible !== false),
    [templateColumns]
  );
  const usesTemplateColumns = visibleTemplateColumns.length > 0;
  const tableColumns = usesTemplateColumns ? visibleTemplateColumns : legacyTableColumns;
  const hasGroupedHeaders = tableColumns.some(
    (column) => column.subColumns && column.subColumns.length > 0
  );
  const tableColSpan =
    tableColumns.reduce(
      (total, column) =>
        total + (column.subColumns && column.subColumns.length > 0 ? column.subColumns.length : 1),
      0
    ) + (gridEditMode ? 1 : 0);
  const componentMatrix = useMemo(() => {
    const computerColumn =
      visibleTemplateColumns.find((column) => isComputerIdentifierColumn(column)) || null;
    const inventoryColumns = visibleTemplateColumns.filter(
      (column) => column.key !== computerColumn?.key
    );
    const componentColumns = inventoryColumns.filter(
      (column) => column.subColumns && column.subColumns.length > 0
    );
    const detailColumns = inventoryColumns.filter(
      (column) => !column.subColumns || column.subColumns.length === 0
    );
    const rowFields = new Map();

    componentColumns.forEach((column) => {
      column.subColumns.forEach((subColumn) => {
        if (!rowFields.has(subColumn.key)) {
          rowFields.set(subColumn.key, subColumn);
        }
      });
    });

    return {
      computerColumn,
      componentColumns,
      detailColumns,
      rowFields: Array.from(rowFields.values()).sort(
        (first, second) =>
          getRowSortIndex(first) - getRowSortIndex(second) ||
          first.label.localeCompare(second.label)
      ),
    };
  }, [visibleTemplateColumns]);
  const usesComponentMatrix =
    usesTemplateColumns &&
    componentMatrix.componentColumns.length > 0 &&
    componentMatrix.rowFields.length > 0;

  useEffect(() => {
    let cancelled = false;

    const loadTabState = async () => {
      if (!tab) {
        setSelectedSectionSlug("");
        setTabTableName("");
        setTemplateColumns([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const sectionQuery = searchParams.get("section");
        const fallbackSection = tab.sections?.[0]?.slug || "";
        const nextSection = tab.sections?.some(
          (section) => section.slug === sectionQuery
        )
          ? sectionQuery
          : fallbackSection;

        if (!cancelled) {
          setSelectedSectionSlug(nextSection);
        }

        const config = await getTabTableConfig(tab.id);
        if (!cancelled) {
          setTabTableName(config?.tableName || "");
          setTemplateColumns(normalizeTemplateColumns(config?.columns || []));
        }

        if (!nextSection && tab.sections?.length === 0) {
          setItems([]);
          setItemsError("");
          setItemsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load inventory tab.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTabState();

    return () => {
      cancelled = true;
    };
  }, [tab, searchParams]);

  useEffect(() => {
    if (!tab) return;
    const sectionQuery = searchParams.get("section");
    const fallbackSection = tab.sections?.[0]?.slug || "";
    const nextSection = tab.sections?.some(
      (section) => section.slug === sectionQuery
    )
      ? sectionQuery
      : fallbackSection;

    if (nextSection && nextSection !== sectionQuery) {
      setSearchParams({ section: nextSection }, { replace: true });
    }

    if (nextSection !== selectedSectionSlug) {
      setSelectedSectionSlug(nextSection);
    }
  }, [tab, searchParams, selectedSectionSlug, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      if (!selectedSection?.id) {
        setItems([]);
        return;
      }

      setItemsLoading(true);
      setItemsError("");

      try {
        const loadedItems = await fetchInventoryItems(
          selectedSection.id,
          tabTableName || null
        );
        if (!cancelled) {
          setItems(loadedItems || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([]);
          setItemsError(
            loadError?.message || "Failed to load section items."
          );
        }
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    };

    loadItems();

    return () => {
      cancelled = true;
    };
  }, [selectedSection?.id, tabTableName, refreshKey]);

  const openCreateModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleSaved = () => {
    const message = editingItem
      ? "Inventory item updated successfully."
      : "Inventory item added successfully.";
    setShowModal(false);
    setEditingItem(null);
    setSuccessMessage(message);
    setRefreshKey((current) => current + 1);
  };

  if (tabsLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#4a1111]/15 border-t-[#4a1111]" />
            <p className="text-sm font-medium text-slate-500">
              Loading inventory tab...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (tabsError || error || !tab) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Inventory tab not found
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {tabsError || error || "The tab you opened does not exist yet."}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/manage/inventory"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Go to management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen sm:p-3 overflow-hidden">
      <div className="mx-auto w-full max-w-full min-w-0 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4a1111]">
              Inventory
            </p>
             {/*<h1 className="mt-2 text-3xl font-bold text-slate-900">
              {tab.name}
            </h1> */}
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tab.description ||
                "Choose a section below to manage its inventory components."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            
            {/*<Link
              to="/manage/inventory"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Manage tabs
            </Link> */}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {sections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                No sections yet. Add one from the inventory manager.
              </div>
            ) : (
              sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setSelectedSectionSlug(section.slug);
                    setSearchParams(
                      { section: section.slug },
                      { replace: true }
                    );
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    section.slug === selectedSectionSlug
                      ? "bg-[#4a1111] text-white shadow-sm ring-2 ring-[#2b0707]/10"
                      : "bg-white text-slate-700 hover:bg-[#4a1111]/10 hover:text-[#4a1111]"
                  }`}
                >
                  {section.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedSection?.name || "Select a section"}
              </h2>
              <p className="text-sm text-slate-500">
                {selectedSection?.description ||
                  "This section stores the inventory items."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              { /*<button
                type="button"
                onClick={() => setGridEditMode(!gridEditMode)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ring-1 shadow-sm ${
                  gridEditMode
                    ? "bg-blue-600 text-white ring-blue-500 hover:bg-blue-700"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {gridEditMode ? "Edit Mode ON" : "Edit Mode OFF"}
              </button> */}

              <button
                type="button"
                onClick={openCreateModal}
                disabled={usesTemplateColumns && !tabTableName}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                <Plus className="h-4 w-4" />
                {usesTemplateColumns && !tabTableName
                  ? "Loading table..."
                  : "Add item"}
              </button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden p-5">
            {!selectedSection ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                <p className="text-slate-500 font-medium">
                  Pick a section to view or add items.
                </p>
              </div>
            ) : itemsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">
                  Loading components...
                </p>
              </div>
            ) : itemsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
                {itemsError}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                <p className="text-slate-500 font-medium">
                  No records found for this section.
                </p>
              </div>
            ) : usesComponentMatrix ? (
              <div className="mt-1 h-[50vh] min-h-0 w-full max-w-full overflow-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-max min-w-full divide-y divide-slate-200">
                  <thead className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_rgb(226,232,240)]">
                    <tr>
                      <th
                        scope="col"
                        className="whitespace-nowrap bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                      >
                        Computer #
                      </th>
                      {componentMatrix.componentColumns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className="whitespace-nowrap bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                        >
                          {column.label}
                        </th>
                      ))}
                      {gridEditMode && (
                        <th
                          scope="col"
                          className="whitespace-nowrap bg-slate-50 px-4 py-3 text-right text-sm font-semibold text-slate-700"
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.flatMap((item, itemIndex) => {
                      const computerNumber = formatCellValue(
                        componentMatrix.computerColumn
                          ? item?.[componentMatrix.computerColumn.key]
                          : item?.computer_number || item?.computerNumber || itemIndex + 1
                      );
                      const rows = componentMatrix.rowFields.map((rowField, rowIndex) => (
                        <tr key={`${item.id}-${rowField.key}`}>
                          {rowIndex === 0 && (
                            <td
                              rowSpan={componentMatrix.rowFields.length}
                              className="whitespace-nowrap px-4 py-4 text-center align-middle text-sm font-semibold text-slate-900"
                            >
                              {computerNumber}
                            </td>
                          )}
                          {componentMatrix.componentColumns.map((column) => {
                            const matchingField = column.subColumns.find(
                              (subColumn) => subColumn.key === rowField.key
                            );
                            const value = formatCellValue(item?.[matchingField?.physicalKey]);

                            return (
                              <td
                                key={`${item.id}-${column.key}-${rowField.key}`}
                                className="min-w-[132px] max-w-[180px] px-4 py-4 text-sm text-slate-600"
                              >
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                  {rowField.label}
                                </div>
                                <div className="mt-1 font-medium text-slate-900">
                                  {value}
                                </div>
                              </td>
                            );
                          })}
                          {gridEditMode && rowIndex === 0 && (
                            <td
                              rowSpan={componentMatrix.rowFields.length}
                              className="px-4 py-4 align-middle"
                            >
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(item || null);
                                    setShowModal(true);
                                  }}
                                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  title="Edit item"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === item.id}
                                  onClick={() => requestDelete(item.id)}
                                  className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ));

                      if (componentMatrix.detailColumns.length > 0) {
                        rows.push(
                          <tr key={`${item.id}-details`}>
                            <td
                              colSpan={
                                componentMatrix.componentColumns.length + (gridEditMode ? 2 : 1)
                              }
                              className="px-4 py-3 text-sm text-slate-500"
                            >
                              <div className="flex flex-wrap gap-2">
                                {componentMatrix.detailColumns.map((column) => (
                                  <span
                                    key={`${item.id}-${column.key}`}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                                  >
                                    <span className="font-semibold text-slate-700">
                                      {column.label}:
                                    </span>{" "}
                                    {formatCellValue(item?.[column.key])}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="h-[65vh] w-full max-w-full overflow-auto">
                  <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 shadow-[0_1px_0_rgb(226,232,240)]">
                      <tr>
                        {tableColumns.map((column) => {
                          const subColumnCount = column.subColumns?.length || 0;
                          return (
                            <th
                              key={column.key}
                              scope="col"
                              colSpan={subColumnCount || 1}
                              rowSpan={hasGroupedHeaders && !subColumnCount ? 2 : 1}
                              className="border-r border-slate-200 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] last:border-r-0"
                            >
                              {column.label}
                            </th>
                          );
                        })}
                        {gridEditMode && (
                          <th
                            scope="col"
                            rowSpan={hasGroupedHeaders ? 2 : 1}
                            className="sticky right-0 min-w-[112px] border-l border-slate-200 bg-slate-50 px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em]"
                          >
                            Actions
                          </th>
                        )}
                      </tr>
                      {hasGroupedHeaders && (
                        <tr className="bg-slate-100/80">
                          {tableColumns.flatMap((column) =>
                            column.subColumns?.length
                              ? column.subColumns.map((subColumn) => (
                                  <th
                                    key={`${column.key}-${subColumn.key}`}
                                    scope="col"
                                    className="min-w-[140px] border-r border-t border-slate-200 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 last:border-r-0"
                                  >
                                    {subColumn.label}
                                  </th>
                                ))
                              : []
                          )}
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {items.map((item) => (
                        <tr key={item.id} className="transition hover:bg-emerald-50/30">
                          {tableColumns.map((column) =>
                            column.subColumns && column.subColumns.length > 0 ? (
                              column.subColumns.map((subColumn) => (
                                <td
                                  key={`${item.id}-${subColumn.physicalKey}`}
                                  className="max-w-[260px] border-r border-slate-100 px-4 py-3 align-top text-sm text-slate-700"
                                >
                                  <span className="block min-h-5 break-words leading-5">
                                    {formatCellValue(item?.[subColumn.physicalKey])}
                                  </span>
                                </td>
                              ))
                            ) : (
                              <td
                                key={`${item.id}-${column.key}`}
                                className={`max-w-[280px] border-r border-slate-100 px-4 py-3 align-top text-sm text-slate-700 ${
                                  column.key === "computer_number"
                                    ? "text-center font-semibold text-slate-900"
                                    : ""
                                }`}
                              >
                                <span className="block min-h-5 break-words leading-5">
                                  {formatCellValue(item?.[column.key])}
                                </span>
                              </td>
                            )
                          )}
                          {gridEditMode && (
                            <td className="sticky right-0 border-l border-slate-200 bg-white px-4 py-3 align-middle shadow-[-8px_0_16px_-16px_rgba(15,23,42,0.5)]">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(item || null);
                                    setShowModal(true);
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                                  title="Edit item"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === item.id}
                                  onClick={() => requestDelete(item.id)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                  {items.length} {items.length === 1 ? "record" : "records"}
                  {tableColSpan > 0 ? ` shown across ${tableColSpan} columns` : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && selectedSection && (
        <ItemModal
          section={selectedSection}
          item={editingItem}
          tableName={tabTableName}
          templateColumns={templateColumns}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Delete item?
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                This will permanently remove the selected inventory item.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                disabled={deletingId === pendingDeleteId}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId === pendingDeleteId}
                className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-wait disabled:bg-rose-400"
              >
                {deletingId === pendingDeleteId ? "Deleting..." : "Delete Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="px-5 py-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
                ✓
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                Success
              </h3>
              <p className="mt-2 text-sm text-slate-500">{successMessage}</p>
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setSuccessMessage("")}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
