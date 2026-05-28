import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Plus, PencilLine, Trash2, Check, FileText, ChevronLeft, ChevronDown, Search, X } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import arkLogoUrl from "@/assets/imgs/ark-logo.png";
import InventoryHistoryView from "@/components/InventoryHistoryView";
import ExportLogsPanel from "@/components/ExportLogsPanel";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const INITIAL_LAB_OPTIONS = [];

const TABLE_HEADING = [
    "COMPUTER #",
    "MOTHERBOARD",
    "PROCESSOR",
    "MEMORY",
    "SSD",
    "HDD",
    "VIDEO CARD",
    "AVR",
    "MOUSE",
    "POWER SUPPLY",
    "KEYBOARD",
    "MONITOR",
    "OPERATING SYSTEM",
];

const VALID_TYPES = new Set(TABLE_HEADING.slice(1));
const COMPONENT_ROWS = [
    ["Brand", "brand"],
    ["Description", "description"],
    ["Remarks", "remarks"],
];

const TABLE_COLUMNS = ["COMPUTER #", "", ...TABLE_HEADING.slice(1)];
const COMPONENT_TYPES = TABLE_HEADING.slice(1);
const REMARK_OPTIONS = ["WORKING", "DEFECTIVE", "BUILT IN"];

const createInitialComponentSections = () =>
    COMPONENT_TYPES.reduce((acc, componentType, index) => {
        acc[componentType] = index === 0;
        return acc;
    }, {});

const formatValue = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
};

const sanitizeSheetName = (value) => String(value || "Computer Lab").replace(/[\\/:*?"<>|]/g, "").slice(0, 31);

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

const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
};

const EXPORT_BUCKET = "export-logs";

const createExportStoragePath = (filename) => {
    const safeName = String(filename || "export.xlsx").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const uniqueId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${new Date().toISOString().slice(0, 10)}/${uniqueId}-${safeName}`;
};

const ordinalSuffix = (n) => {
    const j = n % 10,
        k = n % 100;
    if (k >= 11 && k <= 13) return `${n}th`;
    if (j === 1) return `${n}st`;
    if (j === 2) return `${n}nd`;
    if (j === 3) return `${n}rd`;
    return `${n}th`;
};

const validateAndFormatSchoolYear = (value) => {
    if (!value) return "";
    const v = String(value).trim();
    const m = v.match(/^(\d{4})\s*[-–—]\s*(\d{4})$/);
    if (m) return `${m[1]} - ${m[2]}`;
    const m2 = v.match(/^(\d{4})(\d{4})$/);
    if (m2) return `${m2[1]} - ${m2[2]}`;
    return v;
};

const isValidSchoolYear = (value) => {
    if (!value) return false;
    return /^\s*\d{4}\s*[-–—]\s*\d{4}\s*$/.test(String(value));
};

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
    const opts = [];
    for (let y = start; y <= end; y++) {
        opts.push(`${y} - ${y + 1}`);
    }
    return opts.reverse();
};

const SEMESTER_OPTIONS = ["1st", "2nd", "Summer"];

const formatPickerLabel = (range) => {
    if (!range?.from) return "Select date range";
    if (range.from && !range.to) return `${format(range.from, "MMM d, yyyy")} —`;
    return `${format(range.from, "MMM d, yyyy")} — ${format(range.to, "MMM d, yyyy")}`;
};

const applyExportHeader = (worksheet, titleText, exportDate, headerColor, logoImage, separatorImage, options = {}) => {
    for (let i = 1; i <= 5; i++) {
        worksheet.getRow(i).height = 25;
    }

    if (logoImage) {
        const image = worksheet.workbook.addImage({
            buffer: logoImage,
            extension: 'png',
        });
        const logoCol = typeof options.logoCol === 'number' ? options.logoCol : 3.5;
        worksheet.addImage(image, {
            tl: { col: logoCol, row: 0.35 },
            ext: { width: 125, height: 125 },
        });
    }

    if (separatorImage) {
        const separator = worksheet.workbook.addImage({
            base64: separatorImage,
            extension: 'png',
        });
        worksheet.addImage(separator, {
            tl: { col: 0.5, row: 5.35 },
            br: { col: 13.5, row: 5.65 },
        });
    }

    worksheet.mergeCells("B1:M1");
    const titleCell = worksheet.getCell("B1");
    titleCell.value = "COLEGIO DE STA. TERESA DE AVILA, INC.";
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.font = { bold: true, size: 22, color: headerColor, name: "Corbel" };

    worksheet.mergeCells("B2:M2");
    const addr1 = worksheet.getCell("B2");
    addr1.value = "1177 Quirino Highway, Brgy. Kaligayahan, Novaliches";
    addr1.alignment = { horizontal: "center", vertical: "middle" };
    addr1.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

    worksheet.mergeCells("B3:M3");
    const addr2 = worksheet.getCell("B3");
    addr2.value = "Quezon City 1124 Philippines";
    addr2.alignment = { horizontal: "center", vertical: "middle" };
    addr2.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

    worksheet.mergeCells("B4:M4");
    const phone = worksheet.getCell("B4");
    phone.value = "Tel. No. (02) 8-275-3916";
    phone.alignment = { horizontal: "center", vertical: "middle" };
    phone.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

    worksheet.mergeCells("B5:M5");
    const email = worksheet.getCell("B5");
    email.value = "Email: officialcstaregistrar@gmail.com";
    email.alignment = { horizontal: "center", vertical: "middle" };
    email.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };
    worksheet.getRow(6).height = 15;

    worksheet.mergeCells("B7:M7");
    const title = worksheet.getCell("B7");
    title.value = titleText;
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.font = { bold: true, size: 11, color: headerColor, name: "Arial" };

    worksheet.mergeCells("B8:M8");
    const dateCell = worksheet.getCell("B8");
    const formattedDate = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date(exportDate)).replace(/^[A-Za-z]+/, (month) => month.toUpperCase());
    dateCell.value = "AS OF " + formattedDate;
    dateCell.alignment = { horizontal: "center", vertical: "middle" };
    dateCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };
    worksheet.getRow(8).height = 18;

    worksheet.mergeCells("B9:M9");
    const syCell = worksheet.getCell("B9");
    const schoolYearText = (options.schoolYear || "").toString().trim() || "____________________";
    const semesterText = (options.semester || "").toString().trim() || "____________________";
    syCell.value = `${semesterText} Semester | S.Y ${schoolYearText}`;
    syCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    syCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };
    worksheet.getRow(9).height = 18;
};

export default function ComputerLaboratoryInventory() {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [labOptions, setLabOptions] = useState(INITIAL_LAB_OPTIONS);
    const [selectedLab, setSelectedLab] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [hasEditChanges, setHasEditChanges] = useState(false);
    const [isAddLabOpen, setIsAddLabOpen] = useState(false);
    const [newLabName, setNewLabName] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [labsLoading, setLabsLoading] = useState(true);
    const [error, setError] = useState("");
    const [exporting, setExporting] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [selectedExportLabs, setSelectedExportLabs] = useState([]);
    const [selectedExportColumns, setSelectedExportColumns] = useState(COMPONENT_TYPES.slice());
    const [showColumnOptions, setShowColumnOptions] = useState(false);
    const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
    const [exportSchoolYear, setExportSchoolYear] = useState("");
    const [exportSemester, setExportSemester] = useState("");
    const [exportLogRefreshToken, setExportLogRefreshToken] = useState(0);
    const [preparedByName, setPreparedByName] = useState("");
    const [inspectedByName, setInspectedByName] = useState("");
    const [deleteConfirmLab, setDeleteConfirmLab] = useState(null);
    const [deleteConfirmComputer, setDeleteConfirmComputer] = useState(null);
    const [confirmExitEditMode, setConfirmExitEditMode] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // 'exit' or 'switchHistory'
    const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(() => searchParams.get("view") === "logs");
    const [searchQuery, setSearchQuery] = useState("");
    const [historySearchQuery, setHistorySearchQuery] = useState("");
    const [historyDateRange, setHistoryDateRange] = useState({ from: undefined, to: undefined });
    const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
    const [openComponentSections, setOpenComponentSections] = useState(() => createInitialComponentSections());
    const [cellDrafts, setCellDrafts] = useState({});
    const [savingCellKey, setSavingCellKey] = useState(null);
    const [newComponent, setNewComponent] = useState({
        computer_number: "",
        MOTHERBOARD_brand: "",
        MOTHERBOARD_description: "",
        MOTHERBOARD_remarks: "",
        PROCESSOR_brand: "",
        PROCESSOR_description: "",
        PROCESSOR_remarks: "",
        MEMORY_brand: "",
        MEMORY_description: "",
        MEMORY_remarks: "",
        SSD_brand: "",
        SSD_description: "",
        SSD_remarks: "",
        HDD_brand: "",
        HDD_description: "",
        HDD_remarks: "",
        "VIDEO CARD_brand": "",
        "VIDEO CARD_description": "",
        "VIDEO CARD_remarks": "",
        AVR_brand: "",
        AVR_description: "",
        AVR_remarks: "",
        MOUSE_brand: "",
        MOUSE_description: "",
        MOUSE_remarks: "",
        "POWER SUPPLY_brand": "",
        "POWER SUPPLY_description": "",
        "POWER SUPPLY_remarks": "",
        KEYBOARD_brand: "",
        KEYBOARD_description: "",
        KEYBOARD_remarks: "",
        MONITOR_brand: "",
        MONITOR_description: "",
        MONITOR_remarks: "",
        "OPERATING SYSTEM_brand": "",
        "OPERATING SYSTEM_description": "",
        "OPERATING SYSTEM_remarks": "",
    });
    const selectedLabLabel = useMemo(
        () => labOptions.find((lab) => lab.value === selectedLab)?.label || "Laboratory",
        [labOptions, selectedLab]
    );
    const selectedLabOrder = useMemo(
        () => labOptions.find((lab) => lab.value === selectedLab)?.order ?? null,
        [labOptions, selectedLab]
    );
    const isAdminUser = useMemo(() => {
        const role = String(user?.role || "").toLowerCase();
        return role === "superadmin" || role === "admin";
    }, [user?.role]);
    const currentSchoolYear = useMemo(() => getCurrentSchoolYear(), []);
    const schoolYearOptions = useMemo(() => generateSchoolYearOptions(3, 3), []);

    const getCellDraftKey = (computerNumber, componentType, field) =>
        `${computerNumber}__${componentType}__${field}`;

    const normalizeCellValue = (value) => {
        if (value === null || value === undefined || value === "-") return "";
        return String(value);
    };

    const toggleComponentSection = (componentType) => {
        setOpenComponentSections((current) => ({
            ...current,
            [componentType]: !current[componentType],
        }));
    };

    const updateHistoryView = (nextOpen) => {
        setIsHistoryOpen(nextOpen);
        setSearchParams((current) => {
            const params = new URLSearchParams(current);
            if (nextOpen) {
                params.set("view", "logs");
            } else {
                params.delete("view");
            }
            return params;
        }, { replace: true });
    };

    const handleCellDraftChange = (computerNumber, componentType, field, value) => {
        const key = getCellDraftKey(computerNumber, componentType, field);
        setCellDrafts((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const handleInlineCellSave = async (row, componentType, field) => {
        const computerNumber = row["COMPUTER #"];
        const key = getCellDraftKey(computerNumber, componentType, field);
        const currentRaw = normalizeCellValue(row.components?.[componentType]?.[field]);
        const nextRaw = normalizeCellValue(cellDrafts[key] ?? currentRaw).trim();

        if (nextRaw === currentRaw.trim()) {
            setCellDrafts((current) => {
                if (!(key in current)) return current;
                const next = { ...current };
                delete next[key];
                return next;
            });
            return;
        }

        if (!selectedLab) {
            setError("Lab is required.");
            return;
        }

        const columnMap = {
            brand: "brand",
            description: "description",
            remarks: "status",
        };

        setSavingCellKey(key);
        setError("");
        try {
            const { data, error: updateError } = await supabase
                .from("computers_components")
                .update({ [columnMap[field]]: nextRaw })
                .eq("lab_number_id", selectedLab)
                .eq("computer_number", Number(computerNumber)) // force number
                .eq("type", componentType.toUpperCase()) // force uppercase match
                .select("id, computer_number, type, brand, description, status, lab_number_id, lab_number");

            if (updateError) throw updateError;

            // 🚨 THIS IS THE KEY FIX
            if (!data || data.length === 0) {
                throw new Error("Update failed: No matching row found.");
            }

            if (selectedLabOrder !== null) {
                // Only perform fallback update if a fallback row actually exists
                const { data: fallbackRow, error: fallbackFetchError } = await supabase
                    .from("computers_components")
                    .select("id, brand, description, status, lab_number_id, lab_number")
                    .is("lab_number_id", null)
                    .eq("lab_number", selectedLabOrder)
                    .eq("computer_number", computerNumber)
                    .eq("type", componentType)
                    .maybeSingle();

                if (fallbackFetchError) throw fallbackFetchError;

                if (fallbackRow) {
                    const { error: fallbackUpdateError } = await supabase
                        .from("computers_components")
                        .update({ [columnMap[field]]: nextRaw })
                        .is("lab_number_id", null)
                        .eq("lab_number", selectedLabOrder)
                        .eq("computer_number", computerNumber)
                        .eq("type", componentType);

                    if (fallbackUpdateError) throw fallbackUpdateError;
                }
            }

            setRows((currentRows) =>
                currentRows.map((currentRow) => {
                    if (Number(currentRow["COMPUTER #"]) !== Number(computerNumber)) {
                        return currentRow;
                    }

                    return {
                        ...currentRow,
                        components: {
                            ...currentRow.components,
                            [componentType]: {
                                ...(currentRow.components?.[componentType] || {}),
                                [field]: nextRaw || "-",
                            },
                        },
                    };
                })
            );

            setCellDrafts((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setHasEditChanges(true);
        } catch (updateError) {
            console.error("Failed to update cell:", updateError.message);
            setError(updateError.message || "Failed to update cell.");
        } finally {
            setSavingCellKey(null);
        }
    };

    const groupComponentRows = (dataRows = []) =>
        Object.values(
            (dataRows || []).reduce((acc, item) => {
                const key = item.computer_number ?? 'Unknown';
                if (!acc[key]) acc[key] = { 'COMPUTER #': item.computer_number, components: {} };
                const type = item.type?.toString().trim().toUpperCase();
                if (type && VALID_TYPES.has(type)) {
                    acc[key].components[type] = {
                        brand: String(item.brand || '-'),
                        description: String(item.description || '-'),
                        remarks: String(item.status || '-'),
                    };
                }
                return acc;
            }, {}),
        ).sort((a, b) => Number(a['COMPUTER #'] || 0) - Number(b['COMPUTER #'] || 0));

    useEffect(() => {
        let cancelled = false;

        const loadLaboratories = async () => {
            setLabsLoading(true);
            try {
                const { data: labsData, error: labsError } = await supabase
                    .from("lab_numbers")
                    .select("id, lab_number, name")
                    .order("lab_number", { ascending: true });

                if (cancelled) return;

                if (labsError) {
                    console.error("Failed to load laboratories:", labsError.message);
                    setLabOptions([]);
                    setSelectedLab(null);
                    return;
                }

                const normalizedLabs = (labsData || []).map((lab) => ({
                    value: lab.id,
                    label: lab.name || `Laboratory ${lab.lab_number}`,
                    order: Number(lab.lab_number),
                }));

                setLabOptions(normalizedLabs);

                // respect labId query param if present
                const labIdParam = searchParams.get("labId");
                if (labIdParam) {
                    const match = normalizedLabs.find((l) => String(l.value) === String(labIdParam));
                    if (match) {
                        setSelectedLab(match.value);
                        return;
                    }
                }

                setSelectedLab((current) =>
                    normalizedLabs.some((lab) => lab.value === current) ? current : normalizedLabs[0]?.value || null
                );
            } finally {
                if (!cancelled) setLabsLoading(false);
            }
        };

        loadLaboratories();

        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    const openAddLabModal = () => {
        const nextValue = Math.max(...labOptions.map((lab) => Number(lab.order) || 0), 0) + 1;
        setNewLabName(`Laboratory ${nextValue}`);
        setIsAddLabOpen(true);
    };

    const handleAddLab = async () => {
        const nextLabel = newLabName.trim();
        if (!nextLabel) return;

        const nextValue = Math.max(...labOptions.map((lab) => Number(lab.order) || 0), 0) + 1;

        setExporting(true);
        try {
            const { error: insertError } = await supabase.from("lab_numbers").insert({
                lab_number: nextValue,
                name: nextLabel,
            });

            if (insertError) throw insertError;

            const { data: labsData, error: labsError } = await supabase
                .from("lab_numbers")
                .select("id, lab_number, name")
                .order("lab_number", { ascending: true });

            if (labsError) throw labsError;

            const nextLabs = (labsData || []).map((lab) => ({
                value: lab.id,
                label: lab.name || `Laboratory ${lab.lab_number}`,
                order: Number(lab.lab_number),
            }));

            setLabOptions(nextLabs);
            const justCreated = nextLabs.find((lab) => lab.order === nextValue && lab.label === nextLabel);
            if (justCreated?.value) {
                setSelectedLab(justCreated.value);
            }
            setHasEditChanges(true);
            setIsAddLabOpen(false);
        } catch (labError) {
            console.error("Failed to add laboratory:", labError.message);
            setError(labError.message || "Failed to add laboratory.");
        } finally {
            setExporting(false);
        }
    };

    const _q = searchQuery.trim().toLowerCase();
    const filteredRows = !_q
        ? rows
        : rows.filter((row) => {
            if (String(row["COMPUTER #"] || "").toLowerCase().includes(_q)) return true;
            const comps = row.components || {};
            for (const comp of Object.values(comps)) {
                for (const v of Object.values(comp || {})) {
                    if (v && String(v).toLowerCase().includes(_q)) return true;
                }
            }
            return false;
        });

    const handleDeleteLab = async (labId) => {
        setExporting(true);
        try {
            const { error: deleteError } = await supabase
                .from("lab_numbers")
                .delete()
                .eq("id", labId);

            if (deleteError) throw deleteError;

            const { data: labsData, error: labsError } = await supabase
                .from("lab_numbers")
                .select("id, lab_number, name")
                .order("lab_number", { ascending: true });

            if (labsError) throw labsError;

            const nextLabs = (labsData || []).map((lab) => ({
                value: lab.id,
                label: lab.name || `Laboratory ${lab.lab_number}`,
                order: Number(lab.lab_number),
            }));

            setLabOptions(nextLabs);
            setDeleteConfirmLab(null);
            setHasEditChanges(true);

            if (selectedLab === labId) {
                setSelectedLab(nextLabs[0]?.value || null);
            }
        } catch (labError) {
            console.error("Failed to delete laboratory:", labError.message);
            setError(labError.message || "Failed to delete laboratory.");
        } finally {
            setExporting(false);
        }
    };

    const handleAddComponent = async ({ closeDialog = true } = {}) => {
        if (!selectedLab) {
            setError("Lab is required.");
            return;
        }

        setExporting(true);
        try {
            const parsedComputerNumber = Number.parseInt(newComponent.computer_number, 10);
            const nextComputerNumber =
                Number.isFinite(parsedComputerNumber) && parsedComputerNumber > 0
                    ? parsedComputerNumber
                    : Math.max(0, ...rows.map((row) => Number(row["COMPUTER #"]) || 0)) + 1;

            // Create rows for all components
            const rowsToInsert = COMPONENT_TYPES.map((componentType) => ({
                computer_number: nextComputerNumber,
                type: componentType,
                brand: (newComponent[`${componentType}_brand`] || "").trim(),
                description: (newComponent[`${componentType}_description`] || "").trim(),
                status: (newComponent[`${componentType}_remarks`] || "").trim(),
                lab_number_id: selectedLab,
            }));

            const { error: insertError } = await supabase
                .from("computers_components")
                .insert(rowsToInsert);

            if (insertError) throw insertError;

            // Reset form
            const resetComponent = {
                computer_number: closeDialog ? "" : String(nextComputerNumber + 1),
            };
            COMPONENT_TYPES.forEach((componentType) => {
                resetComponent[`${componentType}_brand`] = "";
                resetComponent[`${componentType}_description`] = "";
                resetComponent[`${componentType}_remarks`] = "";
            });
            setNewComponent(resetComponent);
            setOpenComponentSections(createInitialComponentSections());
            if (closeDialog) {
                setIsAddComponentOpen(false);
            }

            // Refresh table data
            const { data, error: fetchError } = await supabase
                .from("computers_components")
                .select("computer_number, type, brand, description, status")
                .eq("lab_number_id", selectedLab)
                .order("computer_number", { ascending: true });

            if (fetchError) throw fetchError;

            const grouped = Object.values(
                (data || []).reduce((acc, item) => {
                    const key = item.computer_number ?? "Unknown";
                    if (!acc[key]) {
                        acc[key] = { "COMPUTER #": item.computer_number, components: {} };
                    }
                    const type = item.type?.toString().trim().toUpperCase();
                    if (type && VALID_TYPES.has(type)) {
                        acc[key].components[type] = {
                            brand: item.brand || "-",
                            description: item.description || "-",
                            remarks: item.status || "-",
                        };
                    }
                    return acc;
                }, {}),
            ).sort((l, r) => Number(l["COMPUTER #"]) - Number(r["COMPUTER #"]));

            setRows(grouped);
            setHasEditChanges(true);
            setError("");
        } catch (err) {
            console.error("Failed to add component:", err.message);
            setError(err.message || "Failed to add component.");
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteComputerRow = async (computerNumber) => {
        if (!selectedLab) {
            setError("Lab is required.");
            return;
        }

        setExporting(true);
        try {
            const { error: deleteError } = await supabase
                .from("computers_components")
                .delete()
                .eq("lab_number_id", selectedLab)
                .eq("computer_number", computerNumber);

            if (deleteError) throw deleteError;

            const { data, error: fetchError } = await supabase
                .from("computers_components")
                .select("computer_number, type, brand, description, status")
                .eq("lab_number_id", selectedLab)
                .order("computer_number", { ascending: true });

            if (fetchError) throw fetchError;

            const grouped = Object.values(
                (data || []).reduce((acc, item) => {
                    const key = item.computer_number ?? "Unknown";
                    if (!acc[key]) {
                        acc[key] = { "COMPUTER #": item.computer_number, components: {} };
                    }
                    const type = item.type?.toString().trim().toUpperCase();
                    if (type && VALID_TYPES.has(type)) {
                        acc[key].components[type] = {
                            brand: item.brand || "-",
                            description: item.description || "-",
                            remarks: item.status || "-",
                        };
                    }
                    return acc;
                }, {}),
            ).sort((l, r) => Number(l["COMPUTER #"]) - Number(r["COMPUTER #"]));

            setRows(grouped);
            setDeleteConfirmComputer(null);
            setHasEditChanges(true);
            setError("");
        } catch (err) {
            console.error("Failed to delete computer row:", err.message);
            setError(err.message || "Failed to delete computer row.");
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const fetchLabComponents = async () => {
            if (!selectedLab) {
                if (!labsLoading) {
                    setRows([]);
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setError("");

            const { data, error: fetchError } = await supabase
                .from("computers_components")
                .select("computer_number, type, brand, description, status")
                .eq("lab_number_id", selectedLab)
                .order("computer_number", { ascending: true });

            if (cancelled) return;

            if (fetchError) {
                console.error("Failed to load laboratory components:", fetchError.message);
                setError(fetchError.message || "Failed to load laboratory components.");
                setRows([]);
                setLoading(false);
                return;
            }

            let finalData = data || [];

            // Compatibility fallback while old lab_number-based data/policies are still in use.
            if (finalData.length === 0 && selectedLabOrder !== null) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from("computers_components")
                    .select("computer_number, type, brand, description, status")
                    .eq("lab_number", selectedLabOrder)
                    .order("computer_number", { ascending: true });

                if (cancelled) return;

                if (fallbackError) {
                    console.error("Failed to load fallback laboratory components:", fallbackError.message);
                } else {
                    finalData = fallbackData || [];
                }
            }

            const grouped = Object.values(
                finalData.reduce((accumulator, item) => {
                    const computerKey = item.computer_number ?? "Unknown";
                    if (!accumulator[computerKey]) {
                        accumulator[computerKey] = { "COMPUTER #": item.computer_number, components: {} };
                    }

                    const type = item.type?.toString().trim().toUpperCase();
                    if (type && VALID_TYPES.has(type)) {
                        accumulator[computerKey].components[type] = {
                            brand: item.brand || "-",
                            description: item.description || "-",
                            remarks: item.status || "-",
                        };
                    }

                    return accumulator;
                }, {}),
            ).sort((left, right) => Number(left["COMPUTER #"]) - Number(right["COMPUTER #"]));

            // If the URL requested defective-only, filter to only PCs with defective remarks.
            const defectiveOnlyParam = searchParams.get("defectiveOnly");
            if (defectiveOnlyParam) {
                const defectiveRows = grouped.filter((pc) => {
                    const comps = pc.components || {};
                    return Object.values(comps).some((comp) => {
                        const remarks = String(comp.remarks || "").toUpperCase();
                        return remarks.includes("DEFECT") || remarks.includes("BROKEN");
                    });
                });

                // If there are defective PCs, show them; otherwise fall back to full list.
                if (defectiveRows.length > 0) {
                    setRows(defectiveRows);
                    setLoading(false);
                    return;
                }
            }

            setRows(grouped);
            setLoading(false);
        };

        fetchLabComponents();

        return () => {
            cancelled = true;
        };
    }, [selectedLab, searchParams]);

    useEffect(() => {
        if (!isEditMode) {
            setCellDrafts({});
            setSavingCellKey(null);
        }
    }, [isEditMode, selectedLab]);

    useEffect(() => {
        const fromUrl = searchParams.get("view") === "logs";
        setIsHistoryOpen((current) => (current === fromUrl ? current : fromUrl));
    }, [searchParams]);

    useEffect(() => {
        // clear search when switching labs
        setSearchQuery("");
    }, [selectedLab]);

    useEffect(() => {
        if (!isHistoryOpen) {
            setHistorySearchQuery("");
            setHistoryDateRange({ from: undefined, to: undefined });
            setShowHistoryDatePicker(false);
        }
    }, [isHistoryOpen]);

    useEffect(() => {
        if (isAddComponentOpen) {
            setOpenComponentSections(createInitialComponentSections());
        }
    }, [isAddComponentOpen]);

    const createLabSheet = (
        workbook,
        sheetName,
        labName,
        labData,
        selectedColumns,
        logoImage,
        separatorImage,
        preparedBy,
        inspectedBy,
        options = {},
    ) => {
        const worksheet = workbook.addWorksheet(sheetName);
        const headerColor = { argb: "FF4A1111" }; // maroon
        applyExportHeader(
            worksheet,
            `COMPUTER LABORATORY INVENTORY - ${labName?.toUpperCase() || "LABORATORY"}`,
            exportDate,
            headerColor,
            logoImage,
            separatorImage,
            options,
        );

        worksheet.addRow([]);

        // Table headers
        const headers = ["COMPUTER #", "COMPONENT", ...selectedColumns];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, size: 10 };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.border = {
                top: { style: "thin" },
                bottom: { style: "thin" },
                left: { style: "thin" },
                right: { style: "thin" },
            };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
        });

        // Data rows
        labData.forEach((computer) => {
            const computerNo = computer["COMPUTER #"];
            const startRow = worksheet.lastRow.number + 1;
            const computerNumber = Number(computerNo);
            const isGrayRow = Number.isFinite(computerNumber) ? computerNumber % 2 === 0 : false;
            const rowFill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: isGrayRow ? "FFD9D9D9" : "FFFFFFFF" },
            };

            COMPONENT_ROWS.forEach(([label, field]) => {
                const rowData = ["", label];

                selectedColumns.forEach((componentType) => {
                    if (!VALID_TYPES.has(componentType)) return;
                    const component = computer.components?.[componentType] || {};
                    const value = formatValue(component[field]) || "";
                    rowData.push(value);
                });

                const row = worksheet.addRow(rowData);
                row.eachCell((cell) => {
                    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                    cell.border = {
                        top: { style: "thin" },
                        bottom: { style: "thin" },
                        left: { style: "thin" },
                        right: { style: "thin" },
                    };
                    cell.fill = rowFill;
                    cell.font = { size: 10 };
                });
                row.getCell(2).font = { bold: true, size: 10 };
            });

            const endRow = worksheet.lastRow.number;
            worksheet.mergeCells(`A${startRow}:A${endRow}`);
            const computerCell = worksheet.getCell(`A${startRow}`);
            computerCell.value = computerNo;
            computerCell.alignment = { horizontal: "center", vertical: "middle" };
            computerCell.font = { bold: true, size: 12 };
            computerCell.fill = rowFill;
        });

        // Set column widths
        worksheet.columns.forEach((column) => {
            column.width = 15;
        });

        // Signatories block below table
        const preparedLabelRow = worksheet.lastRow.number + 6;
        const preparedNameRow = preparedLabelRow + 2;
        const preparedRoleRow = preparedLabelRow + 3;
        const inspectedLabelRow = preparedLabelRow + 5;
        const inspectedNameRow = inspectedLabelRow + 2;
        const inspectedRoleRow = inspectedLabelRow + 3;

        const safePreparedBy = (preparedBy || "").trim() || "____________________";
        const safeInspectedBy = (inspectedBy || "").trim() || "____________________";

        worksheet.getCell(`B${preparedLabelRow}`).value = "Prepared and submitted by:";
        worksheet.getCell(`B${preparedNameRow}`).value = safePreparedBy;
        worksheet.getCell(`B${preparedRoleRow}`).value = "IT technical support";

        worksheet.getCell(`B${inspectedLabelRow}`).value = "Inspected and verified by:";
        worksheet.getCell(`B${inspectedNameRow}`).value = safeInspectedBy;
        worksheet.getCell(`B${inspectedRoleRow}`).value = "Property custodian";

        [preparedLabelRow, inspectedLabelRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { bold: true, size: 10 };
        });
        [preparedNameRow, inspectedNameRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { bold: true, size: 12, name: "Arial" };
        });
        [preparedRoleRow, inspectedRoleRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { italic: true, size: 10 };
        });
    };

    const createDataSheet = (
        worksheet,
        summaries,
        logoImage,
        separatorImage,
        preparedBy,
        inspectedBy,
        options = {},
    ) => {
        const headerColor = { argb: "FF4A1111" };

        applyExportHeader(
            worksheet,
            "INVENTORY OF COMPUTER LABORATORY",
            exportDate,
            headerColor,
            logoImage,
            separatorImage,
            options,
        );

        // ensure the DATA sheet has the same spacing as lab sheets
        worksheet.addRow([]);

        worksheet.getCell("B10").value = "CSTA COMPUTER LAB:";
        worksheet.getCell("B10").font = { bold: true, size: 20, name: "Arial" };

        const listStartRow = 12;
        summaries.forEach((summary, index) => {
            const rowNumber = listStartRow + index;
            const labelText = String(summary.label || "").toUpperCase();
            worksheet.getCell(`B${rowNumber}`).value = `${labelText} = ${summary.count}`;
            worksheet.getCell(`B${rowNumber}`).font = { bold: false, size: 16, name: "Arial" };
            worksheet.getCell(`B${rowNumber}`).alignment = { horizontal: "left", vertical: "middle" };
        });

        const totalRow = listStartRow + summaries.length + 1;
        const totalCount = summaries.reduce((total, s) => total + (s.count || 0), 0);
        worksheet.getCell(`B${totalRow}`).value = `TOTAL = ${totalCount}`;
        worksheet.getCell(`B${totalRow}`).font = { bold: true, size: 16, name: "Arial" };
        worksheet.getCell(`B${totalRow}`).alignment = { horizontal: "left", vertical: "middle" };

        const preparedLabelRow = totalRow + 4;
        const preparedNameRow = preparedLabelRow + 2;
        const preparedRoleRow = preparedLabelRow + 3;
        const inspectedLabelRow = preparedLabelRow + 5;
        const inspectedNameRow = inspectedLabelRow + 2;
        const inspectedRoleRow = inspectedLabelRow + 3;

        const safePreparedBy = (preparedBy || "").trim() || "____________________";
        const safeInspectedBy = (inspectedBy || "").trim() || "____________________";

        worksheet.getCell(`B${preparedLabelRow}`).value = "Prepared and submitted by:";
        worksheet.getCell(`B${preparedNameRow}`).value = safePreparedBy;
        worksheet.getCell(`B${preparedRoleRow}`).value = "IT technical support";

        worksheet.getCell(`B${inspectedLabelRow}`).value = "Inspected and verified by:";
        worksheet.getCell(`B${inspectedNameRow}`).value = safeInspectedBy;
        worksheet.getCell(`B${inspectedRoleRow}`).value = "Property custodian";

        [preparedLabelRow, inspectedLabelRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { bold: true, size: 10 };
        });
        [preparedNameRow, inspectedNameRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { bold: true, size: 12, name: "Arial" };
        });
        [preparedRoleRow, inspectedRoleRow].forEach((rowNumber) => {
            worksheet.getCell(`B${rowNumber}`).font = { italic: true, size: 10 };
        });

        worksheet.columns = [
            { width: 5 },
            { width: 38 },
            { width: 18 },
        ];
    };

    const exportLab = async () => {
        const labsToExport = selectedExportLabs.length ? selectedExportLabs : (selectedLab ? [selectedLab] : []);
        if (labsToExport.length === 0) return;

        setExporting(true);
        try {
            // Load logo image
            let logoBuffer = null;
            let separatorBuffer = null;
            try {
                const logoRes = await fetch(arkLogoUrl);
                if (logoRes.ok) {
                    logoBuffer = await logoRes.arrayBuffer();
                }
            } catch (e) {
                console.warn('Failed to load logo:', e);
            }

            separatorBuffer = createHeaderSeparatorBase64();

            const workbook = new ExcelJS.Workbook();
            const exportSummaries = [];

            for (const [index, labId] of labsToExport.entries()) {
                const labMeta = labOptions.find((l) => l.value === labId);
                if (!labMeta) continue;

                let grouped = rows.length > 0 && labId === selectedLab ? rows : [];
                if (grouped.length === 0) {
                    let { data: dataRows, error: fetchError } = await supabase
                        .from('computers_components')
                        .select('computer_number, type, brand, description, status')
                        .eq('lab_number_id', labId)
                        .order('computer_number', { ascending: true });

                    if (fetchError) {
                        console.error('Failed to fetch lab components:', fetchError.message);
                        dataRows = [];
                    }

                    if ((!dataRows || dataRows.length === 0) && labMeta.order != null) {
                        const { data: fallbackData } = await supabase
                            .from('computers_components')
                            .select('computer_number, type, brand, description, status')
                            .eq('lab_number', labMeta.order)
                            .order('computer_number', { ascending: true });
                        dataRows = fallbackData || [];
                    }

                    grouped = groupComponentRows(dataRows || []);
                }

                const sheetName = sanitizeSheetName(labMeta.label);
                createLabSheet(
                    workbook,
                    sheetName,
                    labMeta.label,
                    grouped,
                    selectedExportColumns,
                    logoBuffer,
                    separatorBuffer,
                    preparedByName,
                    inspectedByName,
                    { schoolYear: exportSchoolYear, semester: exportSemester },
                );

                exportSummaries.push({
                    label: labMeta.label,
                    count: grouped.length,
                });
            }

            const dataWorksheet = workbook.addWorksheet("DATA");
            createDataSheet(
                dataWorksheet,
                exportSummaries,
                logoBuffer,
                separatorBuffer,
                preparedByName,
                inspectedByName,
                { logoCol: 1.5, schoolYear: exportSchoolYear, semester: exportSemester },
            );

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const filename = `Computer_Lab_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
            saveAs(blob, filename);
            const storagePath = createExportStoragePath(filename);

            const { error: uploadError } = await supabase.storage
                .from(EXPORT_BUCKET)
                .upload(storagePath, blob, {
                    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    upsert: false,
                });

            if (uploadError) throw uploadError;

            const exportBy = (user?.displayName || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "system").trim();

            // Try dynamic shared table first
            let logged = false;
            try {
                const { error: dynErr } = await supabase.from('dynamic_inventory_export_logs').insert({
                    exported_by: exportBy || "system",
                    file_name: filename,
                    export_date: exportDate,
                    file_path: storagePath,
                    table_name: 'computers_components',
                    metadata: { labId: selectedLab } ,
                });
                if (!dynErr) logged = true;
            } catch (e) {
                // ignore - table may not exist
            }

            if (!logged) {
                // Prefer per-table exports table (computers_components_exports) then fallback to global export_logs
                const perTableExports = `computers_components_exports`;
                let insertError = null;
                try {
                    const res = await supabase.from(perTableExports).insert({
                        exported_by: exportBy || "system",
                        file_name: filename,
                        export_date: exportDate,
                        file_path: storagePath,
                    });
                    insertError = res.error;
                    if (!insertError) logged = true;
                } catch (e) {
                    insertError = e;
                }

                if (!logged) {
                    const { error: fallbackErr } = await supabase.from("export_logs").insert({
                        export_by: exportBy || "system",
                        file_name: filename,
                        export_date: exportDate,
                        file_path: storagePath,
                    });
                    if (fallbackErr) throw fallbackErr;
                }
            }

            setExportLogRefreshToken((current) => current + 1);
            setShowExportModal(false);
        } catch (err) {
            console.error('Export failed:', err);
            setError(err.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    if (loading || labsLoading) {
        return (
            <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
                <div className="flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
                            role="status"
                            aria-label="Loading inventory data"
                        />
                        
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            {deleteConfirmLab && (
                <Dialog open={!!deleteConfirmLab} onOpenChange={() => setDeleteConfirmLab(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Laboratory</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete <strong>{labOptions.find((lab) => lab.value === deleteConfirmLab)?.label}</strong>?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmLab(null)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteLab(deleteConfirmLab)}
                                disabled={exporting}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                Delete
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {deleteConfirmComputer !== null && (
                <Dialog open={deleteConfirmComputer !== null} onOpenChange={() => setDeleteConfirmComputer(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Computer Row</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete <strong>Computer #{deleteConfirmComputer}</strong> and all its
                                component entries from <strong>{selectedLabLabel}</strong>?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmComputer(null)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteComputerRow(deleteConfirmComputer)}
                                disabled={exporting}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                Delete
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {confirmExitEditMode && (
                <Dialog open={confirmExitEditMode} onOpenChange={setConfirmExitEditMode}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Done Editing?</DialogTitle>
                            <DialogDescription>
                                You are about to exit edit mode. Are you done making changes?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmExitEditMode(false);
                                    setPendingAction(null);
                                }}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Keep Editing
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditMode(false);
                                    setHasEditChanges(false);
                                    setConfirmExitEditMode(false);
                                    if (pendingAction === 'switchHistory') {
                                        updateHistoryView(true);
                                    }
                                    setPendingAction(null);
                                }}
                                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5a1717]"
                            >
                                Done
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <Dialog open={isAddComponentOpen} onOpenChange={setIsAddComponentOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Add Computer</DialogTitle>
                            <DialogDescription>Add a new computer to {selectedLabLabel}.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 px-0 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="computer-number">
                                    Computer Number *
                                </label>
                                <input
                                    id="computer-number"
                                    type="number"
                                    min="1"
                                    value={newComponent.computer_number}
                                    onChange={(e) => setNewComponent({ ...newComponent, computer_number: e.target.value })}
                                    placeholder="1"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                />
                            </div>
                            <div className="border-t pt-4 space-y-2">
                                {COMPONENT_TYPES.map((componentType) => {
                                    const isOpen = !!openComponentSections[componentType];
                                    return (
                                        <div key={componentType} className="rounded-lg border border-slate-200 bg-slate-50">
                                            <button
                                                type="button"
                                                onClick={() => toggleComponentSection(componentType)}
                                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-100"
                                                aria-expanded={isOpen}
                                                aria-label={`Toggle ${componentType} fields`}
                                            >
                                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{componentType}</span>
                                                <ChevronDown
                                                    className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
                                                />
                                            </button>

                                            {isOpen && (
                                                <div className="grid gap-3 border-t border-slate-200 p-3">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Brand</label>
                                                        <input
                                                            type="text"
                                                            value={newComponent[`${componentType}_brand`] || ""}
                                                            onChange={(e) =>
                                                                setNewComponent((current) => ({
                                                                    ...current,
                                                                    [`${componentType}_brand`]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="e.g., Intel"
                                                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Description</label>
                                                        <input
                                                            type="text"
                                                            value={newComponent[`${componentType}_description`] || ""}
                                                            onChange={(e) =>
                                                                setNewComponent((current) => ({
                                                                    ...current,
                                                                    [`${componentType}_description`]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="e.g., Core i7"
                                                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Remarks</label>
                                                        <select
                                                            value={newComponent[`${componentType}_remarks`] || ""}
                                                            onChange={(e) =>
                                                                setNewComponent((current) => ({
                                                                    ...current,
                                                                    [`${componentType}_remarks`]: e.target.value,
                                                                }))
                                                            }
                                                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                                                        >
                                                            <option value="">Select remarks...</option>
                                                            {REMARK_OPTIONS.map((remark) => (
                                                                <option key={remark} value={remark.toLowerCase()}>
                                                                    {remark}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-4">
                        <button
                            type="button"
                            onClick={() => setIsAddComponentOpen(false)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAddComponent({ closeDialog: true })}
                            disabled={exporting}
                            className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            Save
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddLabOpen} onOpenChange={setIsAddLabOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Laboratory</DialogTitle>
                        <DialogDescription>Create a new laboratory tab for the computer laboratory section.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="laboratory-name">
                            Laboratory name
                        </label>
                        <Input
                            id="laboratory-name"
                            value={newLabName}
                            onChange={(event) => setNewLabName(event.target.value)}
                            placeholder="Laboratory 6"
                        />
                    </div>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setIsAddLabOpen(false)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddLab}
                            disabled={!newLabName.trim() || exporting}
                            className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            Add Laboratory
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                    {labOptions.map((lab) => (
                        <div key={lab.value} className="relative">
                            <button
                                type="button"
                                onClick={() => setSelectedLab(lab.value)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${lab.value === selectedLab
                                    ? "bg-[#4a1111] text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                    }`}
                            >
                                {lab.label}
                            </button>
                            {isEditMode && isAdminUser && (
                                <button
                                    type="button"
                                    onClick={() => setDeleteConfirmLab(lab.value)}
                                    className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition"
                                    title="Delete laboratory"
                                    aria-label="Delete laboratory"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    ))}
                    {isEditMode && (
                        <button
                            type="button"
                            onClick={openAddLabModal}
                            className="inline-flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                            title="Add laboratory"
                            aria-label="Add laboratory"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isHistoryOpen && !isEditMode && (
                        <button
                            type="button"
                            onClick={() => {
                                // default selection: current lab
                                setSelectedExportLabs(selectedLab ? [selectedLab] : labOptions.map((l) => l.value));
                                setSelectedExportColumns(COMPONENT_TYPES.slice());
                                setExportDate(new Date().toISOString().slice(0, 10));
                                setExportSchoolYear(currentSchoolYear);
                                setExportSemester(SEMESTER_OPTIONS[0]);
                                setPreparedByName("");
                                setInspectedByName("");
                                setShowExportModal(true);
                            }}
                            disabled={loading || rows.length === 0 || exporting}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300 icon-btn"
                            title={exporting ? "Exporting..." : "Export"}
                            aria-label={exporting ? "Exporting" : "Export"}
                        >
                            <Download className="h-4 w-4 text-white" />
                        </button>
                    )}

                    {!isHistoryOpen && isEditMode && (
                        <button
                            type="button"
                            onClick={() => setIsAddComponentOpen(true)}
                            disabled={!selectedLab || exporting}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300 icon-btn"
                            title="Add computer component"
                            aria-label="Add computer component"
                        >
                            <Plus className="h-4 w-4 text-white" />
                        </button>
                    )}

                    {!isHistoryOpen && (
                        <button
                            type="button"
                            onClick={() => {
                                if (isEditMode) {
                                    const hasUnsavedChanges = hasEditChanges || Object.keys(cellDrafts).length > 0;
                                    if (hasUnsavedChanges) {
                                        setPendingAction('exit');
                                        setConfirmExitEditMode(true);
                                    } else {
                                        setIsEditMode(false);
                                    }
                                } else {
                                    setIsEditMode(true);
                                    setHasEditChanges(false);
                                }
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition bg-[#4a1111] hover:bg-[#5a1717] icon-btn"
                            title={isEditMode ? "Exit edit mode" : "Edit mode"}
                            aria-label={isEditMode ? "Exit edit mode" : "Edit mode"}
                        >
                            {isEditMode ? (
                                <Check className="h-4 w-4 text-white" />
                            ) : (
                                <PencilLine className="h-4 w-4 text-white" />
                            )}
                        </button>
                    )}

                    {!isEditMode && (
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                // toggle history mode; prompt if exiting edit mode with changes
                                if (!isHistoryOpen) {
                                    // Check if in edit mode and has any unsaved changes (either from cellDrafts or hasEditChanges flag)
                                    const hasUnsavedChanges = isEditMode && (hasEditChanges || Object.keys(cellDrafts).length > 0);
                                    if (hasUnsavedChanges) {
                                        // Show confirmation before switching to history
                                        setPendingAction('switchHistory');
                                        setConfirmExitEditMode(true);
                                    } else {
                                        // No unsaved changes, proceed directly to history
                                        setIsEditMode(false);
                                        setHasEditChanges(false);
                                        updateHistoryView(true);
                                    }
                                } else {
                                    updateHistoryView(false);
                                }
                            }}
                            title={isHistoryOpen ? "Return to inventory" : "View history"}
                            aria-label={isHistoryOpen ? "Return to inventory" : "View history"}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a1111] text-white transition hover:bg-[#5a1717] icon-btn"
                        >
                            <span className="inline-flex items-center justify-center w-4 h-4">
                                {isHistoryOpen ? (
                                    <ChevronLeft className="h-4 w-4 text-white" />
                                ) : (
                                    <FileText className="h-4 w-4 text-white" />
                                )}
                            </span>
                        </button>
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
                            placeholder="Search computer #, component, brand, description..."
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

            {isHistoryOpen && (
                    <div className="mt-3 flex w-full flex-wrap items-center gap-3 overflow-visible">
                        <div className="relative w-full sm:w-96">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={historySearchQuery}
                                onChange={(e) => setHistorySearchQuery(e.target.value)}
                                placeholder="Search computer #, component, brand, description, dates..."
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 shadow-sm focus:border-[#4a1111] focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
                            />
                            {historySearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setHistorySearchQuery("")}
                                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                    aria-label="Clear search"
                                    title="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <div className="relative z-[90]">
                            <button
                                type="button"
                                onClick={() => setShowHistoryDatePicker((current) => !current)}
                                className="w-full min-w-[18rem] sm:w-64 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-left text-slate-700 hover:border-slate-300"
                            >
                                <span className="text-slate-500">{formatPickerLabel(historyDateRange)}</span>
                                <span className="text-xs text-slate-400">▼</span>
                            </button>
                            {showHistoryDatePicker && (
                                <div className="absolute left-0 top-full z-[100] mt-2 w-[22rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                                    <style>{`\n                    .rdp-sidebar-picker .rdp-day_selected,\n                    .rdp-sidebar-picker .rdp-day_range_start,\n                    .rdp-sidebar-picker .rdp-day_range_end,\n                    .rdp-sidebar-picker .rdp-day_range_middle {\n                      background-color: #2b0707 !important;\n                      color: #ffffff !important;\n                    }\n                    .rdp-sidebar-picker .rdp-day_selected:hover,\n                    .rdp-sidebar-picker .rdp-day_range_start:hover,\n                    .rdp-sidebar-picker .rdp-day_range_end:hover,\n                    .rdp-sidebar-picker .rdp-day_range_middle:hover {\n                      background-color: #2b0707 !important;\n                      color: #ffffff !important;\n                    }\n                    .rdp-sidebar-picker .rdp-day_today .rdp-button {\n                      border-color: #2b0707 !important;\n                    }\n                  `}</style>
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
                                                : "Select a date range"
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

            {showExportModal && (
                <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Export Laboratories</DialogTitle>
                            <DialogDescription>Select labs and columns to include in export, and set date.</DialogDescription>
                        </DialogHeader>

                        <div className="max-h-72 overflow-auto px-4 py-2 space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Date</label>
                                <input
                                    type="date"
                                    value={exportDate}
                                    onChange={(e) => setExportDate(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">School Year *</label>
                                    <div className="relative mt-1">
                                        <select
                                            value={exportSchoolYear}
                                            onChange={(e) => setExportSchoolYear(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
                                        >
                                            {schoolYearOptions.map((opt) => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Semester *</label>
                                    <div className="relative mt-1">
                                        <select
                                            value={exportSemester}
                                            onChange={(e) => setExportSemester(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#4a1111]/20"
                                        >
                                            {SEMESTER_OPTIONS.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-500">Prepared and submitted by</label>
                                <input
                                    type="text"
                                    value={preparedByName}
                                    onChange={(e) => setPreparedByName(e.target.value)}
                                    placeholder="Enter name"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-500">Inspected and verified by</label>
                                <input
                                    type="text"
                                    value={inspectedByName}
                                    onChange={(e) => setInspectedByName(e.target.value)}
                                    placeholder="Enter name"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-500">Labs</label>
                                <div className="mt-2 grid gap-2">
                                    {labOptions.map((lab) => (
                                        <label key={lab.value} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedExportLabs.includes(lab.value)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedExportLabs((s) => [...s, lab.value]);
                                                    else setSelectedExportLabs((s) => s.filter((v) => v !== lab.value));
                                                }}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm">{lab.label}</span>
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
                                    className={`grid grid-cols-2 gap-2 overflow-hidden px-3 transition-all duration-300 ease-in-out ${showColumnOptions ? "max-h-96 pb-3 opacity-100" : "max-h-0 pb-0 opacity-0"}`}
                                >
                                    {COMPONENT_TYPES.map((col) => (
                                        <label key={col} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedExportColumns.includes(col)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedExportColumns((s) => [...s, col]);
                                                    else setSelectedExportColumns((s) => s.filter((v) => v !== col));
                                                }}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm">{col}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowExportModal(false);
                                }}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={exportLab}
                                disabled={
                                    exporting ||
                                    selectedExportLabs.length === 0 ||
                                    !isValidSchoolYear(exportSchoolYear) ||
                                    !String(exportSemester || "").trim()
                                }
                                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {exporting ? 'Exporting...' : 'Export Selected'}
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            <div className={`${isHistoryOpen ? "" : "bg-white rounded-xl shadow-sm border border-slate-200"} overflow-hidden`}> 
                <div className="min-w-0 overflow-hidden p-0">
                    {error ? (
                        <div className="border-t border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700">
                            {error}
                        </div>
                    ) : !loading && !labsLoading && rows.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-slate-500">No component records found for this laboratory.</p>
                        </div>
                    ) : isHistoryOpen ? (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(440px,1fr)]">
                            <div className="min-w-0 w-full">
                                <InventoryHistoryView selectedLab={selectedLab} searchQuery={historySearchQuery} dateRange={historyDateRange} />
                            </div>

                            <div className="min-w-0 w-full xl:min-w-[440px]">
                                <ExportLogsPanel searchQuery={historySearchQuery} selectedLab={selectedLab} refreshToken={exportLogRefreshToken} />
                            </div>
                        </div>
                    ) : (
                        <div className="computer-lab-scrollbar h-[80vh] min-h-0 w-full max-w-full overflow-auto">
                            <table className="w-max min-w-full divide-y divide-slate-200 table-fixed">
                                <thead className="sticky top-0 z-20 bg-slate-100">
                                    <tr>
                                        {TABLE_COLUMNS.map((heading, index) => (
                                            <th
                                                key={`${heading || "row-label"}-${index}`}
                                                scope="col"
                                                className="whitespace-nowrap border-r border-slate-300 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 last:border-r-0"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                        {isEditMode && isAdminUser && (
                                            <th
                                                scope="col"
                                                className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700"
                                            >
                                                Action
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                    {filteredRows.flatMap((row, computerIndex) =>
                                        COMPONENT_ROWS.map(([label, field], rowIndex) => {
                                            const shadedRow = computerIndex % 2 === 0 ? "bg-slate-50" : "bg-slate-200/70";
                                            const groupDivider = rowIndex === 0 ? "border-t-2 border-slate-300" : "border-t border-slate-200";

                                            const computerHasDefect = Object.values(row.components || {}).some((component) => {
                                                const remark = String(component?.remarks || "").toUpperCase();
                                                return remark.includes("DEFECT") || remark.includes("BROKEN");
                                            });
                                            const computerHasMissing = Object.values(row.components || {}).some((component) => {
                                                return [component?.brand, component?.description, component?.remarks].some((val) => !val || val === '-' || String(val).trim() === '');
                                            });
                                            const rowBg = shadedRow;
                                            const defectCellClass = computerHasDefect ? "border-l-4 border-rose-500" : "";

                                            return (
                                                <tr
                                                    key={`${row["COMPUTER #"]}-${field}`}
                                                    className={`transition hover:bg-slate-100 ${rowBg} ${groupDivider}`}
                                                >
                                                    {rowIndex === 0 && (
                                                        <td
                                                            rowSpan={COMPONENT_ROWS.length}
                                                            className={`relative whitespace-nowrap pl-8 pr-4 py-3 text-center align-middle font-semibold text-slate-900`}
                                                        >
                                                            <div className="absolute left-0 top-0 bottom-0 flex items-stretch">
                                                                {computerHasDefect && <div className="w-1 bg-rose-500 h-full" />}
                                                                {computerHasMissing && <div className="w-1 bg-amber-400 h-full" />}
                                                            </div>
                                                            {formatValue(row["COMPUTER #"]) }
                                                        </td>
                                                    )}
                                                    <td className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                                                        {label}
                                                    </td>
                                                    {TABLE_HEADING.slice(1).map((componentType) => {
                                                        const componentData = row.components?.[componentType] || {};
                                                        let value = componentData[field];
                                                        // Ensure value is always a string, never an object or ID
                                                        if (typeof value !== 'string' || value === 'null' || value === 'undefined') {
                                                            value = '-';
                                                        }
                                                        const cellKey = getCellDraftKey(row["COMPUTER #"], componentType, field);
                                                        const inputValue = cellDrafts[cellKey] ?? normalizeCellValue(value);
                                                        const isRemarksField = field === "remarks";
                                                        const hasCustomRemark = inputValue && !REMARK_OPTIONS.includes(inputValue);
                                                        const isIncompleteComponent = [componentData.brand, componentData.description, componentData.remarks].some(
                                                            (val) => !val || val === '-' || String(val).trim() === ''
                                                        );

                                                        return (
                                                            <td
                                                                key={`${row["COMPUTER #"]}-${componentType}-${field}`}
                                                                className={`border-r border-slate-200 px-4 py-3 text-sm last:border-r-0 ${isIncompleteComponent ? "bg-amber-100" : ""}`}
                                                            >
                                                                {isEditMode ? (
                                                                    isRemarksField ? (
                                                                        <select
                                                                            value={inputValue}
                                                                            disabled={savingCellKey === cellKey || exporting}
                                                                            onChange={(e) =>
                                                                                handleCellDraftChange(
                                                                                    row["COMPUTER #"],
                                                                                    componentType,
                                                                                    field,
                                                                                    e.target.value
                                                                                )
                                                                            }
                                                                            onBlur={() => handleInlineCellSave(row, componentType, field)}
                                                                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-0 focus:border-[#4a1111] disabled:bg-slate-100"
                                                                        >
                                                                            <option value="">Select remarks...</option>
                                                                            {hasCustomRemark && <option value={inputValue}>{inputValue}</option>}
                                                                            {REMARK_OPTIONS.map((option) => (
                                                                                <option key={option} value={option}>
                                                                                    {option}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <input
                                                                            type="text"
                                                                            value={inputValue}
                                                                            disabled={savingCellKey === cellKey || exporting}
                                                                            onChange={(e) =>
                                                                                handleCellDraftChange(
                                                                                    row["COMPUTER #"],
                                                                                    componentType,
                                                                                    field,
                                                                                    e.target.value
                                                                                )
                                                                            }
                                                                            onBlur={() => handleInlineCellSave(row, componentType, field)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") {
                                                                                    e.currentTarget.blur();
                                                                                }
                                                                                if (e.key === "Escape") {
                                                                                    setCellDrafts((current) => {
                                                                                        const next = { ...current };
                                                                                        delete next[cellKey];
                                                                                        return next;
                                                                                    });
                                                                                    e.currentTarget.blur();
                                                                                }
                                                                            }}
                                                                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-0 focus:border-[#4a1111] disabled:bg-slate-100"
                                                                        />
                                                                    )
                                                                ) : (
                                                                    <div
                                                                        className={` ${isRemarksField && String(value).toUpperCase() === "DEFECTIVE"
                                                                                ? "text-red-600"
                                                                                : "text-slate-900"
                                                                            }`}
                                                                    >
                                                                        {value}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    {isEditMode && isAdminUser && rowIndex === 0 && (
                                                        <td
                                                            rowSpan={COMPONENT_ROWS.length}
                                                            className="px-4 py-3 text-center align-middle"
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteConfirmComputer(row["COMPUTER #"])}
                                                                disabled={exporting}
                                                                className="inline-flex items-center justify-center rounded-lg bg-red-500 p-2 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                                title="Delete computer row"
                                                                aria-label="Delete computer row"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
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
                    )}
                </div>
            </div>
            {/* Inline history view used instead of modal Drawer; keep Drawer component file for later use */}
        </div>
    );
}