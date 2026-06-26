import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowRightLeft, ArrowUp, ChevronsUpDown, Check, ChevronLeft, ChevronRight, ChevronDown, Download, FileText, Loader2, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
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
import arkLogoUrl from "@/assets/imgs/ark-logo.png";
import InventorySectionHistoryView from "@/components/InventorySectionHistoryView";
import InventorySectionExportPanel from "@/components/InventorySectionExportPanel";
import ItemTransferModal from "@/components/ItemTransferModal";
import { useAuth } from "@/lib/AuthContext";
import {
  INVENTORY_ITEMS_CHANGED_EVENT,
  deleteInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  isCurrentUserAdmin,
  updateInventoryItemQuantity,
  upsertInventoryItem,
  useInventoryCatalog,
  callCreateInventoryLogsTable,
  callDropInventoryLogsTable,
  getInventoryLogsTableEndpoint,
  getInventoryDropLogsTableEndpoint,
  transferInventoryItem,
} from "@/lib/inventoryApi";
import { fetchBorrowingRecords } from "@/lib/borrowingApi";
import { cn } from "@/lib/utils";

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
          ? subColumn.options
              .map((option) => {
                if (option && typeof option === "object" && "value" in option) return String(option.value).trim();
                return String(option).trim();
              })
              .filter((option) => option)
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
          ? column.options
              .map((option) => {
                if (option && typeof option === "object" && "value" in option) return String(option.value).trim();
                return String(option).trim();
              })
              .filter((option) => option)
          : [],
        subColumns: normalizeSubColumns(column.subColumns, key),
        dynamicBrand: column.dynamicBrand === true,
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

const isDefectiveInventoryRecord = (record = {}) =>
  Object.entries(record || {}).some(([key, value]) => {
    if (["id", "section_id", "created_at", "updated_at", "sort_order"].includes(key)) return false;
    if (value && typeof value === "object") return isDefectiveInventoryRecord(value);

    const normalized = String(value || "").trim().toUpperCase();
    return normalized.includes("DEFECT") || normalized.includes("BROKEN");
  });

const isDropdownField = (field) => String(field?.fieldType || "").toLowerCase() === "dropdown";

const IDENTIFIER_FIELD_KEYS = new Set(["item_number", "computer_number"]);

const CANONICAL_TEMPLATE_ORDERS = [
  ["computer_number", "type", "brand", "model", "serial_number", "processor", "ram", "storage", "status"],
  ["item_number", "type", "brand", "description", "quantity", "remarks", "location"],
  ["item_number", "name", "brand", "model", "serial_number", "quantity", "remarks", "acquisition_date"],
];

const getCanonicalTemplateOrder = (columns = []) => {
  const normalizedKeys = new Set((Array.isArray(columns) ? columns : []).map((column) => String(column?.key || "").trim()));
  const matchedOrder = CANONICAL_TEMPLATE_ORDERS.find((order) => order.every((key) => normalizedKeys.has(key)));

  return matchedOrder || [];
};

const isIdentifierField = (fieldKey = "") => {
  const normalized = String(fieldKey || "").trim().toLowerCase();
  return IDENTIFIER_FIELD_KEYS.has(normalized) || normalized.endsWith("_item_number") || normalized.endsWith("_computer_number");
};

const orderTemplateColumns = (columns = []) => {
  const ordered = Array.isArray(columns) ? [...columns] : [];
  const canonicalOrder = getCanonicalTemplateOrder(ordered);

  if (canonicalOrder.length > 0) {
    return ordered.sort((left, right) => {
      const leftIndex = canonicalOrder.indexOf(String(left?.key || "").trim());
      const rightIndex = canonicalOrder.indexOf(String(right?.key || "").trim());

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }

      return 0;
    });
  }

  return ordered.sort((left, right) => {
    const leftIsIdentifier = isIdentifierField(left?.key) ? 0 : 1;
    const rightIsIdentifier = isIdentifierField(right?.key) ? 0 : 1;
    if (leftIsIdentifier !== rightIsIdentifier) {
      return leftIsIdentifier - rightIsIdentifier;
    }
    return 0;
  });
};

const getNextIdentifierValue = (rows = [], fieldKey = "") => {
  const numericValues = (Array.isArray(rows) ? rows : [])
    .map((row) => Number.parseInt(String(row?.[fieldKey] ?? "").trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (numericValues.length === 0) {
    return 1;
  }

  return Math.max(...numericValues) + 1;
};

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

const isIdentifierLikeField = (fieldKey = "") => {
  const normalizedKey = String(fieldKey || "").trim().toLowerCase();
  return (
    !normalizedKey ||
    normalizedKey === "quantity" ||
    normalizedKey.endsWith("_quantity") ||
    IDENTIFIER_FIELD_KEYS.has(normalizedKey) ||
    normalizedKey === "id" ||
    normalizedKey === "section_id" ||
    normalizedKey === "created_at" ||
    normalizedKey === "updated_at" ||
    normalizedKey === "sort_order"
  );
};

const hasMeaningfulValue = (value) => {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return normalized !== "" && normalized !== "-";
};

const modalCloseButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

const sanitizeSheetName = (value) =>
  String(value || "Inventory Section").replace(/[\\/:*?"<>|]/g, "").slice(0, 31);

const SEMESTER_OPTIONS = ["1st", "2nd", "Summer"];

const getCurrentSchoolYear = (referenceDate = new Date()) => {
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  const startYear = month >= 5 ? year : year - 1;
  return `${startYear} - ${startYear + 1}`;
};

const generateSchoolYearOptions = (back = 3, forward = 3, referenceDate = new Date()) => {
  const currentSchoolYear = getCurrentSchoolYear(referenceDate);
  const currentStartYear = Number(currentSchoolYear.slice(0, 4));
  const start = currentStartYear - back;
  const end = currentStartYear + forward;
  const options = [];

  for (let year = start; year <= end; year += 1) {
    options.push(`${year} - ${year + 1}`);
  }

  return options.reverse();
};

// ─── Remark / Condition helpers ──────────────────────────────────────────────

/** Keys that commonly hold the remark/condition/status value */
const REMARK_COLUMN_KEYS = ["remarks", "condition", "status", "state"];

/**
 * Find the remark column from template columns.
 * Returns the column config object or null.
 */
const findRemarkColumn = (columns = []) => {
  if (!Array.isArray(columns)) return null;
  for (const key of REMARK_COLUMN_KEYS) {
    const found = columns.find((c) => c.key === key);
    if (found) return found;
  }
  return columns.find((c) => String(c.fieldType).toLowerCase() === "dropdown") || null;
};

/** Get the remark value from an item row. */
const getItemRemark = (item, remarkColumn) => {
  if (!remarkColumn || !item) return "—";
  const val = item[remarkColumn.key];
  return val != null && String(val).trim() !== "" ? String(val).trim() : "—";
};

/** Collect all unique remark values from items, plus all configured options. */
const getAllRemarkOptions = (items, remarkColumn) => {
  const configuredOptions = (remarkColumn?.options || []).map((o) =>
    (o && typeof o === "object" && "value" in o) ? String(o.value) : String(o)
  ).filter(Boolean);
  const usedValues = new Set();
  for (const item of items) {
    const r = getItemRemark(item, remarkColumn);
    if (r !== "—") usedValues.add(r);
  }
  const all = [...configuredOptions];
  for (const v of usedValues) {
    if (!all.includes(v)) all.push(v);
  }
  return all;
};

const getBorrowingDetailNumber = (item = {}, keys = []) => {
  const detail = (item.details || []).find((currentDetail) => {
    const detailKey = String(currentDetail?.key || "").toLowerCase();
    const detailLabel = String(currentDetail?.label || "").toLowerCase();
    return keys.some((key) => detailKey === key || detailLabel === key);
  });
  const directValue = keys
    .flatMap((key) => [key, key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())])
    .map((key) => item?.[key])
    .find((value) => value !== null && value !== undefined && String(value).trim() !== "");
  const rawValue = detail?.value ?? directValue;
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getActiveBorrowedQuantity = (item = {}) => {
  const borrowedQuantity = getBorrowingDetailNumber(item, ["quantity"]) || 1;
  const returnedQuantity =
    getBorrowingDetailNumber(item, ["return_defective_quantity"]) +
    getBorrowingDetailNumber(item, ["return_working_quantity"]);
  return Math.max(0, borrowedQuantity - returnedQuantity);
};

const formatPickerLabel = (range) => {
  if (!range?.from) return "Select date range";
  if (range.from && !range.to) return `${format(range.from, "MMM d, yyyy")} —`;
  return `${format(range.from, "MMM d, yyyy")} — ${format(range.to, "MMM d, yyyy")}`;
};

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

const applyExportHeader = (worksheet, titleText, exportDate, logoImage, separatorImage, totalColumns, options = {}) => {
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

  worksheet.mergeCells(`B9:${endColumnLetter}9`);
  const schoolYearCell = worksheet.getCell("B9");
  const schoolYearText = (options.schoolYear || "").toString().trim() || "____________________";
  const semesterText = (options.semester || "").toString().trim() || "____________________";
  schoolYearCell.value = `${semesterText} Semester | S.Y ${schoolYearText}`;
  schoolYearCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  schoolYearCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };
};

// Item Modal Component
function ItemModal({ section, item, onClose, onSaved, tableName, templateColumns, items, fetchedBrands }) {
  const useTemplate = Array.isArray(templateColumns) && templateColumns.length > 0;
  const orderedTemplateColumns = useMemo(() => orderTemplateColumns(templateColumns), [templateColumns]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState(null);
  const [pendingRecordData, setPendingRecordData] = useState(null);
  const [duplicateAction, setDuplicateAction] = useState("");
  const [nameError, setNameError] = useState("");
  const [remarksDescError, setRemarksDescError] = useState("");

  const nameFieldKey = useMemo(() => {
    for (const col of orderedTemplateColumns) {
      if (col.subColumns && col.subColumns.length > 0) {
        const nameSub = col.subColumns.find((sc) => String(sc.physicalKey || "").toLowerCase() === "name");
        if (nameSub) return nameSub.physicalKey;
      }
      if (String(col.key || "").toLowerCase() === "name") return col.key;
    }
    return null;
  }, [orderedTemplateColumns]);

  const remarksFieldKey = useMemo(() => {
    for (const col of orderedTemplateColumns) {
      if (col.subColumns && col.subColumns.length > 0) {
        const rSub = col.subColumns.find((sc) => String(sc.physicalKey || "").toLowerCase() === "remarks");
        if (rSub) return rSub.physicalKey;
      }
      if (String(col.key || "").toLowerCase() === "remarks") return col.key;
    }
    return null;
  }, [orderedTemplateColumns]);

  const remarksDescFieldKey = useMemo(() => {
    for (const col of orderedTemplateColumns) {
      if (col.subColumns && col.subColumns.length > 0) {
        const rSub = col.subColumns.find((sc) => String(sc.physicalKey || "").toLowerCase() === "remarks_description");
        if (rSub) return rSub.physicalKey;
      }
      if (String(col.key || "").toLowerCase() === "remarks_description") return col.key;
    }
    return null;
  }, [orderedTemplateColumns]);

  const hasRemarksDescColumn = Boolean(remarksDescFieldKey);

  const REMARKS_REQUIRES_DESC = ["defective", "other"];

  const isRemarksDescRequired = () => {
    if (!remarksFieldKey) return false;
    const remarkVal = String(dynamicForm[remarksFieldKey] ?? "").trim().toLowerCase();
    return REMARKS_REQUIRES_DESC.includes(remarkVal);
  };

  const getNameValue = () => {
    if (useTemplate && nameFieldKey) return String(dynamicForm[nameFieldKey] ?? "").trim();
    if (!useTemplate) return legacyForm.type.trim();
    return "";
  };

  const validateName = (val) => {
    const trimmed = String(val || "").trim();
    if (!trimmed) return "Name is required.";
    return "";
  };

  const validateRemarksDesc = (val) => {
    if (!hasRemarksDescColumn) return "";
    if (isRemarksDescRequired()) {
      const trimmed = String(val || "").trim();
      if (!trimmed) return "Remarks Description is required when remark is Defective or Other.";
    }
    return "";
  };

  const createInitialSubFieldGroups = (columns) =>
    (columns || []).reduce((accumulator, column) => {
      if (Array.isArray(column?.subColumns) && column.subColumns.length > 1) {
        accumulator[column.key] = true;
      }
      return accumulator;
    }, {});
  const [openSubFieldGroups, setOpenSubFieldGroups] = useState(() =>
    createInitialSubFieldGroups(orderedTemplateColumns)
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
  // Use fetchedBrands from parent (InventorySection) which queries ALL inventory tables

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

  const renderFieldControl = (fieldKey, fieldConfig, isNameField = false, nameErr = "", setNameErr = () => {}, validateNameFn = () => "") => {
    if (isDropdownField(fieldConfig)) {
      // Use live fetched brands for brand fields (detected by key name or dynamicBrand flag)
      const isBrandField = fieldConfig?.dynamicBrand === true || fieldKey === "brand";
      const staticOptions = Array.isArray(fieldConfig?.options) ? fieldConfig.options : [];
      const options = isBrandField ? fetchedBrands : staticOptions;
      const hasOther = options.includes("Other");
      const regularOptions = hasOther ? options : [...options, "Other"];
      const rawValue = dynamicForm[fieldKey] ?? "";
      const isOtherSelected = rawValue === "Other" || (!hasOther && rawValue && !options.includes(rawValue));

      return (
        <div className="space-y-2">
          <Select
            value={isOtherSelected && rawValue !== "Other" ? "Other" : rawValue}
            onValueChange={(val) => {
              setDynamicForm((current) => ({
                ...current,
                [fieldKey]: val,
                ...(val !== "Other" && { [`${fieldKey}_other`]: "" }),
              }));
              // If this is the remarks dropdown, re-validate remarks description
              if (remarksFieldKey && fieldKey === remarksFieldKey) {
                const newVal = REMARKS_REQUIRES_DESC.includes(String(val).trim().toLowerCase());
                if (newVal) {
                  setRemarksDescError(validateRemarksDesc(dynamicForm[remarksDescFieldKey] ?? ""));
                } else {
                  setRemarksDescError("");
                }
              }
            }}
          >
            <SelectTrigger className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-[#4a1111]">
              <SelectValue placeholder={isBrandField ? "Select or type a brand…" : "Select an option"} />
            </SelectTrigger>
            <SelectContent className="rounded-lg border border-slate-200 bg-white shadow-md">
              {regularOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isOtherSelected && (
            <Input
              className="mt-1"
              placeholder={isBrandField ? "Type brand name…" : "Specify other value…"}
              value={rawValue !== "Other" ? rawValue : (dynamicForm[`${fieldKey}_other`] ?? "")}
              onChange={(event) => {
                const customVal = event.target.value;
                setDynamicForm((current) => ({
                  ...current,
                  [fieldKey]: "Other",
                  [`${fieldKey}_other`]: customVal,
                }));
              }}
            />
          )}
        </div>
      );
    }

    const isRemarksDescField = remarksDescFieldKey && fieldKey === remarksDescFieldKey;
    const isIdentifier = isIdentifierField(fieldKey);

    return (
      <Input
        className={cn(
          "mt-1",
          isIdentifier && "bg-slate-100 cursor-not-allowed",
          isNameField && nameErr
            ? "border-rose-400 bg-rose-50/50 focus-visible:ring-rose-400"
            : isNameField && !nameErr && dynamicForm[fieldKey]?.trim()
              ? "border-emerald-400 bg-emerald-50/30 focus-visible:ring-emerald-400"
              : isRemarksDescField && remarksDescError
                ? "border-rose-400 bg-rose-50/50 focus-visible:ring-rose-400"
                : isRemarksDescField && !remarksDescError && dynamicForm[fieldKey]?.trim()
                  ? "border-emerald-400 bg-emerald-50/30 focus-visible:ring-emerald-400"
                  : ""
        )}
        type={
          fieldConfig?.data_type === "date"
            ? "date"
            : ["int", "integer", "float", "number", "numeric"].includes(fieldConfig?.data_type)
              ? "number"
              : "text"
        }
        value={dynamicForm[fieldKey] ?? ""}
        readOnly={isIdentifier}
        onChange={(event) => {
          if (isIdentifier) return;
          setDynamicForm((current) => ({
            ...current,
            [fieldKey]: event.target.value,
          }));
          if (isNameField) {
            setNameErr(validateNameFn(event.target.value));
          }
          if (isRemarksDescField) {
            setRemarksDescError(validateRemarksDesc(event.target.value));
          }
        }}
      />
    );
  };

  const currentSnapshot = useTemplate
    ? buildTemplateSnapshot(dynamicForm)
    : buildLegacySnapshot(legacyForm);
  const hasUnsavedChanges = initialSnapshotRef.current !== currentSnapshot;

  const quantityFieldKey = useMemo(() => {
    for (const column of orderedTemplateColumns) {
      if (column.subColumns && column.subColumns.length > 0) {
        const quantitySubColumn = column.subColumns.find(
          (subColumn) =>
            String(subColumn.key || "").toLowerCase() === "quantity" ||
            String(subColumn.label || "").toLowerCase() === "quantity" ||
            String(subColumn.physicalKey || "").toLowerCase() === "quantity"
        );
        if (quantitySubColumn?.physicalKey) return quantitySubColumn.physicalKey;
        continue;
      }

      if (
        String(column.key || "").toLowerCase() === "quantity" ||
        String(column.label || "").toLowerCase() === "quantity"
      ) {
        return column.key;
      }
    }

    return "";
  }, [orderedTemplateColumns]);

  const isQuantityLikeKey = (fieldKey = "") => {
    const normalizedKey = String(fieldKey || "").trim().toLowerCase();
    return normalizedKey === "quantity" || normalizedKey.endsWith("_quantity");
  };

  const getDuplicateComparisonKeys = (recordData = {}) =>
    Object.keys(recordData).filter((key) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey) return false;
      if (normalizedKey === String(quantityFieldKey || "").toLowerCase() || isQuantityLikeKey(normalizedKey)) return false;
      if (["id", "section_id", "created_at", "updated_at", "sort_order"].includes(normalizedKey)) return false;
      if (isIdentifierField(normalizedKey)) return false;
      if (normalizedKey.endsWith("_item_number") || normalizedKey.endsWith("_computer_number")) return false;

      const value = recordData[key];
      return value !== null && value !== undefined && String(value).trim() !== "";
    });

  const normalizeDuplicateValue = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

  const findDuplicateItem = (recordData = {}) => {
    if (item?.id || !useTemplate) return null;

    const comparisonKeys = getDuplicateComparisonKeys(recordData);
    if (comparisonKeys.length === 0) return null;

    return (items || []).find((existingItem) =>
      comparisonKeys.every(
        (key) => normalizeDuplicateValue(existingItem?.[key]) === normalizeDuplicateValue(recordData?.[key])
      )
    ) || null;
  };

  const buildTemplateRecordData = () => {
    const recordData = {};
    for (const column of orderedTemplateColumns) {
      if (column.subColumns && column.subColumns.length > 0) {
        for (const subColumn of column.subColumns) {
          recordData[subColumn.physicalKey] = castValueByType(
            dynamicForm[subColumn.physicalKey],
            subColumn.data_type
          );
        }
      } else {
        const val = dynamicForm[column.key];
        // If user selected "Other" and typed a custom value, store the custom value
        if (val === "Other" && dynamicForm[`${column.key}_other`]) {
          recordData[column.key] = castValueByType(dynamicForm[`${column.key}_other`], column.data_type);
        } else {
          recordData[column.key] = castValueByType(val, column.data_type);
        }
      }
    }
    return recordData;
  };

  useEffect(() => {
    if (useTemplate) {
      const nextForm = {};
      for (const column of orderedTemplateColumns) {
        if (column.subColumns && column.subColumns.length > 0) {
          for (const subColumn of column.subColumns) {
            const existingValue = item?.[subColumn.physicalKey];
            nextForm[subColumn.physicalKey] =
              existingValue !== undefined && existingValue !== null && existingValue !== ""
                ? existingValue
                : isIdentifierField(subColumn.key)
                  ? getNextIdentifierValue(items, subColumn.physicalKey)
                  : "";
          }
        } else {
          const existingValue = item?.[column.key];
          const colOptions = isDropdownField(column) ? (column.options || []) : [];
          if (existingValue !== undefined && existingValue !== null && existingValue !== "") {
            // If the stored value doesn't match any dropdown option, treat as "Other"
            if (colOptions.length > 0 && !colOptions.includes(existingValue) && isDropdownField(column)) {
              nextForm[column.key] = "Other";
              nextForm[`${column.key}_other`] = existingValue;
            } else {
              nextForm[column.key] = existingValue;
            }
          } else {
            nextForm[column.key] = isIdentifierField(column.key)
              ? getNextIdentifierValue(items, column.key)
              : "";
          }
        }
      }
      setDynamicForm(nextForm);
      setOpenSubFieldGroups(createInitialSubFieldGroups(orderedTemplateColumns));
      initialSnapshotRef.current = buildTemplateSnapshot(nextForm);
      setShowDiscardConfirm(false);
      setShowSaveConfirm(false);
      setDuplicateMatch(null);
      setPendingRecordData(null);
      setDuplicateAction("");
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
    setDuplicateMatch(null);
    setPendingRecordData(null);
    setDuplicateAction("");
  }, [item, items, orderedTemplateColumns, useTemplate]);

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
    // Validate name field
    const currentName = getNameValue();
    const nameErr = validateName(currentName);
    setNameError(nameErr);

    // Validate remarks description (required when remark is Defective or Other)
    const rdErr = validateRemarksDesc(dynamicForm[remarksDescFieldKey] ?? "");
    setRemarksDescError(rdErr);

    if (nameErr || rdErr) return;

    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }
    save().catch((err) => {
      console.error("[Save] error:", err);
      alert(`Failed to save: ${err?.message || err}`);
    });
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    try {
      await save();
    } catch (err) {
      console.error("[Save] error:", err);
      alert(`Failed to save: ${err?.message || err}`);
    }
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

  const save = async ({ allowDuplicate = false, recordDataOverride = null } = {}) => {
    if (useTemplate) {
      if (!tableName) {
        throw new Error("Physical table is not ready yet. Please wait for the table mapping to load.");
      }

      const recordData = recordDataOverride || buildTemplateRecordData();
      const matchingItem = allowDuplicate ? null : findDuplicateItem(recordData);

      if (matchingItem) {
        setDuplicateMatch(matchingItem);
        setPendingRecordData(recordData);
        return;
      }

      const result = await upsertInventoryItem({
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

  const mergeDuplicateItem = async () => {
    if (!duplicateMatch || !pendingRecordData || !quantityFieldKey) return;

    setDuplicateAction("merge");
    try {
      const existingQuantity = Number(duplicateMatch?.[quantityFieldKey] ?? 0);
      const addedQuantity = Number(pendingRecordData?.[quantityFieldKey] ?? 0);
      const nextQuantity = (Number.isFinite(existingQuantity) ? existingQuantity : 0) +
        (Number.isFinite(addedQuantity) ? addedQuantity : 0);

      await updateInventoryItemQuantity({
        id: duplicateMatch.id,
        sectionId: section.id,
        tableName,
        quantity: nextQuantity,
      });
      onSaved();
    } finally {
      setDuplicateAction("");
    }
  };

  const addDuplicateSeparately = async () => {
    setDuplicateAction("separate");
    try {
      await save({ allowDuplicate: true, recordDataOverride: pendingRecordData });
    } finally {
      setDuplicateAction("");
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => {
        if (!open) requestClose();
      }}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {item ? "Edit Item" : "Add Item"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              {item
                ? `Update this item in ${section?.name || "the selected section"}.`
                : `Add a new item to ${section?.name || "the selected section"}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
            <div className="space-y-4">
            {useTemplate ? (
              <div className="grid gap-4 md:grid-cols-2">
                {orderedTemplateColumns.map((column) =>
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
                            {column.label}{String(column.key || "").toLowerCase() === "name" ? <span className="text-red-500">*</span> : null}
                          </span>
                        </div>
                      )}
                      {(column.subColumns.length <= 1 || openSubFieldGroups[column.key] !== false) && (
                        <div className={`grid gap-3 border-t border-slate-200 p-3 ${isIdentifierField(column.key) ? "md:grid-cols-1" : "md:grid-cols-3"}`}>
                          {column.subColumns.map((subColumn) => {
                            const isNameSubField = nameFieldKey && subColumn.physicalKey === nameFieldKey;
                            const isRemarksDescSubField = remarksDescFieldKey && subColumn.physicalKey === remarksDescFieldKey;
                            return (
                              <div key={subColumn.physicalKey}>
                                <label className="text-xs font-medium text-slate-600">
                                  {subColumn.label}{String(subColumn.physicalKey || "").toLowerCase() === "name" ? <span className="text-red-500">*</span> : null}
                                </label>
                                {renderFieldControl(subColumn.physicalKey, subColumn, isNameSubField, nameError, setNameError, validateName)}
                                {isNameSubField && nameError && (
                                  <p className="mt-1 text-xs font-medium text-rose-600">{nameError}</p>
                                )}
                                {isRemarksDescSubField && remarksDescError && (
                                  <p className="mt-1 text-xs font-medium text-rose-600">{remarksDescError}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={column.key} className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        {column.label}{String(column.key || "").toLowerCase() === "name" ? <span className="text-red-500">*</span> : null}
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
                        <div className="space-y-1">
                          {renderFieldControl(column.key, column)}
                          {remarksFieldKey && column.key === remarksFieldKey && isRemarksDescRequired() && (
                            <></>
                          )}
                        </div>
                      ) : (
                        <Input
                          className={cn(
                            "mt-1",
                            isIdentifierField(column.key) && "bg-slate-100 cursor-not-allowed",
                            useTemplate && nameFieldKey && column.key === nameFieldKey && nameError
                              ? "border-rose-400 bg-rose-50/50 focus-visible:ring-rose-400"
                              : useTemplate && nameFieldKey && column.key === nameFieldKey && !nameError && dynamicForm[column.key]?.trim()
                                ? "border-emerald-400 bg-emerald-50/30 focus-visible:ring-emerald-400"
                                : useTemplate && remarksDescFieldKey && column.key === remarksDescFieldKey && remarksDescError
                                  ? "border-rose-400 bg-rose-50/50 focus-visible:ring-rose-400"
                                  : useTemplate && remarksDescFieldKey && column.key === remarksDescFieldKey && !remarksDescError && dynamicForm[column.key]?.trim()
                                    ? "border-emerald-400 bg-emerald-50/30 focus-visible:ring-emerald-400"
                                    : ""
                          )}
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
                          readOnly={isIdentifierField(column.key)}
                          onChange={(event) => {
                            if (isIdentifierField(column.key)) return;
                            setDynamicForm((current) => ({
                              ...current,
                              [column.key]: event.target.value,
                            }));
                            if (useTemplate && nameFieldKey && column.key === nameFieldKey) {
                              setNameError(validateName(event.target.value));
                            }
                            if (useTemplate && remarksDescFieldKey && column.key === remarksDescFieldKey) {
                              setRemarksDescError(validateRemarksDesc(event.target.value));
                            }
                          }}
                        />
                      )}
                      {useTemplate && nameFieldKey && column.key === nameFieldKey && nameError && (
                        <p className="mt-1 text-xs font-medium text-rose-600">{nameError}</p>
                      )}
                      {useTemplate && remarksDescFieldKey && column.key === remarksDescFieldKey && remarksDescError && (
                        <p className="mt-1 text-xs font-medium text-rose-600">{remarksDescError}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Computer #
                  </label>
                  <Input
                    className="mt-1 bg-slate-100 cursor-not-allowed"
                    type="number"
                    min="1"
                    value={legacyForm.computerNumber}
                    readOnly
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
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={requestClose}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={requestSave}
            className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
          >
            Save
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you close now, those changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel onClick={cancelDiscard} className="rounded-lg">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmDiscard}
              className="rounded-lg bg-rose-600 px-6 text-white hover:bg-rose-700"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel onClick={cancelSave} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmSave}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(duplicateMatch)}
        onOpenChange={(open) => {
          if (!open && duplicateAction === "") {
            setDuplicateMatch(null);
            setPendingRecordData(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">Item already exists</DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              A matching item was found in {section?.name || "this section"}.
            </DialogDescription>
          </DialogHeader>

          {duplicateMatch && (
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
              <p className="text-sm text-slate-600">
                You can merge it by adding the typed quantity to the existing item, or keep it as a separate
                inventory record.
              </p>

              {quantityFieldKey ? (
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Existing quantity
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatCellValue(duplicateMatch?.[quantityFieldKey])}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quantity to add
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-[#4a1111]">
                      {formatCellValue(pendingRecordData?.[quantityFieldKey])}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This inventory does not have a Quantity column, so it can only be added separately.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDuplicateMatch(null);
                  setPendingRecordData(null);
                }}
                disabled={duplicateAction !== ""}
                className="rounded-lg"
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDuplicateSeparately}
                disabled={duplicateAction !== ""}
                className="rounded-lg"
              >
                {duplicateAction === "separate" ? "Adding..." : "Add separately"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={mergeDuplicateItem}
                disabled={!quantityFieldKey || duplicateAction !== ""}
                className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
              >
                {duplicateAction === "merge" ? "Merging..." : "Merge quantity"}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Main Component
export default function InventorySection() {
  const { sectionSlug: tabSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDefectiveOnlyView = Boolean(searchParams.get("defectiveOnly"));
  const { tabs, loading: tabsLoading, error: tabsError } = useInventoryCatalog();
  const { showGlobalLoader, hideGlobalLoader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSectionSlug, setSelectedSectionSlug] = useState("");
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  itemsRef.current = items;
  const [activeBorrowedItemIds, setActiveBorrowedItemIds] = useState(() => new Set());
  const [activeBorrowedItemQuantities, setActiveBorrowedItemQuantities] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsLoadedForSectionId, setItemsLoadedForSectionId] = useState(null);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [itemsError, setItemsError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tabTableName, setTabTableName] = useState("");
  const [templateColumns, setTemplateColumns] = useState([]);
  const [sectionColumnsMap, setSectionColumnsMap] = useState({}); // { [sectionId]: ColumnDef[] }
  const [gridEditMode, setGridEditMode] = useState(false);
  const [cellDrafts, setCellDrafts] = useState({});
  const [savingCellKey, setSavingCellKey] = useState(null);
  const [fetchedBrands, setFetchedBrands] = useState([]);
  const [tabBrands, setTabBrands] = useState([]); // template-specific brands from tab config
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyDateRange, setHistoryDateRange] = useState({ from: undefined, to: undefined });
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
  const [confirmExitEditMode, setConfirmExitEditMode] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);
  const [selectedExportSections, setSelectedExportSections] = useState([]);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [exportSchoolYear, setExportSchoolYear] = useState("");
  const [exportSemester, setExportSemester] = useState("");
  const [preparedByName, setPreparedByName] = useState("");
  const [inspectedByName, setInspectedByName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showColumnOptions, setShowColumnOptions] = useState(true);
  const [exportLogRefreshToken, setExportLogRefreshToken] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [isHistoryOpen, setIsHistoryOpen] = useState(() => searchParams.get("view") === "logs");
  const [pendingAction, setPendingAction] = useState("");

  // ── Remark Edit state ──
  const [remarkChangeModal, setRemarkChangeModal] = useState(null);
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [remarkInlineEdit, setRemarkInlineEdit] = useState(null);
  const [defectiveConfirmModal, setDefectiveConfirmModal] = useState(null);
  // { item, currentRemark, allRemarkOptions, remarkColumnKey, quantityKey }

  // ── Item Transfer state ──
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceItem, setTransferSourceItem] = useState(null);
  // { item, currentRemark, allRemarkOptions, remarkColumnKey, quantityKey }

  const historyDatePickerRef = useRef(null);
  const inlineEditRef = useRef(null);

  const updateHistoryView = (isOpen) => {
    setIsHistoryOpen(isOpen);
    // Update URL params to reflect the view
    if (isOpen) {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("view", "logs");
        return params;
      }, { replace: true });
    } else {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.delete("view");
        return params;
      }, { replace: true });
    }
  };

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

  const isDefectiveRemark = (remark) => String(remark || "").toLowerCase().includes("defective");

  const REMARKS_REQUIRES_DESC = ["defective", "other"];

  const isRemarkDescRequired = (remark) => REMARKS_REQUIRES_DESC.includes(String(remark || "").trim().toLowerCase());

  const executeRemarkChange = async ({ item, targetRemark, quantity, remarkColumnKey, quantityKey, itemQty, remarksDescription = "" }) => {
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    setRemarkSaving(true);
    try {
      const newSourceQty = Math.max(0, itemQty - qty);

      // Use functional updater so we always work with the freshest items array
      // Find merge target from current items (read from ref to always get latest)
      const idKey = item.item_number != null ? "item_number" : item.computer_number != null ? "computer_number" : null;
      const norm = (v) => String(v ?? "").trim().toLowerCase();
      const currentItems = itemsRef.current || items;

      let foundTarget = null;
      if (idKey && item[idKey] != null) {
        foundTarget = currentItems.find((it) =>
          it.id !== item.id &&
          it[idKey] === item[idKey] &&
          norm(it[remarkColumnKey]) === norm(targetRemark)
        ) || null;
      }
      if (!foundTarget) {
        const matchKeys = Object.keys(item).filter((k) => {
          const nk = String(k || "").trim().toLowerCase();
          if (!nk) return false;
          if (["id", "created_at", "updated_at", "sort_order"].includes(nk)) return false;
          if (nk === String(quantityKey || "").toLowerCase()) return false;
          if (nk === String(remarkColumnKey || "").trim().toLowerCase()) return false;
          return item[k] != null && String(item[k]).trim() !== "";
        });
        if (matchKeys.length > 0) {
          foundTarget = currentItems.find((it) =>
            it.id !== item.id &&
            norm(it[remarkColumnKey]) === norm(targetRemark) &&
            matchKeys.every((k) => norm(it[k]) === norm(item[k]))
          ) || null;
        }
      }

      // Build the extra record data (remarks_description if needed, only when column exists)
      const extraRecord = {};
      if (sectionHasRemarksDescColumn && isRemarkDescRequired(targetRemark) && remarksDescription.trim()) {
        extraRecord.remarks_description = remarksDescription.trim();
      }

      if (foundTarget) {
        // Merge path: update state AND persist to DB
        const tbl = tabTableName || null;
        const newTargetQty = (Number(foundTarget[quantityKey]) || 0) + qty;

        // Update UI state
        if (newSourceQty <= 0) {
          setItems((prev) => prev.map((it) => it.id === foundTarget.id ? { ...it, [quantityKey]: newTargetQty, ...(extraRecord.remarks_description != null ? { remarks_description: extraRecord.remarks_description } : {}) } : it).filter((it) => it.id !== item.id));
        } else {
          setItems((prev) => prev.map((it) => {
            if (it.id === item.id) return { ...it, [quantityKey]: newSourceQty };
            if (it.id === foundTarget.id) return { ...it, [quantityKey]: newTargetQty, ...(extraRecord.remarks_description != null ? { remarks_description: extraRecord.remarks_description } : {}) };
            return it;
          }));
        }

        // Persist to DB
        if (newSourceQty <= 0) {
          const { error: updErr } = await supabase.from(tbl).update({ [quantityKey]: newTargetQty, ...extraRecord }).eq("id", foundTarget.id);
          if (updErr) throw new Error("Update target failed: " + updErr.message);
          const { error: delErr } = await supabase.from(tbl).delete().eq("id", item.id);
          if (delErr) throw new Error("Delete source failed: " + delErr.message);
        } else {
          const { error: e1 } = await supabase.from(tbl).update({ [quantityKey]: newTargetQty, ...extraRecord }).eq("id", foundTarget.id);
          if (e1) throw new Error("Update target failed: " + e1.message);
          const { error: e2 } = await supabase.from(tbl).update({ [quantityKey]: newSourceQty }).eq("id", item.id);
          if (e2) throw new Error("Update source failed: " + e2.message);
        }
      } else if (newSourceQty <= 0) {
        // No target, source fully consumed — update remark in-place
        await upsertInventoryItem({ id: item.id, sectionId: selectedSection?.id, tableName: tabTableName || null, recordData: { [remarkColumnKey]: targetRemark, ...extraRecord } });
        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, [remarkColumnKey]: targetRemark, ...(extraRecord.remarks_description != null ? { remarks_description: extraRecord.remarks_description } : {}) } : it));
      } else {
        // No target, source has remaining qty — create a new row
        await upsertInventoryItem({ id: item.id, sectionId: selectedSection?.id, tableName: tabTableName || null, recordData: { [quantityKey]: newSourceQty } });
        const nr = { ...item }; delete nr.id; delete nr.created_at; delete nr.updated_at;
        nr[quantityKey] = qty; nr[remarkColumnKey] = targetRemark;
        if (extraRecord.remarks_description) nr.remarks_description = extraRecord.remarks_description;
        const newRecordData = { ...nr };
        const created = await upsertInventoryItem({ id: null, sectionId: selectedSection?.id, tableName: tabTableName || null, recordData: newRecordData });
        setItems((prev) => { const u = prev.map((it) => it.id === item.id ? { ...it, [quantityKey]: newSourceQty } : it); if (created?.id) { const newRow = { ...nr, id: created.id }; const si = u.findIndex((it) => it.id === item.id); u.splice(si + 1, 0, newRow); } return u; });
      }
      setRemarkChangeModal(null);
    } catch (err) { console.error("Remark change failed:", err); alert("Remark change failed: " + (err.message || err)); }
    finally { setRemarkSaving(false); }
  };

  const handleRemarkChange = () => {
    if (!remarkChangeModal) return;
    const { item, currentRemark, targetRemark, quantity, remarkColumnKey, quantityKey, itemQty, remarksDescription } = remarkChangeModal;
    if (currentRemark === targetRemark) { setRemarkChangeModal(null); return; }
    // Validate remarks description when required (only if the column exists)
    if (sectionHasRemarksDescColumn && isRemarkDescRequired(targetRemark)) {
      const descTrimmed = String(remarksDescription || "").trim();
      if (!descTrimmed) {
        setRemarkChangeModal((prev) => ({ ...prev, remarksDescError: "Remarks Description is required when remark is Defective or Other." }));
        return;
      }
    }
    setRemarkChangeModal((prev) => ({ ...prev, remarksDescError: "" }));
    if (isDefectiveRemark(targetRemark)) {
      setDefectiveConfirmModal({ item, currentRemark, targetRemark, quantity, remarkColumnKey, quantityKey, itemQty, remarksDescription });
      setRemarkChangeModal(null);
      return;
    }
    executeRemarkChange({ item, targetRemark, quantity, remarkColumnKey, quantityKey, itemQty, remarksDescription });
  };

  useEffect(() => {
    setPage(1);
  }, [selectedSectionSlug, refreshKey, isDefectiveOnlyView]);

  const commitInlineRemark = async (newRemark) => {
    if (!remarkInlineEdit) return;
    const { item, currentRemark, remarkColumnKey } = remarkInlineEdit;
    if (currentRemark === newRemark) { setRemarkInlineEdit(null); return; }
    setRemarkSaving(true);
    try {
      await upsertInventoryItem({ id: item.id, sectionId: selectedSection?.id, tableName: tabTableName || null, recordData: { [remarkColumnKey]: newRemark } });
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, [remarkColumnKey]: newRemark } : it));
      setRemarkInlineEdit(null);
    } catch (err) { console.error("Remark change failed:", err); alert("Remark change failed: " + (err.message || err)); }
    finally { setRemarkSaving(false); }
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [isHistoryOpen]);

  useEffect(() => {
    if (!gridEditMode) {
      setCellDrafts({});
      setSavingCellKey(null);
    }
  }, [gridEditMode, selectedSectionSlug]);

  // Close inline edit popover on outside click
  useEffect(() => {
    if (!remarkInlineEdit) return;
    const handleClick = (e) => {
      if (inlineEditRef.current && !inlineEditRef.current.contains(e.target)) {
        setRemarkInlineEdit(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [remarkInlineEdit]);

  // Close inline edit when exiting edit mode
  useEffect(() => {
    if (!gridEditMode) setRemarkInlineEdit(null);
  }, [gridEditMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleInventoryItemsChanged = () => {
      setRefreshKey((current) => current + 1);
    };

    window.addEventListener(INVENTORY_ITEMS_CHANGED_EVENT, handleInventoryItemsChanged);
    return () => {
      window.removeEventListener(INVENTORY_ITEMS_CHANGED_EVENT, handleInventoryItemsChanged);
    };
  }, []);

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
    await deleteInventoryItem(pendingDeleteId, tabTableName || null, selectedSection?.id || null);
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
    const nextAction = pendingAction;

    setGridEditMode(false);
    setPendingAction("");
    setConfirmExitEditMode(false);

    toast.success("All changes saved.");

    if (nextAction === "switchHistory") {
      setIsHistoryOpen(true);
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("view", "logs");
        return params;
      }, { replace: true });
    } else if (nextAction === "exitHistory") {
      setIsHistoryOpen(false);
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.delete("view");
        return params;
      }, { replace: true });
    }
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
  const orderedTemplateColumns = useMemo(() => orderTemplateColumns(templateColumns), [templateColumns]);
  const usesTemplateColumns = templateColumns.length > 0;
  // Use per-section columns if available, otherwise fall back to merged template columns
  const displayTemplateColumns = useMemo(() => {
    if (selectedSection?.id && sectionColumnsMap[selectedSection.id]?.length > 0) {
      return orderTemplateColumns(normalizeTemplateColumns(sectionColumnsMap[selectedSection.id]));
    }
    return orderedTemplateColumns;
  }, [selectedSection?.id, sectionColumnsMap, orderedTemplateColumns]);
  const hasItemNumberColumn = useMemo(
    () => displayTemplateColumns.some((column) => String(column?.key || "").trim() === "item_number"),
    [displayTemplateColumns]
  );
  const sectionHasRemarksDescColumn = useMemo(
    () => displayTemplateColumns.some((column) => {
      const k = String(column?.key || "").trim().toLowerCase();
      if (k === "remarks_description") return true;
      return column?.subColumns?.some((sc) => String(sc.physicalKey || "").toLowerCase() === "remarks_description") || false;
    }),
    [displayTemplateColumns]
  );
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
  const displayItems = useMemo(() => {
    let visibleItems = isDefectiveOnlyView
      ? items.filter(isDefectiveInventoryRecord)
      : items;

    // Apply search filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      visibleItems = visibleItems.filter((item) => {
        return Object.values(item).some((val) => {
          if (val == null) return false;
          return String(val).toLowerCase().includes(query);
        });
      });
    }

    if (!hasItemNumberColumn) {
      return visibleItems;
    }

    return [...visibleItems].sort((leftItem, rightItem) => {
      const leftValue = Number.parseInt(String(leftItem?.item_number ?? "").trim(), 10);
      const rightValue = Number.parseInt(String(rightItem?.item_number ?? "").trim(), 10);
      const leftMissing = !Number.isFinite(leftValue);
      const rightMissing = !Number.isFinite(rightValue);

      if (leftMissing && rightMissing) return 0;
      if (leftMissing) return 1;
      if (rightMissing) return -1;
      return leftValue - rightValue;
    });
  }, [hasItemNumberColumn, isDefectiveOnlyView, items, searchQuery]);
  const totalPages = Math.ceil(displayItems.length / itemsPerPage);
  const visiblePageNumbers = (() => {
    const maxVisible = 3;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const offset = Math.min(Math.max(page - 2, 0), totalPages - maxVisible);
    const startPage = offset + 1;
    return Array.from({ length: maxVisible }, (_, index) => startPage + index);
  })();

  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const paginatedItems = useMemo(
    () =>
      displayItems.filter(
        (_, index) => index >= pageStartIndex && index < pageEndIndex
      ),
    [displayItems, pageStartIndex, pageEndIndex]
  );

  // Compute defective/missing status for each item
  const itemStatusMap = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const hasDefect = isDefectiveInventoryRecord(item);

      const hasMissing =
        usesTemplateColumns && displayTemplateColumns.length > 0
          ? displayTemplateColumns.some((column) => {
            if (column.subColumns && column.subColumns.length > 0) {
              return column.subColumns.some((subColumn) => {
                if (isIdentifierLikeField(subColumn.physicalKey)) return false;
                return !hasMeaningfulValue(item?.[subColumn.physicalKey]);
              });
            }

            if (isIdentifierLikeField(column.key)) return false;
            return !hasMeaningfulValue(item?.[column.key]);
          })
          : ["type", "brand", "description", "status"].some((fieldKey) => {
            if (isIdentifierLikeField(fieldKey)) return false;
            return !hasMeaningfulValue(item?.[fieldKey]);
          });

      map[item.id] = { hasDefect, hasMissing };
    });
    return map;
  }, [displayTemplateColumns, items, usesTemplateColumns]);

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
        className={`inline-flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-inherit transition hover:bg-slate-200/70 hover:text-slate-900 ${align === "left" ? "justify-start text-left" : "justify-center text-center"
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
      setSectionsLoading(true);
      if (!tab) {
        setSelectedSectionSlug("");
        setTabTableName("");
        setTemplateColumns([]);
        setLoading(false);
        setSectionsLoading(false);
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
          setSectionColumnsMap(config?.sectionColumns || {});
          setTabBrands(Array.isArray(config?.brands) ? config.brands : []);
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
          setSectionsLoading(false);
        }
      }
    };

    loadTabState();

    return () => {
      cancelled = true;
    };
  }, [tab, searchParams]);

  // Fetch brands for this tab: template-specific presets + real data from this tab's own table
  useEffect(() => {
    let cancelled = false;

    const fetchBrands = async () => {
      // Start with template-specific preset brands (from tab config)
      const brandSets = new Set(tabBrands);

      // Supplement with real brand data from this tab's own table only
      if (tabTableName) {
        try {
          const { data } = await supabase
            .from(tabTableName)
            .select("brand")
            .not("brand", "is", null)
            .neq("brand", "");
          if (data) {
            data.forEach((r) => {
              const b = String(r.brand || "").trim();
              if (b) brandSets.add(b);
            });
          }
        } catch { /* table may not have brand column yet — use presets only */ }
      }

      const sorted = [...brandSets].sort((a, b) => a.localeCompare(b));
      if (!cancelled) setFetchedBrands(sorted);
    };
    fetchBrands();
    return () => { cancelled = true; };
  }, [tabTableName, tabBrands, refreshKey]);

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
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("section", nextSection);
        return params;
      }, { replace: true });
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
        setItemsLoadedForSectionId(null);
        if (!sectionsLoading) {
          setItemsLoading(false);
        }
        return;
      }

      setItemsLoading(true);
      setItemsLoadedForSectionId(null);
      setItemsError("");
      setItems([]);

      try {
        const loadedItems = await fetchInventoryItems(
          selectedSection.id,
          tabTableName || null
        );
        if (!cancelled) {
          setItems(loadedItems || []);
          setItemsLoadedForSectionId(selectedSection.id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([]);
          setItemsLoadedForSectionId(null);
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
  }, [selectedSection?.id, tabTableName, refreshKey, sectionsLoading]);

  useEffect(() => {
    let cancelled = false;

    const loadActiveBorrowedItems = async () => {
      if (!selectedSection?.id) {
        setActiveBorrowedItemIds(new Set());
        setActiveBorrowedItemQuantities({});
        return;
      }

      try {
        const records = await fetchBorrowingRecords({ status: "borrowed" });
        if (cancelled) return;

        const borrowedIds = new Set();
        const borrowedQuantities = {};
        records.forEach((record) => {
          (record.items || []).forEach((borrowedItem) => {
            if (!borrowedItem?.inventoryItemId) return;
            if (
              borrowedItem.inventorySectionId &&
              String(borrowedItem.inventorySectionId) !== String(selectedSection.id)
            ) {
              return;
            }
            if (
              tabTableName &&
              borrowedItem.tableName &&
              String(borrowedItem.tableName) !== String(tabTableName)
            ) {
              return;
            }
            const activeQuantity = getActiveBorrowedQuantity(borrowedItem);
            if (activeQuantity > 0) {
              const itemId = String(borrowedItem.inventoryItemId);
              borrowedIds.add(itemId);
              borrowedQuantities[itemId] = (borrowedQuantities[itemId] || 0) + activeQuantity;
            }
          });
        });

        setActiveBorrowedItemIds(borrowedIds);
        setActiveBorrowedItemQuantities(borrowedQuantities);
      } catch (borrowError) {
        console.error("Failed to load active borrowed items:", borrowError);
        if (!cancelled) {
          setActiveBorrowedItemIds(new Set());
          setActiveBorrowedItemQuantities({});
        }
      }
    };

    loadActiveBorrowedItems();

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

  useEffect(() => {
    if (!showHistoryDatePicker) return undefined;

    const handlePointerDown = (event) => {
      if (historyDatePickerRef.current && !historyDatePickerRef.current.contains(event.target)) {
        setShowHistoryDatePicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showHistoryDatePicker]);

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
    setExportSchoolYear(getCurrentSchoolYear());
    setExportSemester(SEMESTER_OPTIONS[0]);
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
      showGlobalLoader("Exporting inventory...");
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
          columnsToExport.length + 1,
          { schoolYear: exportSchoolYear, semester: exportSemester }
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

      // Generate filename and save locally
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `${tab?.slug || "inventory"}_sections_export-${timestamp}.xlsx`;
      saveAs(blob, filename);

      // Upload to storage and log export to dynamic shared table (fallback to inventory_section_exports)
      try {
        const EXPORT_BUCKET = "export-logs";
        const storagePath = `section-exports/${tabTableName || 'sections'}/${selectedSection?.id || 'unknown'}/${filename}`;
        const { error: uploadError } = await supabase.storage.from(EXPORT_BUCKET).upload(storagePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        });

        if (uploadError) {
          console.warn('Failed to upload section export to storage:', uploadError);
        }

        // determine exported_by from auth if available
        let exportedBy = 'system';
        try {
          const userResult = await supabase.auth.getUser();
          const user = userResult?.data?.user;
          exportedBy = (user?.user_metadata?.full_name || user?.email || user?.id || 'system').trim();
        } catch (e) {
          // ignore
        }

        // try dynamic shared table first
        let wroteRecord = false;
        try {
          const { data: dynData, error: dynErr } = await supabase.from('dynamic_inventory_export_logs').insert({
            exported_by: exportedBy || 'system',
            file_name: filename,
            export_date: exportDate,
            file_path: storagePath,
            tab_id: tab?.id || null,
            inventory_uuid: selectedSection?.id || null,
            table_name: tabTableName || null,
            metadata: { section_slug: selectedSection?.slug } || null,
          }).select();
          if (!dynErr) {
            wroteRecord = true;
          }
        } catch (e) {
          console.warn('[InventorySection] dynamic insert threw:', e);
        }

        if (!wroteRecord) {
          // fallback to per-section shared table
          try {
            try {
              const { data: fbData, error: fallbackErr } = await supabase.from('inventory_section_exports').insert({
                exported_by: exportedBy || 'system',
                file_name: filename,
                export_date: exportDate,
                file_path: storagePath,
                section_id: selectedSection?.id || null,
                tab_id: tab?.id || null,
              }).select();
              if (!fallbackErr) wroteRecord = true;
            } catch (e) {
              console.warn('[InventorySection] fallback insert threw:', e);
            }
          } catch (e) {
            console.warn('Error inserting export record fallback:', e);
          }
        }
      } catch (e) {
        console.warn('Error recording/exporting section file:', e);
      }

      setShowExportModal(false);
      setExportLogRefreshToken((current) => current + 1);
      toast.success("Inventory exported successfully.");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      hideGlobalLoader();
      setExporting(false);
    }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditingItem(null);
    setRefreshKey((current) => current + 1);
  };

  const isSectionTableLoading = !isHistoryOpen && (itemsLoading || itemsLoadedForSectionId !== selectedSection?.id);

  if (tabsLoading || loading || sectionsLoading || isSectionTableLoading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]" role="status" aria-label="Loading inventory section" />
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
      <div className="w-full space-y-5">

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center justify-start gap-1.5">
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
                    setSearchParams((current) => {
                      const params = new URLSearchParams(current);
                      params.set("section", section.slug);
                      return params;
                    }, { replace: true });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${section.slug === selectedSectionSlug
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
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                  title={usesTemplateColumns && !tabTableName ? "Loading table..." : "Add item"}
                  aria-label={usesTemplateColumns && !tabTableName ? "Loading table" : "Add item"}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New Item</span>
                </button>
                <button
                  type="button"
                  onClick={requestExitEditMode}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
                  title="Done editing"
                  aria-label="Done editing"
                >
                  <Check className="h-4 w-4" />
                  <span>Done</span>
                </button>
              </>
            ) : (
              <>
                {!isHistoryOpen && (
                  <>
                    <button
                      type="button"
                      onClick={openExportModal}
                      disabled={itemsLoading || items.length === 0}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                      title={itemsLoading ? "Loading items..." : "Export"}
                      aria-label={itemsLoading ? "Loading items" : "Export"}
                    >
                      <Download className="h-4 w-4" />
                      <span>Export</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridEditMode(true)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
                      title="Edit mode off"
                      aria-label="Edit mode off"
                    >
                      <PencilLine className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    // toggle history mode; prompt if exiting edit mode with changes
                    if (!isHistoryOpen) {
                      // Check if in edit mode and has any unsaved changes (from cellDrafts)
                      const hasUnsavedChanges = gridEditMode && Object.keys(cellDrafts).length > 0;
                      if (hasUnsavedChanges) {
                        // Show confirmation before switching to history
                        setPendingAction('switchHistory');
                        setConfirmExitEditMode(true);
                      } else {
                        // No unsaved changes, proceed directly to history
                        setGridEditMode(false);
                        setIsHistoryOpen(true);
                        setSearchParams((current) => {
                          const params = new URLSearchParams(current);
                          params.set("view", "logs");
                          return params;
                        }, { replace: true });
                      }
                    } else {
                      setIsHistoryOpen(false);
                      setSearchParams((current) => {
                        const params = new URLSearchParams(current);
                        params.delete("view");
                        return params;
                      }, { replace: true });
                    }
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
                  title={isHistoryOpen ? "Return to inventory" : "View history"}
                  aria-label={isHistoryOpen ? "Return to inventory" : "View history"}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    {isHistoryOpen ? (
                      <ChevronLeft className="h-4 w-4 text-white" />
                    ) : (
                      <FileText className="h-4 w-4 text-white" />
                    )}
                  </span>
                  <span>{isHistoryOpen ? "Return" : "Logs"}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {!isHistoryOpen && (
          <div className="mt-3 w-full sm:w-96">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
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

        {!isHistoryOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-blue-600" aria-hidden="true" />
              Borrowed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-rose-500" aria-hidden="true" />
              Defective
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-amber-500" aria-hidden="true" />
              Missing data
            </span>
          </div>
        )}

        {isHistoryOpen && (
          <div className="relative z-20 mt-3 flex w-full flex-wrap items-center gap-3 overflow-visible">
            <div className="relative w-full sm:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Search history, actions, values, dates..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 shadow-sm focus:border-[#4a1111] focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
              />
              {historySearchQuery && (
                <button
                  type="button"
                  onClick={() => setHistorySearchQuery("")}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear history search"
                  title="Clear history search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div ref={historyDatePickerRef} className="relative z-50">
              <button
                type="button"
                onClick={() => setShowHistoryDatePicker((current) => !current)}
                className="w-full min-w-[18rem] sm:w-64 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-left text-slate-700 hover:border-slate-300"
              >
                <span className="text-slate-500">{formatPickerLabel(historyDateRange)}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {showHistoryDatePicker && (
                <div className="absolute left-0 top-full z-50 mt-2 w-fit rounded-lg border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 px-2 py-2 shadow-[0_24px_80px_rgba(15,23,42,0.16)] ring-1 ring-white/60 backdrop-blur-sm">
                  <style>{`
                    .rdp-sidebar-picker {
                      --rdp-accent-color: #4a1111;
                      --rdp-background-color: transparent;
                      --rdp-outline: 2px solid rgba(74, 17, 17, 0.28);
                      --rdp-outline-selected: 2px solid rgba(74, 17, 17, 0.28);
                      color: hsl(var(--foreground));
                      margin: 0;
                    }

                    .rdp-sidebar-picker .rdp-months {
                      gap: 0.75rem;
                    }

                    .rdp-sidebar-picker .rdp-month_caption,
                    .rdp-sidebar-picker .rdp-caption_label {
                      color: hsl(var(--foreground));
                      font-size: 0.95rem;
                      font-weight: 700;
                      letter-spacing: -0.01em;
                    }

                    .rdp-sidebar-picker .rdp-nav {
                      top: 0.1rem;
                    }

                    .rdp-sidebar-picker .rdp-nav_button_previous {
                      margin-right: 0.4rem;
                    }

                    .rdp-sidebar-picker .rdp-nav_button {
                      width: 2rem;
                      height: 2rem;
                      border-radius: 9999px;
                      border: 1px solid hsl(var(--border));
                      background: hsl(var(--background));
                      color: #4a1111;
                      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
                      transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
                    }

                    .rdp-sidebar-picker .rdp-nav_button:hover {
                      border-color: rgba(74, 17, 17, 0.18);
                      background: rgba(74, 17, 17, 0.06);
                      transform: translateY(-1px);
                    }

                    .rdp-sidebar-picker .rdp-nav_button:disabled {
                      opacity: 0.45;
                      transform: none;
                    }

                    .rdp-sidebar-picker .rdp-chevron {
                      fill: none;
                      stroke: currentColor;
                    }

                    .rdp-sidebar-picker .rdp-table {
                      border-collapse: separate;
                      border-spacing: 0 0.3rem;
                    }

                    .rdp-sidebar-picker .rdp-head_cell {
                      color: hsl(var(--muted-foreground));
                      font-size: 0.68rem;
                      font-weight: 700;
                      letter-spacing: 0.18em;
                      text-transform: uppercase;
                    }

                    .rdp-sidebar-picker .rdp-day {
                      width: 2.35rem;
                      height: 2.35rem;
                    }

                    .rdp-sidebar-picker .rdp-day .rdp-button {
                      width: 2.35rem;
                      height: 2.35rem;
                      border-radius: 9999px;
                      font-size: 0.85rem;
                      font-weight: 500;
                      color: hsl(var(--foreground));
                      transition: background-color 150ms ease, color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
                    }

                    .rdp-sidebar-picker .rdp-day .rdp-button:hover {
                      background: hsl(var(--secondary));
                      transform: translateY(-1px);
                    }

                    .rdp-sidebar-picker .rdp-day_selected .rdp-button,
                    .rdp-sidebar-picker .rdp-day_range_start .rdp-button,
                    .rdp-sidebar-picker .rdp-day_range_end .rdp-button {
                      background-color: #4a1111 !important;
                      color: #ffffff !important;
                      box-shadow: 0 10px 22px rgba(74, 17, 17, 0.22);
                    }

                    .rdp-sidebar-picker .rdp-day_range_middle .rdp-button {
                      background-color: rgba(74, 17, 17, 0.1) !important;
                      color: #4a1111 !important;
                    }

                    .rdp-sidebar-picker .rdp-day_today .rdp-button {
                      box-shadow: inset 0 0 0 1px rgba(74, 17, 17, 0.35);
                    }

                    .rdp-sidebar-picker .rdp-day_outside .rdp-button,
                    .rdp-sidebar-picker .rdp-day_disabled .rdp-button {
                      color: hsl(var(--muted-foreground));
                      opacity: 0.45;
                    }

                    .rdp-sidebar-picker .rdp-footer {
                      margin-top: 0.75rem;
                      padding-top: 0.75rem;
                      border-top: 1px solid hsl(var(--border));
                      color: hsl(var(--muted-foreground));
                      font-size: 0.75rem;
                    }
                  `}</style>
                  <DayPicker
                    className="rdp-sidebar-picker text-sm"
                    mode="range"
                    selected={historyDateRange}
                    numberOfMonths={1}
                    onSelect={(range) => {
                      setHistoryDateRange(range || { from: undefined, to: undefined });
                    }}
                    footer={
                      historyDateRange.from && historyDateRange.to
                        ? `${format(historyDateRange.from, "MMM d, yyyy")} — ${format(historyDateRange.to, "MMM d, yyyy")}`
                        : ""
                    }
                    fromDate={new Date("2000-01-01")}
                    toDate={new Date("2100-12-31")}
                  />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryDateRange({ from: undefined, to: undefined })}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHistoryDatePicker(false)}
                      className="rounded-full bg-[#2b0707] px-3 py-1 text-xs font-medium text-white hover:bg-[#3a0b0b]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!isHistoryOpen && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">


            <div className="p-0">
              {!selectedSection ? (
                <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                  <p className="text-slate-500 font-medium">
                    Pick a section to view or add items.
                  </p>
                </div>
              ) : itemsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
                  {itemsError}
                </div>
              ) : displayItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                  <p className="text-slate-500 font-medium">
                    {isDefectiveOnlyView ? "No defective records found for this section." : "No records found for this section."}
                  </p>
                </div>
              ) : (
                <div className="computer-lab-scrollbar w-full max-w-full min-h-[18rem] max-h-[calc(100vh-16rem)] overflow-auto sm:max-h-[calc(100vh-18rem)] lg:max-h-[calc(100vh-20rem)]">
                  <table className="w-max min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100">
                      <tr>
                        {usesTemplateColumns &&
                          displayTemplateColumns.map((column) => (
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
                      {paginatedItems.map((item, rowIndex) => {
                        const itemStatus = itemStatusMap[item.id] || { hasDefect: false, hasMissing: false };
                        const remarkCol = findRemarkColumn(displayTemplateColumns);
                        const currentRemark = getItemRemark(item, remarkCol);
                        const normalizedRemark = currentRemark.toLowerCase();
                        const activeBorrowedQuantity = activeBorrowedItemQuantities[String(item.id)] || 0;
                        const isBorrowed =
                          activeBorrowedQuantity > 0 ||
                          activeBorrowedItemIds.has(String(item.id)) ||
                          normalizedRemark === "borrowed" ||
                          normalizedRemark.includes("borrowed");
                        const rowIndicatorColors = [
                          ...(isBorrowed ? ["#2563eb"] : []),
                          ...(itemStatus.hasDefect ? ["#f43f5e"] : []),
                          ...(itemStatus.hasMissing ? ["#f59e0b"] : []),
                        ];
                        const rowIndicatorStyle = rowIndicatorColors.length
                          ? {
                              boxShadow: rowIndicatorColors
                                .map((color, index) => `inset ${(index + 1) * 4}px 0 0 ${color}`)
                                .join(", "),
                            }
                          : undefined;
                        const quantityKey = displayTemplateColumns.find((c) => c.key === "quantity")?.key || "quantity";
                        const itemQty = Number(item[quantityKey]) || 0;
                        const totalItemQty = itemQty + activeBorrowedQuantity;
                        return (
                          <tr
                            key={item.id}
                            style={rowIndicatorStyle}
                            className={`${rowIndex % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
                          >
                            {usesTemplateColumns &&
                              displayTemplateColumns.map((column) => {
                                const columnKey = column.key;
                                const columnEditorType = getEditorType(column);
                                const columnValue = item?.[columnKey];
                                const columnDraftKey = getCellDraftKey(item.id, columnKey);
                                const columnDraftValue = cellDrafts[columnDraftKey] ?? normalizeCellValue(columnValue);
                                const isQuantityColumn = columnKey === quantityKey;
                                const quantityDisplayValue =
                                  activeBorrowedQuantity > 0
                                    ? `${itemQty}/${totalItemQty}`
                                    : formatCellValue(columnValue);

                                const isMissingColumn = (() => {
                                  if (column.subColumns && column.subColumns.length > 0) {
                                    return column.subColumns.some((subColumn) => {
                                      const v = item?.[subColumn.physicalKey];
                                      return v === null || v === undefined || String(v).trim() === "" || String(v) === "-";
                                    });
                                  }
                                  const v = columnValue;
                                  return v === null || v === undefined || String(v).trim() === "" || String(v) === "-";
                                })();

                                return (
                                  <td key={`${item.id}-${column.key}`} className={`px-4 py-4 align-top text-sm text-slate-700 ${isMissingColumn ? "bg-amber-100" : ""}`}>
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
                                                fieldEditorType === "dropdown" ? (() => {
                                                  const isBrandSub = subColumn?.dynamicBrand === true || fieldKey === "brand";
                                                  const baseOptions = isBrandSub ? fetchedBrands : (subColumn.options || []);
                                                  const hasOtherSub = baseOptions.includes("Other");
                                                  // Include the current value in the dropdown if it's not already there
                                                  const currentSubVal = fieldDraftValue;
                                                  const withOtherSub = hasOtherSub ? baseOptions : [...baseOptions, "Other"];
                                                  const subDropdownOptions = (currentSubVal && !withOtherSub.includes(currentSubVal))
                                                    ? [...withOtherSub, currentSubVal]
                                                    : withOtherSub;
                                                  return (
                                                    <Select
                                                      value={fieldDraftValue || undefined}
                                                      onValueChange={(val) => {
                                                        handleCellDraftChange(item.id, fieldKey, val);
                                                        handleInlineCellSave(item, fieldKey, subColumn);
                                                      }}
                                                    >
                                                      <SelectTrigger className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100 h-auto">
                                                        <SelectValue placeholder={isBrandSub ? "Select brand…" : "Select option…"} />
                                                      </SelectTrigger>
                                                      <SelectContent className="rounded-lg border border-slate-200 bg-white shadow-md">
                                                        {subDropdownOptions.map((option) => (
                                                          <SelectItem key={option} value={option}>
                                                            {option}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  );
                                                })() : fieldEditorType === "boolean" ? (
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
                                                    disabled={savingCellKey === fieldDraftKey || deletingId !== null || isIdentifierField(fieldKey)}
                                                    onChange={(event) => { if (!isIdentifierField(fieldKey)) handleCellDraftChange(item.id, fieldKey, event.target.value); }}
                                                    onBlur={() => { if (!isIdentifierField(fieldKey)) handleInlineCellSave(item, fieldKey, subColumn); }}
                                                    onKeyDown={(event) => {
                                                      if (isIdentifierField(fieldKey)) return;
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
                                                    className={cn(
                                                      "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100",
                                                      isIdentifierField(fieldKey) && "bg-slate-100 cursor-not-allowed opacity-70"
                                                    )}
                                                  />
                                                )
                                              ) : (
                                                <div className={`font-medium ${String(fieldValue || "").toUpperCase().includes("DEFECT") || String(fieldValue || "").toUpperCase().includes("BROKEN") ? "text-red-600" : "text-slate-900"}`}>
                                                  {formatCellValue(fieldValue)}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : REMARK_COLUMN_KEYS.includes(columnKey) ? (
                                      gridEditMode ? (
                                        <button
                                          type="button"
                                          ref={inlineEditRef}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const allOpts = getAllRemarkOptions(items, remarkCol);
                                            setRemarkChangeModal({
                                              item,
                                              currentRemark,
                                              targetRemark: allOpts.find((o) => o !== currentRemark) || "",
                                              quantity: 1,
                                              allRemarkOptions: allOpts,
                                              remarkColumnKey: remarkCol?.key || null,
                                              quantityKey,
                                              itemQty,
                                              remarksDescription: "",
                                              remarksDescError: "",
                                            });
                                          }}
                                          className="group inline-flex items-center gap-1 text-sm text-slate-700 cursor-pointer hover:text-indigo-600 transition-colors"
                                        >
                                          <span>{formatCellValue(columnValue)}</span>
                                          <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
                                        </button>
                                      ) : (
                                        <span className={String(columnValue || "").toUpperCase().includes("DEFECT") || String(columnValue || "").toUpperCase().includes("BROKEN") ? "text-red-600" : "text-slate-700"}>
                                          {formatCellValue(columnValue)}
                                        </span>
                                      )
                                    ) : gridEditMode ? (
                                      columnEditorType === "dropdown" ? (() => {
                                        const isBrandCol = column?.dynamicBrand === true || columnKey === "brand";
                                        const baseColOptions = isBrandCol ? fetchedBrands : (column.options || []);
                                        const hasOtherCol = baseColOptions.includes("Other");
                                        // Include the current value in the dropdown if it's not already there
                                        // (e.g. a custom "Other" brand that isn't in fetchedBrands yet)
                                        const currentVal = columnDraftValue;
                                        const withOther = hasOtherCol ? baseColOptions : [...baseColOptions, "Other"];
                                        const dropdownOptions = (currentVal && !withOther.includes(currentVal))
                                          ? [...withOther, currentVal]
                                          : withOther;
                                        return (
                                          <Select
                                            value={columnDraftValue || undefined}
                                            onValueChange={(val) => {
                                              handleCellDraftChange(item.id, columnKey, val);
                                              handleInlineCellSave(item, columnKey, column);
                                            }}
                                          >
                                            <SelectTrigger className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100 h-auto">
                                              <SelectValue placeholder={isBrandCol ? "Select brand…" : "Select option…"} />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-lg border border-slate-200 bg-white shadow-md">
                                              {dropdownOptions.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {option}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        );
                                      })() : columnEditorType === "boolean" ? (
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
                                          disabled={savingCellKey === columnDraftKey || deletingId !== null || isIdentifierField(columnKey)}
                                          onChange={(event) => { if (!isIdentifierField(columnKey)) handleCellDraftChange(item.id, columnKey, event.target.value); }}
                                          onBlur={() => { if (!isIdentifierField(columnKey)) handleInlineCellSave(item, columnKey, column); }}
                                          onKeyDown={(event) => {
                                            if (isIdentifierField(columnKey)) return;
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
                                          className={cn(
                                            "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#4a1111] focus:outline-none disabled:bg-slate-100",
                                            isIdentifierField(columnKey) && "bg-slate-100 cursor-not-allowed opacity-70"
                                          )}
                                        />
                                      )
                                    ) : (
                                      <span className={String(columnValue || "").toUpperCase().includes("DEFECT") || String(columnValue || "").toUpperCase().includes("BROKEN") ? "text-red-600" : ""}>
                                        {isQuantityColumn ? quantityDisplayValue : formatCellValue(columnValue)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            {gridEditMode && isAdmin && (
                              <td className="px-4 py-4 align-middle text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    disabled={deletingId === item.id}
                                    onClick={() => {
                                      setTransferSourceItem(item);
                                      setShowTransferModal(true);
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg bg-[#4a1111] p-2 text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                                    title="Transfer item"
                                    aria-label="Transfer item"
                                  >
                                    <ArrowRightLeft className="h-4 w-4" />
                                  </button>
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
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>

            {displayItems.length > 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
                <div className="text-sm text-slate-500">
                  Showing {Math.min(pageStartIndex + 1, displayItems.length)}–{Math.min(
                    pageEndIndex,
                    displayItems.length
                  )} of {displayItems.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || totalPages === 0}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {isHistoryOpen && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <InventorySectionHistoryView
                selectedTab={{
                  id: tab?.id,
                  tableName: tabTableName,
                }}
                selectedSection={selectedSection}
                searchQuery={historySearchQuery}
                dateRange={historyDateRange}
              />
            </div>

            <div className="xl:col-span-2">
              <InventorySectionExportPanel
                searchQuery={historySearchQuery}
                refreshToken={exportLogRefreshToken}
                selectedSection={selectedSection}
                selectedTab={{
                  id: tab?.id,
                  tableName: tabTableName,
                }}
                items={items}
                exportColumnOptions={exportColumnOptions}
                onExported={() => setExportLogRefreshToken((c) => c + 1)}
              />
            </div>
          </div>
        </div>
      )}

      {showModal && selectedSection && (
        <ItemModal
          key={`${selectedSection?.id}-${editingItem?.id || "new"}`}
          section={selectedSection}
          item={editingItem}
          tableName={tabTableName}
          templateColumns={displayTemplateColumns}
          items={items}
          fetchedBrands={fetchedBrands}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      <ItemTransferModal
        open={showTransferModal}
        onOpenChange={(nextOpen) => {
          setShowTransferModal(nextOpen);
          if (!nextOpen) setTransferSourceItem(null);
        }}
        sourceItem={transferSourceItem}
        sourceTableName={tabTableName || ""}
        sourceSectionId={selectedSection?.id || ""}
        sourceTab={tab ? { id: tab.id, name: tab.name, slug: tab.slug } : null}
        allTabs={tabs}
        quantityColumn={displayTemplateColumns.find((c) => c.key === "quantity")?.key || "quantity"}
        onTransferred={() => {
          setTransferSourceItem(null);
          setRefreshKey((current) => current + 1);
        }}
      />

      {showExportModal && (
        <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
          <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] p-0">
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
              <DialogTitle className="text-lg font-semibold text-slate-900">Export Section</DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                Select columns to include in export, and set date/signatories.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Date</Label>
                <Input
                  type="date"
                  value={exportDate}
                  onChange={(event) => setExportDate(event.target.value)}
                  className="focus-visible:ring-[#4a1111]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">School Year *</Label>
                  <Select value={exportSchoolYear} onValueChange={setExportSchoolYear}>
                    <SelectTrigger className="focus:ring-[#4a1111]">
                      <SelectValue placeholder="Select year..." />
                    </SelectTrigger>
                    <SelectContent>
                      {generateSchoolYearOptions().map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Semester *</Label>
                  <Select value={exportSemester} onValueChange={setExportSemester}>
                    <SelectTrigger className="focus:ring-[#4a1111]">
                      <SelectValue placeholder="Select semester..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMESTER_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Prepared and submitted by</Label>
                <Input
                  value={preparedByName}
                  onChange={(event) => setPreparedByName(event.target.value)}
                  placeholder="Enter name"
                  className="focus-visible:ring-[#4a1111]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Inspected and verified by</Label>
                <Input
                  value={inspectedByName}
                  onChange={(event) => setInspectedByName(event.target.value)}
                  placeholder="Enter name"
                  className="focus-visible:ring-[#4a1111]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Sections</Label>
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3 sm:grid-cols-2">
                  {sections.map((sec) => (
                    <label key={sec.slug} className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={selectedExportSections.includes(sec.slug)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedExportSections((current) => [...current, sec.slug]);
                          } else {
                            setSelectedExportSections((current) => current.filter((s) => s !== sec.slug));
                          }
                        }}
                        className="border-slate-300 data-[state=checked]:bg-[#4a1111] data-[state=checked]:border-[#4a1111]"
                      />
                      <span className="text-sm text-slate-700">{sec.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Accordion
                type="single"
                collapsible
                defaultValue="columns"
                value={showColumnOptions ? "columns" : ""}
                onValueChange={(val) => setShowColumnOptions(!!val)}
              >
                <AccordionItem value="columns" className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <AccordionTrigger className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100/80 hover:no-underline">
                    Columns
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {exportColumnOptions.map((column) => (
                        <label key={column.key} className="flex items-center gap-2.5 cursor-pointer">
                          <Checkbox
                            checked={selectedExportColumns.includes(column.key)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedExportColumns((current) => [...current, column.key]);
                              } else {
                                setSelectedExportColumns((current) =>
                                  current.filter((key) => key !== column.key)
                                );
                              }
                            }}
                            className="border-slate-300 data-[state=checked]:bg-[#4a1111] data-[state=checked]:border-[#4a1111]"
                          />
                          <span className="text-sm text-slate-700">{column.label}</span>
                        </label>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowExportModal(false)}
                disabled={exporting}
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowExportConfirm(true)}
                disabled={exporting || selectedExportColumns.length === 0 || !exportSchoolYear || !exportSemester}
                className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
              >
                {exporting ? "Exporting..." : "Proceed"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={showExportConfirm} onOpenChange={setShowExportConfirm}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Export Section</AlertDialogTitle>
            <AlertDialogDescription>
              Export {selectedExportSections.length} section{selectedExportSections.length !== 1 ? "s" : ""} with {selectedExportColumns.length} column{selectedExportColumns.length !== 1 ? "s" : ""}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              disabled={exporting}
              className="rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExportSection}
              disabled={exporting}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              {exporting ? "Exporting..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !deletingId) cancelDelete();
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              disabled={!!deletingId}
              onClick={cancelDelete}
              className="rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmDelete}
              disabled={!!deletingId}
              className="rounded-lg bg-red-600 px-6 text-white hover:bg-red-700"
            >
              {deletingId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Inline Remark Popover (qty === 1) ──────────────────────────────────── */}
      {remarkInlineEdit && remarkInlineEdit.targetEl && createPortal(
        <div
          className="fixed z-[70] mt-1 rounded-lg border border-slate-200 bg-white shadow-lg py-1 min-w-[10rem]"
          style={{
            top: remarkInlineEdit.targetEl.getBoundingClientRect().bottom + 4,
            left: remarkInlineEdit.targetEl.getBoundingClientRect().left,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {remarkInlineEdit.allRemarkOptions
            .filter((o) => o !== remarkInlineEdit.currentRemark)
            .map((opt) => (
              <button
                key={opt}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                onClick={() => commitInlineRemark(opt)}
              >
                {opt}
              </button>
            ))}
        </div>,
        document.body
      )}

      {/* ── Remark Change Modal ───────────────────────────────────────────────── */}
      <Dialog
        open={Boolean(remarkChangeModal)}
        onOpenChange={(open) => {
          if (!open && !remarkSaving) {
            setRemarkChangeModal(null);
            setRemarkSaving(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden rounded-[28px] p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">Change Remark</DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              Move item quantity from the current remark to a new remark.
            </DialogDescription>
          </DialogHeader>

          {remarkChangeModal && (
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-sm text-slate-500">Current remark</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {remarkChangeModal.currentRemark} x{remarkChangeModal.itemQty}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">New Remark</Label>
                <Select
                  value={remarkChangeModal.targetRemark || ""}
                  onValueChange={(value) => {
                    setRemarkChangeModal((prev) => ({
                      ...prev,
                      targetRemark: value,
                      remarksDescError: "",
                      remarksDescription: isRemarkDescRequired(value) ? prev.remarksDescription : "",
                    }));
                  }}
                >
                  <SelectTrigger className="focus:ring-[#4a1111]">
                    <SelectValue placeholder="Select new remark..." />
                  </SelectTrigger>
                  <SelectContent>
                    {remarkChangeModal.allRemarkOptions
                      .filter((option) => option !== remarkChangeModal.currentRemark)
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Remarks Description — slides down when Defective or Other is selected (only if column exists) */}
              {sectionHasRemarksDescColumn && (
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: isRemarkDescRequired(remarkChangeModal.targetRemark) ? "200px" : "0px",
                  opacity: isRemarkDescRequired(remarkChangeModal.targetRemark) ? 1 : 0,
                  marginTop: isRemarkDescRequired(remarkChangeModal.targetRemark) ? "12px" : "0px",
                }}
              >
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">
                    Remarks Description <span className="text-rose-500">*</span>
                  </Label>
                  <Textarea
                    placeholder="Describe the issue or details..."
                    value={remarkChangeModal.remarksDescription || ""}
                    onChange={(event) => {
                      setRemarkChangeModal((prev) => ({
                        ...prev,
                        remarksDescription: event.target.value,
                        remarksDescError: "",
                      }));
                    }}
                    className={cn(
                      "min-h-[80px] resize-none focus-visible:ring-[#4a1111]",
                      remarkChangeModal.remarksDescError
                        ? "border-rose-400 bg-rose-50/50 focus-visible:ring-rose-400"
                        : remarkChangeModal.remarksDescription?.trim()
                          ? "border-emerald-400 bg-emerald-50/30 focus-visible:ring-emerald-400"
                          : ""
                    )}
                    rows={3}
                  />
                  {remarkChangeModal.remarksDescError && (
                    <p className="text-xs font-medium text-rose-600">{remarkChangeModal.remarksDescError}</p>
                  )}
                </div>
              </div>
              )}

            {/* Quantity input — only when item has more than 1 */}
            {remarkChangeModal.itemQty > 1 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  max={remarkChangeModal.itemQty}
                  value={remarkChangeModal.quantity}
                  onChange={(event) => {
                    const max = remarkChangeModal.itemQty;
                    const value = Math.max(1, Math.min(max, Math.floor(Number(event.target.value)) || 1));
                    setRemarkChangeModal((prev) => ({ ...prev, quantity: value }));
                  }}
                  className="focus-visible:ring-[#4a1111]"
                />
                <p className="text-xs text-slate-500">Max: {remarkChangeModal.itemQty}</p>
              </div>
            )}

          </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRemarkChangeModal(null);
                setRemarkSaving(false);
              }}
              disabled={remarkSaving}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleRemarkChange}
              disabled={remarkSaving || !remarkChangeModal?.targetRemark || Number(remarkChangeModal?.quantity) < 1}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              {remarkSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Defective Status Confirmation Modal ──────────────────────────── */}
      <AlertDialog
        open={Boolean(defectiveConfirmModal)}
        onOpenChange={(open) => {
          if (!open) setDefectiveConfirmModal(null);
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark item as defective?</AlertDialogTitle>
            <AlertDialogDescription>
              {defectiveConfirmModal && (
                <>
                  This will move <strong>{defectiveConfirmModal.quantity}</strong> unit{defectiveConfirmModal.quantity > 1 ? "s" : ""} from{" "}
                  <strong>"{defectiveConfirmModal.currentRemark}"</strong> to <strong>"{defectiveConfirmModal.targetRemark}"</strong>.
                  {defectiveConfirmModal.remarksDescription?.trim() && (
                    <>
                      <br /><br />
                      <span className="text-sm font-medium text-slate-700">Remarks Description:</span>
                      <br />
                      <span className="text-sm text-slate-600 italic">"{defectiveConfirmModal.remarksDescription.trim()}"</span>
                    </>
                  )}                  
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              onClick={() => setDefectiveConfirmModal(null)}
              className="rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (defectiveConfirmModal) {
                  executeRemarkChange(defectiveConfirmModal);
                  setDefectiveConfirmModal(null);
                }
              }}
              className="rounded-lg bg-[#4a1111] text-white hover:bg-[#3f0f0f]"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmExitEditMode} onOpenChange={setConfirmExitEditMode}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Done Editing?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to exit edit mode. Are you done making changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              onClick={cancelExitEditing}
              className="rounded-lg"
            >
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmExitEditing}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}