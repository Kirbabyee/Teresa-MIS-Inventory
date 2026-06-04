import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Download, History, Minus, Package, Plus, Search, User, X } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import { supabase } from "@/api/supabaseClient";
import ExportLogsPanel from "@/components/ExportLogsPanel";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  adjustInventoryItemQuantity,
  deriveTargetCondition,
  detectItemColumns,
  isSameInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  useInventoryCatalog,
} from "@/lib/inventoryApi";
import {
  appendBorrowingRecordItems,
  createBorrowingRecord,
  fetchBorrowingRecords,
  markOverdueBorrowingRecords,
  returnBorrowingRecord,
  updateBorrowingItemsStatus,
  updateBorrowingItemsRemarks,
} from "@/lib/borrowingApi";
import { cn } from "@/lib/utils";

const initialForm = {
  name: "",
  studentId: "",
  role: "",
};

const hiddenItemDetailKeys = new Set([
  "id",
  "section_id",
  "created_at",
  "updated_at",
  "sort_order",
  "data",
  "_returned_qty",
  "_return_status",
  "tab_id",
  "section_id",
  "inventory_tab_id",
  "inventory_section_id",
  "inventory_item_id",
  "borrowing_record_id",
  "inventory_table_name",
  "tabName",
  "sectionName",
  "tableName",
  "tabId",
  "sectionId",
  "inventoryTabId",
  "inventorySectionId",
  "inventoryItemId",
  "borrowingRecordId",
  "inventoryTableName",
  "computer_number",
  "computerNumber",
  "name",
  "item_name",
  "asset_name",
  "itemName",
  "assetName",
  "label",
  "item_label",
  "itemLabel",
]);

const fieldLabels = {
  computer_number: "Computer #",
  computerNumber: "Computer #",
  item_name: "Item",
  asset_name: "Asset",
};

const formatFieldLabel = (key = "") =>
  fieldLabels[key] ||
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getItemLabel = (item = {}) => {
  const computerNumber = item.computer_number ?? item.computerNumber;
  const namedValue =
    item.name ||
    item.item_name ||
    item.asset_name ||
    item.brand ||
    item.type ||
    item.description;

  if (computerNumber) {
    const details = [item.type, item.brand, item.description].filter(Boolean).join(" - ");
    return details ? `Computer #${computerNumber} - ${details}` : `Computer #${computerNumber}`;
  }

  if (namedValue) return String(namedValue);

  const fallback = Object.entries(item).find(
    ([key, value]) =>
      !["id", "section_id", "created_at", "updated_at"].includes(key) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );

  return fallback ? String(fallback[1]) : `Item ${item.id || ""}`.trim();
};

const buildConditionMeta = (columns = []) => {
  const remarkCol = (columns || []).find(
    (c) =>
      c.fieldType === "dropdown" &&
      Array.isArray(c.options) &&
      c.options.length > 0 &&
      ["remarks", "condition", "status", "item_status"].includes(String(c.key || "").toLowerCase())
  );
  const opts = (remarkCol?.options || []).map((o) =>
    o && typeof o === "object" && "value" in o ? String(o.value) ?? "" : String(o ?? "")
  ).filter(Boolean);
  const quarantine = deriveTargetCondition(columns, "quarantine");
  const operational = opts.find((v) => v !== quarantine) || opts[0] || "Working";
  return { allOptions: opts.length ? opts : ["Working", "Defective"], operational, quarantine };
};

const getItemRemark = (item = {}) => {
  const { remarkKey } = detectItemColumns(item);
  if (!remarkKey) return null;
  const val = item[remarkKey];
  return val != null && String(val).trim() !== "" ? String(val).trim() : null;
};

const getItemDetails = (item = {}) =>
  Object.entries(item)
    .filter(
      ([key, value]) =>
        !hiddenItemDetailKeys.has(key) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      label: formatFieldLabel(key),
      value: String(value),
    }));

const getExportItemLabel = (item = {}) => {
  if (item.label) return String(item.label);

  const computerNumber = item.computer_number ?? item.computerNumber;
  const namedValue =
    item.name || item.item_name || item.asset_name || item.brand || item.type || item.description;

  if (computerNumber) {
    const details = [item.type, item.brand, item.description].filter(Boolean).join(" - ");
    return details ? `Computer #${computerNumber} - ${details}` : `Computer #${computerNumber}`;
  }

  if (namedValue) return String(namedValue);
  return "";
};

const getLiveStock = (item = {}) => {
  const fromData = Number(item.data?.quantity);
  if (Number.isFinite(fromData) && fromData >= 0) return fromData;
  const fromTop = Number(item.quantity);
  if (Number.isFinite(fromTop) && fromTop >= 0) return fromTop;
  return 0;
};

const getCartReservedQuantity = (cartId, cartItems) => {
  const found = cartItems.find((c) => c.cartId === cartId);
  return found ? Number(found.quantity || 0) : 0;
};

const getItemQuantity = (item = {}) => {
  if (item.quantity !== null && item.quantity !== undefined && String(item.quantity).trim() !== "") {
    return String(item.quantity);
  }

  if (
    item.data?.quantity !== null &&
    item.data?.quantity !== undefined &&
    String(item.data.quantity).trim() !== ""
  ) {
    return String(item.data.quantity);
  }

  const quantityDetail = (item.details || []).find(
    (detail) =>
      String(detail.key || "").toLowerCase() === "quantity" ||
      String(detail.label || "").toLowerCase() === "quantity"
  );

  return quantityDetail?.value ? String(quantityDetail.value) : "";
};

const getBorrowedQuantity = (item = {}) => {
  const rawQuantity =
    item.quantity ??
    item.details?.find((detail) => String(detail.key || "").toLowerCase() === "quantity")?.value ??
    item.details?.find((detail) => String(detail.label || "").toLowerCase() === "quantity")?.value ??
    1;
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const getReturnDefectiveQuantity = (item = {}) => {
  const rawQuantity =
    item.returnDefectiveQuantity ??
    item.details?.find(
      (detail) => String(detail.key || "").toLowerCase() === "return_defective_quantity"
    )?.value ??
    0;
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

const getReturnWorkingQuantity = (item = {}) => {
  const rawQuantity =
    item.returnWorkingQuantity ??
    item.details?.find(
      (detail) => String(detail.key || "").toLowerCase() === "return_working_quantity"
    )?.value ??
    0;
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

const getReturnConditionLabel = (item = {}, operationalLabel = "Working", quarantineLabel = "Defective") => {
  const borrowedQuantity = getBorrowedQuantity(item);
  const defectiveQuantity = getReturnDefectiveQuantity(item);
  const workingQuantity = getReturnWorkingQuantity(item);

  // If there are per-remark return quantities, show the split
  if (defectiveQuantity > 0 || workingQuantity > 0) {
    const parts = [];
    if (defectiveQuantity > 0) parts.push(`${quarantineLabel || "Defective"}: ${defectiveQuantity}`);
    if (workingQuantity > 0) parts.push(`${operationalLabel || "Working"}: ${workingQuantity}`);
    if (parts.length > 0) return parts.join(" / ");
  }

  // Otherwise show the item's actual condition/remarks value
  const rawCondition = getItemConditionRaw(item);
  if (rawCondition) return rawCondition;

  return operationalLabel || "Working";
};

/**
 * Derive the `returning_status` for a borrowing record.
 * Returns one of: "not fully returned" | "partially returned" | "fully returned"
 *
 * Logic:
 *   - If record status is "returned" / "returned_late" → "fully returned"
 *   - If record status is "borrowed" / "not_returned" → inspect items:
 *     - Any item with returned > 0 but not all fully returned → "partially returned"
 *     - All items fully returned → "fully returned"
 *     - No items returned → "not fully returned"
 */
const deriveReturningStatus = (record = {}) => {
  const recStatus = String(record.status || "").toLowerCase();

  // Explicit record-level statuses take precedence
  if (recStatus === "returned" || recStatus === "returned_late") return "fully returned";

  // Inspect items to determine returning status
  const items = record.items || [];
  if (items.length === 0) return "not fully returned";

  let anyReturned = false;
  let allFullyReturned = true;

  for (const item of items) {
    const total = getBorrowedQuantity(item);
    const returned = getReturnedQuantity(item);
    if (returned > 0) anyReturned = true;
    if (returned < total) allFullyReturned = false;
  }

  if (allFullyReturned && anyReturned) return "fully returned";
  if (anyReturned) return "partially returned";
  return "not fully returned";
};

/**
 * Extract the raw condition/remarks string from an item.
 * Checks explicit returnCondition, then item_details for condition/status/remarks keys.
 * Returns the original (non-lowercased) value for display.
 */
const getItemConditionRaw = (item = {}) => {
  const explicit = String(item.returnCondition || "").trim();
  if (explicit) return explicit;

  const detail = (item.details || []).find((d) => {
    const k = String(d.key || "").toLowerCase();
    const l = String(d.label || "").toLowerCase();
    return k === "condition" || k === "status" || k === "remarks"
      || l === "condition" || l === "status" || l === "remarks";
  });
  if (detail?.value) return String(detail.value).trim();

  return null;
};

/**
 * Classify an item's condition as "working" (operational) or "defective" (non-operational)
 * by comparing its raw condition value against the dynamic operational label.
 * Any condition that doesn't match the operational label is treated as non-operational.
 */
const getBorrowingItemCondition = (item = {}, quarantineLabel = "Defective", operationalLabel = "Working") => {
  const raw = getItemConditionRaw(item);
  if (!raw) return "working";

  const condition = raw.toLowerCase();
  const ol = String(operationalLabel || "Working").toLowerCase();
  const ql = String(quarantineLabel || "Defective").toLowerCase();

  // Exact match against operational = working
  if (condition === ol) return "working";
  // Exact match against quarantine = defective
  if (condition === ql) return "defective";
  // Contains "defect" = defective
  if (condition.includes("defect")) return "defective";
  // Contains "repair" or "quarantine" = defective
  if (condition.includes("repair") || condition.includes("quarantine")) return "defective";
  // Anything else that doesn't match operational = defective (catch-all for dynamic conditions)
  return "defective";
};

/**
 * Get the number of already-returned units for an item.
 * Reads _returned_qty from item_details JSONB (stored by confirmReturn).
 */
const getReturnedQuantity = (item = {}) => {
  const fromDetails = (item.details || []).find(
    (d) => String(d.key || "").toLowerCase() === "_returned_qty"
  )?.value;
  const val = Number(fromDetails);
  return Number.isFinite(val) && val >= 0 ? val : 0;
};

/**
 * Unroll a borrowed item into 1-by-1 unit rows for NOT-YET-returned units.
 * Each unit gets a stable unique key: `${item.id}::${index}`.
 * Only unrolls remaining units (total qty - already returned).
 */
const unrollBorrowedUnits = (items = []) => {
  const units = [];
  for (const item of items) {
    const totalQty = getBorrowedQuantity(item);
    const alreadyReturned = getReturnedQuantity(item);
    const remaining = Math.max(0, totalQty - alreadyReturned);
    const originalRemark = getItemConditionRaw(item) || getItemRemark(item) || null;
    for (let i = 0; i < remaining; i += 1) {
      units.push({
        unitKey: `${item.id}::${alreadyReturned + i}`,
        item,
        unitIndex: alreadyReturned + i,
        originalRemark,
      });
    }
  }
  return units;
};

const formatBorrowingStatus = (status = "borrowed") => {
  const normalizedStatus = String(status || "borrowed").toLowerCase();
  if (normalizedStatus === "returned") return "Returned";
  if (normalizedStatus === "returned_late") return "Returned Late";
  if (normalizedStatus === "not_returned") return "Not Returned";
  return "Borrowed";
};

const getBorrowingStatusClass = (status = "borrowed") => {
  const normalizedStatus = String(status || "borrowed").toLowerCase();
  if (normalizedStatus === "returned") return "bg-emerald-100 text-emerald-700";
  if (normalizedStatus === "returned_late") return "bg-amber-100 text-amber-700";
  if (normalizedStatus === "not_returned") return "bg-rose-100 text-rose-700";
  return "bg-sky-100 text-sky-700";
};

const formatExportDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatExportTime = (value) => {
	  if (!value) return "";
	  const date = new Date(value);
	  if (Number.isNaN(date.getTime())) return "";
	  return new Intl.DateTimeFormat("en-US", {
	    hour: "2-digit",
	    minute: "2-digit",
	    hour12: true,
	  }).format(date);
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

const getInventorySelectionKey = ({ inventoryTabId, inventorySectionId, id }) =>
  [inventoryTabId || "", inventorySectionId || "", id || ""].map(String).join("::");

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

const borrowingExportColumnOptions = [
  { key: "name", label: "Borrower" },
  { key: "studentId", label: "Student ID" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "date", label: "Borrowed At" },
  { key: "returnedAt", label: "Returned At" },
  { key: "item", label: "Item" },
  { key: "quantity", label: "Quantity" },
  { key: "condition", label: "Return Condition" },
  { key: "remark", label: "Return Remark" },
];

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

const EXPORT_BUCKET = "export-logs";

const createExportStoragePath = (filename) => {
  const safeName = String(filename || "export.xlsx").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${new Date().toISOString().slice(0, 10)}/${uniqueId}-${safeName}`;
};

const applyExportHeader = (worksheet, titleText, exportDate, separatorImage, totalColumns, options = {}) => {
  const headerColor = { argb: "FF4A1111" };
  const endColumnNumber = Math.max(13, totalColumns + 1);
  const endColumnLetter = getColumnLetter(endColumnNumber);

  for (let i = 1; i <= 5; i++) {
    worksheet.getRow(i).height = 25;
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

export default function Borrowing() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { tabs, loading: inventoryLoading, error: inventoryError } = useInventoryCatalog();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectedItemQuantities, setSelectedItemQuantities] = useState({});
  const [selectedInventoryItems, setSelectedInventoryItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [tabTableNames, setTabTableNames] = useState({});
  const [conditionMetaByTab, setConditionMetaByTab] = useState({});
  const [formError, setFormError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [pendingReturn, setPendingReturn] = useState(null);
  const [borrowingsLoading, setBorrowingsLoading] = useState(true);
  const [borrowingsError, setBorrowingsError] = useState("");
  const [savingBorrow, setSavingBorrow] = useState(false);
  const [returningBorrow, setReturningBorrow] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [mergeWithLastBorrow, setMergeWithLastBorrow] = useState(false);

  const [statusFilter, setStatusFilter] = useState(() =>
    ["logs", "history"].includes(searchParams.get("view")) ? "all" : "borrowed"
  );
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef(null);
  const [customItems, setCustomItems] = useState([]);
  const [customItemForm, setCustomItemForm] = useState({
    name: "",
    brand: "",
    quantity: "",
    condition: "Working",
    remarks: "",
  });
  const [addingCustom, setAddingCustom] = useState(false);
  const [returnSelections, setReturnSelections] = useState({});
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [data, setData] = useState([]);
  const [depletedItems, setDepletedItems] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [exportSchoolYear, setExportSchoolYear] = useState("");
  const [exportSemester, setExportSemester] = useState("");
  const [preparedByName, setPreparedByName] = useState("");
  const [inspectedByName, setInspectedByName] = useState("");
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);
  const [showColumnOptions, setShowColumnOptions] = useState(true);
  const [exportLogRefreshToken, setExportLogRefreshToken] = useState(0);
  const [showExportLogs, setShowExportLogs] = useState(false);

  // ── 3-Step Wizard State ──────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(1);
  const [borrowCart, setBorrowCart] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [allItemsLoading, setAllItemsLoading] = useState(true);
  const [globalFetchInit, setGlobalFetchInit] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [filterTabId, setFilterTabId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [qtyDialogItem, setQtyDialogItem] = useState(null);
  const [qtyDialogValue, setQtyDialogValue] = useState(1);

  const selectedTab = useMemo(
    () => tabs.find((tab) => String(tab.id) === String(selectedTabId)) || null,
    [tabs, selectedTabId]
  );
  const sections = selectedTab?.sections || [];
  const selectedSection = useMemo(
    () => sections.find((section) => String(section.id) === String(selectedSectionId)) || null,
    [sections, selectedSectionId]
  );
  const selectedItems = useMemo(
    () =>
      selectedInventoryItems.map((item) => ({
        ...item,
        selectedQuantity: Number(selectedItemQuantities[item.selectionKey] || item.selectedQuantity || 1),
      })),
    [selectedInventoryItems, selectedItemQuantities]
  );
  const inventoryNameLookup = useMemo(() => {
    const tabNames = {};
    const sectionNames = {};

    tabs.forEach((tab) => {
      tabNames[tab.id] = tab.name;
      (tab.sections || []).forEach((section) => {
        sectionNames[section.id] = section.name;
      });
    });

    return { tabNames, sectionNames };
  }, [tabs]);

  const formatPickerLabel = (range) => {
    if (!range?.from) return "Select date range";
    if (range.from && !range.to) return `${format(range.from, "MMM d, yyyy")} —`;
    return `${format(range.from, "MMM d, yyyy")} — ${format(range.to, "MMM d, yyyy")}`;
  };

  const filteredData = data
    .filter((d) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        d.name.toLowerCase().includes(searchLower) ||
        (d.items || []).some((item) => String(item.label || "").toLowerCase().includes(searchLower));
      const recordDate = new Date(d.date);
      const minDate = dateRange.from ? new Date(`${dateRange.from.toISOString().slice(0, 10)}T00:00:00.000`) : null;
      const maxDate = dateRange.to ? new Date(`${dateRange.to.toISOString().slice(0, 10)}T23:59:59.999`) : null;
      const matchesStart = !minDate || recordDate >= minDate;
      const matchesEnd = !maxDate || recordDate <= maxDate;
      return matchesSearch && matchesStart && matchesEnd;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const visiblePageNumbers = (() => {
    const maxVisible = 3;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const offset = Math.min(Math.max(page - 2, 0), totalPages - maxVisible);
    const startPage = offset + 1;
    return Array.from({ length: maxVisible }, (_, index) => startPage + index);
  })();
  const currentPageData = filteredData.slice(pageStartIndex, pageEndIndex);

  const latestActiveBorrowForBorrower = useMemo(() => {
    const borrowerId = String(form.studentId || "").trim().toLowerCase();
    const borrowerName = String(form.name || "").trim().toLowerCase();

    if (!borrowerId && !borrowerName) return null;

    return [...data]
      .filter((record) => {
        const status = String(record.status || "").toLowerCase();
        const sameId =
          borrowerId &&
          String(record.studentId || "").trim().toLowerCase() === borrowerId;
        const sameName =
          borrowerName &&
          String(record.name || "").trim().toLowerCase() === borrowerName;

        return ["borrowed", "not_returned"].includes(status) && (sameId || sameName);
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
  }, [data, form.name, form.studentId]);

  const loadBorrowings = async (cancelToken = { current: false }) => {
    setBorrowingsLoading(true);
    setBorrowingsError("");

    try {
      if (statusFilter === "borrowed") {
        await markOverdueBorrowingRecords({ days: 3 });
      }
      const records = await fetchBorrowingRecords({ status: statusFilter === "all" ? null : "borrowed" });
      const visibleRecords =
        statusFilter === "all"
          ? records.filter((record) => {
              const rs = deriveReturningStatus(record);
              return rs === "partially returned" || rs === "fully returned";
            })
          : records.filter((record) => {
              const rs = deriveReturningStatus(record);
              return rs === "not fully returned" || rs === "partially returned";
            });
      if (!cancelToken.current) {
        setData(visibleRecords);
      }
    } catch (error) {
      if (!cancelToken.current) {
        setData([]);
        setBorrowingsError(error?.message || "Failed to load borrowing records.");
      }
    } finally {
      if (!cancelToken.current) {
        setBorrowingsLoading(false);
      }
    }
  };

  useEffect(() => {
    const cancelToken = { current: false };
    loadBorrowings(cancelToken);
    setPage(1);

    return () => {
      cancelToken.current = true;
    };
  }, [statusFilter]);

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
    setPage(1);
  }, [search, statusFilter, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!showDatePicker) return undefined;

    const handlePointerDown = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showDatePicker]);

  useEffect(() => {
    let cancelled = false;

    const loadTableNames = async () => {
      const results = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const config = await getTabTableConfig(tab.id);
            return { tabId: tab.id, tableName: config?.tableName || null, columns: config?.columns || [] };
          } catch (error) {
            return { tabId: tab.id, tableName: null, columns: [] };
          }
        })
      );

      if (!cancelled) {
        const names = {};
        const meta = {};
        for (const r of results) {
          names[r.tabId] = r.tableName;
          meta[r.tabId] = buildConditionMeta(r.columns);
        }
        setTabTableNames(names);
        setConditionMetaByTab(meta);
      }
    };

    if (tabs.length > 0) loadTableNames();

    return () => {
      cancelled = true;
    };
  }, [tabs]);

  useEffect(() => {
    if (!selectedSectionId) {
      setInventoryItems([]);
      return;
    }

    let cancelled = false;

    const loadItems = async () => {
      setItemsLoading(true);
      setItemsError("");

      try {
        const loadedItems = await fetchInventoryItems(
          selectedSectionId,
          tabTableNames[selectedTabId] || null
        );

        if (!cancelled) {
          setInventoryItems(loadedItems || []);
        }
      } catch (error) {
        if (!cancelled) {
          setInventoryItems([]);
          setItemsError(error?.message || "Failed to load inventory items.");
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
  }, [selectedSectionId, selectedTabId, tabTableNames]);

  // ── Pre-fetch ALL inventory items for Step 2 global search ─────────────
  useEffect(() => {
    if (!showModal || globalFetchInit) return;

    let cancelled = false;

    const loadAllItems = async () => {
      setAllItemsLoading(true);

      try {
        const sectionQueries = [];

        tabs.forEach((tab) => {
          const tableName = tabTableNames[tab.id] || null;
          (tab.sections || []).forEach((section) => {
            sectionQueries.push(
              fetchInventoryItems(section.id, tableName).then((items) =>
                (items || []).map((item) => ({
                  ...item,
                  tabId: tab.id,
                  tabName: tab.name,
                  sectionId: section.id,
                  sectionName: section.name,
                  tableName: tableName || "",
                }))
              )
            );
          });
        });

        const results = await Promise.allSettled(sectionQueries);
        const flat = [];

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            flat.push(...result.value);
          }
        });

        if (!cancelled) {
          setAllItems(flat);
          setGlobalFetchInit(true);
        }
      } catch (error) {
        if (!cancelled) {
          setAllItems([]);
        }
      } finally {
        if (!cancelled) {
          setAllItemsLoading(false);
        }
      }
    };

    if (tabs.length > 0) {
      loadAllItems();
    } else {
      setAllItemsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [showModal, globalFetchInit, tabs, tabTableNames]);

  const resetBorrowForm = () => {
    setForm(initialForm);
    setSelectedTabId("");
    setSelectedSectionId("");
    setSelectedItemIds([]);
    setSelectedItemQuantities({});
    setSelectedInventoryItems([]);
    setInventoryItems([]);
    setCustomItems([]);
    setCustomItemForm({
      name: "",
      brand: "",
      quantity: "",
      condition: "Working",
      remarks: "",
    });
    setItemsError("");
    setFormError("");
    setFormErrors({});
    setMergeWithLastBorrow(false);
    // Reset wizard
    setActiveStep(1);
    setBorrowCart([]);
    setGlobalFetchInit(false);
    setAllItems([]);
    setGlobalSearch("");
    setFilterTabId("");
    setFilterSectionId("");
    setQtyDialogItem(null);
    setQtyDialogValue(1);
  };

  const closeBorrowModal = () => {
    setShowModal(false);
    resetBorrowForm();
  };

  const validateField = (fieldName, value) => {
    const trimmed = String(value || "").trim();

    switch (fieldName) {
      case "name":
        if (!trimmed) return "Borrower name is required.";
        if (!/^[A-Za-z\s]+$/.test(trimmed)) return "Borrower name may contain only letters and spaces.";
        return "";
      case "studentId":
        if (!trimmed) return "ID number is required.";
        return "";
      case "role":
        if (!trimmed) return "Select borrower role.";
        return "";
      case "items":
        if (!value || value.length === 0) return "Choose at least one item to borrow.";
        return "";
      default:
        return "";
    }
  };

  const requestReturn = async (record) => {
    // Fetch fresh data so _returned_qty in item_details is current
    let freshRecord = record;
    try {
      freshRecord = await fetchBorrowingRecord(record.id);
    } catch {
      // fall back to passed record
    }

    // Filter out items that have already been fully returned
    const activeItems = (freshRecord.items || []).filter((item) => {
      const total = getBorrowedQuantity(item);
      const returned = getReturnedQuantity(item);
      return returned < total;
    });

    const returnRecord = { ...freshRecord, items: activeItems };
    setPendingReturn(returnRecord);
    setReturnError("");
    const units = unrollBorrowedUnits(activeItems || []);
    const metaByTab = conditionMetaByTab;
    const initialSelections = {};
    for (const unit of units) {
      const tabMeta = metaByTab[unit.item.inventoryTabId] || {};
      const allOptions = tabMeta.allOptions || ["Working", "Defective"];
      const opLabel = tabMeta.operational || "Working";
      // Default to the item's current remark if it's in the available options,
      // otherwise fall back to the operational label
      const currentRemark = unit.originalRemark || null;
      const defaultRemark = currentRemark && allOptions.some(
        (opt) => String(opt).toLowerCase() === String(currentRemark).toLowerCase()
      )
        ? allOptions.find((opt) => String(opt).toLowerCase() === String(currentRemark).toLowerCase())
        : opLabel;
      initialSelections[unit.unitKey] = {
        checked: true,
        returnRemark: defaultRemark,
        remarks: "",
      };
    }
    setReturnSelections(initialSelections);
  };

  const openExportModal = () => {
    if (!filteredData.length) return;
    setSelectedExportColumns(borrowingExportColumnOptions.map((column) => column.key));
    setShowColumnOptions(false);
    setExportDate(new Date().toISOString().slice(0, 10));
    setExportSchoolYear(getCurrentSchoolYear());
    setExportSemester(SEMESTER_OPTIONS[0]);
    setPreparedByName("");
    setInspectedByName("");
    setShowExportModal(true);
  };

  const handleExportBorrowings = async () => {
    if (!filteredData.length || selectedExportColumns.length === 0) return;

    const columns = borrowingExportColumnOptions.filter((column) =>
      selectedExportColumns.includes(column.key)
    );

    setExporting(true);
    try {
      const separatorBuffer = createHeaderSeparatorBase64();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Borrowings");

      applyExportHeader(worksheet, "BORROWING RECORDS", exportDate, separatorBuffer, columns.length, {
        schoolYear: exportSchoolYear,
        semester: exportSemester,
      });

      worksheet.addRow([]);
      const startColumn = 2;
      const headerRowIndex = worksheet.lastRow.number + 1;
      const headerRow = worksheet.getRow(headerRowIndex);
      headerRow.height = 26;

      columns.forEach((column, index) => {
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

      let currentRowIndex = headerRowIndex + 1;
      filteredData.forEach((record, recordIndex) => {
        const itemLabels = (record.items || []).map((item) => getExportItemLabel(item));
        const itemQuantities = (record.items || []).map((item) => getItemQuantity(item) || "");
        const itemConditions = (record.items || []).map((item) => getReturnConditionLabel(item));
        const itemRemarks = (record.items || []).map((item) => {
          const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
          const opLabel = tabMeta.operational || "Working";
          const qLabel = tabMeta.quarantine || "Defective";
          const condition = getBorrowingItemCondition(item, qLabel, opLabel);
          return item.returnRemarks || (condition === "defective" ? qLabel : opLabel);
        });
        const rowCount = Math.max(
          itemLabels.length,
          itemQuantities.length,
          itemConditions.length,
          itemRemarks.length,
          1
        );
        const rowFill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: recordIndex % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
        };

        for (let itemIndex = 0; itemIndex < rowCount; itemIndex += 1) {
          const excelRow = worksheet.getRow(currentRowIndex + itemIndex);
          const valueByColumn = {
            name: record.name,
            studentId: record.studentId,
            role: record.role,
            status: formatBorrowingStatus(record.status || statusFilter),
            date: `${formatExportDate(record.date)}${formatExportTime(record.date) ? ` ${formatExportTime(record.date)}` : ""}`,
            returnedAt: record.returnedAt ? `${formatExportDate(record.returnedAt)}${formatExportTime(record.returnedAt) ? ` ${formatExportTime(record.returnedAt)}` : ""}` : "",
            item: itemLabels[itemIndex] || "",
            quantity: itemQuantities[itemIndex] || "",
            condition: itemConditions[itemIndex] || "",
            remark: itemRemarks[itemIndex] || "",
          };
          const values = columns.map((column) => valueByColumn[column.key] || "");

          values.forEach((value, colIndex) => {
            const cell = excelRow.getCell(startColumn + colIndex);
            cell.value = value === null || value === undefined ? "" : String(value);
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.font = { size: 10, name: "Arial" };
            cell.fill = rowFill;
            cell.border = {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }

        if (rowCount > 1) {
          const mergedColumns = ["name", "studentId", "role", "status", "date", "returnedAt"]
            .map((key) => columns.findIndex((column) => column.key === key))
            .filter((colIndex) => colIndex >= 0);

          mergedColumns.forEach((colIndex) => {
            const startCell = `${getColumnLetter(startColumn + colIndex)}${currentRowIndex}`;
            const endCell = `${getColumnLetter(startColumn + colIndex)}${currentRowIndex + rowCount - 1}`;
            worksheet.mergeCells(`${startCell}:${endCell}`);
          });
        }

        currentRowIndex += rowCount;
      });

      columns.forEach((column, index) => {
        const colNumber = startColumn + index;
        const longestData = filteredData.reduce((max, record) => {
          if (column.key === "item") {
            const itemMax = (record.items || []).reduce(
              (itemMax, item) => Math.max(itemMax, String(getExportItemLabel(item) || "").length),
              0
            );
            return Math.max(max, itemMax);
          }

          if (column.key === "remark") {
            const remarkMax = (record.items || []).reduce(
              (remarkMax, item) => {
                const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                const opLabel = tabMeta.operational || "Working";
                const qLabel = tabMeta.quarantine || "Defective";
                const condition = getBorrowingItemCondition(item, qLabel, opLabel);
                const value = item.returnRemarks || (condition === "defective" ? qLabel : opLabel);
                return Math.max(remarkMax, String(value).length);
              },
              0
            );
            return Math.max(max, remarkMax);
          }

          if (column.key === "quantity") {
            const quantityMax = (record.items || []).reduce(
              (itemMax, item) => Math.max(itemMax, String(getItemQuantity(item) || "").length),
              0
            );
            return Math.max(max, quantityMax);
          }

          if (column.key === "condition") {
            const conditionMax = (record.items || []).reduce(
              (itemMax, item) => Math.max(itemMax, String(getReturnConditionLabel(item) || "").length),
              0
            );
            return Math.max(max, conditionMax);
          }

          if (column.key === "date") {
            return Math.max(max, String(formatExportDate(record.date)).length);
          }

          const value = record[column.key];
          return Math.max(max, value === null || value === undefined ? 0 : String(value).length);
        }, 0);

        const width = Math.min(40, Math.max(14, column.label.length + 4, longestData + 2));
        worksheet.getColumn(colNumber).width = width;
      });

      const signatoryStart = currentRowIndex + 4;
      const safePreparedBy = preparedByName.trim() || "____________________";
      const safeInspectedBy = inspectedByName.trim() || "____________________";

      worksheet.getCell(`B${signatoryStart}`).value = "Prepared and submitted by:";
      worksheet.getCell(`B${signatoryStart}`).font = { bold: true, size: 10 };
      worksheet.getCell(`B${signatoryStart + 2}`).value = safePreparedBy;
      worksheet.getCell(`B${signatoryStart + 2}`).font = { bold: true, size: 12, name: "Arial" };
      worksheet.getCell(`B${signatoryStart + 3}`).value = "Borrowing office";
      worksheet.getCell(`B${signatoryStart + 3}`).font = { italic: true, size: 10 };

      worksheet.getCell(`B${signatoryStart + 5}`).value = "Inspected and verified by:";
      worksheet.getCell(`B${signatoryStart + 5}`).font = { bold: true, size: 10 };
      worksheet.getCell(`B${signatoryStart + 7}`).value = safeInspectedBy;
      worksheet.getCell(`B${signatoryStart + 7}`).font = { bold: true, size: 12, name: "Arial" };
      worksheet.getCell(`B${signatoryStart + 8}`).value = "Inventory custodian";
      worksheet.getCell(`B${signatoryStart + 8}`).font = { italic: true, size: 10 };

      worksheet.views = [];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const filename = `borrowing-records-${statusFilter}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      saveAs(blob, filename);

      try {
        const storagePath = createExportStoragePath(filename);
        const { error: uploadError } = await supabase.storage
          .from(EXPORT_BUCKET)
          .upload(storagePath, blob, {
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const exportBy = (
          user?.displayName ||
          [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
          user?.email ||
          "system"
        ).trim();

        const { error: logError } = await supabase.from("export_logs").insert({
          export_by: exportBy || "system",
          file_name: filename,
          export_date: exportDate,
          file_path: storagePath,
        });

        if (logError) {
          console.warn("Failed to insert borrowing export log:", logError);
        } else {
          setExportLogRefreshToken((current) => current + 1);
        }
      } catch (logError) {
        console.warn("Failed to record borrowing export log:", logError);
      }

      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  const cancelReturn = () => {
    setPendingReturn(null);
    setReturnSelections({});
  };

  // ── Confirm Return — Ledger Merge Engine ──────────────────────────────
  // Mirrors the exact remark-change row-shifting architecture from
  // InventorySection.jsx handleRemarkChange(), but operates on checked
  // units and dynamic per-row return remarks.
  const confirmReturn = async () => {
    if (!pendingReturn?.id || returningBorrow) return;

    const units = unrollBorrowedUnits(pendingReturn.items || []);
    const checkedUnits = units.filter((u) => returnSelections[u.unitKey]?.checked);
    if (checkedUnits.length === 0) {
      return;
    }

    setReturningBorrow(true);
    setReturnError("");

    try {
      // Group checked units by the borrowed item they belong to
      const unitsByItemId = new Map();
      for (const unit of checkedUnits) {
        const id = unit.item.id;
        if (!unitsByItemId.has(id)) unitsByItemId.set(id, []);
        unitsByItemId.get(id).push(unit);
      }

      // Identify which sections need fetching (custom-table items only)
      const inventoryItems = (pendingReturn.items || []).filter(
        (item) => item.inventoryItemId && item.inventorySectionId
      );

      // Build a SectionRowsCache: one fetch per impacted section
      const sectionCache = new Map();
      for (const item of inventoryItems) {
        const sectionId = item.inventorySectionId;
        if (sectionCache.has(sectionId)) continue;
        const tabId = item.inventoryTabId;
        const config = await getTabTableConfig(tabId).catch(() => null);
        const tableName = item.tableName || tabTableNames[tabId] || config?.tableName || "";
        const columns = config?.columns || [];
        let rows = [];
        if (tableName) {
          try {
            rows = (await fetchInventoryItems(sectionId, tableName)) || [];
          } catch {
            rows = [];
          }
        }
        sectionCache.set(sectionId, { tabId, tableName, columns, rows });
      }

      // ── Per-unit ledger merge ──────────────────────────────────────────
      const dbOps = [];
      const norm = (v) => String(v ?? "").trim().toLowerCase();

      // Group borrowed items by section so all items in the same section
      // share a single delta accumulator (prevents conflicting DB updates).
      const itemsBySection = new Map();
      for (const [, itemUnits] of unitsByItemId) {
        const borrowedItem = itemUnits[0].item;
        const sectionId = borrowedItem.inventorySectionId;
        if (!itemsBySection.has(sectionId)) itemsBySection.set(sectionId, []);
        itemsBySection.get(sectionId).push(itemUnits);
      }

      for (const [sectionId, sectionItemGroups] of itemsBySection) {
        const cache = sectionCache.get(sectionId);
        const isCustomTable = cache?.tableName && cache?.rows?.length > 0;

        // Handle legacy (no-table) items — these don't need shared delta maps
        for (const itemUnits of sectionItemGroups) {
          const borrowedItem = itemUnits[0].item;
          const sourceItemId = borrowedItem.inventoryItemId;
          const byRemark = new Map();
          for (const unit of itemUnits) {
            const remark = returnSelections[unit.unitKey]?.returnRemark || "Working";
            byRemark.set(remark, (byRemark.get(remark) || 0) + 1);
          }

          if (!isCustomTable) {
            const totalReturnQty = itemUnits.length;
            const tableName =
              borrowedItem.tableName ||
              tabTableNames[borrowedItem.inventoryTabId] ||
              (await getTabTableConfig(borrowedItem.inventoryTabId).catch(() => null))?.tableName ||
              "";

            if (totalReturnQty > 0 && tableName) {
              // Get the operational (non-quarantine) remark label dynamically
              const tabMeta = conditionMetaByTab[borrowedItem.inventoryTabId] || {};
              const operationalLabel = tabMeta.operational || "Working";

              // Separate units by whether they go back to the source (operational)
              // or need a sibling row (non-operational remark)
              const operationalQty = [...byRemark.entries()]
                .filter(([r]) => r === operationalLabel)
                .reduce((sum, [, q]) => sum + q, 0);

              // Add operational-remark units back to the source row
              if (operationalQty > 0) {
                dbOps.push(
                  adjustInventoryItemQuantity({
                    id: sourceItemId,
                    sectionId,
                    tableName,
                    delta: operationalQty,
                  })
                );
              }

              // For non-operational remarks, create a new row with that remark
              // (no existing sibling to merge into in the legacy path)
              for (const [remark, qty] of byRemark) {
                if (remark === operationalLabel) continue;
                if (qty <= 0) continue;

                // Create a new inventory row for this non-operational remark
                dbOps.push(
                  (async () => {
                    // Fetch source item data to clone attributes
                    const { data: src, error: srcErr } = await supabase
                      .from(tableName)
                      .select("*")
                      .eq("id", sourceItemId)
                      .single();
                    if (srcErr) throw srcErr;

                    const { remarkKey: rk, quantityKey: qk } = detectItemColumns(src);
                    const newRow = {};
                    for (const [k, v] of Object.entries(src)) {
                      if (["id", "created_at", "updated_at"].includes(k)) continue;
                      newRow[k] = v;
                    }
                    newRow[qk] = qty;
                    if (rk) newRow[rk] = remark;

                    const { error: insErr } = await supabase.from(tableName).insert([newRow]);
                    if (insErr) throw insErr;
                  })()
                );
              }
            }
          }
        }

        if (!isCustomTable) continue;

        // ── Custom-table ledger merge for this section ────────────────────
        // ONE shared delta accumulator for ALL items in this section,
        // preventing conflicting DB updates when multiple borrowed items
        // target the same inventory row (e.g. two items returned as "Working"
        // both merging into the same Working row).
        const { tableName, rows } = cache;

        // Detect columns from any source row in this section
        const sampleRow = rows.find(() => true) || {};
        const { remarkKey, quantityKey } = detectItemColumns(sampleRow);

        const rowDeltas = new Map();
        const rowsToInsert = [];
        const rowsToDelete = new Set();
        const sourceRowsWithSameRemarkReturn = new Set();
        const allSourceItemIds = new Set();

        const addDelta = (rowId, delta) => {
          rowDeltas.set(rowId, (rowDeltas.get(rowId) || 0) + delta);
        };

        // Process each borrowed item in this section
        for (const itemUnits of sectionItemGroups) {
          const byRemark = new Map();
          for (const unit of itemUnits) {
            const remark = returnSelections[unit.unitKey]?.returnRemark || "Working";
            byRemark.set(remark, (byRemark.get(remark) || 0) + 1);
          }

          const borrowedItem = itemUnits[0].item;
          const sourceItemId = borrowedItem.inventoryItemId;
          allSourceItemIds.add(String(sourceItemId));
          const sourceRowData = rows.find((r) => String(r.id) === String(sourceItemId));

          const matchKeys = sourceRowData
            ? Object.keys(sourceRowData).filter((k) => {
                const nk = String(k).trim().toLowerCase();
                if (["id", "created_at", "updated_at", "sort_order"].includes(nk)) return false;
                if (nk === String(quantityKey || "").toLowerCase()) return false;
                if (nk === String(remarkKey || "").trim().toLowerCase()) return false;
                return sourceRowData[k] != null && String(sourceRowData[k]).trim() !== "";
              })
            : [];

          // Process each distinct return-remark group for this item
          for (const [targetRemark, qty] of byRemark) {
            if (qty <= 0) continue;

            // Find target row: could be source itself (same remark) or a sibling
            let targetRow = null;
            if (remarkKey && sourceRowData && norm(sourceRowData[remarkKey]) === norm(targetRemark)) {
              targetRow = sourceRowData;
              sourceRowsWithSameRemarkReturn.add(String(sourceItemId));
            } else if (remarkKey && sourceRowData) {
              const idKey = ["item_number", "computer_number"].find(
                (k) => sourceRowData[k] != null && rows.some((r) => r[k] != null)
              );
              if (idKey) {
                targetRow = rows.find(
                  (r) =>
                    String(r.id) !== String(sourceItemId) &&
                    r[idKey] === sourceRowData[idKey] &&
                    norm(r[remarkKey]) === norm(targetRemark)
                ) || null;
              }
              if (!targetRow && matchKeys.length > 0) {
                targetRow = rows.find(
                  (r) =>
                    String(r.id) !== String(sourceItemId) &&
                    norm(r[remarkKey]) === norm(targetRemark) &&
                    matchKeys.every((k) => norm(r[k]) === norm(sourceRowData[k]))
                ) || null;
              }
            }

            if (targetRow) {
              addDelta(targetRow.id, qty);
            } else {
              const pendingInsert = rowsToInsert.find(
                (nr) => remarkKey && norm(nr[remarkKey]) === norm(targetRemark) &&
                  matchKeys.every((k) => norm(nr[k]) === norm(sourceRowData[k]))
              );
              if (pendingInsert) {
                pendingInsert[quantityKey] = (Number(pendingInsert[quantityKey]) || 0) + qty;
              } else {
                const newRow = {};
                for (const [k, v] of Object.entries(sourceRowData || {})) {
                  if (["id", "created_at", "updated_at"].includes(k)) continue;
                  newRow[k] = v;
                }
                newRow[quantityKey] = qty;
                if (remarkKey) newRow[remarkKey] = targetRemark;
                rowsToInsert.push(newRow);
              }
            }
          }
        }

        // Apply accumulated deltas — ONE update per row for the whole section
        for (const [rowId, delta] of rowDeltas) {
          if (delta === 0) continue;
          const row = rows.find((r) => String(r.id) === String(rowId));
          if (!row) continue;
          const newQty = Math.max(0, (Number(row[quantityKey]) || 0) + delta);
          if (newQty <= 0) {
            rowsToDelete.add(rowId);
          } else {
            const capturedId = rowId;
            const capturedQty = newQty;
            dbOps.push(
              async () => {
                const { error } = await supabase
                  .from(tableName)
                  .update({ [quantityKey]: capturedQty })
                  .eq("id", capturedId);
                if (error) throw error;
              }
            );
          }
        }

        // Purge zero-qty source rows that received no same-remark returns
        for (const sid of allSourceItemIds) {
          if (rowsToDelete.has(sid)) continue;
          if (sourceRowsWithSameRemarkReturn.has(sid)) continue;
          const row = rows.find((r) => String(r.id) === sid);
          if (!row) continue;
          if (Number(row[quantityKey] || 0) <= 0) {
            rowsToDelete.add(sid);
          }
        }

        // Schedule inserts for new rows
        for (const newRow of rowsToInsert) {
          dbOps.push(
            async () => {
              const { data: created, error } = await supabase
                .from(tableName)
                .insert([newRow])
                .select("*")
                .single();
              if (error) throw error;
              if (created) rows.push(created);
            }
          );
        }

        // Schedule deletes for zero-purged rows
        for (const rowId of rowsToDelete) {
          const capturedId = rowId;
          dbOps.push(
            async () => {
              const { error } = await supabase.from(tableName).delete().eq("id", capturedId);
              if (error) throw error;
            }
          );
          const idx = rows.findIndex((r) => String(r.id) === String(rowId));
          if (idx >= 0) rows.splice(idx, 1);
        }
      }

      // Execute all DB operations
      for (const op of dbOps) {
        await op();
      }

      // ── Collect per-item return remarks from selections ────────────────
      // Aggregate remarks per borrowed item (merge all unit-level remarks)
      const itemRemarkMap = {};
      for (const unit of checkedUnits) {
        const sel = returnSelections[unit.unitKey];
        if (!sel) continue;
        const remarkText = String(sel.remarks || "").trim();
        const conditionText = String(sel.returnRemark || "Working").trim();
        const itemId = unit.item.id;
        if (!itemRemarkMap[itemId]) {
          itemRemarkMap[itemId] = { condition: conditionText, remarks: remarkText };
        } else {
          // Append additional remarks from other units of same item
          if (remarkText) {
            const existing = itemRemarkMap[itemId].remarks;
            itemRemarkMap[itemId].remarks = existing
              ? `${existing}\n${remarkText}`
              : remarkText;
          }
          // If any unit has a non-operational condition, keep it
          const tabMeta = conditionMetaByTab[unit.item.inventoryTabId] || {};
          const opLabel = tabMeta.operational || "Working";
          if (conditionText !== opLabel) {
            itemRemarkMap[itemId].condition = conditionText;
          }
        }
      }

      // ── Determine if all units are returned ───────────────────────────
      const remainingUnits = units.length;
      const allReturned = checkedUnits.length >= remainingUnits;

      if (allReturned) {
        // Build remarks map for returnBorrowingRecord
        const fullRemarksMap = {};
        for (const [itemId, remarkData] of Object.entries(itemRemarkMap)) {
          fullRemarksMap[itemId] = remarkData;
        }
        const hasRemarks = Object.values(fullRemarksMap).some(
          (r) => (r.remarks && r.remarks.trim()) || (r.condition && r.condition !== "Working")
        );
        await returnBorrowingRecord(pendingReturn.id, hasRemarks ? fullRemarksMap : {});
      } else {
        // Build a map of itemId → number of newly-checked units
        const itemQtyMap = {};
        for (const [itemId, itemUnits] of unitsByItemId) {
          itemQtyMap[itemId] = itemUnits.length;
        }
        await updateBorrowingItemsStatus(pendingReturn.id, itemQtyMap);

        // Write remarks separately for partial returns
        const partialRemarksMap = {};
        for (const [itemId, remarkData] of Object.entries(itemRemarkMap)) {
          if (remarkData.remarks || (remarkData.condition && remarkData.condition !== "Working")) {
            partialRemarksMap[itemId] = remarkData;
          }
        }
        if (Object.keys(partialRemarksMap).length > 0) {
          await updateBorrowingItemsRemarks(pendingReturn.id, partialRemarksMap);
        }
      }

      await loadBorrowings();
      setSuccessMessage(
        allReturned
          ? "All items returned successfully."
          : `Returned ${checkedUnits.length} unit${checkedUnits.length !== 1 ? "s" : ""}.`
      );
      setPendingReturn(null);
      setReturnSelections({});

      // Refresh impacted sections in allItems cache
      try {
        const impacted = new Map();
        for (const item of inventoryItems) {
          const key = String(item.inventoryTabId) + "::" + String(item.inventorySectionId);
          if (!impacted.has(key))
            impacted.set(key, {
              tabId: item.inventoryTabId,
              sectionId: item.inventorySectionId,
              tableName: item.tableName || tabTableNames[item.inventoryTabId] || "",
            });
        }
        if (impacted.size > 0) {
          const results = await Promise.allSettled(
            [...impacted.values()].map((sec) =>
              fetchInventoryItems(sec.sectionId, sec.tableName || null).then((items) =>
                (items || []).map((it) => ({
                  ...it,
                  tabId: sec.tabId,
                  sectionId: sec.sectionId,
                  tableName: sec.tableName || "",
                }))
              )
            )
          );
          const freshSectionIds = new Set([...impacted.values()].map((s) => String(s.sectionId)));
          const freshItems = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
          setAllItems((prev) => {
            const untouched = prev.filter((a) => !freshSectionIds.has(String(a.sectionId)));
            return [...untouched, ...freshItems];
          });
        }
      } catch (refreshErr) {
        console.warn("Post-return inventory refresh failed:", refreshErr);
      }
    } catch (error) {
      const message = error?.message || "Failed to return borrowed item.";
      setReturnError(message);
      setBorrowingsError(message);
    } finally {
      setReturningBorrow(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setFormErrors((current) => ({
      ...current,
      [name]: validateField(name, value),
    }));
    setFormError("");
  };

  const toggleItem = (item) => {
    const selectionKey = getInventorySelectionKey({
      inventoryTabId: selectedTab?.id,
      inventorySectionId: selectedSection?.id,
      id: item?.id,
    });
    const isSelected = selectedItemIds.includes(selectionKey);

    if (isSelected) {
      setSelectedItemIds((current) => current.filter((id) => id !== selectionKey));
      setSelectedInventoryItems((current) =>
        current.filter((selectedItem) => selectedItem.selectionKey !== selectionKey)
      );
      setSelectedItemQuantities((current) => {
        const { [selectionKey]: _, ...next } = current;
        return next;
      });
    } else {
      const maxQuantity = Number(item.quantity ?? item.data?.quantity ?? 1);
      const selectedQuantity = Math.max(1, Math.min(maxQuantity, 1));
      const originalDetails = getItemDetails(item);

      setSelectedItemIds((current) => [...current, selectionKey]);
      setSelectedInventoryItems((current) => [
        ...current,
        {
          ...item,
          selectionKey,
          inventoryTabId: selectedTab?.id || null,
          inventoryTabName: selectedTab?.name || "",
          inventorySectionId: selectedSection?.id || null,
          inventorySectionName: selectedSection?.name || "",
          inventoryTableName: tabTableNames[selectedTabId] || "",
          originalDetails,
          selectedQuantity,
        },
      ]);
      setSelectedItemQuantities((current) => ({
        ...current,
        [selectionKey]: selectedQuantity,
      }));
    }

    setFormErrors((current) => ({ ...current, items: "" }));
    setFormError("");
  };

  const requestBorrowConfirmation = () => {
    const pendingCustomItemName = customItemForm.name.trim();
    const hasSelectedItems = selectedItemIds.length > 0 || customItems.length > 0 || pendingCustomItemName;

    const errors = {
      name: validateField("name", form.name),
      studentId: validateField("studentId", form.studentId),
      role: validateField("role", form.role),
      items: hasSelectedItems ? "" : validateField("items", []),
    };

    setFormErrors(errors);
    setFormError("");

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    const invalidQuantity = selectedItems.some((item) => {
      const chosen = Number(item.selectedQuantity || 0);
      const maxAllowed = Number(item.quantity ?? item.data?.quantity ?? 1);
      return !Number.isInteger(chosen) || chosen <= 0 || chosen > maxAllowed;
    });

    if (invalidQuantity) {
      setFormError("One or more selected item quantities are invalid or exceed available stock.");
      return;
    }

    if (pendingCustomItemName) {
      const quantityValue = customItemForm.quantity.trim();
      if (!quantityValue || !/^\d+$/.test(quantityValue) || Number(quantityValue) <= 0) {
        setFormError("Custom item quantity is required and must be a number.");
        return;
      }

      const details = [];

      if (customItemForm.brand.trim()) {
        details.push({ key: "brand", label: "Brand", value: customItemForm.brand.trim() });
      }
      details.push({ key: "quantity", label: "Quantity", value: quantityValue });
      details.push({ key: "condition", label: "Condition", value: customItemForm.condition });
      if (customItemForm.remarks.trim()) {
        details.push({ key: "remarks", label: "Remarks", value: customItemForm.remarks.trim() });
      }

      const newCustomItem = {
        id: `custom-${Date.now()}`,
        label: pendingCustomItemName,
        details,
        inventoryItemId: null,
        inventoryTabId: null,
        inventorySectionId: null,
        inventoryTableName: "",
      };

      setCustomItems((current) => [...current, newCustomItem]);
      setCustomItemForm({
        name: "",
        brand: "",
        quantity: "",
        condition: "Working",
        remarks: "",
      });
    }

  };

  const confirmBorrow = async () => {
    if (savingBorrow) return;

    setSavingBorrow(true);
    try {
      // Split cart into inventory items and custom items
      const inventoryCartItems = borrowCart.filter((c) => !c.isCustom);
      const customCartItems = borrowCart.filter((c) => c.isCustom);

      const borrowingItems = [
        ...inventoryCartItems.map((item) => {
          const originalDetails = item.originalDetails || getItemDetails(item);
          const details = originalDetails.filter(
            (detail) => detail.key !== "quantity"
          );
          details.unshift({
            key: "quantity",
            label: "Quantity",
            value: String(item.quantity || 1),
          });

          return {
            inventoryItemId: item._deductedRowId || item.id,
            inventoryTabId: item.tabId || null,
            inventoryTabName: item.tabName || "",
            inventorySectionId: item.sectionId || null,
            inventorySectionName: item.sectionName || "",
            inventoryTableName: item.tableName || "",
            label: getItemLabel(item),
            details,
            quantity: item.quantity || 1,
          };
        }),
        ...customCartItems.map((item) => ({
          inventoryItemId: null,
          inventoryTabId: null,
          inventoryTabName: "",
          inventorySectionId: null,
          inventorySectionName: "",
          inventoryTableName: "",
          label: item.label,
          details: item.details,
          quantity: item.quantity || 1,
        })),
      ];

      // Deduct borrowed quantity from the Working row in each item's table.
      // Uses detectItemColumns to find the remark/quantity keys dynamically.
      const dbUpdates = [];
      const cartUpdates = [];

      for (const cartItem of inventoryCartItems) {
        const tableName = cartItem.tableName || tabTableNames[cartItem.tabId] || "";
        if (!tableName) continue;

        // Fetch fresh rows for this item's section so we can find the Working row
        const sectionRows = await fetchInventoryItems(cartItem.sectionId, tableName);
        const targetRow = sectionRows.find((r) => String(r.id) === String(cartItem.id));
        if (!targetRow) throw new Error(`Item not found in ${tableName}.`);

        const { quantityKey, remarkKey } = detectItemColumns(targetRow);
        const borrowedQty = Number(cartItem.quantity || 1);
        const currentQty = Number(targetRow[quantityKey] || 0);

        if (borrowedQty > currentQty) {
          throw new Error(`${getItemLabel(cartItem)}: insufficient stock (requested ${borrowedQty}, available ${currentQty}).`);
        }

        const remaining = currentQty - borrowedQty;

        // Track which row ID was actually deducted — this must match what we
        // store in inventoryItemId so the return flow restores the correct row.
        let deductedRowId = cartItem.id;

        // Dynamic remark-based sibling resolution (no hardcoded strings).
        // If the selected row has a remark column, look for a sibling whose
        // remark DIFFERS — that sibling is in the "other" condition group and
        // should be the source of the borrow. If no differing sibling exists,
        // the selected row itself is the only/primary group → deduct from it.
        if (remarkKey) {
          const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
          const targetRemark = norm(targetRow[remarkKey]);

          // Find a sibling with a different remark value (same item, different condition).
          const otherGroupSibling = sectionRows.find((r) => {
            if (String(r.id) === String(cartItem.id)) return false;
            if (!isSameInventoryItem(targetRow, r, remarkKey)) return false;
            return norm(r[remarkKey]) !== targetRemark;
          });

          if (otherGroupSibling) {
            // Borrow from the sibling in the other condition group
            const sibQty = Number(otherGroupSibling[quantityKey] || 0);
            if (borrowedQty > sibQty) {
              throw new Error(`${getItemLabel(cartItem)}: insufficient stock in the other condition group (requested ${borrowedQty}, available ${sibQty}).`);
            }
            dbUpdates.push(
              supabase.from(tableName).update({ [quantityKey]: sibQty - borrowedQty }).eq("id", otherGroupSibling.id)
            );
            deductedRowId = otherGroupSibling.id;
          } else {
            // No sibling in another group — deduct from the selected row directly
            dbUpdates.push(
              supabase.from(tableName).update({ [quantityKey]: remaining }).eq("id", cartItem.id)
            );
          }
        } else {
          // No remark column — deduct from the selected row directly
          dbUpdates.push(
            supabase.from(tableName).update({ [quantityKey]: remaining }).eq("id", cartItem.id)
          );
        }

        // Store the actual deducted row ID so the return flow knows which row to restore.
        cartItem._deductedRowId = deductedRowId;
        cartUpdates.push({ item: cartItem, remainingQuantity: remaining });
      }

      // Execute all DB updates
      const results = await Promise.allSettled(dbUpdates);
      for (const r of results) {
        if (r.status === "rejected") throw r.reason;
      }

      const shouldMerge = mergeWithLastBorrow && latestActiveBorrowForBorrower?.id;

      if (shouldMerge) {
        const appendedItems = await appendBorrowingRecordItems({
          recordId: latestActiveBorrowForBorrower.id,
          items: borrowingItems,
        });

        setData((prev) =>
          prev.map((record) =>
            String(record.id) === String(latestActiveBorrowForBorrower.id)
              ? { ...record, items: [...(record.items || []), ...appendedItems] }
              : record
          )
        );
      } else {
        const savedRecord = await createBorrowingRecord({
          borrowerName: form.name.trim(),
          borrowerIdNumber: form.studentId.trim(),
          borrowerRole: form.role,
          items: borrowingItems,
        });

        setData((prev) => [savedRecord, ...prev]);
      }

      setInventoryItems((currentItems) =>
        currentItems.map((item) => {
          const update = cartUpdates.find(
            ({ item: updatedItem }) =>
              String(updatedItem.id) === String(item.id) &&
              String(updatedItem.sectionId || "") === String(item.section_id || "")
          );

          return update ? { ...item, quantity: update.remainingQuantity } : item;
        })
      );

      // Sync the wizard Step-2 `allItems` cache so the item list reflects
      // the exact live stock immediately after the DB deduction.
      setAllItems((prev) =>
        prev.map((aItem) => {
          const update = cartUpdates.find(
            ({ item: updatedItem }) =>
              String(updatedItem.id) === String(aItem.id) &&
              String(updatedItem.sectionId || "") === String(aItem.sectionId || "") &&
              String(updatedItem.tabId || "") === String(aItem.tabId || "")
          );
          if (!update) return aItem;
          const patched = { ...aItem, quantity: update.remainingQuantity };
          if (patched.data && typeof patched.data === "object")
            patched.data = { ...patched.data, quantity: update.remainingQuantity };
          return patched;
        })
      );

      setSuccessMessage(
        shouldMerge
          ? "Borrowed item merged with the latest active borrowing record."
          : "Borrowing record added successfully."
      );
      closeBorrowModal();

      setDepletedItems(
        new Set(
          cartUpdates
            .filter(({ remainingQuantity }) => remainingQuantity <= 0)
            .map(({ item }) => item.id)
        )
      );
    } catch (error) {
      setFormError(error?.message || "Failed to save borrowing record.");
    } finally {
      setSavingBorrow(false);
    }
  };

  if (inventoryLoading || itemsLoading || borrowingsLoading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
              role="status"
              aria-label="Loading borrowing data"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
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
      <div className="w-full space-y-5">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">
            {showExportLogs
              ? "Export Logs"
              : statusFilter === "all"
                ? "Borrowing History"
                : "Borrowed Items"}
          </h1>
        </div>

        {/* ── Filters & Actions ────────────────────────────────────────────── */}
        <div className="relative z-20 flex w-full flex-col gap-3 overflow-visible xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={showExportLogs ? "Search export logs..." : "Search borrower or item..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 shadow-sm focus:border-[#4a1111] focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {!showExportLogs && (
              <div ref={datePickerRef} className="relative z-50">
                <button
                  type="button"
                  onClick={() => setShowDatePicker((current) => !current)}
                  className="flex w-full min-w-[18rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm hover:border-slate-300 focus:border-[#4a1111] focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20 sm:w-64"
                >
                  <span className="text-slate-500">{formatPickerLabel(dateRange)}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                {showDatePicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-fit rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 px-2 py-2 shadow-[0_24px_80px_rgba(15,23,42,0.16)] ring-1 ring-white/60 backdrop-blur-sm">
                    <DayPicker
                      className="rdp-sidebar-picker text-sm"
                      mode="range"
                      selected={dateRange}
                      numberOfMonths={1}
                      onSelect={(range) => {
                        setDateRange(range || { from: undefined, to: undefined });
                      }}
                      footer={
                        dateRange.from && dateRange.to
                          ? `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`
                          : ""
                      }
                      fromDate={new Date("2000-01-01")}
                      toDate={new Date("2100-12-31")}
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDateRange({ from: undefined, to: undefined });
                        }}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="rounded-full bg-[#4a1111] px-3 py-1 text-xs font-medium text-white hover:bg-[#5a1717]"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowModal(true);
                setActiveStep(1);
                setBorrowCart([]);
                setGlobalSearch("");
                setFormErrors({});
                setFormError("");
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
              title="Open borrow modal"
              aria-label="Open borrow modal"
            >
              <span className="text-base leading-none">+</span>
              <span>Borrow</span>
            </button>

            <button
              type="button"
              onClick={openExportModal}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
              title={borrowingsLoading ? "Loading borrowings..." : "Export borrowings"}
              aria-label={borrowingsLoading ? "Loading borrowings" : "Export borrowings"}
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowExportLogs((current) => !current);
                setStatusFilter("borrowed");
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${showExportLogs
                ? "bg-[#4a1111] text-white hover:bg-[#5a1717]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              title={showExportLogs ? "Return to borrowed items" : "Show export logs"}
              aria-label={showExportLogs ? "Return to borrowed items" : "Show export logs"}
            >
              {showExportLogs ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{showExportLogs ? "Return" : "Export Logs"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowExportLogs(false);
                setStatusFilter(statusFilter === "borrowed" ? "all" : "borrowed");
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${!showExportLogs && statusFilter === "all"
                ? "bg-[#4a1111] text-white hover:bg-[#5a1717]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              title={statusFilter === "borrowed" ? "Show borrowing history" : "Show current borrowed items"}
              aria-label={statusFilter === "borrowed" ? "Show borrowing history" : "Show current borrowed items"}
            >
              {!showExportLogs && statusFilter === "all" ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <History className="h-4 w-4" />
              )}
              <span>{!showExportLogs && statusFilter === "all" ? "Active Only" : "History"}</span>
            </button>
          </div>
        </div>

        {showExportModal && (
          <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
            <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] p-0">
              <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
                <DialogTitle className="text-lg font-semibold text-slate-900">Export Borrowing Records</DialogTitle>
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
                        {borrowingExportColumnOptions.map((column) => (
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
                  disabled={
                    exporting ||
                    filteredData.length === 0 ||
                    selectedExportColumns.length === 0 ||
                    !exportSchoolYear ||
                    !exportSemester
                  }
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
              <AlertDialogTitle>Export Borrowing Records</AlertDialogTitle>
              <AlertDialogDescription>
                Export {selectedExportColumns.length} column{selectedExportColumns.length !== 1 ? "s" : ""}?
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
                onClick={handleExportBorrowings}
                disabled={exporting}
                className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
              >
                {exporting ? "Exporting..." : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {showExportLogs ? (
          <ExportLogsPanel
            searchQuery={search}
            refreshToken={exportLogRefreshToken}
            fileNamePrefix="borrowing-records"
          />
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity duration-300">
            {borrowingsError && (
              <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Error loading borrowings: {borrowingsError}
              </div>
            )}
            {!borrowingsLoading && filteredData.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <p>{statusFilter === "borrowed" ? "No borrowed items yet." : "No borrowing logs found."}</p>
              </div>
            ) : !borrowingsLoading && (
              <>
                <div className="max-h-[36rem] overflow-auto">
                  <table className="w-full min-w-[900px] border-separate border-spacing-0 transition-opacity duration-300">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_rgb(226,232,240)]">
                      <tr>
                        {[
                          "Borrower",
                          "Borrowed At",
                          ...(statusFilter === "all" ? ["Returned At"] : []),
                          ...(statusFilter !== "all" ? ["Status"] : []),
                          "Items",
                          "Quantity",
                          statusFilter === "all" ? "Return Condition" : "Condition",
                        ].map((h) => (
                          <th
                            key={h}
                            className="bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                          >
                            {h}
                          </th>
                        ))}
                        {statusFilter === "borrowed" && (
                          <th className="bg-slate-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <span className="sr-only">Row actions</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentPageData.map((record, rowIndex) => {
                        // Borrowed tab: show only items still out (not fully returned yet)
                        // History tab: show only items that were returned
                        const activeItems = (record.items || []).filter((item) => {
                          const total = getBorrowedQuantity(item);
                          const returned = getReturnedQuantity(item);
                          if (statusFilter === "all") {
                            return returned > 0;
                          }
                          return returned < total;
                        });
                        return (
                        <tr
                          key={record.id}
                          onClick={() => setSelectedRecord(record)}
                          className={`cursor-pointer transition-colors hover:bg-slate-200/80 ${
                            rowIndex % 2 === 0 ? "bg-white" : "bg-slate-100/90"
                          }`}
                        >
                          {/* Borrower */}
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-900">{record.name}</p>
                          </td>

                          {/* Borrowed */}
                          <td className="px-4 py-3 text-sm text-slate-600">
                            <div>{formatExportDate(record.date)}</div>
                            <div className="text-xs text-slate-400">{formatExportTime(record.date)}</div>
                          </td>

                          {/* Returned At (history view only) */}
                          {statusFilter === "all" && (
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {record.returnedAt
                                ? <div>
                                    <div>{formatExportDate(record.returnedAt)}</div>
                                    <div className="text-xs text-slate-400">{formatExportTime(record.returnedAt)}</div>
                                  </div>
                                : <span className="text-xs text-amber-600">Partially returned</span>
                              }
                            </td>
                          )}

                          {/* Status (borrowed view only) */}
                          {statusFilter !== "all" && (
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${getBorrowingStatusClass(record.status)}`}
                            >
                              {formatBorrowingStatus(record.status)}
                            </span>
                          </td>
                          )}

                          {/* Items — bulleted list for multiple */}
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {activeItems.length > 1 ? (
                              <ul className="list-disc list-inside space-y-0.5">
                                {activeItems.map((item) => (
                                  <li key={`${record.id}-${item.id}`}>{item.label}</li>
                                ))}
                              </ul>
                            ) : activeItems.length === 1 ? (
                              <span>{activeItems[0].label}</span>
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* Quantity — borrowed tab: remaining; history tab: returned */}
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {activeItems.length > 1 ? (
                              <ul className="list-disc list-inside space-y-0.5">
                                {activeItems.map((item) => {
                                  const total = getBorrowedQuantity(item);
                                  const returned = getReturnedQuantity(item);
                                  const displayQty = statusFilter === "all"
                                    ? returned
                                    : Math.max(0, total - returned);
                                  const isZero = displayQty === 0 || (statusFilter !== "all" && item.inventoryItemId && depletedItems.has(item.inventoryItemId));
                                  return (
                                    <li key={`${record.id}-${item.id}-qty`} className={isZero ? "text-slate-600 font-semibold" : ""}>
                                      {displayQty || "—"}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : activeItems.length === 1 ? (
                              (() => {
                                const item = activeItems[0];
                                const total = getBorrowedQuantity(item);
                                const returned = getReturnedQuantity(item);
                                const displayQty = statusFilter === "all"
                                  ? returned
                                  : Math.max(0, total - returned);
                                const isZero = displayQty === 0 || (statusFilter !== "all" && item.inventoryItemId && depletedItems.has(item.inventoryItemId));
                                return <span className={isZero ? "text-rose-700 font-semibold" : ""}>{displayQty || "—"}</span>;
                              })()
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* Condition */}
                          <td className="px-4 py-3">
                            {activeItems.length > 1 ? (
                              <ul className="space-y-1">
                                {activeItems.map((item) => {
                                  const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                                  const opLabel = tabMeta.operational || "Working";
                                  const qLabel = tabMeta.quarantine || "Defective";
                                  const isOperational = getBorrowingItemCondition(item, qLabel, opLabel) === "working";
                                  const label = getReturnConditionLabel(item, opLabel, qLabel);
                                  return (
                                    <li key={`${record.id}-${item.id}-condition`}>
                                      <span
                                        className={`inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isOperational
                                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                          : "bg-rose-100 text-rose-700 border-rose-200"
                                          }`}
                                      >
                                        {label}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : activeItems.length === 1 ? (
                              (() => {
                                const item = activeItems[0];
                                const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                                const opLabel = tabMeta.operational || "Working";
                                const qLabel = tabMeta.quarantine || "Defective";
                                const isOperational = getBorrowingItemCondition(item, qLabel, opLabel) === "working";
                                const label = getReturnConditionLabel(item, opLabel, qLabel);
                                return (
                                  <span
                                    className={`inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isOperational
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : "bg-rose-100 text-rose-700 border-rose-200"
                                      }`}
                                  >
                                    {label}
                                  </span>
                                );
                              })()
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* Action (active view only) */}
                          {statusFilter === "borrowed" && (
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestReturn(record);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                >
                                  Return
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

                {/* ── Pagination Footer ─────────────────────────────────────────────── */}
                {filteredData.length > 0 && (
                  <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
                    <div className="text-sm text-slate-500">
                      Showing {Math.min(pageStartIndex + 1, filteredData.length)}–{Math.min(pageEndIndex, filteredData.length)} of {filteredData.length}
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
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Record Detail Dialog ──────────────────────────────────────────── */}
      {selectedRecord && (
        <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
          <DialogContent
            className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            {/* ── Header ───────────────────────────────────────────────────── */}
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
              <DialogTitle className="text-lg font-semibold text-slate-900">
                Borrowing Record Details
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                Complete transaction data for this borrowing record.
              </DialogDescription>
            </DialogHeader>

            {/* ── Body ─────────────────────────────────────────────────────── */}
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">

              {/* Borrower Identity Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Borrower Identity
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Full Name</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">{selectedRecord.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">ID Number</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">{selectedRecord.studentId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Role</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">{selectedRecord.role || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Timeline Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Transaction Details
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Borrowed At</p>
                    <div className="mt-1">
                      <p className="text-sm text-slate-700">{formatExportDate(selectedRecord.date)}</p>
                      <p className="text-xs text-slate-400">{formatExportTime(selectedRecord.date)}</p>
                    </div>
                  </div>
                  {selectedRecord.returnedAt && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Returned At</p>
                      <div className="mt-1">
                      <p className="text-sm text-slate-700">{formatExportDate(selectedRecord.returnedAt)}</p>
                      <p className="text-xs text-slate-400">{formatExportTime(selectedRecord.returnedAt)}</p>
                    </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</p>
                    <p className="mt-1">
                      <span className={`inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold ${getBorrowingStatusClass(selectedRecord.status)}`}>
                        {formatBorrowingStatus(selectedRecord.status)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Return Progress</p>
                    <p className="mt-1">
                      {(() => {
                        const rs = deriveReturningStatus(selectedRecord);
                        const badgeClass = rs === "fully returned"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : rs === "partially returned"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-sky-100 text-sky-700 border-sky-200";
                        const label = rs === "fully returned"
                          ? "Fully Returned"
                          : rs === "partially returned"
                            ? "Partially Returned"
                            : "Not Fully Returned";
                        return (
                          <span className={`inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold ${badgeClass}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items Detail Section */}
              {(() => {
                const returningStatus = deriveReturningStatus(selectedRecord);
                const allItems = selectedRecord.items || [];

                // ── Filter items based on view ──
                // History view ("all"): ONLY show items that have been returned (returnedQty > 0)
                // Borrowed view: show ALL items
                const visibleItems = statusFilter === "all"
                  ? allItems.filter((item) => getReturnedQuantity(item) > 0)
                  : allItems;

                // Count returned vs total for header
                const totalReturnedQty = allItems.reduce(
                  (sum, item) => sum + Math.min(getReturnedQuantity(item), getBorrowedQuantity(item)), 0
                );
                const totalBorrowedQty = allItems.reduce(
                  (sum, item) => sum + getBorrowedQuantity(item), 0
                );

                // ── For borrowed view: split into still-borrowed vs returned ──
                const borrowedItems = statusFilter !== "all"
                  ? visibleItems.filter((item) => getReturnedQuantity(item) < getBorrowedQuantity(item))
                  : [];
                const returnedItems = statusFilter !== "all"
                  ? visibleItems.filter((item) => getReturnedQuantity(item) > 0)
                  : [];
                // An item can appear in both lists if partially returned
                const hasSegregation = borrowedItems.length > 0 && returnedItems.length > 0;

                return (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {statusFilter === "all" && returningStatus === "partially returned"
                        ? `Returned Items · ${visibleItems.length} of ${allItems.length} ${allItems.length === 1 ? "item" : "items"}`
                        : returningStatus === "partially returned"
                          ? `Items · ${allItems.length} ${allItems.length === 1 ? "item" : "items"} · ${totalReturnedQty} of ${totalBorrowedQty} units returned`
                          : `Items · ${allItems.length} ${allItems.length === 1 ? "item" : "items"}`
                      }
                    </h3>
                   
                  </div>
                  <div className="space-y-4">
                    {/* ════════════════════════════════════════════════════════════
                        STILL BORROWED items (borrowed view only)
                        ════════════════════════════════════════════════════════════ */}
                    {hasSegregation && borrowedItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2.5 mb-3 px-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Still Borrowed
                          </p>
                          <span className="text-[10px] text-slate-400">· {borrowedItems.length} {borrowedItems.length === 1 ? "item" : "items"}</span>
                        </div>
                        <div className="space-y-3">
                          {borrowedItems.map((item, idx) => {
                      const borrowedQty = getBorrowedQuantity(item);
                      const returnedQty = getReturnedQuantity(item);
                      const defectiveReturned = getReturnDefectiveQuantity(item);
                      const workingReturned = getReturnWorkingQuantity(item);
                      const itemRemark = getItemRemark(item);
                      const tabName = item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "";
                      const sectionName = item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "";
                      const isCustom = !item.inventoryItemId;

                      // ── Get dynamic condition labels for this item's tab ──
                      const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                      const opLabel = tabMeta.operational || "Working";
                      const qLabel = tabMeta.quarantine || "Defective";

                      // ── Unroll units: one entry per physical unit ──
                      const units = [];
                      if (isCustom) {
                        // Custom/ad-hoc: determine return remark from condition/remarks
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        const rr = String(item.returnRemarks || "").trim().toLowerCase();
                        let customRemark = "Returned";
                        if (rc === "defective" || rr.includes("defect")) customRemark = qLabel;
                        else if (rc === "working" || rr.includes("working")) customRemark = opLabel;
                        for (let i = 0; i < borrowedQty; i++) {
                          const isOut = i >= returnedQty;
                          units.push({
                            index: i,
                            status: isOut ? "Active / Borrowed" : "Returned",
                            remark: isOut ? null : customRemark,
                            returnRemarkText: isOut ? null : (item.returnRemarks || ""),
                          });
                        }
                      } else {
                        // Structured: assign per-remark statuses to individual unit indices
                        let unitCursor = 0;
                        for (let i = 0; i < defectiveReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: qLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        for (let i = 0; i < workingReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: opLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        // Handle unclassified returns
                        const accountedFor = defectiveReturned + workingReturned;
                        const unclassified = Math.max(0, returnedQty - accountedFor);
                        for (let i = 0; i < unclassified; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: "Returned", returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        // Remaining units are still out
                        while (unitCursor < borrowedQty) {
                          units.push({ index: unitCursor, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          unitCursor += 1;
                        }
                        // Nothing returned at all
                        if (units.length === 0) {
                          for (let i = 0; i < borrowedQty; i += 1) {
                            units.push({ index: i, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          }
                        }
                      }

                      // ── Still Borrowed section: show ALL units ──
                      const displayUnits = units;

                      // ── Determine the return condition badge for this item ──
                      const returnConditionLabel = getReturnConditionLabel(item, opLabel, qLabel);
                      const isOperationalReturn = (() => {
                        // Check if the dominant return remark matches operational
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        if (rc === "working" || rc === opLabel.toLowerCase()) return true;
                        if (rc === "defective" || rc === qLabel.toLowerCase()) return false;
                        // Fallback: check if workingReturned > defectiveReturned
                        return workingReturned >= defectiveReturned;
                      })();

                      // ── Asset attribute key-value pairs (no raw DB IDs) ──
                      const assetFields = (item.details || [])
                        .filter((d) => {
                          const k = String(d.key || "").toLowerCase();
                          if (d.value == null || String(d.value).trim() === "" || String(d.value) === "[object Object]") return false;
                          const blockedKeys = new Set([
                            "quantity", "id", "section_id", "created_at", "updated_at",
                            "sort_order", "data", "remark", "condition",
                            "return_defective_quantity", "return_working_quantity",
                            "tab_id", "section_id", "inventory_tab_id", "inventory_section_id",
                            "inventory_item_id", "borrowing_record_id", "inventory_table_name",
                            "computer_number", "computerNumber", "item_number", "itemNumber",
                            "tab_name", "section_name", "tabName", "sectionName",
                            "tableName", "table_name", "inventoryTableName",
                            "tabId", "sectionId", "inventoryTabId", "inventorySectionId",
                            "inventoryItemId", "borrowingRecordId",
                            "name", "item_name", "asset_name", "itemName", "assetName",
                            "label", "item_label", "itemLabel",
                          ]);
                          if (blockedKeys.has(k)) return false;
                          if (k.endsWith("_id")) return false;
                          if (k.startsWith("_")) return false;
                          if (k.includes("tab") || k.includes("section") || k.includes("table")) return false;
                          return true;
                        })
                        .map((d) => ({
                          key: d.key,
                          label: d.label || formatFieldLabel(d.key),
                          value: String(d.value),
                        }));

                      // Fallback for items with empty details array
                      const fallbackFields = [];
                      if (assetFields.length === 0 && (item.details || []).length === 0) {
                        const displayableKeys = [
                          "brand", "model", "serial_number", "serialNumber",
                          "type", "description",
                          "acquisition_date", "acquisitionDate", "date_acquired",
                          "color", "size", "capacity", "processor", "ram", "storage",
                        ];
                        for (const key of displayableKeys) {
                          const val = item[key];
                          if (val != null && String(val).trim() !== "") {
                            fallbackFields.push({ key, label: formatFieldLabel(key), value: String(val) });
                          }
                        }
                      }

                      const displayFields = assetFields.length > 0 ? assetFields : fallbackFields;

                      // ── Original checkout remark ──
                      const originalRemark = getItemConditionRaw(item) || getItemRemark(item) || opLabel;

                      return (
                        <div
                          key={`${selectedRecord.id}-${item.id}-detail`}
                          className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                        >
                          {/* ── Item Header Strip ─────────────────────────────────── */}
                          <div className="bg-slate-50/80 border-b border-slate-100 px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{item.label}</p>
                                {isCustom ? (
                                  <p className="mt-0.5 text-[11px] text-slate-400">Custom Item (Outside Inventory)</p>
                                ) : (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {tabName || "Inventory"}{tabName && sectionName ? " / " : ""}{sectionName || ""}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {/* Return condition badge */}
                                {returningStatus !== "not fully returned" && (
                                  <></>
                                )}
                                <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
                                  Qty: {borrowedQty}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Return Summary Row (for returned items) ──────────── */}
                          {returningStatus !== "not fully returned" && returnedQty > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-slate-50/40 border-b border-slate-100">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Qty Returned</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{returnedQty} / {borrowedQty}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Original Remark</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{originalRemark}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Condition</p>
                                 <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                  
                                    {returnConditionLabel}
                                 
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Remark</p>
                                <p className="mt-0.5 text-xs text-slate-600 truncate">
                                  {item.returnRemarks?.trim() || "—"}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* ── Unit Status (unrolled per-unit rows) ─────────────── */}
                          {displayUnits.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 1 ? "pt-3 pb-2" : "pt-3 pb-2"}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                {displayUnits.length > 1 ? "Unit Status" : "Status"}
                              </p>
                              <div className={displayUnits.length > 1 ? "space-y-0" : ""}>
                                {displayUnits.map((unit, uIdx) => {
                                  const isActive = unit.status === "Active / Borrowed";
                                  const dotColor = isActive
                                    ? "bg-sky-500"
                                    : unit.remark === qLabel || (unit.remark && unit.remark.toLowerCase().includes("defect"))
                                      ? "bg-rose-500"
                                      : unit.remark === opLabel || (unit.remark && unit.remark.toLowerCase() === "working")
                                        ? "bg-emerald-500"
                                        : "bg-slate-400";
                                  return (
                                    <div
                                      key={`${item.id}-unit-${unit.index}`}
                                      className={`flex items-center gap-2 text-xs py-1 ${displayUnits.length > 1 && uIdx < displayUnits.length - 1 ? "border-b border-slate-100/80" : ""}`}
                                    >
                                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                                      {displayUnits.length > 1 && (
                                        <span className="font-medium text-slate-400 w-10 shrink-0 tabular-nums">
                                          Unit {unit.index + 1}:
                                        </span>
                                      )}
                                      <span className={`font-medium ${isActive ? "text-sky-700" : "text-slate-600"}`}>
                                        {unit.status}
                                      </span>
                                      {!isActive && unit.remark && unit.remark !== "Returned" && (
                                        <span className="text-slate-400">— {unit.remark}</span>
                                      )}
                                      {isActive && (
                                        <span className="text-[10px] text-slate-400 italic">still out</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Asset Attributes Grid ───────────────────────────── */}
                          {displayFields.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 0 ? "pt-1" : "pt-2"} pb-3`}>
                              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                {displayFields.map((field) => (
                                  <div key={`${item.id}-${field.key}`} className="flex items-baseline gap-1.5 min-w-0">
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                      {field.label}:
                                    </span>
                                    <span className="truncate text-xs font-medium text-slate-700">{field.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* ── Freetext Return Remarks ─────────────────────────── */}
                        {item.returnRemarks?.trim() && (
                          <div className="border-t border-slate-100 bg-slate-300/10 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Return Remarks</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.returnRemarks}</p>
                          </div>
                        )}
                      </div>
                    );
                    })}
                        </div>
                      </div>
                    )}

                    {/* ════════════════════════════════════════════════════════════
                        RETURNED items (borrowed view only)
                        ════════════════════════════════════════════════════════════ */}
                    {hasSegregation && returnedItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2.5 mb-3 px-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Returned
                          </p>
                          <span className="text-[10px] text-slate-400">· {returnedItems.length} {returnedItems.length === 1 ? "item" : "items"}</span>
                        </div>
                        <div className="space-y-3">
                          {returnedItems.map((item, idx) => {
                      const borrowedQty = getBorrowedQuantity(item);
                      const returnedQty = getReturnedQuantity(item);
                      const defectiveReturned = getReturnDefectiveQuantity(item);
                      const workingReturned = getReturnWorkingQuantity(item);
                      const itemRemark = getItemRemark(item);
                      const tabName = item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "";
                      const sectionName = item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "";
                      const isCustom = !item.inventoryItemId;

                      // ── Get dynamic condition labels for this item's tab ──
                      const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                      const opLabel = tabMeta.operational || "Working";
                      const qLabel = tabMeta.quarantine || "Defective";

                      // ── Unroll units: one entry per physical unit ──
                      const units = [];
                      if (isCustom) {
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        const rr = String(item.returnRemarks || "").trim().toLowerCase();
                        let customRemark = "Returned";
                        if (rc === "defective" || rr.includes("defect")) customRemark = qLabel;
                        else if (rc === "working" || rr.includes("working")) customRemark = opLabel;
                        for (let i = 0; i < borrowedQty; i++) {
                          const isOut = i >= returnedQty;
                          units.push({
                            index: i,
                            status: isOut ? "Active / Borrowed" : "Returned",
                            remark: isOut ? null : customRemark,
                            returnRemarkText: isOut ? null : (item.returnRemarks || ""),
                          });
                        }
                      } else {
                        let unitCursor = 0;
                        for (let i = 0; i < defectiveReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: qLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        for (let i = 0; i < workingReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: opLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        const accountedFor = defectiveReturned + workingReturned;
                        const unclassified = Math.max(0, returnedQty - accountedFor);
                        for (let i = 0; i < unclassified; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: "Returned", returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        while (unitCursor < borrowedQty) {
                          units.push({ index: unitCursor, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          unitCursor += 1;
                        }
                        if (units.length === 0) {
                          for (let i = 0; i < borrowedQty; i += 1) {
                            units.push({ index: i, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          }
                        }
                      }

                      // ── For returned section: only show returned units ──
                      const displayUnits = units.filter((u) => u.status === "Returned");

                      // ── Determine the return condition badge for this item ──
                      const returnConditionLabel = getReturnConditionLabel(item, opLabel, qLabel);
                      const isOperationalReturn = (() => {
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        if (rc === "working" || rc === opLabel.toLowerCase()) return true;
                        if (rc === "defective" || rc === qLabel.toLowerCase()) return false;
                        return workingReturned >= defectiveReturned;
                      })();

                      // ── Asset attribute key-value pairs (no raw DB IDs) ──
                      const assetFields = (item.details || [])
                        .filter((d) => {
                          const k = String(d.key || "").toLowerCase();
                          if (d.value == null || String(d.value).trim() === "" || String(d.value) === "[object Object]") return false;
                          const blockedKeys = new Set([
                            "quantity", "id", "section_id", "created_at", "updated_at",
                            "sort_order", "data", "remark", "condition",
                            "return_defective_quantity", "return_working_quantity",
                            "tab_id", "section_id", "inventory_tab_id", "inventory_section_id",
                            "inventory_item_id", "borrowing_record_id", "inventory_table_name",
                            "computer_number", "computerNumber", "item_number", "itemNumber",
                            "tab_name", "section_name", "tabName", "sectionName",
                            "tableName", "table_name", "inventoryTableName",
                            "tabId", "sectionId", "inventoryTabId", "inventorySectionId",
                            "inventoryItemId", "borrowingRecordId",
                            "name", "item_name", "asset_name", "itemName", "assetName",
                            "label", "item_label", "itemLabel",
                          ]);
                          if (blockedKeys.has(k)) return false;
                          if (k.endsWith("_id")) return false;
                          if (k.startsWith("_")) return false;
                          if (k.includes("tab") || k.includes("section") || k.includes("table")) return false;
                          return true;
                        })
                        .map((d) => ({
                          key: d.key,
                          label: d.label || formatFieldLabel(d.key),
                          value: String(d.value),
                        }));

                      // Fallback for items with empty details array
                      const fallbackFields = [];
                      if (assetFields.length === 0 && (item.details || []).length === 0) {
                        const displayableKeys = [
                          "brand", "model", "serial_number", "serialNumber",
                          "type", "description",
                          "acquisition_date", "acquisitionDate", "date_acquired",
                          "color", "size", "capacity", "processor", "ram", "storage",
                        ];
                        for (const key of displayableKeys) {
                          const val = item[key];
                          if (val != null && String(val).trim() !== "") {
                            fallbackFields.push({ key, label: formatFieldLabel(key), value: String(val) });
                          }
                        }
                      }

                      const displayFields = assetFields.length > 0 ? assetFields : fallbackFields;

                      // ── Original checkout remark ──
                      const originalRemark = getItemConditionRaw(item) || getItemRemark(item) || opLabel;

                      return (
                        <div
                          key={`${selectedRecord.id}-${item.id}-detail-returned`}
                          className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                        >
                          {/* ── Item Header Strip ─────────────────────────────────── */}
                          <div className="bg-slate-50/80 border-b border-slate-100 px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{item.label}</p>
                                {isCustom ? (
                                  <p className="mt-0.5 text-[11px] text-slate-400">Custom Item (Outside Inventory)</p>
                                ) : (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {tabName || "Inventory"}{tabName && sectionName ? " / " : ""}{sectionName || ""}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
                                  Qty: {borrowedQty}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Return Summary Row ───────────────────────────────── */}
                          {returnedQty > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-slate-50/40 border-b border-slate-100">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Qty Returned</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{returnedQty} / {borrowedQty}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Original Remark</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{originalRemark}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Condition</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                  
                                    {returnConditionLabel}
                                  
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Remark</p>
                                <p className="mt-0.5 text-xs text-slate-600 truncate">
                                  {item.returnRemarks?.trim() || "—"}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* ── Unit Status (returned units only) ───────────────── */}
                          {displayUnits.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 1 ? "pt-3 pb-2" : "pt-3 pb-2"}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                {displayUnits.length > 1 ? "Unit Status" : "Status"}
                              </p>
                              <div className={displayUnits.length > 1 ? "space-y-0" : ""}>
                                {displayUnits.map((unit, uIdx) => {
                                  const dotColor =
                                    unit.remark === qLabel || (unit.remark && unit.remark.toLowerCase().includes("defect"))
                                      ? "bg-rose-500"
                                      : unit.remark === opLabel || (unit.remark && unit.remark.toLowerCase() === "working")
                                        ? "bg-emerald-500"
                                        : "bg-slate-400";
                                  return (
                                    <div
                                      key={`${item.id}-unit-${unit.index}`}
                                      className={`flex items-center gap-2 text-xs py-1 ${displayUnits.length > 1 && uIdx < displayUnits.length - 1 ? "border-b border-slate-100/80" : ""}`}
                                    >
                                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                                      {displayUnits.length > 1 && (
                                        <span className="font-medium text-slate-400 w-10 shrink-0 tabular-nums">
                                          Unit {unit.index + 1}:
                                        </span>
                                      )}
                                      <span className="font-medium text-slate-600">
                                        {unit.status}
                                      </span>
                                      {unit.remark && unit.remark !== "Returned" && (
                                        <span className="text-slate-400">— {unit.remark}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Asset Attributes Grid ───────────────────────────── */}
                          {displayFields.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 0 ? "pt-1" : "pt-2"} pb-3`}>
                              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                {displayFields.map((field) => (
                                  <div key={`${item.id}-${field.key}`} className="flex items-baseline gap-1.5 min-w-0">
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                      {field.label}:
                                    </span>
                                    <span className="truncate text-xs font-medium text-slate-700">{field.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* ── Freetext Return Remarks ─────────────────────────── */}
                        {item.returnRemarks?.trim() && (
                          <div className="border-t border-slate-100 bg-slate-300/10 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Return Remarks</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.returnRemarks}</p>
                          </div>
                        )}
                      </div>
                    );
                    })}
                        </div>
                      </div>
                    )}

                    {/* ── Non-segregated: single list (no split needed) ──────── */}
                    {!hasSegregation && visibleItems.map((item, idx) => {
                      const borrowedQty = getBorrowedQuantity(item);
                      const returnedQty = getReturnedQuantity(item);
                      const defectiveReturned = getReturnDefectiveQuantity(item);
                      const workingReturned = getReturnWorkingQuantity(item);
                      const itemRemark = getItemRemark(item);
                      const tabName = item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "";
                      const sectionName = item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "";
                      const isCustom = !item.inventoryItemId;

                      // ── Get dynamic condition labels for this item's tab ──
                      const tabMeta = conditionMetaByTab[item.inventoryTabId] || {};
                      const opLabel = tabMeta.operational || "Working";
                      const qLabel = tabMeta.quarantine || "Defective";

                      // ── Unroll units: one entry per physical unit ──
                      const units = [];
                      if (isCustom) {
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        const rr = String(item.returnRemarks || "").trim().toLowerCase();
                        let customRemark = "Returned";
                        if (rc === "defective" || rr.includes("defect")) customRemark = qLabel;
                        else if (rc === "working" || rr.includes("working")) customRemark = opLabel;
                        for (let i = 0; i < borrowedQty; i++) {
                          const isOut = i >= returnedQty;
                          units.push({
                            index: i,
                            status: isOut ? "Active / Borrowed" : "Returned",
                            remark: isOut ? null : customRemark,
                            returnRemarkText: isOut ? null : (item.returnRemarks || ""),
                          });
                        }
                      } else {
                        let unitCursor = 0;
                        for (let i = 0; i < defectiveReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: qLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        for (let i = 0; i < workingReturned; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: opLabel, returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        const accountedFor = defectiveReturned + workingReturned;
                        const unclassified = Math.max(0, returnedQty - accountedFor);
                        for (let i = 0; i < unclassified; i += 1) {
                          units.push({ index: unitCursor, status: "Returned", remark: "Returned", returnRemarkText: item.returnRemarks || "" });
                          unitCursor += 1;
                        }
                        while (unitCursor < borrowedQty) {
                          units.push({ index: unitCursor, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          unitCursor += 1;
                        }
                        if (units.length === 0) {
                          for (let i = 0; i < borrowedQty; i += 1) {
                            units.push({ index: i, status: "Active / Borrowed", remark: null, returnRemarkText: null });
                          }
                        }
                      }

                      const displayUnits = units;

                      // ── Determine the return condition badge for this item ──
                      const returnConditionLabel = getReturnConditionLabel(item, opLabel, qLabel);
                      const isOperationalReturn = (() => {
                        const rc = String(item.returnCondition || "").trim().toLowerCase();
                        if (rc === "working" || rc === opLabel.toLowerCase()) return true;
                        if (rc === "defective" || rc === qLabel.toLowerCase()) return false;
                        return workingReturned >= defectiveReturned;
                      })();

                      // ── Asset attribute key-value pairs (no raw DB IDs) ──
                      const assetFields = (item.details || [])
                        .filter((d) => {
                          const k = String(d.key || "").toLowerCase();
                          if (d.value == null || String(d.value).trim() === "" || String(d.value) === "[object Object]") return false;
                          const blockedKeys = new Set([
                            "quantity", "id", "section_id", "created_at", "updated_at",
                            "sort_order", "data", "remark", "condition",
                            "return_defective_quantity", "return_working_quantity",
                            "tab_id", "section_id", "inventory_tab_id", "inventory_section_id",
                            "inventory_item_id", "borrowing_record_id", "inventory_table_name",
                            "computer_number", "computerNumber", "item_number", "itemNumber",
                            "tab_name", "section_name", "tabName", "sectionName",
                            "tableName", "table_name", "inventoryTableName",
                            "tabId", "sectionId", "inventoryTabId", "inventorySectionId",
                            "inventoryItemId", "borrowingRecordId",
                            "name", "item_name", "asset_name", "itemName", "assetName",
                            "label", "item_label", "itemLabel",
                          ]);
                          if (blockedKeys.has(k)) return false;
                          if (k.endsWith("_id")) return false;
                          if (k.startsWith("_")) return false;
                          if (k.includes("tab") || k.includes("section") || k.includes("table")) return false;
                          return true;
                        })
                        .map((d) => ({
                          key: d.key,
                          label: d.label || formatFieldLabel(d.key),
                          value: String(d.value),
                        }));

                      const fallbackFields = [];
                      if (assetFields.length === 0 && (item.details || []).length === 0) {
                        const displayableKeys = [
                          "brand", "model", "serial_number", "serialNumber",
                          "type", "description",
                          "acquisition_date", "acquisitionDate", "date_acquired",
                          "color", "size", "capacity", "processor", "ram", "storage",
                        ];
                        for (const key of displayableKeys) {
                          const val = item[key];
                          if (val != null && String(val).trim() !== "") {
                            fallbackFields.push({ key, label: formatFieldLabel(key), value: String(val) });
                          }
                        }
                      }

                      const displayFields = assetFields.length > 0 ? assetFields : fallbackFields;

                      const originalRemark = getItemConditionRaw(item) || getItemRemark(item) || opLabel;

                      return (
                        <div
                          key={`${selectedRecord.id}-${item.id}-detail`}
                          className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                        >
                          {/* ── Item Header Strip ─────────────────────────────────── */}
                          <div className="bg-slate-50/80 border-b border-slate-100 px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{item.label}</p>
                                {isCustom ? (
                                  <p className="mt-0.5 text-[11px] text-slate-400">Custom Item (Outside Inventory)</p>
                                ) : (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {tabName || "Inventory"}{tabName && sectionName ? " / " : ""}{sectionName || ""}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {returningStatus !== "not fully returned" && (
                                  <></>
                                )}
                                <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
                                  Qty: {borrowedQty}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Return Summary Row (for returned items) ──────────── */}
                          {returningStatus !== "not fully returned" && returnedQty > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-slate-50/40 border-b border-slate-100">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Qty Returned</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{returnedQty} / {borrowedQty}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Original Remark</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">{originalRemark}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Condition</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                 
                                    {returnConditionLabel}
                                 
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Return Remark</p>
                                <p className="mt-0.5 text-xs text-slate-600 truncate">
                                  {item.returnRemarks?.trim() || "—"}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* ── Unit Status (unrolled per-unit rows) ─────────────── */}
                          {displayUnits.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 1 ? "pt-3 pb-2" : "pt-3 pb-2"}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                {displayUnits.length > 1 ? "Unit Status" : "Status"}
                              </p>
                              <div className={displayUnits.length > 1 ? "space-y-0" : ""}>
                                {displayUnits.map((unit, uIdx) => {
                                  const isActive = unit.status === "Active / Borrowed";
                                  const dotColor = isActive
                                    ? "bg-sky-500"
                                    : unit.remark === qLabel || (unit.remark && unit.remark.toLowerCase().includes("defect"))
                                      ? "bg-rose-500"
                                      : unit.remark === opLabel || (unit.remark && unit.remark.toLowerCase() === "working")
                                        ? "bg-emerald-500"
                                        : "bg-slate-400";
                                  return (
                                    <div
                                      key={`${item.id}-unit-${unit.index}`}
                                      className={`flex items-center gap-2 text-xs py-1 ${displayUnits.length > 1 && uIdx < displayUnits.length - 1 ? "border-b border-slate-100/80" : ""}`}
                                    >
                                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                                      {displayUnits.length > 1 && (
                                        <span className="font-medium text-slate-400 w-10 shrink-0 tabular-nums">
                                          Unit {unit.index + 1}:
                                        </span>
                                      )}
                                      <span className={`font-medium ${isActive ? "text-sky-700" : "text-slate-600"}`}>
                                        {unit.status}
                                      </span>
                                      {!isActive && unit.remark && unit.remark !== "Returned" && (
                                        <span className="text-slate-400">— {unit.remark}</span>
                                      )}
                                      {isActive && (
                                        <span className="text-[10px] text-slate-400 italic">still out</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Asset Attributes Grid ───────────────────────────── */}
                          {displayFields.length > 0 && (
                            <div className={`px-4 ${displayUnits.length > 0 ? "pt-1" : "pt-2"} pb-3`}>
                              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                {displayFields.map((field) => (
                                  <div key={`${item.id}-${field.key}`} className="flex items-baseline gap-1.5 min-w-0">
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                      {field.label}:
                                    </span>
                                    <span className="truncate text-xs font-medium text-slate-700">{field.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* ── Freetext Return Remarks ─────────────────────────── */}
                        {item.returnRemarks?.trim() && (
                          <div className="border-t border-slate-100 bg-slate-300/10 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Return Remarks</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.returnRemarks}</p>
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              );
              })()}

            </div>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          3-STEP BORROW WIZARD MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {showModal && (() => {
        // ── Step 1 gate: all 3 borrower fields must pass validation ──────
        const step1Valid =
          !validateField("name", form.name) &&
          !validateField("studentId", form.studentId) &&
          !validateField("role", form.role);

        // ── Step 2 search term ───────────────────────────────────────────
        const searchLower = globalSearch.toLowerCase().trim();

        // ── Items already in cart (by cartId lookup) ─────────────────────
        const cartIdSet = new Set(borrowCart.map((c) => c.cartId));

        // ── Helpers ──────────────────────────────────────────────────────
        const addToCart = (item, isCustom = false, forcedQuantity = null) => {
          const cartId = isCustom
            ? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            : `inv-${item.tabId}-${item.sectionId}-${item.id}`;

          if (borrowCart.some((c) => c.cartId === cartId)) return;

          const maxQuantity = isCustom ? 999 : Number(item.quantity ?? item.data?.quantity ?? 1);
          const initialQty = forcedQuantity != null ? Math.max(1, Math.min(Number(forcedQuantity), maxQuantity)) : 1;
          const cartItem = {
            ...item,
            cartId,
            isCustom,
            quantity: initialQty,
            maxQuantity,
            tabName: item.tabName || "",
            sectionName: item.sectionName || "",
            tabId: item.tabId || null,
            sectionId: item.sectionId || null,
            tableName: item.tableName || "",
            originalDetails: getItemDetails(item),
          };

          setBorrowCart((prev) => [...prev, cartItem]);
          setFormErrors((prev) => ({ ...prev, items: "" }));
          setFormError("");
        };

        const removeFromCart = (cartId) => {
          setBorrowCart((prev) => prev.filter((c) => c.cartId !== cartId));
        };

        const updateCartQuantity = (cartId, newQty) => {
          setBorrowCart((prev) =>
            prev.map((c) =>
              c.cartId === cartId
                ? { ...c, quantity: Math.max(1, Math.min(c.maxQuantity, newQty)) }
                : c
            )
          );
        };

        const addCustomItemToCart = () => {
          const name = customItemForm.name.trim();
          if (!name) return;
          const quantityValue = customItemForm.quantity.trim();
          if (!quantityValue || !/^\d+$/.test(quantityValue) || Number(quantityValue) <= 0) {
            setFormError("Custom item quantity is required and must be a number.");
            return;
          }

          const details = [];
          if (customItemForm.brand.trim()) {
            details.push({ key: "brand", label: "Brand", value: customItemForm.brand.trim() });
          }
          details.push({ key: "quantity", label: "Quantity", value: quantityValue });
          details.push({ key: "condition", label: "Condition", value: customItemForm.condition });
          if (customItemForm.remarks.trim()) {
            details.push({ key: "remarks", label: "Remarks", value: customItemForm.remarks.trim() });
          }

          const cartId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setBorrowCart((prev) => [
            ...prev,
            {
              id: cartId,
              label: name,
              details,
              cartId,
              isCustom: true,
              quantity: Number(quantityValue),
              maxQuantity: 999,
              tabName: "",
              sectionName: "",
              tabId: null,
              sectionId: null,
              tableName: "",
            },
          ]);
          setCustomItemForm({ name: "", brand: "", quantity: "", condition: "Working", remarks: "" });
          setFormErrors((prev) => ({ ...prev, items: "" }));
          setFormError("");
        };

        const canAddCustom =
          customItemForm.name.trim() &&
          customItemForm.quantity.trim() &&
          /^\d+$/.test(customItemForm.quantity.trim()) &&
          Number(customItemForm.quantity.trim()) > 0;

        // ── Filtered items: cascading tab → section → text search ───────
        const filterTab = filterTabId ? tabs.find((t) => String(t.id) === String(filterTabId)) : null;
        const filterSections = filterTab?.sections || [];

        const filteredItems = allItems.filter((item) => {
          // Tab filter
          if (filterTabId && String(item.tabId) !== String(filterTabId)) return false;
          // Section filter
          if (filterSectionId && String(item.sectionId) !== String(filterSectionId)) return false;
          // Free-text search (secondary)
          if (searchLower) {
            const haystack = [
              getItemLabel(item),
              item.tabName || "",
              item.sectionName || "",
              item.brand || "",
              item.type || "",
              item.description || "",
              item.computer_number ?? item.computerNumber ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(searchLower);
          }
          return true;
        });

        // ── Stepper icon map ─────────────────────────────────────────────
        const stepIcons = [
          { key: "identity", Icon: User },
          { key: "select", Icon: Package },
          { key: "review", Icon: CheckCircle },
        ];

        return (
          <Dialog open={showModal} onOpenChange={(open) => !open && closeBorrowModal()}>
            <DialogContent
              className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              {/* ── Stepper Header ──────────────────────────────────────── */}
              <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 pt-5 pb-4 sm:px-8">
                <div className="flex items-center justify-center">
                  {["Identity", "Select Items", "Review"].map((label, idx) => {
                    const stepNum = idx + 1;
                    const isActive = activeStep === stepNum;
                    const isCompleted = activeStep > stepNum;
                    const { Icon } = stepIcons[idx];

                    return (
                      <div key={stepIcons[idx].key} className="flex items-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                              isActive && "border-[#4a1111] bg-[#4a1111] text-white",
                              isCompleted && "border-[#4a1111] bg-[#4a1111] text-white",
                              !isActive && !isCompleted && "border-slate-200 bg-white text-slate-400"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <span
                            className={cn(
                              "text-[11px] font-medium tracking-wide",
                              isActive && "text-[#4a1111]",
                              isCompleted && "text-[#4a1111]/60",
                              !isActive && !isCompleted && "text-slate-400"
                            )}
                          >
                            {label}
                          </span>
                        </div>
                        {idx < 2 && (
                          <div
                            className={cn(
                              "mx-4 mb-5 h-0.5 w-16 rounded-full transition-colors",
                              activeStep > stepNum ? "bg-[#4a1111]" : "bg-slate-200"
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </DialogHeader>

              {/* ── Scrollable Body ──────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">

                {/* ═══ STEP 1: Borrower Identity ═══ */}
                {activeStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <DialogTitle className="text-lg font-semibold text-slate-900">
                        Borrower Information
                      </DialogTitle>
                      <DialogDescription className="mt-1 text-sm">
                        Enter the borrower's identity details to begin.
                      </DialogDescription>
                    </div>

                    <div>
                      <Label htmlFor="borrow-name" className="mb-1 block text-sm font-medium text-slate-700">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="borrow-name"
                        name="name"
                        placeholder="Enter full name"
                        value={form.name}
                        onChange={handleChange}
                        autoFocus
                        aria-invalid={!!formErrors.name}
                        aria-describedby={formErrors.name ? "name-error" : undefined}
                        className={cn(
                          "h-10",
                          formErrors.name && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive"
                        )}
                      />
                      {formErrors.name && (
                        <p id="name-error" className="mt-1 text-xs font-medium text-destructive">{formErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="borrow-studentId" className="mb-1 block text-sm font-medium text-slate-700">
                        ID Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="borrow-studentId"
                        name="studentId"
                        placeholder="Enter ID number"
                        value={form.studentId}
                        onChange={handleChange}
                        aria-invalid={!!formErrors.studentId}
                        aria-describedby={formErrors.studentId ? "studentId-error" : undefined}
                        className={cn(
                          "h-10",
                          formErrors.studentId && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive"
                        )}
                      />
                      {formErrors.studentId && (
                        <p id="studentId-error" className="mt-1 text-xs font-medium text-destructive">{formErrors.studentId}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="borrow-role" className="mb-1 block text-sm font-medium text-slate-700">
                        Role <span className="text-destructive">*</span>
                      </Label>
                      <Select name="role" value={form.role} onValueChange={(val) => {
                        setForm({ ...form, role: val });
                        setFormErrors((prev) => ({ ...prev, role: validateField("role", val) }));
                        setFormError("");
                      }}>
                        <SelectTrigger id="borrow-role" className="h-10">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Student">Student</SelectItem>
                          <SelectItem value="Teacher">Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                      {formErrors.role && (
                        <p id="role-error" className="mt-1 text-xs font-medium text-destructive">{formErrors.role}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ STEP 2: Select Items ═══ */}
                {activeStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <DialogTitle className="text-lg font-semibold text-slate-900">Select Items</DialogTitle>
                      <DialogDescription className="mt-1 text-sm">
                        Browse by location, pick items, and manage your cart.
                      </DialogDescription>
                    </div>

                    {/* ── Cascading Filters: Inventory → Section ──────────────── */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block text-sm font-medium text-slate-700">Inventory</Label>
                        <Select value={filterTabId || "__all__"} onValueChange={(val) => { setFilterTabId(val === "__all__" ? "" : val); setFilterSectionId(""); }}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="All Inventories" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All Inventories</SelectItem>
                            {tabs.map((tab) => (
                              <SelectItem key={tab.id} value={String(tab.id)}>{tab.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-1 block text-sm font-medium text-slate-700">Section</Label>
                        <Select value={filterSectionId || "__all__"} onValueChange={(val) => setFilterSectionId(val === "__all__" ? "" : val)} disabled={!filterTabId}>
                          <SelectTrigger className="h-10"><SelectValue placeholder={filterTabId ? "All Sections" : "Select inventory first"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All Sections</SelectItem>
                            {filterSections.map((section) => (
                              <SelectItem key={section.id} value={String(section.id)}>{section.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* ── Secondary free-text search ─────────────────────────── */}
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search within selection..."
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        autoFocus
                        className="h-9 pl-9 pr-9 text-sm"
                      />
                      {globalSearch && (
                        <button
                          type="button"
                          onClick={() => setGlobalSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* ── Compact Scrollable Item List ────────────────────────── */}
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="grid grid-cols-[1fr_90px_80px] gap-2 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <span>Item</span>
                        <span className="text-center">In Stock</span>
                        <span className="text-right">Action</span>
                      </div>
                      {allItemsLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#4a1111]" />
                          <span className="ml-2 text-sm text-slate-500">Loading inventory...</span>
                        </div>
                      ) : filteredItems.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">
                          {globalSearch ? "No items match your search." : "No inventory items available."}
                        </p>
                      ) : (
                        <div className="max-h-[250px] overflow-y-auto">
                          {filteredItems.map((item) => {
                            const cartId = `inv-${item.tabId}-${item.sectionId}-${item.id}`;
                            const alreadyInCart = cartIdSet.has(cartId);
                            const liveStock = getLiveStock(item);
                            const reservedForThisItem = getCartReservedQuantity(cartId, borrowCart);
                            const availableStock = Math.max(0, liveStock - reservedForThisItem);

                            const itemRemark = getItemRemark(item);

                            return (
                              <div
                                key={cartId}
                                className="grid grid-cols-[1fr_90px_80px] gap-2 items-center border-b border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="truncate text-sm font-medium text-slate-800">{getItemLabel(item)}</p>
                                    {itemRemark && (
                                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600">
                                        {itemRemark}
                                      </span>
                                    )}
                                  </div>
                                  <p className="truncate text-[11px] text-slate-400">{item.tabName} • {item.sectionName}</p>
                                </div>
                                <div className="text-center">
                                  <span className={cn(
                                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    availableStock > 0
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  )}>
                                    {availableStock > 0 ? availableStock : "0"}
                                  </span>
                                </div>
                                <div className="text-right">
                                  {availableStock <= 0 && (
                                    <span className="block text-[9px] font-semibold text-rose-500 leading-tight">
                                      Not available
                                    </span>
                                  )}
                                  {availableStock > 0 && (
                                    <Button
                                      size="sm"
                                      variant={alreadyInCart ? "secondary" : "default"}
                                      onClick={() => {
                                        if (!alreadyInCart && availableStock > 0) {
                                          setQtyDialogItem(item);
                                          setQtyDialogValue(1);
                                        }
                                      }}
                                      disabled={alreadyInCart || availableStock <= 0}
                                      className={cn(
                                        "h-7 px-2.5 text-[11px] font-semibold mt-0.5",
                                        !alreadyInCart && availableStock > 0 && "bg-[#4a1111] hover:bg-[#5a1717]"
                                      )}
                                    >
                                      {alreadyInCart ? "Added" : "+ Add"}
                                    </Button>
                                  )}

                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ── Quantity Dialog (nested) ───────────────────────────── */}
                    {qtyDialogItem && (
                      <Dialog open={!!qtyDialogItem} onOpenChange={(open) => !open && setQtyDialogItem(null)}>
                        <DialogContent
                          className="max-w-sm rounded-2xl p-6"
                          onPointerDownOutside={(e) => e.preventDefault()}
                        >
                          <DialogHeader>
                            <DialogTitle className="text-base font-semibold text-slate-900">How many to borrow?</DialogTitle>
                            <DialogDescription className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                              {getItemLabel(qtyDialogItem)}
                              {getItemRemark(qtyDialogItem) && (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600">
                                  {getItemRemark(qtyDialogItem)}
                                </span>
                              )}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="mt-4 flex flex-col items-center gap-3">
                            <span className="text-xs text-slate-400">Available: {Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 0)}</span>
                            <div className="flex items-center gap-3">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 rounded-full"
                                onClick={() => setQtyDialogValue((v) => Math.max(1, v - 1))}
                                disabled={qtyDialogValue <= 1}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                max={Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1)}
                                value={qtyDialogValue}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (!Number.isNaN(v)) {
                                    const max = Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1);
                                    setQtyDialogValue(Math.max(1, Math.min(v, max)));
                                  }
                                }}
                                className="no-number-spinner h-10 w-20 text-center text-lg font-semibold"
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 rounded-full"
                                onClick={() => {
                                  const max = Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1);
                                  setQtyDialogValue((v) => Math.min(max, v + 1));
                                }}
                                disabled={qtyDialogValue >= Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <DialogFooter className="mt-5 gap-2 sm:gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setQtyDialogItem(null)}
                              className="rounded-lg"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                addToCart(qtyDialogItem, false, qtyDialogValue);
                                setQtyDialogItem(null);
                              }}
                              className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]"
                            >
                              Add to List
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}

                    {/* ── Custom Item Form ───────────────────────────────────── */}
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
                      <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-3">
                        Or Add Custom Item (Outside Inventory)
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="mb-1 block text-sm font-medium text-slate-700">Item Name</Label>
                          <Input
                            type="text"
                            placeholder="e.g. External Hard Drive"
                            value={customItemForm.name}
                            onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                            className="h-10"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="mb-1 block text-sm font-medium text-slate-700">
                              Brand <span className="text-slate-400 font-normal">(optional)</span>
                            </Label>
                            <Input
                              type="text"
                              placeholder="e.g. Samsung"
                              value={customItemForm.brand}
                              onChange={(e) => setCustomItemForm({ ...customItemForm, brand: e.target.value })}
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block text-sm font-medium text-slate-700">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              placeholder="e.g. 1"
                              value={customItemForm.quantity}
                              onChange={(e) => setCustomItemForm({ ...customItemForm, quantity: e.target.value })}
                              className="no-number-spinner h-10"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="mb-1 block text-sm font-medium text-slate-700">Condition</Label>
                            <Select value={customItemForm.condition} onValueChange={(val) => setCustomItemForm({ ...customItemForm, condition: val })}>
                              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Working">Working</SelectItem>
                                <SelectItem value="Defective">Defective</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block text-sm font-medium text-slate-700">
                              Remarks <span className="text-slate-400 font-normal">(optional)</span>
                            </Label>
                            <Input
                              type="text"
                              placeholder="Any notes..."
                              value={customItemForm.remarks}
                              onChange={(e) => setCustomItemForm({ ...customItemForm, remarks: e.target.value })}
                              className="h-10"
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="default"
                        onClick={addCustomItemToCart}
                        disabled={!canAddCustom}
                        className={cn(
                          "mt-4 w-full h-10 text-sm font-semibold",
                          canAddCustom
                            ? "bg-[#4a1111] hover:bg-[#5a1717]"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100"
                        )}
                      >
                        + Add Custom Item
                      </Button>
                    </div>

                    {/* ── Cart Summary with +/- controls ─────────────────────── */}
                    {borrowCart.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                            Cart ({borrowCart.length} {borrowCart.length === 1 ? "item" : "items"})
                          </h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
                          {borrowCart.map((item) => (
                            <div key={item.cartId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-slate-800 truncate">
                                    {item.label || getItemLabel(item)}
                                  </p>
                                  {getItemRemark(item) && (
                                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600">
                                      {getItemRemark(item)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400">
                                  {item.isCustom ? "Custom Item" : `${item.tabName} / ${item.sectionName}`}
                                </p>
                              </div>
                              {!item.isCustom && (
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-6 w-6 rounded-full border-slate-200"
                                    onClick={() => updateCartQuantity(item.cartId, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm font-semibold text-slate-700">
                                    {item.quantity}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-6 w-6 rounded-full border-slate-200"
                                    onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)}
                                    disabled={item.quantity >= item.maxQuantity}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {item.isCustom && (
                                <span className="px-2 py-0.5 text-sm font-semibold text-slate-600">
                                  ×{item.quantity}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.cartId)}
                                className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50"
                                title="Remove"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {formError && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p>
                    )}
                  </div>
                )}

                {/* ═══ STEP 3: Review & Summary ═══ */}
                {activeStep === 3 && (
                  <div className="space-y-5">
                    <div>
                      <DialogTitle className="text-lg font-semibold text-slate-900">Review & Confirm</DialogTitle>
                      <DialogDescription className="mt-1 text-sm">
                        Verify all details before confirming the borrowing record.
                      </DialogDescription>
                    </div>

                    {/* Borrower Profile Block */}
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Borrower</h3>
                      </div>
                      <div className="px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Full Name</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{form.name.trim()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">ID Number</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{form.studentId.trim()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Role</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{form.role}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                          Items ({borrowCart.length})
                        </h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {borrowCart.map((item) => (
                          <div key={item.cartId} className="flex items-center justify-between gap-4 px-5 py-3.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-slate-800">{item.label || getItemLabel(item)}</p>
                                {getItemRemark(item) && (
                                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600">
                                    {getItemRemark(item)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {item.isCustom ? "Custom Item" : `${item.tabName} • ${item.sectionName}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {!item.isCustom && (
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7 rounded-full border-slate-200"
                                    onClick={() => updateCartQuantity(item.cartId, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm font-semibold text-slate-700">
                                    {item.quantity}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7 rounded-full border-slate-200"
                                    onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)}
                                    disabled={item.quantity >= item.maxQuantity}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {item.isCustom && (
                                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  Qty: {item.quantity}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.cartId)}
                                className="rounded-md p-1.5 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                                title="Remove item"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Merge with active borrow */}
                    {latestActiveBorrowForBorrower ? (
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
                        <Checkbox
                          checked={mergeWithLastBorrow}
                          onCheckedChange={(checked) => setMergeWithLastBorrow(!!checked)}
                          className="mt-0.5 border-amber-400 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                        />
                        <span>
                          <span className="block font-semibold">Merge with latest active borrow</span>
                          <span className="mt-1 block text-xs text-amber-700">
                            Latest record borrowed on{" "}
                            {new Date(latestActiveBorrowForBorrower.date).toLocaleString()} has not been returned yet.
                          </span>
                        </span>
                      </label>
                    ) : null}

                    {formError && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Footer ──────────────────────────────────────────────── */}
              <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeBorrowModal}
                  className="rounded-lg"
                >
                  Cancel
                </Button>

                {activeStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setActiveStep((s) => s - 1); setFormError(""); }}
                    className="rounded-lg"
                  >
                    Back
                  </Button>
                )}

                {activeStep === 1 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const errors = {
                        name: validateField("name", form.name),
                        studentId: validateField("studentId", form.studentId),
                        role: validateField("role", form.role),
                      };
                      setFormErrors(errors);

                      if (Object.values(errors).some(Boolean)) return;

                      setActiveStep(2);
                      setFormError("");
                    }}
                    disabled={!step1Valid}
                    className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]"
                  >
                    Continue
                  </Button>
                )}

                {activeStep === 2 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (borrowCart.length === 0) {
                        setFormError("Add at least one item to the cart.");
                        return;
                      }
                      setActiveStep(3);
                      setFormError("");
                    }}
                    disabled={borrowCart.length === 0}
                    className={cn(
                      "rounded-lg px-5",
                      borrowCart.length > 0
                        ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f]"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100"
                    )}
                  >
                    Review
                  </Button>
                )}

                {activeStep === 3 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={confirmBorrow}
                    disabled={savingBorrow || borrowCart.length === 0}
                    className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f] disabled:cursor-wait disabled:opacity-60"
                  >
                    {savingBorrow ? "Saving..." : "Confirm Borrow"}
                  </Button>
                )}
              </DialogFooter>

            </DialogContent>
          </Dialog>
        );
      })()}

      {pendingReturn && (() => {
        const units = unrollBorrowedUnits(pendingReturn.items || []);
        const checkedCount = units.filter((u) => returnSelections[u.unitKey]?.checked).length;
        const totalUnits = units.length;

        // Group consecutive units by item for display (each row is still 1-by-1)
        const itemGroups = [];
        let currentGroup = null;
        for (const unit of units) {
          if (!currentGroup || currentGroup.item.id !== unit.item.id) {
            currentGroup = { item: unit.item, units: [] };
            itemGroups.push(currentGroup);
          }
          currentGroup.units.push(unit);
        }

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
              {/* ── Header ──────────────────────────────────────────────── */}
              <div className="shrink-0 border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-bold text-[#4a1111]">Return Items</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {pendingReturn.name} &middot; {checkedCount}/{totalUnits} units selected for return
                </p>
              </div>

              {/* ── Scrollable unit list ────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {returnError && (
                  <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {returnError}
                  </div>
                )}

                <div className="space-y-4">
                  {itemGroups.map((group) => {
                    const tabMeta = conditionMetaByTab[group.item.inventoryTabId] || {};
                    const allOptions = tabMeta.allOptions || ["Working", "Defective"];
                    const locLabel = [
                      group.item.tab || inventoryNameLookup.tabNames[group.item.inventoryTabId] || "Inventory",
                      group.item.section || inventoryNameLookup.sectionNames[group.item.inventorySectionId] || "Section",
                    ].join(" / ");

                    return (
                      <div key={group.item.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        {/* Item header */}
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <p className="text-sm font-semibold text-slate-800">{group.item.label}</p>
                          <p className="text-xs text-slate-400">{locLabel}</p>
                        </div>

                        {/* Unrolled unit rows */}
                        <div className="divide-y divide-slate-100">
                          {group.units.map((unit) => {
                            const sel = returnSelections[unit.unitKey] || { checked: true, returnRemark: allOptions[0] || "Working", remarks: "" };
                            const unitNum = unit.unitIndex + 1;
                            const groupQty = group.units.length;
                            const opLabel = tabMeta.operational || "Working";
                            const isNonOperational = sel.checked && sel.returnRemark && sel.returnRemark !== opLabel;

                            return (
                              <div key={unit.unitKey}>
                                <div
                                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${sel.checked ? "bg-white" : "bg-slate-50/60"}`}
                                >
                                  {/* Checkbox */}
                                  <Checkbox
                                    checked={!!sel.checked}
                                    onCheckedChange={(checked) =>
                                      setReturnSelections((prev) => ({
                                        ...prev,
                                        [unit.unitKey]: { ...(prev[unit.unitKey] || {}), checked: !!checked },
                                      }))
                                    }
                                    className="border-slate-300 data-[state=checked]:bg-[#4a1111] data-[state=checked]:border-[#4a1111]"
                                  />

                                  {/* Unit label */}
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm ${sel.checked ? "font-medium text-slate-800" : "text-slate-400"}`}>
                                      Unit {unitNum}{groupQty > 1 ? ` of ${groupQty}` : ""}
                                    </p>
                                    {unit.originalRemark && (
                                      <p className="text-xs text-slate-400">
                                        Current: <span className="font-medium text-slate-600">{unit.originalRemark}</span>
                                      </p>
                                    )}
                                  </div>

                                  {/* Dynamic remark dropdown */}
                                  <select
                                    value={sel.returnRemark || allOptions[0] || "Working"}
                                    onChange={(e) =>
                                      setReturnSelections((prev) => ({
                                        ...prev,
                                        [unit.unitKey]: { ...(prev[unit.unitKey] || {}), returnRemark: e.target.value },
                                      }))
                                    }
                                    disabled={!sel.checked}
                                    className={`h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#4a1111] ${
                                      sel.checked
                                        ? "border-slate-200 bg-white text-slate-700"
                                        : "border-slate-100 bg-slate-50 text-slate-400"
                                    }`}
                                  >
                                    {allOptions.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Reason input — shown when remark is non-operational */}
                                {isNonOperational && (
                                  <div className="border-t border-dashed border-slate-200 bg-amber-50/40 px-4 py-2.5">
                                    <label className="block text-xs font-medium text-amber-800 mb-1">
                                      Why is this unit being returned as "{sel.returnRemark}"?
                                    </label>
                                    <textarea
                                      value={sel.remarks || ""}
                                      onChange={(e) =>
                                        setReturnSelections((prev) => ({
                                          ...prev,
                                          [unit.unitKey]: { ...(prev[unit.unitKey] || {}), remarks: e.target.value },
                                        }))
                                      }
                                      placeholder="e.g. Screen cracked, battery not charging, water damage..."
                                      rows={2}
                                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Footer ─────────────────────────────────────────────── */}
              <div className="shrink-0 flex justify-end gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
                <button
                  type="button"
                  onClick={cancelReturn}
                  disabled={returningBorrow}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReturn}
                  disabled={returningBorrow || checkedCount === 0}
                  className="rounded-lg bg-[#4a1111] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                >
                  {returningBorrow ? "Returning..." : `Return ${checkedCount} Unit${checkedCount !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {successMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
              ✓
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Success</h3>
            <p className="mt-2 text-sm text-slate-500">{successMessage}</p>
            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="mt-5 rounded-lg bg-[#4a1111] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}