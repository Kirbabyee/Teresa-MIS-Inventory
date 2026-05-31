import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Download, History } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adjustInventoryItemQuantity,
  createReturnedDefectiveInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  updateInventoryItemQuantity,
  useInventoryCatalog,
} from "@/lib/inventoryApi";
import {
  appendBorrowingRecordItems,
  createBorrowingRecord,
  fetchBorrowingRecords,
  markOverdueBorrowingRecords,
  returnBorrowingRecord,
} from "@/lib/borrowingApi";

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

const getReturnConditionLabel = (item = {}) => {
  const borrowedQuantity = getBorrowedQuantity(item);
  const defectiveQuantity = getReturnDefectiveQuantity(item);
  const workingQuantity = getReturnWorkingQuantity(item);
  const condition = getBorrowingItemCondition(item);

  if (defectiveQuantity > 0) {
    if (workingQuantity > 0) {
      return `Defective: ${defectiveQuantity} / Working: ${workingQuantity}`;
    }

    if (defectiveQuantity < borrowedQuantity) {
      return `Defective: ${defectiveQuantity} / Working: ${borrowedQuantity - defectiveQuantity}`;
    }

    return `Defective: ${defectiveQuantity}`;
  }

  return condition === "defective" ? "Defective" : "Working";
};

const getBorrowingItemCondition = (item = {}) => {
  const explicitCondition = String(item.returnCondition || "").trim();
  if (explicitCondition) return explicitCondition.toLowerCase();

  const detailCondition = (item.details || []).find((detail) => {
    const key = String(detail.key || "").toLowerCase();
    const label = String(detail.label || "").toLowerCase();
    return (
      key === "condition" ||
      key === "status" ||
      key === "remarks" ||
      label === "condition" ||
      label === "status" ||
      label === "remarks"
    );
  });

  const condition = String(detailCondition?.value || "").trim().toLowerCase();
  return condition.includes("defect") ? "defective" : "working";
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
  { key: "date", label: "Date" },
  { key: "item", label: "Item" },
  { key: "quantity", label: "Quantity" },
  { key: "condition", label: "Condition" },
  { key: "remark", label: "Item Remark" },
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
  const { tabs, loading: inventoryLoading, error: inventoryError } = useInventoryCatalog();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    searchParams.get("view") === "history" ? "all" : "borrowed"
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
  const [returnRemarksByItem, setReturnRemarksByItem] = useState({});
  const [page, setPage] = useState(0);
  const pageSize = 5;

  const [data, setData] = useState([]);
  const [depletedItems, setDepletedItems] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [exportSchoolYear, setExportSchoolYear] = useState("");
  const [exportSemester, setExportSemester] = useState("");
  const [preparedByName, setPreparedByName] = useState("");
  const [inspectedByName, setInspectedByName] = useState("");
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);
  const [showColumnOptions, setShowColumnOptions] = useState(true);

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

  const pageCount = Math.ceil(filteredData.length / pageSize);
  const currentPageData = filteredData.slice(page * pageSize, page * pageSize + pageSize);
  const visiblePageNumbers = (() => {
    const maxVisible = 3;
    if (pageCount <= maxVisible) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    const offset = Math.min(Math.max(page - 1, 0), pageCount - maxVisible);
    const startPage = offset + 1;
    return Array.from({ length: maxVisible }, (_, index) => startPage + index);
  })();

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
          ? records.filter((record) => !["borrowed", "not_returned"].includes(String(record.status || "").toLowerCase()))
          : records;
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
    setPage(0);

    return () => {
      cancelToken.current = true;
    };
  }, [statusFilter]);

  useEffect(() => {
    if (page >= pageCount && pageCount > 0) {
      setPage(pageCount - 1);
    }
  }, [filteredData.length, pageCount, page]);

  useEffect(() => {
    setPage(0);
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
      const entries = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const config = await getTabTableConfig(tab.id);
            return [tab.id, config?.tableName || null];
          } catch (error) {
            return [tab.id, null];
          }
        })
      );

      if (!cancelled) {
        setTabTableNames(Object.fromEntries(entries));
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
  };

  const closeBorrowModal = () => {
    setShowModal(false);
    setShowConfirm(false);
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

  const requestReturn = (record) => {
    setPendingReturn(record);
    setReturnError("");
    setReturnRemarksByItem(
      (record.items || []).reduce((acc, item) => {
        const condition = getBorrowingItemCondition(item);
        const borrowedQuantity = getBorrowedQuantity(item);
        acc[item.id] = {
          condition: condition === "defective" ? "Defective" : "Working",
          defectiveQuantity: condition === "defective" ? borrowedQuantity : 0,
          remarks: item.returnRemarks || "",
        };
        return acc;
      }, {})
    );
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
          const condition = getBorrowingItemCondition(item);
          return item.returnRemarks || (condition === "defective" ? "Defective" : "Working");
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
            date: formatExportDate(record.date),
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
          const mergedColumns = ["name", "studentId", "role", "status", "date"]
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
                const condition = getBorrowingItemCondition(item);
                const value = item.returnRemarks || (condition === "defective" ? "Defective" : "Working");
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
      saveAs(blob, `borrowing-records-${statusFilter}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  const cancelReturn = () => {
    setPendingReturn(null);
    setReturnRemarksByItem({});
  };

  const confirmReturn = async () => {
    if (!pendingReturn?.id || returningBorrow) return;

    const defectiveItems = (pendingReturn.items || []).filter((item) => {
      const returnData = returnRemarksByItem[item.id] || {};
      const defectiveQuantity = Number(returnData.defectiveQuantity || 0);
      return (
        String(returnData?.condition || "").toLowerCase() === "defective" &&
        defectiveQuantity > 0
      );
    });
    const missingDescriptions = defectiveItems.filter(
      (item) => !String(returnRemarksByItem[item.id]?.remarks || "").trim()
    );
    const invalidDefectiveQuantity = (pendingReturn.items || []).some((item) => {
      const returnData = returnRemarksByItem[item.id] || {};
      if (String(returnData?.condition || "").toLowerCase() !== "defective") return false;

      const borrowedQuantity = getBorrowedQuantity(item);
      const defectiveQuantity = Number(returnData.defectiveQuantity || 0);
      return (
        !Number.isInteger(defectiveQuantity) ||
        defectiveQuantity <= 0 ||
        defectiveQuantity > borrowedQuantity
      );
    });

    if (invalidDefectiveQuantity) {
      setReturnError("Defective quantity must be between 1 and the borrowed quantity.");
      return;
    }

    if (missingDescriptions.length > 0) {
      setReturnError("Please describe why the defective item is defective.");
      return;
    }

    const normalizedReturnRemarks = Object.fromEntries(
      Object.entries(returnRemarksByItem).map(([itemId, data]) => {
        const matchingItem = (pendingReturn.items || []).find(
          (item) => String(item.id) === String(itemId)
        );
        const borrowedQuantity = matchingItem ? getBorrowedQuantity(matchingItem) : 1;
        const defectiveQuantity =
          String(data?.condition || "").toLowerCase() === "defective"
            ? Math.min(borrowedQuantity, Math.max(0, Number(data.defectiveQuantity || 0)))
            : 0;

        return [
          itemId,
          {
            ...data,
            condition: defectiveQuantity > 0 ? "Defective" : "Working",
            defectiveQuantity,
            workingQuantity: Math.max(0, borrowedQuantity - defectiveQuantity),
          },
        ];
      })
    );

    setReturningBorrow(true);
    setReturnError("");
    try {
      await Promise.all(
        (pendingReturn.items || [])
          .filter((item) => item.inventoryItemId && item.inventorySectionId)
          .map(async (item) => {
            const returnData = normalizedReturnRemarks[item.id] || {};
            const borrowedQuantity = getBorrowedQuantity(item);
            const defectiveQuantity = Number(returnData.defectiveQuantity || 0);
            const workingQuantity = Math.max(0, borrowedQuantity - defectiveQuantity);
            const tableName =
              item.tableName ||
              tabTableNames[item.inventoryTabId] ||
              (await getTabTableConfig(item.inventoryTabId))?.tableName ||
              "";

            const inventoryUpdates = [];

            if (workingQuantity > 0) {
              inventoryUpdates.push(
                adjustInventoryItemQuantity({
                  id: item.inventoryItemId,
                  sectionId: item.inventorySectionId,
                  tableName,
                  delta: workingQuantity,
                })
              );
            }

            if (defectiveQuantity > 0) {
              inventoryUpdates.push(
                createReturnedDefectiveInventoryItem({
                  id: item.inventoryItemId,
                  sectionId: item.inventorySectionId,
                  tableName,
                  quantity: defectiveQuantity,
                  remarks: returnData?.remarks || "",
                })
              );
            }

            return Promise.all(inventoryUpdates);
          })
      );
      await returnBorrowingRecord(pendingReturn.id, normalizedReturnRemarks);
      await loadBorrowings();
      setSuccessMessage("Borrowed item returned.");
      setPendingReturn(null);
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

    setShowConfirm(true);
  };

  const confirmBorrow = async () => {
    if (savingBorrow) return;

    setSavingBorrow(true);
    try {
      const borrowingItems = [
        ...selectedItems.map((item) => {
          const details = (item.originalDetails || getItemDetails(item)).filter(
            (detail) => detail.key !== "quantity"
          );
          details.unshift({
            key: "quantity",
            label: "Quantity",
            value: String(item.selectedQuantity || 1),
          });

          return {
            inventoryItemId: item.id,
            inventoryTabId: item.inventoryTabId || null,
            inventoryTabName: item.inventoryTabName || "",
            inventorySectionId: item.inventorySectionId || null,
            inventorySectionName: item.inventorySectionName || "",
            inventoryTableName: item.inventoryTableName || "",
            label: getItemLabel(item),
            details,
            quantity: item.selectedQuantity || 1,
          };
        }),
        ...customItems.map((item) => {
          const quantity = Number(
            item.details?.find((detail) => detail.key === "quantity")?.value || 1
          );
          return {
            inventoryItemId: null,
            inventoryTabId: null,
            inventoryTabName: "",
            inventorySectionId: null,
            inventorySectionName: "",
            inventoryTableName: "",
            label: item.label,
            details: item.details,
            quantity,
          };
        }),
      ];
      const inventoryQuantityUpdates = selectedItems.map((item) => {
        const currentQuantity = Number(item.quantity ?? item.data?.quantity ?? 0);
        const borrowedQuantity = Number(item.selectedQuantity || 1);
        const remainingQuantity = Math.max(0, currentQuantity - borrowedQuantity);

        return {
          item,
          currentQuantity,
          borrowedQuantity,
          remainingQuantity,
        };
      });

      const invalidInventoryQuantity = inventoryQuantityUpdates.some(
        ({ currentQuantity, borrowedQuantity }) =>
          !Number.isFinite(currentQuantity) ||
          !Number.isInteger(borrowedQuantity) ||
          borrowedQuantity <= 0 ||
          borrowedQuantity > currentQuantity
      );

      if (invalidInventoryQuantity) {
        throw new Error("One or more selected item quantities are invalid or exceed available stock.");
      }

      await Promise.all(
        inventoryQuantityUpdates.map(({ item, remainingQuantity }) =>
          updateInventoryItemQuantity({
            id: item.id,
            sectionId: item.inventorySectionId,
            tableName: item.inventoryTableName || null,
            quantity: remainingQuantity,
          })
        )
      );

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
          const update = inventoryQuantityUpdates.find(
            ({ item: updatedItem }) =>
              String(updatedItem.id) === String(item.id) &&
              String(updatedItem.inventorySectionId || "") === String(item.section_id || "")
          );

          return update ? { ...item, quantity: update.remainingQuantity } : item;
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
          inventoryQuantityUpdates
            .filter(({ remainingQuantity }) => remainingQuantity <= 0)
            .map(({ item }) => item.id)
        )
      );
    } catch (error) {
      setFormError(error?.message || "Failed to save borrowing record.");
      setShowConfirm(false);
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
    <div className="max-h-screen py-10 px-6">
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">
            {statusFilter === "borrowed" ? "Borrowed Items" : "Borrowing History"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <input
            type="text"
            placeholder="Search borrower or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px] flex-1 border rounded-full px-4 py-2 text-sm"
          />
          <div ref={datePickerRef} className="relative z-[90]">
            <button
              type="button"
              onClick={() => setShowDatePicker((current) => !current)}
              className="w-full min-w-[18rem] sm:w-64 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-left text-slate-700 hover:border-slate-300"
            >
              <span className="text-slate-500">{formatPickerLabel(dateRange)}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {showDatePicker && (
              <div className="absolute left-0 top-full z-[100] mt-2 w-fit rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 px-2 py-2 shadow-[0_24px_80px_rgba(15,23,42,0.16)] ring-1 ring-white/60 backdrop-blur-sm">
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
                    className="rounded-full bg-[#2b0707] px-3 py-1 text-xs font-medium text-white hover:bg-[#3a0b0b]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === "borrowed" ? "all" : "borrowed")}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                statusFilter === "all"
                  ? "bg-[#4a1111] text-white border-[#4a1111] hover:bg-[#4a1111]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
              }`}
              title={statusFilter === "borrowed" ? "Show all borrowing history" : "Show current borrowed items"}
              aria-label={statusFilter === "borrowed" ? "Show all borrowing history" : "Show current borrowed items"}
            >
              <History className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={openExportModal}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#4a1111] text-white border border-[#4a1111] hover:opacity-90 transition"
              title={borrowingsLoading ? "Loading borrowings..." : "Export borrowings"}
              aria-label={borrowingsLoading ? "Loading borrowings" : "Export borrowings"}
            >
              <Download className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowModal(true);
                setFormErrors({});
                setFormError("");
              }}
              className="bg-[#4a1111] text-white px-5 py-2 rounded-full text-sm hover:opacity-90 transition"
              title="Open borrow modal"
              aria-label="Open borrow modal"
            >
              + Borrow
            </button>
          </div>
        </div>

        {showExportModal && (
          <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Export Borrowing Records</DialogTitle>
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">School Year *</label>
                    <div className="relative mt-1">
                      <select
                        value={exportSchoolYear}
                        onChange={(event) => setExportSchoolYear(event.target.value)}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
                      >
                        {generateSchoolYearOptions().map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Semester *</label>
                    <div className="relative mt-1">
                      <select
                        value={exportSemester}
                        onChange={(event) => setExportSemester(event.target.value)}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
                      >
                        {SEMESTER_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>
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
                    {borrowingExportColumnOptions.map((column) => (
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
                  onClick={handleExportBorrowings}
                  disabled={
                    exporting ||
                    filteredData.length === 0 ||
                    selectedExportColumns.length === 0 ||
                    !exportSchoolYear ||
                    !exportSemester
                  }
                  className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {exporting ? "Exporting..." : "Export Selected"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {borrowingsError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {borrowingsError}
          </div>
        ) : null}

        {borrowingsLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading {statusFilter === "borrowed" ? "borrowed items" : "borrowing records"}...
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[520px] overflow-y-auto mb-6">
            <table className="min-w-full text-sm border-separate border border-slate-100" style={{ borderSpacing: 0 }}>
              <thead className="bg-white text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Borrower</th>
                <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Borrowed</th>
                <th className="sticky top-0 bg-white z-10 w-32 min-w-32 px-4 py-3 text-center align-middle border-b border-slate-100">Status</th>
                <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Items</th>
                <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Quantity</th>
                <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Condition</th>
                {statusFilter !== "borrowed" && (
                  <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Remarks</th>
                )}
                {statusFilter === "borrowed" && (
                  <th className="sticky top-0 bg-white z-10 px-4 py-3 align-middle border-b border-slate-100">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentPageData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    {statusFilter === "borrowed" ? "No borrowed items yet." : "No borrowing records found."}
                  </td>
                </tr>
              ) : (
                currentPageData.map((record) => {
                  return (
                    <tr
                      key={record.id}
                      className="group even:bg-slate-50"
                    >
                    <td className="px-4 py-4 align-middle border-b border-slate-100">
                      <p className="font-medium text-slate-800">{record.name}</p>
                      <p className="text-xs text-slate-500">{record.studentId}</p>
                      <p className="text-xs text-slate-500">{record.role}</p>
                    </td>
                    <td className="px-4 py-4 align-middle border-b border-slate-100 text-xs text-slate-500">
                      <div>Borrowed: {new Date(record.date).toLocaleString()}</div>
                      {record.returnedAt && (
                        <div>Returned: {new Date(record.returnedAt).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="w-32 min-w-32 px-4 py-4 text-center align-middle border-b border-slate-100 text-xs font-semibold">
                      <span
                        className={`inline-flex justify-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold ${getBorrowingStatusClass(record.status)}`}
                      >
                        {formatBorrowingStatus(record.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-middle border-b border-slate-100">
                      <div className="grid gap-2 text-sm text-slate-700">
                        {record.items?.map((item) => (
                          <div key={`${record.id}-${item.id}`} className="min-h-[60px] rounded-lg bg-white group-even:bg-slate-50 p-3 flex flex-col justify-center">
                            <div className="font-medium text-slate-800">{item.label}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {item.inventoryItemId ? (
                                `${item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} / ${item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}`
                              ) : (
                                "Custom Item"
                              )}
                            </div>
                            {item.details?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.details.map((detail) => (
                                  <span
                                    key={`${record.id}-${item.id}-${detail.key}`}
                                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    <span className="font-semibold text-slate-700">{detail.label}:</span> {detail.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle border-b border-slate-100 text-xs text-slate-600">
                      <div className="grid gap-2">
                        {record.items?.map((item) => {
                          const isZero = item.inventoryItemId && depletedItems.has(item.inventoryItemId);
                          return (
                            <div
                              key={`${record.id}-${item.id}-qty`}
                              className={`min-h-[60px] flex items-center justify-center rounded-lg bg-white group-even:bg-slate-50 px-3 text-sm font-semibold ${
                                isZero ? "text-rose-700" : "text-slate-600"
                              }`}
                            >
                              {getItemQuantity(item) || "—"}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle border-b border-slate-100 text-xs text-slate-600">
                      <div className="grid gap-2">
                        {record.items?.map((item) => {
                          const condition = getBorrowingItemCondition(item);
                          const label = getReturnConditionLabel(item);
                          return (
                            <div key={`${record.id}-${item.id}-condition`} className="min-h-[60px] flex items-center justify-center rounded-lg bg-white group-even:bg-slate-50 px-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-center text-[11px] font-semibold ${
                                  condition === "defective"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    {statusFilter !== "borrowed" && (
                      <td className="px-4 py-4 align-middle border-b border-slate-100 text-xs text-slate-600">
                        <div className="grid gap-2">
                          {record.items?.map((item) => (
                            <div key={`${record.id}-${item.id}-remarks`} className="min-h-[60px] rounded-lg bg-white group-even:bg-slate-50 px-3 py-3">
                              {item.returnRemarks?.trim() ? (
                                <p className="text-xs text-slate-700">{item.returnRemarks}</p>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    )}
                    {statusFilter === "borrowed" && (
                      <td className="px-4 py-4 align-middle border-b border-slate-100">
                        <button
                          type="button"
                          onClick={() => requestReturn(record)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          Return
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
            </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
            <div className="text-sm text-slate-500">
              Showing {filteredData.length === 0 ? 0 : page * pageSize + 1}–{Math.min(filteredData.length, (page + 1) * pageSize)} of {filteredData.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {visiblePageNumbers.map((pageNumber) => {
                const isActive = page + 1 === pageNumber;
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber - 1)}
                    className={isActive ? "rounded-md px-3 py-1 text-sm transition bg-[#4a1111] text-primary-foreground" : "rounded-md px-3 py-1 text-sm transition text-foreground hover:bg-accent hover:text-accent-foreground"}
                  >
                    {pageNumber}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
          <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white p-6 shadow-md">
            <h2 className="text-xl font-bold mb-6 text-[#4a1111]">
              BORROWER'S INFORMATION
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#4a1111]">NAME</label>
                <input
                  name="name"
                  placeholder="Enter full name"
                  value={form.name}
                  onChange={handleChange}
                  aria-invalid={!!formErrors.name}
                  aria-describedby={formErrors.name ? "name-error" : undefined}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    formErrors.name ? "border-rose-300 focus:ring-rose-200" : "focus:ring-[#4a1111]"
                  }`}
                />
                {formErrors.name ? (
                  <p id="name-error" className="text-xs text-rose-600">
                    {formErrors.name}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#4a1111]">ID NUMBER</label>
                <input
                  name="studentId"
                  placeholder="Enter ID number"
                  value={form.studentId}
                  onChange={handleChange}
                  aria-invalid={!!formErrors.studentId}
                  aria-describedby={formErrors.studentId ? "studentId-error" : undefined}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    formErrors.studentId ? "border-rose-300 focus:ring-rose-200" : "focus:ring-[#4a1111]"
                  }`}
                />
                {formErrors.studentId ? (
                  <p id="studentId-error" className="text-xs text-rose-600">
                    {formErrors.studentId}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#4a1111]">ROLE</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  aria-invalid={!!formErrors.role}
                  aria-describedby={formErrors.role ? "role-error" : undefined}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    formErrors.role ? "border-rose-300 focus:ring-rose-200" : "focus:ring-[#4a1111]"
                  }`}
                >
                  <option value="">Select role</option>
                  <option value="Student">Student</option>
                  <option value="Teacher">Teacher</option>
                </select>
                {formErrors.role ? (
                  <p id="role-error" className="text-xs text-rose-600">
                    {formErrors.role}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-8 h-[620px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111]">
                Choose item to borrow
              </h3>

              {inventoryError ? (
                <p className="mt-3 text-sm text-rose-600">{inventoryError}</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <select
                      value={selectedTabId}
                      onChange={(event) => {
                        setSelectedTabId(event.target.value);
                        setSelectedSectionId("");
                        setInventoryItems([]);
                        setFormError("");
                      }}
                      disabled={inventoryLoading}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                    >
                      <option value="">{inventoryLoading ? "Loading inventory..." : "Select inventory tab"}</option>
                      {tabs.map((tab) => (
                        <option key={tab.id} value={tab.id}>
                          {tab.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedSectionId}
                      onChange={(event) => {
                        setSelectedSectionId(event.target.value);
                        setFormError("");
                        setFormErrors((current) => ({ ...current, items: "" }));
                      }}
                      disabled={!selectedTabId}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                    >
                      <option value="">Select section</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formErrors.items ? (
                    <p className="mt-2 text-xs text-rose-600">{formErrors.items}</p>
                  ) : null}
                </>
              )}

              <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-auto h-[35vh]">
                {!selectedSectionId ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Select an inventory tab and section to show items.
                  </p>
                ) : itemsLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Loading items...
                  </p>
                ) : itemsError ? (
                  <p className="px-4 py-8 text-center text-sm text-rose-600">{itemsError}</p>
                ) : inventoryItems.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    No items found in this section.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {inventoryItems.map((item) => {
                      const selectionKey = getInventorySelectionKey({
                        inventoryTabId: selectedTab?.id,
                        inventorySectionId: selectedSection?.id,
                        id: item.id,
                      });
                      const checked = selectedItemIds.includes(selectionKey);
                      const details = getItemDetails(item);
                      const maxQuantity = Number(item.quantity ?? item.data?.quantity ?? 1);
                      const selectedQuantity = selectedItemQuantities[selectionKey] ?? 1;

                      return (
                        <label
                          key={selectionKey}
                          className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item)}
                            className="mt-1"
                          />
                          <span className="flex-1">
                            <span className="block text-sm font-medium text-slate-800">
                              {getItemLabel(item)}
                            </span>
                            <span className="block text-xs text-slate-400">
                              {selectedTab?.name} / {selectedSection?.name}
                            </span>
                            {details.length > 0 ? (
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {details.map((detail) => (
                                  <span
                                    key={`${item.id}-${detail.key}`}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    <span className="font-semibold text-slate-700">
                                      {detail.label}:
                                    </span>{" "}
                                    {detail.value}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span>Available: {maxQuantity}</span>
                              {checked && (
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-700">Qty</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max={maxQuantity}
                                    value={selectedQuantity}
                                    onChange={(e) => {
                                      const value = Number(e.target.value);
                                      if (Number.isNaN(value)) return;
                                      const nextQuantity = Math.max(1, Math.min(maxQuantity, value));
                                      setSelectedItemQuantities((current) => ({
                                        ...current,
                                        [selectionKey]: nextQuantity,
                                      }));
                                      setSelectedInventoryItems((current) =>
                                        current.map((selectedItem) =>
                                          selectedItem.selectionKey === selectionKey
                                            ? { ...selectedItem, selectedQuantity: nextQuantity }
                                            : selectedItem
                                        )
                                      );
                                    }}
                                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                  />
                                </div>
                              )}
                            </div>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-2">
                  Or Add Custom Item (Outside Inventory)
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={customItemForm.name}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  />
                  <input
                    type="text"
                    placeholder="Brand (optional)"
                    value={customItemForm.brand}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, brand: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantity"
                    value={customItemForm.quantity}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, quantity: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  />
                  <select
                    value={customItemForm.condition}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, condition: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  >
                    <option value="Working">Working</option>
                    <option value="Defective">Defective</option>
                  </select>
                </div>
                <textarea
                  placeholder="Remarks (optional)"
                  value={customItemForm.remarks}
                  onChange={(e) => setCustomItemForm({ ...customItemForm, remarks: e.target.value })}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customItemForm.name.trim()) return;

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

                    const newItem = {
                      id: `custom-${Date.now()}`,
                      label: customItemForm.name.trim(),
                      details,
                      inventoryItemId: null,
                      inventoryTabId: null,
                      inventorySectionId: null,
                      inventoryTableName: "",
                    };
                    setCustomItems([...customItems, newItem]);
                    setCustomItemForm({
                      name: "",
                      brand: "",
                      quantity: "",
                      condition: "Working",
                      remarks: "",
                    });
                    setFormErrors((current) => ({ ...current, items: "" }));
                    setFormError("");
                  }}
                  className="mt-2 px-4 py-1 bg-[#4a1111] text-white text-sm rounded hover:opacity-90"
                >
                  Add Custom Item
                </button>
              </div>

              {(selectedItems.length > 0 || customItems.length > 0) && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-2">
                    Selected Items
                  </h4>
                  <div className="space-y-2">
                    {selectedItems.map((item) => (
                      <div key={item.selectionKey || item.id} className="flex justify-between items-center gap-3">
                        <span className="text-sm">
                          {getItemLabel(item)}{item.selectedQuantity ? ` (Qty: ${item.selectedQuantity})` : ""}
                          <span className="block text-xs text-slate-400">
                            {item.inventoryTabName || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} / {item.inventorySectionName || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleItem(item)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {customItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span className="text-sm">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => setCustomItems(customItems.filter((i) => i.id !== item.id))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {formError ? <p className="mt-4 text-sm text-rose-600">{formError}</p> : null}

            <div className="mt-6 flex shrink-0 justify-end gap-4">
              <button
                type="button"
                onClick={closeBorrowModal}
                className="px-6 py-2 rounded-lg text-sm border border-[#4a1111] text-[#4a1111] hover:bg-[#4a1111] hover:text-white transition"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={requestBorrowConfirmation}
                className="px-6 py-2 rounded-lg text-sm bg-[#4a1111] text-white hover:opacity-90 transition"
              >
                PROCEED
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#4a1111]">Confirm borrowing</h3>
            <p className="mt-2 text-sm text-slate-600">
              Add this borrowing record for {form.name.trim()}?
            </p>
            {latestActiveBorrowForBorrower ? (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={mergeWithLastBorrow}
                  onChange={(event) => setMergeWithLastBorrow(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">Merge with latest active borrow</span>
                  <span className="mt-1 block text-xs text-amber-800">
                    Latest record borrowed on{" "}
                    {new Date(latestActiveBorrowForBorrower.date).toLocaleString()} has not been returned yet.
                  </span>
                </span>
              </label>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm">
              {[...selectedItems, ...customItems].map((item) => {
                const details = item.details ? item.details : getItemDetails(item);
                const borrowedQuantity =
                  item.selectedQuantity ||
                  details.find((detail) => detail.key === "quantity")?.value ||
                  1;
                const remarks =
                  item.remarks ||
                  details.find((detail) => detail.key === "remarks")?.value ||
                  details.find((detail) => detail.key === "condition")?.value ||
                  "";
                const confirmDetails = [
                  ...(remarks
                    ? [{ key: "remarks", label: "Remarks", value: remarks }]
                    : []),
                  {
                    key: "quantity",
                    label: "Quantity",
                    value: String(borrowedQuantity),
                  },
                ];

                return (
                  <li key={item.selectionKey || item.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-800">{item.label || getItemLabel(item)}</span>
                    {item.inventoryItemId !== null && item.inventoryItemId !== undefined ? (
                      <span className="mt-1 block text-xs text-slate-400">
                        {item.inventoryTabName || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} / {item.inventorySectionName || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}
                      </span>
                    ) : null}
                    {confirmDetails.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {confirmDetails.map((detail) => (
                          <span
                            key={`${item.id}-${detail.key}`}
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                          >
                            <span className="font-semibold text-slate-700">
                              {detail.label}:
                            </span>{" "}
                            {detail.value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBorrow}
                disabled={savingBorrow}
                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {savingBorrow ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingReturn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#4a1111]">Confirm return</h3>
            <p className="mt-2 text-sm text-slate-600">
              Mark borrowed items from {pendingReturn.name} as returned?
            </p>
            {pendingReturn.items?.length > 0 ? (
              <ul className="mt-4 space-y-3 text-sm">
                {pendingReturn.items.map((item) => {
                  const borrowedQuantity = getBorrowedQuantity(item);
                  const returnData = returnRemarksByItem[item.id] || {};
                  const isDefective = returnData.condition === "Defective";
                  const defectiveQuantity = Math.min(
                    borrowedQuantity,
                    Math.max(0, Number(returnData.defectiveQuantity || 0))
                  );
                  const workingQuantity = borrowedQuantity - defectiveQuantity;

                  return (
                    <li
                      key={`${pendingReturn.id}-${item.id}`}
                      className="rounded-lg bg-slate-50 px-3 py-3"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium text-slate-800">{item.label}</p>
                            <p className="text-xs text-slate-400">
                              {item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} / {item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              Borrowed qty: {borrowedQuantity}
                            </p>
                          </div>
                          <select
                            value={returnData.condition || "Working"}
                            onChange={(e) =>
                              setReturnRemarksByItem((current) => {
                                const nextCondition = e.target.value;
                                const currentItem = current[item.id] || {};

                                return {
                                  ...current,
                                  [item.id]: {
                                    ...currentItem,
                                    condition: nextCondition,
                                    defectiveQuantity:
                                      nextCondition === "Defective"
                                        ? currentItem.defectiveQuantity || borrowedQuantity
                                        : 0,
                                  },
                                };
                              })
                            }
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111] sm:max-w-40"
                          >
                            <option value="Working">Working</option>
                            <option value="Defective">Defective</option>
                          </select>
                        </div>

                        {isDefective && (
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-end">
                              <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Defective qty
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={borrowedQuantity}
                                  value={returnData.defectiveQuantity || ""}
                                  onChange={(e) => {
                                    const nextQuantity = Math.max(
                                      1,
                                      Math.min(borrowedQuantity, Number(e.target.value) || 1)
                                    );
                                    setReturnRemarksByItem((current) => ({
                                      ...current,
                                      [item.id]: {
                                        ...(current[item.id] || {}),
                                        condition: "Defective",
                                        defectiveQuantity: nextQuantity,
                                      },
                                    }));
                                  }}
                                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                />
                              </div>
                              <p className="text-xs text-slate-500">
                                Working qty to return: {workingQuantity}
                              </p>
                            </div>

                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Describe defect
                              </label>
                              <textarea
                                value={returnData.remarks || ""}
                                onChange={(e) =>
                                  setReturnRemarksByItem((current) => ({
                                    ...current,
                                    [item.id]: {
                                      ...(current[item.id] || {}),
                                      remarks: e.target.value,
                                    },
                                  }))
                                }
                                rows={3}
                                placeholder="Explain how the item became defective"
                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {returnError ? (
              <p className="mt-4 text-sm text-rose-600">{returnError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
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
                disabled={returningBorrow}
                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {returningBorrow ? "Returning..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

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
