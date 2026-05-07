import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, Check, ChevronDown, Download, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import arkLogoUrl from "@/assets/imgs/ark-logo.png";
import {
  deleteInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  isCurrentUserAdmin,
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
        fieldType: String(subColumn.fieldType || subColumn.field_type || "text").toLowerCase(),
        options: Array.isArray(subColumn.options)
          ? subColumn.options.map((option) => String(option).trim()).filter((option) => option)
          : [],
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
        fieldType: String(column.fieldType || column.field_type || "text").toLowerCase(),
        options: Array.isArray(column.options)
          ? column.options.map((option) => String(option).trim()).filter((option) => option)
          : [],
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

const isDropdownField = (field) => String(field?.fieldType || "").toLowerCase() === "dropdown";

const getEditorType = (fieldConfig) => {
  if (isDropdownField(fieldConfig)) return "dropdown";
  const dataType = String(fieldConfig?.data_type || "text").toLowerCase();
  if (dataType === "bool" || dataType === "boolean") return "boolean";
  return dataType;
};

const compareSortableValues = (left, right) => {
  const leftValue = left?.item?.[left?.key];
  const rightValue = right?.item?.[right?.key];

  const leftEmpty = leftValue === null || leftValue === undefined || leftValue === "";
  const rightEmpty = rightValue === null || rightValue === undefined || rightValue === "";

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const bothNumbers = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (bothNumbers) {
    return leftNumber - rightNumber;
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const modalCloseButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

const sanitizeSheetName = (value) =>
  String(value || "Inventory Section").replace(/[\\/:*?"<>|]/g, "").slice(0, 31);

const getColumnLetter = (columnNumber) => {
  let value = columnNumber;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
};

const createHeaderSeparatorBase64 = () => {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 24;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#4a1111";
  context.fillRect(0, 9, canvas.width, 5);

  return canvas.toDataURL("image/png").split(",")[1];
};

const applyExportHeader = (worksheet, titleText, exportDate, logoImage, separatorImage, totalColumns) => {
  const headerColor = { argb: "FF4A1111" };
  const endColumnNumber = Math.max(13, totalColumns + 1);
  const endColumnLetter = getColumnLetter(endColumnNumber);

  for (let i = 1; i <= 5; i++) {
    worksheet.getRow(i).height = 25;
  }

  if (logoImage) {
    const image = worksheet.workbook.addImage({
      buffer: logoImage,
      extension: "png",
    });

    // place logo roughly in the middle of column B
    worksheet.addImage(image, {
      tl: { col: 1.5, row: 0.35 },
      ext: { width: 125, height: 125 },
    });
  }

  if (separatorImage) {
    const separator = worksheet.workbook.addImage({
      base64: separatorImage,
      extension: "png",
    });

    worksheet.addImage(separator, {
      tl: { col: 0.5, row: 5.35 },
      br: { col: endColumnNumber + 0.5, row: 5.65 },
    });
  }

  worksheet.mergeCells(`B1:${endColumnLetter}1`);
  const titleCell = worksheet.getCell("B1");
  titleCell.value = "COLEGIO DE STA. TERESA DE AVILA, INC.";
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.font = { bold: true, size: 22, color: headerColor, name: "Corbel" };

  worksheet.mergeCells(`B2:${endColumnLetter}2`);
  const addr1 = worksheet.getCell("B2");
  addr1.value = "1177 Quirino Highway, Brgy. Kaligayahan, Novaliches";
  addr1.alignment = { horizontal: "center", vertical: "middle" };
  addr1.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B3:${endColumnLetter}3`);
  const addr2 = worksheet.getCell("B3");
  addr2.value = "Quezon City 1124 Philippines";
  addr2.alignment = { horizontal: "center", vertical: "middle" };
  addr2.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B4:${endColumnLetter}4`);
  const phone = worksheet.getCell("B4");
  phone.value = "Tel. No. (02) 8-275-3916";
  phone.alignment = { horizontal: "center", vertical: "middle" };
  phone.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B5:${endColumnLetter}5`);
  const email = worksheet.getCell("B5");
  email.value = "Email: officialcstaregistrar@gmail.com";
  email.alignment = { horizontal: "center", vertical: "middle" };
  email.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };
  worksheet.getRow(6).height = 15;

  worksheet.mergeCells(`B7:${endColumnLetter}7`);
  const exportTitle = worksheet.getCell("B7");
  exportTitle.value = titleText;
  exportTitle.alignment = { horizontal: "center", vertical: "middle" };
  exportTitle.font = { bold: true, size: 11, color: headerColor, name: "Arial" };

  worksheet.mergeCells(`B8:${endColumnLetter}8`);
  const dateCell = worksheet.getCell("B8");
  dateCell.value =
    "AS OF " +
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
      .format(new Date(exportDate))
      .replace(/^[A-Za-z]+/, (month) => month.toUpperCase());
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  dateCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };
};

// Item Modal Component
function ItemModal({ section, item, onClose, onSaved, tableName, templateColumns }) {
  const useTemplate = Array.isArray(templateColumns) && templateColumns.length > 0;
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const createInitialSubFieldGroups = (columns) =>
    (columns || []).reduce((accumulator, column) => {
      if (Array.isArray(column?.subColumns) && column.subColumns.length > 1) {
        accumulator[column.key] = true;
      }
      return accumulator;
    }, {});
  const [openSubFieldGroups, setOpenSubFieldGroups] = useState(() =>
    createInitialSubFieldGroups(templateColumns)
  );
  const initialSnapshotRef = useRef("");
  const [legacyForm, setLegacyForm] = useState(() => ({
    computerNumber: item?.computer_number ?? "",
    type: item?.type || "",
    brand: item?.brand || "",
    description: item?.description || "",
    status: item?.status || "",
  }));
  const [dynamicForm, setDynamicForm] = useState({});

  const buildLegacySnapshot = (form) =>
    JSON.stringify({
      computerNumber: String(form.computerNumber ?? ""),
      type: String(form.type ?? ""),
      brand: String(form.brand ?? ""),
      description: String(form.description ?? ""),
      status: String(form.status ?? ""),
    });

  const buildTemplateSnapshot = (form) =>
    JSON.stringify(
      templateColumns.reduce((accumulator, column) => {
        if (column.subColumns && column.subColumns.length > 0) {
          for (const subColumn of column.subColumns) {
            accumulator[subColumn.physicalKey] = String(form[subColumn.physicalKey] ?? "");
          }
        } else {
          accumulator[column.key] = String(form[column.key] ?? "");
        }
        return accumulator;
      }, {})
    );

  const renderFieldControl = (fieldKey, fieldConfig) => {
    if (isDropdownField(fieldConfig)) {
      const options = Array.isArray(fieldConfig?.options) ? fieldConfig.options : [];

      return (
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
          value={dynamicForm[fieldKey] ?? ""}
          onChange={(event) =>
            setDynamicForm((current) => ({
              ...current,
              [fieldKey]: event.target.value,
            }))
          }
        >
          <option value="">Select an option</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Input
        className="mt-1"
        type={
          fieldConfig?.data_type === "date"
            ? "date"
            : ["int", "integer", "float", "number", "numeric"].includes(fieldConfig?.data_type)
              ? "number"
              : "text"
        }
        value={dynamicForm[fieldKey] ?? ""}
        onChange={(event) =>
          setDynamicForm((current) => ({
            ...current,
            [fieldKey]: event.target.value,
          }))
        }
      />
    );
  };

  const currentSnapshot = useTemplate
    ? buildTemplateSnapshot(dynamicForm)
    : buildLegacySnapshot(legacyForm);
  const hasUnsavedChanges = initialSnapshotRef.current !== currentSnapshot;

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
      setOpenSubFieldGroups(createInitialSubFieldGroups(templateColumns));
      initialSnapshotRef.current = buildTemplateSnapshot(nextForm);
      setShowDiscardConfirm(false);
      setShowSaveConfirm(false);
      return;
    }

    const nextLegacyForm = {
      computerNumber: item?.computer_number ?? "",
      type: item?.type || "",
      brand: item?.brand || "",
      description: item?.description || "",
      status: item?.status || "",
    };

    setLegacyForm(nextLegacyForm);
    initialSnapshotRef.current = buildLegacySnapshot(nextLegacyForm);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
  }, [item, templateColumns, useTemplate]);

  useEffect(() => {
    if (!showDiscardConfirm && !showSaveConfirm) {
      return;
    }
  }, [showDiscardConfirm, showSaveConfirm]);

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
    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    save();
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    await save();
  };

  const cancelSave = () => {
    setShowSaveConfirm(false);
  };

  const toggleSubFieldGroup = (columnKey) => {
    setOpenSubFieldGroups((current) => ({
      ...current,
      [columnKey]: !current[columnKey],
    }));
  };

  const save = async () => {
    if (useTemplate) {
      if (!tableName) {
        throw new Error("Physical table is not ready yet. Please wait for the table mapping to load.");
      }

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
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {item ? "Edit item" : "Add item"}
            </h3>
            <p className="text-sm text-slate-500">
              {item
                ? `Update this item in ${section?.name || "the selected section"}.`
                : `Add a new item to ${section?.name || "the selected section"}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={modalCloseButtonClass}
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {useTemplate ? (
            templateColumns.map((column) =>
              column.subColumns && column.subColumns.length > 0 ? (
                <div
                  key={column.key}
                  className="rounded-lg border border-slate-200 bg-slate-50"
                >
                  {column.subColumns.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => toggleSubFieldGroup(column.key)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-100"
                      aria-expanded={openSubFieldGroups[column.key] !== false}
                      aria-label={`Toggle ${column.label} fields`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {column.label}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-500 transition-transform ${openSubFieldGroups[column.key] !== false ? "rotate-180" : "rotate-0"}`}
                      />
                    </button>
                  ) : (
                    <div className="px-3 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {column.label}
                      </span>
                    </div>
                  )}
                  {(column.subColumns.length <= 1 || openSubFieldGroups[column.key] !== false) && (
                    <div className="grid gap-3 border-t border-slate-200 p-3 md:grid-cols-3">
                      {column.subColumns.map((subColumn) => (
                        <div key={subColumn.physicalKey}>
                          <label className="text-xs font-medium text-slate-600">
                            {subColumn.label}
                          </label>
                          {renderFieldControl(subColumn.physicalKey, subColumn)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={column.key} className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    {column.label}
                  </label>
                  {column.data_type === "boolean" || column.data_type === "bool" ? (
                    <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
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
                      <span>{dynamicForm[column.key] ? "True" : "False"}</span>
                    </label>
                  ) : isDropdownField(column) ? (
                    renderFieldControl(column.key, column)
                  ) : (
                    <Input
                      className="mt-1"
                      type={
                        column.data_type === "date"
                          ? "date"
                          : ["int", "integer", "float", "number", "numeric"].includes(
                              column.data_type
                            )
                          ? "number"
                          : "text"
                      }
                      value={dynamicForm[column.key] ?? ""}
                      onChange={(event) =>
                        setDynamicForm((current) => ({
                          ...current,
                          [column.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              )
            )
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Computer #
                </label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  value={legacyForm.computerNumber}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      computerNumber: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Type
                </label>
                <Input
                  className="mt-1"
                  value={legacyForm.type}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Brand
                </label>
                <Input
                  className="mt-1"
                  value={legacyForm.brand}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      brand: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Status
                </label>
                <Input
                  className="mt-1"
                  value={legacyForm.status}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Description
                </label>
                <Textarea
                  className="mt-1 min-h-[120px]"
                  value={legacyForm.description}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={requestSave}
            className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5a1717]"
          >
            Save
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
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tabTableName, setTabTableName] = useState("");
  const [templateColumns, setTemplateColumns] = useState([]);
  const [gridEditMode, setGridEditMode] = useState(false);
  const [cellDrafts, setCellDrafts] = useState({});
  const [savingCellKey, setSavingCellKey] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmExitEditMode, setConfirmExitEditMode] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);
  const [selectedExportSections, setSelectedExportSections] = useState([]);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [preparedByName, setPreparedByName] = useState("");
  const [inspectedByName, setInspectedByName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showColumnOptions, setShowColumnOptions] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const isHistoryOpen = false;

  const handleDelete = async (itemId) => {
    setPendingDeleteId(itemId);
    setShowDeleteConfirm(true);
  };

  const getCellDraftKey = (itemId, fieldKey) => `${itemId}__${fieldKey}`;

  const normalizeCellValue = (value) => {
    if (value === null || value === undefined || value === "-") return "";
    return String(value);
  };

  const handleCellDraftChange = (itemId, fieldKey, value) => {
    const key = getCellDraftKey(itemId, fieldKey);
    setCellDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateItemRow = (itemId, nextValues) => {
    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === itemId ? { ...currentItem, ...nextValues } : currentItem
      )
    );
  };

  const handleInlineCellSave = async (item, fieldKey, fieldConfig) => {
    if (!tabTableName) return;

    const key = getCellDraftKey(item.id, fieldKey);
    const currentRaw = normalizeCellValue(item?.[fieldKey]);
    const nextRaw = normalizeCellValue(cellDrafts[key] ?? currentRaw).trim();

    if (nextRaw === currentRaw.trim()) {
      setCellDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }

    setSavingCellKey(key);
    try {
      const editorType = getEditorType(fieldConfig);
      const nextValue = editorType === "boolean"
        ? ["true", "1", "yes", "on"].includes(nextRaw.toLowerCase())
        : castValueByType(nextRaw, fieldConfig?.data_type);
      await upsertInventoryItem({
        id: item.id,
        sectionId: selectedSection.id,
        tableName: tabTableName,
        recordData: {
          [fieldKey]: nextValue,
        },
      });

      updateItemRow(item.id, { [fieldKey]: nextValue });
      setCellDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (saveError) {
      console.error("Failed to save inline cell:", saveError);
      setError(saveError?.message || "Failed to save cell.");
    } finally {
      setSavingCellKey(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [selectedSectionSlug, refreshKey]);

  useEffect(() => {
    if (!gridEditMode) {
      setCellDrafts({});
      setSavingCellKey(null);
    }
  }, [gridEditMode, selectedSectionSlug]);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const admin = await isCurrentUserAdmin();
        if (!cancelled) setIsAdmin(admin);
      } catch (checkError) {
        if (!cancelled) setIsAdmin(false);
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setShowDeleteConfirm(false);
    setDeletingId(pendingDeleteId);
    await deleteInventoryItem(pendingDeleteId, tabTableName || null);
    setDeletingId(null);
    setPendingDeleteId(null);
    setRefreshKey((current) => current + 1);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);
  };

  const requestExitEditMode = () => {
    setConfirmExitEditMode(true);
  };

  const confirmExitEditing = () => {
    setGridEditMode(false);
    setConfirmExitEditMode(false);
  };

  const cancelExitEditing = () => {
    setConfirmExitEditMode(false);
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
  const usesTemplateColumns = templateColumns.length > 0;
  const exportColumnOptions = useMemo(
    () =>
      usesTemplateColumns
        ? templateColumns.flatMap((column) =>
            Array.isArray(column.subColumns) && column.subColumns.length > 0
              ? column.subColumns.map((subColumn) => ({
                  key: subColumn.physicalKey,
                  label: `${column.label} - ${subColumn.label}`,
                }))
              : [{ key: column.key, label: column.label }]
          )
        : [
            { key: "computer_number", label: "Computer #" },
            { key: "type", label: "Type" },
            { key: "brand", label: "Brand" },
            { key: "description", label: "Description" },
            { key: "status", label: "Status" },
          ],
    [templateColumns, usesTemplateColumns]
  );
  const tableColSpan = templateColumns.length + 1;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const paginatedItems = useMemo(
    () =>
      items.filter(
        (_, index) => index >= pageStartIndex && index < pageEndIndex
      ),
    [items, pageStartIndex, pageEndIndex]
  );
  const sortedItems = useMemo(() => {
    if (!sortConfig.key) return items;

    return [...items].sort((firstItem, secondItem) => {
      const result = compareSortableValues(
        { item: firstItem, key: sortConfig.key },
        { item: secondItem, key: sortConfig.key }
      );

      return sortConfig.direction === "desc" ? -result : result;
    });
  }, [items, sortConfig]);
  const requestSort = (key) => {
    if (!key) return;

    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };
  const renderSortButton = (key, label, align = "center") => {
    const isActive = sortConfig.key === key;
    const Icon = isActive ? (sortConfig.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

    return (
      <button
        type="button"
        onClick={() => requestSort(key)}
        className={`inline-flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-inherit transition hover:bg-slate-200/70 hover:text-slate-900 ${
          align === "left" ? "justify-start text-left" : "justify-center text-center"
        }`}
        title={`Sort by ${label}`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${isActive ? "text-[#4a1111]" : "text-slate-400"}`} />
      </button>
    );
  };

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

  useEffect(() => {
    if (page < 1) {
      setPage(1);
      return;
    }

    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const openCreateModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const openExportModal = () => {
    if (!selectedSection || items.length === 0) return;
    setSelectedExportColumns(exportColumnOptions.map((column) => column.key));
    // default to the currently selected section
    setSelectedExportSections(selectedSection ? [selectedSection.slug] : []);
    setShowColumnOptions(false);
    setExportDate(new Date().toISOString().slice(0, 10));
    setPreparedByName("");
    setInspectedByName("");
    setShowExportModal(true);
  };

  const handleExportSection = async () => {
    if (!selectedSection || items.length === 0 || selectedExportColumns.length === 0) {
      return;
    }

    const columnsToExport = exportColumnOptions.filter((column) =>
      selectedExportColumns.includes(column.key)
    );

    try {
      setExporting(true);
      let logoBuffer = null;
      let separatorBuffer = null;

      try {
        const logoRes = await fetch(arkLogoUrl);
        if (logoRes.ok) {
          logoBuffer = await logoRes.arrayBuffer();
        }
      } catch (logoError) {
        console.warn("Failed to load logo:", logoError);
      }

      separatorBuffer = createHeaderSeparatorBase64();

      const workbook = new ExcelJS.Workbook();

      // If no sections selected, default to current selected section
      const sectionSlugsToExport = (selectedExportSections && selectedExportSections.length > 0)
        ? selectedExportSections
        : selectedSection
          ? [selectedSection.slug]
          : [];

      for (const sectionSlug of sectionSlugsToExport) {
        const section = sections.find((s) => s.slug === sectionSlug);
        if (!section) continue;

        // fetch items for this section (supports custom table via tabTableName)
        let sectionItems = [];
        try {
          sectionItems = await fetchInventoryItems(section.id, tabTableName || null);
        } catch (e) {
          console.warn(`Failed to load items for section ${section.slug}:`, e);
          sectionItems = [];
        }

        const worksheet = workbook.addWorksheet(sanitizeSheetName(section.name));

        applyExportHeader(
          worksheet,
          `INVENTORY - ${(section.name || "SECTION").toUpperCase()}`,
          exportDate,
          logoBuffer,
          separatorBuffer,
          columnsToExport.length + 1
        );

        worksheet.addRow([]);

        // Start headers at column B
        const startColumn = 2;
        const headerRowIndex = worksheet.lastRow.number + 1;
        const headerRow = worksheet.getRow(headerRowIndex);
        headerRow.height = 26;

        columnsToExport.forEach((column, index) => {
          const cell = headerRow.getCell(startColumn + index);
          cell.value = column.label;
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
          cell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Data rows
        sectionItems.forEach((item, rowIndex) => {
          const excelRow = worksheet.getRow(headerRowIndex + 1 + rowIndex);
          const isGrayRow = rowIndex % 2 === 0;
          const rowFill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isGrayRow ? "FFF8FAFC" : "FFFFFFFF" },
          };

          columnsToExport.forEach((column, colIndex) => {
            const cell = excelRow.getCell(startColumn + colIndex);
            const rawValue = item?.[column.key];
            cell.value = rawValue === null || rawValue === undefined ? "" : String(rawValue);
            cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
            cell.font = { size: 10, name: "Arial" };
            cell.fill = rowFill;
            cell.border = {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            };
          });
        });

        // column widths
        columnsToExport.forEach((column, index) => {
          const colNumber = startColumn + index;
          const longestData = sectionItems.reduce((max, item) => {
            const value = item?.[column.key];
            const length = value === null || value === undefined ? 0 : String(value).length;
            return Math.max(max, length);
          }, 0);
          const width = Math.min(40, Math.max(14, column.label.length + 4, longestData + 2));
          worksheet.getColumn(colNumber).width = width;
        });

        const signatoryStart = headerRowIndex + sectionItems.length + 5;
        const safePreparedBy = preparedByName.trim() || "____________________";
        const safeInspectedBy = inspectedByName.trim() || "____________________";

        worksheet.getCell(`B${signatoryStart}`).value = "Prepared and submitted by:";
        worksheet.getCell(`B${signatoryStart}`).font = { bold: true, size: 10 };
        worksheet.getCell(`B${signatoryStart + 2}`).value = safePreparedBy;
        worksheet.getCell(`B${signatoryStart + 2}`).font = { bold: true, size: 12, name: "Arial" };
        worksheet.getCell(`B${signatoryStart + 3}`).value = "IT technical support";
        worksheet.getCell(`B${signatoryStart + 3}`).font = { italic: true, size: 10 };

        worksheet.getCell(`B${signatoryStart + 5}`).value = "Inspected and verified by:";
        worksheet.getCell(`B${signatoryStart + 5}`).font = { bold: true, size: 10 };
        worksheet.getCell(`B${signatoryStart + 7}`).value = safeInspectedBy;
        worksheet.getCell(`B${signatoryStart + 7}`).font = { bold: true, size: 12, name: "Arial" };
        worksheet.getCell(`B${signatoryStart + 8}`).value = "Property custodian";
        worksheet.getCell(`B${signatoryStart + 8}`).font = { italic: true, size: 10 };

        worksheet.views = [];
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `${tab?.slug || "inventory"}_sections_export.xlsx`);
      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditingItem(null);
    setRefreshKey((current) => current + 1);
  };

  if (tabsLoading || loading) {
    return (
      <div className="p-6 space-y-5">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#4a1111]" />
            <p className="text-sm text-slate-500">Loading inventory tab...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tabsError || error || !tab) {
    return (
      <div className="p-6 space-y-5">
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
              className="rounded-lg bg-[#4a1111] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5a1717]"
            >
              Go to management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="mx-auto w-full max-w-7xl space-y-5">

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            {sections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-500">
                No sections yet. Add one from the inventory manager.
              </div>
            ) : (
              sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setSelectedSectionSlug(section.slug);
                    setSearchParams({ section: section.slug }, { replace: true });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    section.slug === selectedSectionSlug
                      ? "bg-[#4a1111] text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {section.name}
                </button>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            {gridEditMode ? (
              <>
                <button
                  type="button"
                  onClick={openCreateModal}
                  disabled={usesTemplateColumns && !tabTableName}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                  title={usesTemplateColumns && !tabTableName ? "Loading table..." : "Add item"}
                  aria-label={usesTemplateColumns && !tabTableName ? "Loading table" : "Add item"}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={requestExitEditMode}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717]"
                  title="Done editing"
                  aria-label="Done editing"
                >
                  <Check className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openExportModal}
                  disabled={itemsLoading || items.length === 0}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                  title={itemsLoading ? "Loading items..." : "Export"}
                  aria-label={itemsLoading ? "Loading items" : "Export"}
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGridEditMode(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717]"
                  title="Edit mode off"
                  aria-label="Edit mode off"
                >
                  <PencilLine className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {!isHistoryOpen && (
          <div className="w-full sm:w-96">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items, columns, values..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 shadow-sm focus:border-[#4a1111] focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
         

          <div className="p-0">
            {!selectedSection ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                <p className="text-slate-500 font-medium">
                  Pick a section to view or add items.
                </p>
              </div>
            ) : itemsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-[#4a1111] animate-spin" />
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
            ) : (
              <div className="computer-lab-scrollbar w-full max-w-full min-h-[18rem] max-h-[calc(100vh-16rem)] overflow-auto sm:max-h-[calc(100vh-18rem)] lg:max-h-[calc(100vh-20rem)]">
                <table className="w-max min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100">
                    <tr>
                      {usesTemplateColumns &&
                        templateColumns.map((column) => (
                          <th
                            key={column.key}
                            className="whitespace-nowrap border-r border-slate-300 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 last:border-r-0"
                          >
                            {column.label}
                          </th>
                        ))}
                      {gridEditMode && isAdmin && (
                          <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {paginatedItems.map((item, rowIndex) => (
                      <tr key={item.id} className={rowIndex % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                        {usesTemplateColumns &&
                          templateColumns.map((column) => {
                            const columnKey = column.key;
                            const columnEditorType = getEditorType(column);
                            const columnValue = item?.[columnKey];
                            const columnDraftKey = getCellDraftKey(item.id, columnKey);
                            const columnDraftValue = cellDrafts[columnDraftKey] ?? normalizeCellValue(columnValue);

                            return (
                              <td key={`${item.id}-${column.key}`} className="px-4 py-4 align-top text-sm text-slate-700">
                                {column.subColumns && column.subColumns.length > 0 ? (
                                  <div className="space-y-3">
                                    {column.subColumns.map((subColumn) => {
                                      const fieldKey = subColumn.physicalKey;
                                      const fieldEditorType = getEditorType(subColumn);
                                      const fieldValue = item?.[fieldKey];
                                      const fieldDraftKey = getCellDraftKey(item.id, fieldKey);
                                      const fieldDraftValue = cellDrafts[fieldDraftKey] ?? normalizeCellValue(fieldValue);

                                      return (
                                        <div key={subColumn.physicalKey} className="space-y-1">
                                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                            {subColumn.label}
                                          </div>
                                          {gridEditMode ? (
                                            fieldEditorType === "dropdown" ? (
                                              <select
                                                value={fieldDraftValue}
                                                disabled={savingCellKey === fieldDraftKey || deletingId !== null}
                                                onChange={(event) => handleCellDraftChange(item.id, fieldKey, event.target.value)}
                                                onBlur={() => handleInlineCellSave(item, fieldKey, subColumn)}
                                                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100"
                                              >
                                                <option value="">Select option...</option>
                                                {(subColumn.options || []).map((option) => (
                                                  <option key={option} value={option}>
                                                    {option}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : fieldEditorType === "boolean" ? (
                                              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                                <input
                                                  type="checkbox"
                                                  checked={fieldDraftValue === true || fieldDraftValue === "true"}
                                                  disabled={savingCellKey === fieldDraftKey || deletingId !== null}
                                                  onChange={(event) => {
                                                    handleCellDraftChange(item.id, fieldKey, event.target.checked ? "true" : "false");
                                                    handleInlineCellSave(item, fieldKey, subColumn);
                                                  }}
                                                />
                                                <span>{fieldDraftValue === true || fieldDraftValue === "true" ? "Yes" : "No"}</span>
                                              </label>
                                            ) : (
                                              <input
                                                type={fieldEditorType === "date" ? "date" : ["int", "integer", "float", "number", "numeric"].includes(fieldEditorType) ? "number" : "text"}
                                                value={fieldDraftValue}
                                                disabled={savingCellKey === fieldDraftKey || deletingId !== null}
                                                onChange={(event) => handleCellDraftChange(item.id, fieldKey, event.target.value)}
                                                onBlur={() => handleInlineCellSave(item, fieldKey, subColumn)}
                                                onKeyDown={(event) => {
                                                  if (event.key === "Enter") event.currentTarget.blur();
                                                  if (event.key === "Escape") {
                                                    setCellDrafts((current) => {
                                                      const next = { ...current };
                                                      delete next[fieldDraftKey];
                                                      return next;
                                                    });
                                                    event.currentTarget.blur();
                                                  }
                                                }}
                                                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100"
                                              />
                                            )
                                          ) : (
                                            <div className="font-medium text-slate-900">
                                              {formatCellValue(fieldValue)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : gridEditMode ? (
                                  columnEditorType === "dropdown" ? (
                                    <select
                                      value={columnDraftValue}
                                      disabled={savingCellKey === columnDraftKey || deletingId !== null}
                                      onChange={(event) => handleCellDraftChange(item.id, columnKey, event.target.value)}
                                      onBlur={() => handleInlineCellSave(item, columnKey, column)}
                                      className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100"
                                    >
                                      <option value="">Select option...</option>
                                      {(column.options || []).map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : columnEditorType === "boolean" ? (
                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={columnDraftValue === true || columnDraftValue === "true"}
                                        disabled={savingCellKey === columnDraftKey || deletingId !== null}
                                        onChange={(event) => {
                                          handleCellDraftChange(item.id, columnKey, event.target.checked ? "true" : "false");
                                          handleInlineCellSave(item, columnKey, column);
                                        }}
                                      />
                                      <span>{columnDraftValue === true || columnDraftValue === "true" ? "Yes" : "No"}</span>
                                    </label>
                                  ) : (
                                    <input
                                      type={columnEditorType === "date" ? "date" : ["int", "integer", "float", "number", "numeric"].includes(columnEditorType) ? "number" : "text"}
                                      value={columnDraftValue}
                                      disabled={savingCellKey === columnDraftKey || deletingId !== null}
                                      onChange={(event) => handleCellDraftChange(item.id, columnKey, event.target.value)}
                                      onBlur={() => handleInlineCellSave(item, columnKey, column)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          setCellDrafts((current) => {
                                            const next = { ...current };
                                            delete next[columnDraftKey];
                                            return next;
                                          });
                                          event.currentTarget.blur();
                                        }
                                      }}
                                      className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100"
                                    />
                                  )
                                ) : (
                                  <span>{formatCellValue(columnValue)}</span>
                                )}
                              </td>
                            );
                          })}
                        {gridEditMode && isAdmin && (
                          <td className="px-4 py-4 align-middle text-center">
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={() => handleDelete(item.id)}
                              className="inline-flex items-center justify-center rounded-lg bg-red-500 p-2 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                              title="Delete item"
                              aria-label="Delete item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-4">
              <div className="text-sm text-slate-600">
                Showing {Math.min(pageStartIndex + 1, items.length)}–{Math.min(
                  pageEndIndex,
                  items.length
                )} of {items.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i + 1)}
                    className={`rounded-md px-2 py-1 text-sm ${
                      page === i + 1 ? "bg-[#4a1111] text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
      {showExportModal && (
        <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Export Section</DialogTitle>
              <DialogDescription>
                Select columns to include in export, and set date/signatories.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-72 overflow-auto px-4 py-2 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Date</label>
                <input
                  type="date"
                  value={exportDate}
                  onChange={(event) => setExportDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Prepared and submitted by</label>
                <input
                  type="text"
                  value={preparedByName}
                  onChange={(event) => setPreparedByName(event.target.value)}
                  placeholder="Enter name"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Inspected and verified by</label>
                <input
                  type="text"
                  value={inspectedByName}
                  onChange={(event) => setInspectedByName(event.target.value)}
                  placeholder="Enter name"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Sections</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sections.map((sec) => (
                    <label key={sec.slug} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedExportSections.includes(sec.slug)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedExportSections((current) => [...current, sec.slug]);
                          } else {
                            setSelectedExportSections((current) => current.filter((s) => s !== sec.slug));
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-slate-700">{sec.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowColumnOptions((current) => !current)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                  aria-expanded={showColumnOptions}
                >
                  <span className="text-xs font-semibold text-slate-500">Columns</span>
                  <span className="text-xs font-medium text-slate-500">
                    {showColumnOptions ? "Hide" : "Show"}
                  </span>
                </button>
                <div
                  className={`grid grid-cols-1 gap-2 overflow-hidden px-3 transition-all duration-300 ease-in-out sm:grid-cols-2 ${showColumnOptions ? "max-h-96 pb-3 opacity-100" : "max-h-0 pb-0 opacity-0"}`}
                >
                  {exportColumnOptions.map((column) => (
                    <label key={column.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedExportColumns.includes(column.key)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedExportColumns((current) => [...current, column.key]);
                          } else {
                            setSelectedExportColumns((current) =>
                              current.filter((key) => key !== column.key)
                            );
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-slate-700">{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportSection}
                disabled={exporting || selectedExportColumns.length === 0}
                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {exporting ? "Exporting..." : "Export Selected"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Confirm delete</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this item? This action cannot be undone.
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
                disabled={!!deletingId}
                            className="rounded-md bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#5a1717] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmExitEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Done Editing?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You are about to exit edit mode. Are you done making changes?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelExitEditing}
                className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={confirmExitEditing}
                className="rounded-md bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#5a1717]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
