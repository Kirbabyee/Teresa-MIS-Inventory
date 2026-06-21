import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Edit, MoreVertical, Plus, Trash2, X, CheckCircle, Monitor, Armchair, Wrench, FileText, Box, Tv, Cable, ChevronLeft, ChevronRight, Columns2, FolderOpen, LayoutTemplate, Upload, FileSpreadsheet, Wifi, Battery, HardDrive, Keyboard, Mouse, Headphones, Projector, Usb, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { supabase } from "@/api/supabaseClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import {
  deleteInventorySection,
  deleteInventoryTab,
  fetchSetting,
  callCleanupExportLogs,
  upsertInventorySection,
  upsertInventoryTab,
  useInventoryCatalog,
  callCreateInventoryTable,
  callModifyInventoryTable,
  callCreateInventoryLogsTable,
  callDropInventoryLogsTable,
  upsertSetting,
  getInventoryCreateTableEndpoint,
  getInventoryCleanupExportLogsEndpoint,
  getInventoryModifyTableEndpoint,
  getInventoryLogsTableEndpoint,
  getInventoryDropLogsTableEndpoint,
  getInventoryDropColumnsEndpoint,
  getTabTableConfig,
  getTabTableName,
  callDropInventoryColumns,
  slugify,
  makeUniqueSlug,
  bulkInsertInventoryRows,
} from "@/lib/inventoryApi";
import { isCurrentUserAdmin } from "@/lib/inventoryApi";
import SmartImporter from "@/components/SmartImporter";

const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

const rowActionButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900";

const sanitizeNameInput = (value = "") => String(value).replace(/[^a-zA-Z0-9 ]/g, "");
const hasOnlyLettersNumbers = (value = "") => /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9 ]+$/.test(String(value));

const getTabRoute = (tab) => {
  if (!tab?.slug) return "/inventory";

  return `/inventory/${tab.slug}${tab.sections?.[0]?.slug ? `?section=${tab.sections[0].slug}` : ""}`;
};

// Pre-built templates for common inventory types
// ─── Fallback brand list used when DB query returns empty ───
const FALLBACK_BRANDS = ["Dell", "HP", "Lenovo", "Apple", "Asus", "Acer", "Logitech", "TP-Link", "Samsung", "LG"];

// ─── Helper: build a standard column def ───
const C = (key, label, fieldType = "text", extra = {}) => ({
  key, label, data_type: fieldType === "number" ? "int" : "text", fieldType, ...extra,
});
const REMARKS = { key: "remarks", label: "Remarks", data_type: "text", fieldType: "dropdown", options: ["Working", "Defective"] };
const REMARKS_DESC = { key: "remarks_description", label: "Remarks Description", data_type: "text", fieldType: "text" };
const QTY = { key: "quantity", label: "Quantity", data_type: "int", fieldType: "number" };
const BRAND = { key: "brand", label: "Brand", data_type: "text", fieldType: "dropdown", dynamicBrand: true };
const DESCRIPTION = { key: "description", label: "Description", data_type: "text", fieldType: "text" };

// Default columns for any new section added in the wizard
const DEFAULT_SECTION_COLUMNS = [
  C("item_number", "Item #"), C("name", "Name"), BRAND, DESCRIPTION,
  QTY, REMARKS, REMARKS_DESC,
];

const INVENTORY_TEMPLATES = [
  {
    id: "import-csv",
    name: "Import CSV / File",
    description: "Upload a CSV or Excel file to auto-create your inventory structure",
    icon: Upload,
    sections: [],
    sectionColumns: {},
    isImportTemplate: true,
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // A. Computing Devices
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "computing-devices",
    name: "Computing Devices",
    description: "Laptops, desktops, tablets, and mobile devices with per-section schemas",
    icon: Monitor,
    brands: ["Dell", "HP", "Lenovo", "Apple", "Asus", "Acer", "MSI", "Samsung", "Huawei", "Xiaomi", "Microsoft", "Framework", "Razer", "Gateway", "Toshiba", "Sony VAIO", "Panasonic"],
    sections: [
      { name: "Laptops", description: "Portable computers with serial tracking" },
      { name: "Desktops & All-in-Ones", description: "Desktop and AIO workstations" },
      { name: "Tablets & Mobile Devices", description: "Tablets, iPads, and mobile devices" },
    ],
    sectionColumns: {
      "Laptops": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("serial_number", "Serial Number"), C("assigned_user", "Assigned User/Faculty"),
        C("sub_category", "Sub-Category", "dropdown", { options: ["Ultrabook", "Business", "Gaming"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Desktops & All-in-Ones": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("serial_number", "Serial Number"),
        C("form_factor", "Form Factor", "dropdown", { options: ["Tower", "SFF", "Mini", "All-in-One"] }),
        C("room_location", "Room Location"), DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Tablets & Mobile Devices": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("imei_serial_number", "IMEI/Serial Number"),
        C("os_platform", "OS Platform", "dropdown", { options: ["iOS", "Android", "Windows"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // B. Displays
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "displays",
    name: "Displays",
    description: "Monitors, projectors, and presentation display equipment",
    icon: Tv,
    brands: ["Dell", "HP", "Lenovo", "Samsung", "LG", "Asus", "Acer", "BenQ", "ViewSonic", "Epson", "NEC", "Optoma", "Hitachi", "Panasonic", "Sony", "Philips", "AOC", "MSI", "Gigabyte", "Alienware"],
    sections: [
      { name: "External Monitors", description: "Computer monitors and display screens" },
      { name: "Projectors & Presentation Displays", description: "Projectors and presentation equipment" },
    ],
    sectionColumns: {
      "External Monitors": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("serial_number", "Serial Number"),
        C("screen_size", "Screen Size", "dropdown", { options: ["21\"", "24\"", "27\"", "32\"+"] }),
        C("video_inputs", "Video Inputs", "dropdown", { options: ["HDMI", "DisplayPort", "VGA"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Projectors & Presentation Displays": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("serial_number", "Serial Number"), C("interface_connection", "Interface Connection"),
        C("bulb_hours_run", "Bulb Hours Run", "number"), DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // C. Peripherals & Input Devices
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "peripherals",
    name: "Peripherals & Input Devices",
    description: "Docking stations, keyboards, mice, headsets, and webcams",
    icon: Keyboard,
    brands: ["Logitech", "Razer", "Corsair", "SteelSeries", "HyperX", "Dell", "HP", "Lenovo", "Apple", "Microsoft", "Anker", "UGREEN", "Satechi", "CalDigit", "Plugable", "StarTech", "Blue", "Jabra", "Plantronics", "Poly", "Elgato", "Razer", "Creative", "Audio-Technica", "Shure", "Samson"],
    sections: [
      { name: "Docking Stations", description: "USB-C and brand-specific docking stations" },
      { name: "Keyboards & Mice", description: "Pooled bulk inventory — no serial tracking" },
      { name: "Headsets, Microphones & Webcams", description: "Audio and video conferencing peripherals" },
    ],
    sectionColumns: {
      "Docking Stations": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("compatibility_type", "Compatibility Type", "dropdown", { options: ["Universal USB-C", "Dell", "Lenovo", "HP"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Keyboards & Mice": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        DESCRIPTION, { key: "quantity", label: "Quantity", data_type: "int", fieldType: "number" }, REMARKS, REMARKS_DESC,
      ],
      "Headsets, Microphones & Webcams": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("connection_type", "Connection Type", "dropdown", { options: ["USB-A", "USB-C", "3.5mm", "Bluetooth"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // D. Power & Cables
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "power-cables",
    name: "Power & Cables",
    description: "Power adapters, UPS units, surge protectors, and data adapters",
    icon: Battery,
    brands: ["APC", "CyberPower", "Tripp Lite", "Belkin", "Eaton", "Dell", "HP", "Lenovo", "Apple", "Anker", "UGREEN", "Baseus", "Unidapt", "StarTech", "Cable Matters", "Amazon Basics", "DURAGADGET", "Pyle", "Monster", "Philips"],
    sections: [
      { name: "Power Adapters / Chargers", description: "Consumable pool stock items" },
      { name: "UPS Units & Surge Protectors", description: "UPS and surge protection devices" },
      { name: "Video & Data Adapters", description: "Video, data, and network adapters" },
    ],
    sectionColumns: {
      "Power Adapters / Chargers": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("voltage_wattage", "Voltage/Wattage"), DESCRIPTION,
        { key: "quantity", label: "Quantity", data_type: "int", fieldType: "number" }, REMARKS, REMARKS_DESC,
      ],
      "UPS Units & Surge Protectors": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("load_capacity_va", "Load Capacity (VA)"),
        C("battery_health", "Battery Health Condition", "dropdown", { options: ["Good", "Replace Battery"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Video & Data Adapters": [
        C("item_number", "Item #"), C("name", "Name"), BRAND,
        C("adapter_endpoints", "Adapter Endpoints", "dropdown", { options: ["HDMI to VGA", "USB-C to USB-A", "Type-C to Ethernet"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // E. Storage & Networking
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "storage-networking",
    name: "Storage & Networking",
    description: "External storage drives and network equipment",
    icon: HardDrive,
    brands: ["Western Digital", "Seagate", "Samsung", "SanDisk", "Kingston", "Crucial", "Toshiba", "LaCie", "Netgear", "TP-Link", "Ubiquiti", "Cisco", "MikroTik", "Linksys", "Asus", "D-Link", "Synology", "QNAP", "Zyxel", "Aruba"],
    sections: [
      { name: "External Hard Drives & SSDs", description: "Portable storage devices" },
      { name: "Network Equipment", description: "Routers, access points, and switches" },
      { name: "Networking Tools", description: "Crimping tools, wire strippers, and cable testers" },
    ],
    sectionColumns: {
      "External Hard Drives & SSDs": [
        C("item_number", "Item #"), C("name", "Name"), BRAND,
        C("storage_type", "Storage Type", "dropdown", { options: ["External HDD", "Portable SSD"] }),
        C("capacity", "Capacity", "dropdown", { options: ["500GB", "1TB", "2TB", "4TB+"] }),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Network Equipment": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("device_class", "Device Class", "dropdown", { options: ["Wireless Router", "Access Point", "PoE Switch"] }),
        C("management_ip", "Management IP Address"), DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
      "Networking Tools": [
        C("item_number", "Item #"), C("name", "Name"), BRAND, C("model", "Model"),
        C("tool_type", "Tool Type", "dropdown", { options: ["Crimping Tool", "Wire Stripper", "Cable Tester", "Punch Down Tool", "Tone Probe", "Network Cable Certifier", "Other"] }),
        C("compatible_cable", "Compatible Cable Type", "dropdown", { options: ["RJ45 Ethernet", "RJ11 Telephone", "Coaxial", "Fiber Optic", "Cat5e/Cat6/Cat6a", "Multiple/Universal"] }),
        C("quantity", "Quantity", "number"),
        DESCRIPTION, QTY, REMARKS, REMARKS_DESC,
      ],
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════
  // F. Custom
  // ══════════════════════════════════════════════════════════════════════════════
  {
    id: "custom",
    name: "Custom",
    description: "Start from scratch with your own fields",
    icon: FileText,
    sections: [],
    sectionColumns: {},
  },
];

const normalizeOption = (o) => {
  if (o && typeof o === "object" && "value" in o) {
    return { value: String(o.value), conditionGroup: o.conditionGroup || "operational" };
  }
  const str = String(o).trim();
  if (!str) return null;
  const group = KNOWN_OPERATIONAL_VALUES.has(str.toLowerCase()) ? "operational" : "quarantine";
  return { value: str, conditionGroup: group };
};

const normalizeColumnConfig = (column) => ({
  key: String(column?.key || "").trim(),
  label: String(column?.label || column?.key || "").trim(),
  data_type: String(column?.data_type || column?.type || "text").toLowerCase(),
  visible: column?.visible !== false,
  fieldType: String(column?.fieldType || "text").toLowerCase(),
  options: Array.isArray(column?.options) ? column.options.map(normalizeOption).filter(Boolean) : [],
  dynamicBrand: column?.dynamicBrand === true,
  subColumns: Array.isArray(column?.subColumns)
    ? column.subColumns
      .filter((subColumn) => subColumn && subColumn.key)
      .map((subColumn) => ({
        key: String(subColumn.key).trim(),
        label: String(subColumn.label || subColumn.key).trim(),
        fieldType: String(subColumn?.fieldType || "text").toLowerCase(),
        options: Array.isArray(subColumn?.options) ? subColumn.options.map(normalizeOption).filter(Boolean) : [],
      }))
    : [],
});

// ─── Instance-tracking columns injected into every new inventory table ───
export const INSTANCE_COLUMNS = [
  { key: "parent_id",     label: "Parent ID",        data_type: "bigint" },
  { key: "instance_tag",  label: "Instance Tag",     data_type: "text" },
  { key: "serial_number", label: "Serial Number",    data_type: "text" },
  { key: "condition",     label: "Condition",        data_type: "text" },
  { key: "remarks",       label: "Instance Remarks", data_type: "text" },
];

// Known operational values for heuristic classification of plain-string options
const KNOWN_OPERATIONAL_VALUES = new Set(["working", "good", "new", "active", "operational"]);

/**
 * Classify a single remark/condition value given a column's options array.
 * Returns "operational" | "quarantine".
 * Works with both classified objects [{value, conditionGroup}] and plain strings.
 */
export const classifyConditionOption = (value, columnOptions) => {
  if (!value || !columnOptions || !Array.isArray(columnOptions)) return "quarantine";
  const needle = String(value).trim().toLowerCase();
  const match = columnOptions.find((o) => {
    const v = (o && typeof o === "object" && "value" in o) ? String(o.value) : String(o);
    return v.trim().toLowerCase() === needle;
  });
  if (match && typeof match === "object" && "conditionGroup" in match) {
    return match.conditionGroup === "operational" ? "operational" : "quarantine";
  }
  return KNOWN_OPERATIONAL_VALUES.has(needle) ? "operational" : "quarantine";
};

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
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    try {
      await onSave(form);
    } finally {
      setIsSaving(false);
    }
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto inventory-modal-scrollbar rounded-[28px] sm:rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 rounded-t-xl">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{column ? "Edit column" : "Add column"}</h3>
            <p className="text-sm text-muted-foreground">Define a custom column for this tab.</p>
          </div>
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
            <Select
              value={form.fieldType}
              onValueChange={(v) =>
                setForm((c) => ({
                  ...c,
                  fieldType: v,
                  data_type: v === "number" ? "int" : v === "date" ? "date" : "text",
                }))
              }
            >
              <SelectTrigger className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text Input</SelectItem>
                <SelectItem value="dropdown">Dropdown</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.fieldType === "dropdown" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dropdown Options</label>
              <div className="flex gap-2">
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
                  className="rounded-md bg-[#4a1111] px-3 py-2 text-xs font-medium text-white hover:bg-[#3f0f0f]"
                >
                  Add
                </button>
              </div>

              {form.options.length > 0 && (
                <div className="space-y-1">
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
              <Checkbox
                checked={Boolean(form.hasSubColumns)}
                onCheckedChange={(v) => setForm((c) => ({ ...c, hasSubColumns: Boolean(v) }))}
              />
              <span className="select-none">Add sub fields</span>
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
                      className="rounded-md bg-[#4a1111] px-3 py-2 text-xs font-medium text-white hover:bg-[#3f0f0f]"
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
                              <Select
                                value={subCol.fieldType || "text"}
                                onValueChange={(v) =>
                                  setForm((c) => ({
                                    ...c,
                                    subColumns: c.subColumns.map((sc) =>
                                      sc.key === subCol.key
                                        ? {
                                            ...sc,
                                            fieldType: v,
                                            options: v === "dropdown" ? sc.options || [] : [],
                                            data_type: v === "number" ? "int" : v === "date" ? "date" : "text",
                                          }
                                        : sc
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text Input</SelectItem>
                                  <SelectItem value="dropdown">Dropdown</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                </SelectContent>
                              </Select>
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

        <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 px-5 py-4 backdrop-blur-sm rounded-b-xl">
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-[#4a1111] hover:bg-[#3f0f0f] text-white rounded-lg px-6"
          >
            {isSaving && (
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            )}
            {isSaving ? "Saving..." : "Save Column"}
          </button>
        </div>

        {isSaving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] sm:rounded-lg bg-white/80 backdrop-blur-sm !m-0 !p-0">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-slate-950/95 px-5 py-4 text-sm font-medium text-white shadow-lg">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
              Saving column...
            </div>
          </div>
        )}
      </div>

      {showDiscardConfirm && (
        <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. If you close now, those changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3">
              <AlertDialogCancel onClick={cancelDiscard} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">
                Keep Editing
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDiscard} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-6">
                Discard
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showSaveConfirm && (
        <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Save changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to save these changes?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3">
              <AlertDialogCancel disabled={isSaving} onClick={cancelSave} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-[#4a1111] hover:bg-[#3f0f0f] text-white rounded-lg px-6"
              >
                {isSaving ? "Saving..." : "Save"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function SectionModal({ section, onClose, onSave }) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    try {
      await onSave(form);
    } finally {
      setIsSaving(false);
    }
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
      <div className="relative flex w-full max-w-xl max-h-[90vh] flex-col gap-0 overflow-hidden rounded-[28px] sm:rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{section ? "Edit section" : "Add section"}</h3>
            <p className="text-sm text-slate-500">Sections belong to a tab and hold the inventory items.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto inventory-modal-scrollbar grid gap-4 px-6 py-5">
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

        <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur-sm">
          <Button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            variant="outline"
            size="sm"
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={requestSave}
            disabled={isSectionSaveDisabled || isSaving}
            size="sm"
            className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
          >
            {isSaving && (
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            )}
            {isSaving ? "Saving..." : "Save Section"}
          </Button>
        </div>

        {isSaving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm !m-0 !p-0">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-slate-950/95 px-5 py-4 text-sm font-medium text-white shadow-lg">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
              Saving section...
            </div>
          </div>
        )}
      </div>

      {showDiscardConfirm && (
        <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. If you close now, those changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">Keep Editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDiscard}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-6"
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showSaveConfirm && (
        <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Save changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to save these changes?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3">
              <AlertDialogCancel disabled={isSaving} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-[#4a1111] hover:bg-[#3f0f0f] text-white rounded-lg px-6"
              >
                {isSaving ? "Saving..." : "Save"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Template category grouping (for flat display, one card per template) ───
const TEMPLATE_DISPLAY_ORDER = [
  "import-csv",
  "computing-devices",
  "displays",
  "peripherals",
  "power-cables",
  "storage-networking",
  "custom",
];

// ─── Field type badge colors ───
const FIELD_TYPE_COLORS = {
  text: "bg-slate-100 text-slate-600",
  dropdown: "bg-violet-100 text-violet-700",
  number: "bg-emerald-100 text-emerald-700",
  date: "bg-amber-100 text-amber-700",
};

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
  const [editingColumnSectionKey, setEditingColumnSectionKey] = useState(null); // section name when editing in Step 4
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [sectionToEdit, setSectionToEdit] = useState(null);
  const [columnToEdit, setColumnToEdit] = useState(null);
  const [isTabNameTouched, setIsTabNameTouched] = useState(false);
  const [tabType, setTabType] = useState("legacy");

  // Wizard step state for new tabs
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Per-section columns: { [sectionName]: ColumnDef[] }
  const [sectionColumns, setSectionColumns] = useState({});
  const [activeSectionTab, setActiveSectionTab] = useState(0);

  // Fetched brands from Supabase
  const [availableBrands, setAvailableBrands] = useState([]);

  // CSV / File import state
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // { headers: string[], rows: string[][] }
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const isNewTab = !tab?.id;
  const isImportTemplate = selectedTemplate?.isImportTemplate === true;
  const STEPS = isNewTab
    ? isImportTemplate
      ? [
        { num: 1, label: "Choose Template" },
        { num: 2, label: "Basic Info" },
        { num: 3, label: "Upload File" },
        { num: 4, label: "Map Columns" },
        { num: 5, label: "Review" },
      ]
      : [
        { num: 1, label: "Choose Template" },
        { num: 2, label: "Basic Info" },
        { num: 3, label: "Sections" },
        { num: 4, label: "Section Columns" },
        { num: 5, label: "Review" },
      ]
    : [
      { num: 1, label: "Basic Info" },
      { num: 2, label: "Sections" },
      { num: 3, label: "Section Columns" },
      { num: 4, label: "Review" },
    ];

  const stepIcons = isNewTab
    ? isImportTemplate
      ? [
        { key: "template", Icon: LayoutTemplate },
        { key: "basic", Icon: FileText },
        { key: "upload", Icon: Upload },
        { key: "columns", Icon: Columns2 },
        { key: "review", Icon: CheckCircle },
      ]
      : [
        { key: "template", Icon: LayoutTemplate },
        { key: "basic", Icon: FileText },
        { key: "sections", Icon: FolderOpen },
        { key: "section-columns", Icon: Columns2 },
        { key: "review", Icon: CheckCircle },
      ]
    : [
      { key: "basic", Icon: FileText },
      { key: "sections", Icon: FolderOpen },
      { key: "section-columns", Icon: Columns2 },
      { key: "review", Icon: CheckCircle },
    ];

  const canProceed = () => {
    const currentStep = wizardStep;
    // Edit flow: Step 1 = Basic Info, Step 2 = Sections, Step 3 = Section Columns, Step 4 = Review
    if (!isNewTab) {
      if (currentStep === 1 || currentStep === 2) {
        const name = tabForm.name.trim();
        return name && hasOnlyLettersNumbers(name);
      }
      if (currentStep === 3) {
        return sections.length > 0;
      }
      if (currentStep === 4) {
        return Object.values(sectionColumns).some((cols) => cols.length > 0);
      }
      return true;
    }
    // New tab flow
    if (currentStep === 1) {
      return selectedTemplate !== null;
    }
    if (currentStep === 2) {
      const name = tabForm.name.trim();
      return name && hasOnlyLettersNumbers(name);
    }
    if (currentStep === 3) {
      if (isImportTemplate) {
        return importPreview !== null && importPreview.headers.length > 0;
      }
      return sections.length > 0;
    }
    if (currentStep === 4) {
      if (isImportTemplate) {
        return true; // step 4 is review for import
      }
      // Section columns step — at least one section must have columns
      return Object.values(sectionColumns).some((cols) => cols.length > 0);
    }
    return true;
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setActiveSectionTab(0);
    if (template.id === "custom") {
      setSections([]);
      setSectionColumns({});
      setAvailableBrands([]);
    } else if (template.isImportTemplate) {
      setSections([]);
      setSectionColumns({});
      setImportPreview(null);
      setImportFile(null);
      setAvailableBrands([]);
    } else {
      setSections(template.sections.map((s, i) => ({ ...s, sort_order: i + 1 })));
      // Build sectionColumns map from template; merged columns = union of all section columns
      const secCols = {};
      const merged = [];
      const seenKeys = new Set();
      for (const sec of template.sections) {
        const cols = (template.sectionColumns?.[sec.name] || []).map((c) => ({ ...c }));
        secCols[sec.name] = cols;
        for (const c of cols) {
          if (!seenKeys.has(c.key)) {
            seenKeys.add(c.key);
            merged.push({ ...c });
          }
        }
      }
      setSectionColumns(secCols);
      setColumns(merged);
      setAvailableBrands(Array.isArray(template.brands) ? template.brands : []);
    }
    setWizardStep(2);
  };

  // ── CSV / File import helpers ──
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1, 6).map(parseLine); // preview first 5 data rows
    return { headers, rows };
  };

  const handleImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError("");
    setImportPreview(null);
    setImportFile(file);

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    const isExcel = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

    if (!isCSV && !isExcel) {
      setImportError("Please upload a .csv, .xlsx, or .xls file.");
      return;
    }

    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result;
          if (typeof text !== "string") {
            setImportError("Failed to read file.");
            return;
          }
          const parsed = parseCSV(text);
          if (parsed.headers.length === 0) {
            setImportError("No headers found in the CSV file.");
            return;
          }
          setImportPreview(parsed);
        } catch {
          setImportError("Failed to parse CSV file.");
        }
      };
      reader.onerror = () => setImportError("Failed to read file.");
      reader.readAsText(file);
    } else {
      // For Excel files, we parse as CSV by reading the first sheet
      // Since we can't add a heavy dependency, we'll instruct the user to save as CSV
      setImportError("For Excel files, please save as .csv format first, or use the CSV upload option.");
    }

    // Reset input so the same file can be re-selected
    event.target.value = "";
  };

  const applyImportToWizard = () => {
    if (!importPreview) return;

    const headerToKey = (h) =>
      h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    const allSections = importPreview._allSections || [];

    // Build sections: one per detected file section (or fall back to one)
    const newSections = allSections.length > 0
      ? allSections.map((sec, idx) => ({
          name: sec.name || `Section ${idx + 1}`,
          description: "Imported from file",
          sort_order: idx + 1,
        }))
      : [{ name: tabForm.name.trim() || "Imported Section", description: "Imported from file", sort_order: 1 }];

    // Build columns: merge all unique headers across all sections
    // Skip auto-generated identifier columns (serial number, row id, etc.)
    const seenKeys = new Set();
    const mergedColumns = [];
    for (const sec of allSections) {
      for (const header of (sec.headers || [])) {
        const key = headerToKey(header);
        if (key && !seenKeys.has(key) && key !== "serial_number" && key !== "id" && key !== "row_number") {
          seenKeys.add(key);
          mergedColumns.push({
            key,
            label: header,
            data_type: "text",
            visible: true,
            fieldType: "text",
            options: [],
          });
        }
      }
    }
    // Fallback if no _allSections data (backwards compat)
    if (mergedColumns.length === 0) {
      for (const header of (importPreview.headers || [])) {
        const key = headerToKey(header);
        if (key && !seenKeys.has(key) && key !== "serial_number" && key !== "id" && key !== "row_number") {
          seenKeys.add(key);
          mergedColumns.push({ key, label: header, data_type: "text", visible: true, fieldType: "text", options: [] });
        }
      }
    }

    setSections(newSections);
    setColumns(mergedColumns);
  };

  const handleNext = () => {
    // If on the import step (step 3) and using import template, apply the import before moving on
    if (isNewTab && wizardStep === 3 && selectedTemplate?.isImportTemplate) {
      if (importPreview && importPreview.headers.length > 0) {
        applyImportToWizard();
      }
    }
    if (wizardStep < STEPS.length) {
      setWizardStep((step) => step + 1);
    }
  };

  const handlePrev = () => {
    if (wizardStep > 1) {
      setWizardStep((step) => step - 1);
    }
  };

  const tabValidation = useMemo(() => {
    const errors = { name: "", sections: "", columns: "" };
    const trimmedName = String(tabForm.name || "").trim();

    if (!trimmedName) {
      errors.name = "Tab name is required.";
    } else if (!hasOnlyLettersNumbers(trimmedName)) {
      errors.name = "Tab name may only contain letters, numbers, and spaces.";
    }

    if (sections.length === 0) {
      errors.sections = "At least one section is required.";
    }

    if (isNewTab && columns.length === 0) {
      errors.columns = "At least one column is required.";
    }

    return errors;
  }, [tabForm.name, columns, sections, isNewTab]);

  const isSaveDisabled = Boolean(tabValidation.name || tabValidation.sections || tabValidation.columns || isSaving);

  const buildTabSnapshot = (currentTabForm, currentSections, currentColumns, currentSectionColumns, currentBrands) =>
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
      columns: (currentColumns || []).map((column) => ({
        id: column?.id || null,
        key: String(column?.key || ""),
        label: String(column?.label || ""),
        data_type: String(column?.data_type || column?.type || "text"),
        visible: column?.visible !== false,
        fieldType: String(column?.fieldType || "text"),
        options: Array.isArray(column?.options) ? column.options : [],
        subColumns: Array.isArray(column?.subColumns)
          ? column.subColumns.map((subColumn) => ({
              key: String(subColumn?.key || ""),
              label: String(subColumn?.label || ""),
              fieldType: String(subColumn?.fieldType || "text"),
              options: Array.isArray(subColumn?.options) ? subColumn.options : [],
            }))
          : [],
      })),
      sectionColumns: currentSectionColumns || {},
      brands: Array.isArray(currentBrands) ? currentBrands : [],
    });

  const hasUnsavedChanges =
    initialSnapshotRef.current !== buildTabSnapshot(tabForm, sections, columns, sectionColumns, availableBrands);

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
    setSectionColumns({});
    setActiveSectionTab(0);
    setEditingSectionIndex(null);
    setEditingColumnIndex(null);
    setSectionToEdit(null);
    setColumnToEdit(null);
    setShowSectionModal(false);
    setShowColumnModal(false);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
    setIsTabNameTouched(false);
    setHasUserInteracted(false);
    initialSnapshotRef.current = buildTabSnapshot(nextTabForm, nextSections, nextColumns);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    const loadTabConfig = async () => {
      if (!tab?.id) return;

      try {
        const config = await getTabTableConfig(tab.id);
        if (!cancelled) {
          if (config?.columns) {
            setColumns((config.columns || []).filter((column) => column && column.key).map((column) => normalizeColumnConfig(column)));
          }
          // Load per-section columns map (keyed by section name for the wizard UI)
          if (config?.sectionColumns) {
            const byName = {};
            for (const [secId, secCols] of Object.entries(config.sectionColumns)) {
              // Find the section name from the tab's sections
              const sec = (tab.sections || []).find((s) => String(s.id) === String(secId));
              if (sec) {
                byName[sec.name] = secCols;
              }
            }
            setSectionColumns(byName);
          }
          // Load template-specific brands
          if (Array.isArray(config?.brands)) {
            setAvailableBrands(config.brands);
          }
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

  // Brand fetching is handled by:
  //   - handleTemplateSelect() for new tabs (template-specific brands)
  //   - loadTabConfig() for existing tabs (brands from DB config)
  // The legacy fetch from inventory_items is no longer needed.

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

  const deleteColumn = async (index) => {
    const columnToDelete = columns[index];
    if (!columnToDelete || !columnToDelete.key) {
      setColumns((currentColumns) => currentColumns.filter((_, currentIndex) => currentIndex !== index));
      if (editingColumnIndex === index) setEditingColumnIndex(null);
      return;
    }

    try {
      // If we have an existing table, drop the column immediately
      if (tab && tab.id) {
        const tableName = await getTabTableName(tab.id);
        if (tableName) {
          const dropColumnsEndpoint = getInventoryDropColumnsEndpoint();
          await callDropInventoryColumns(dropColumnsEndpoint, tableName, [columnToDelete.key]);
        }
      }
    } catch (error) {
      console.warn("Failed to drop column immediately, will drop on save:", error);
      // Continue with UI update - will be cleaned up on save
    }

    setColumns((currentColumns) => currentColumns.filter((_, currentIndex) => currentIndex !== index));
    if (editingColumnIndex === index) setEditingColumnIndex(null);
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
    return onSave({ ...tabForm, sections, columns, sectionColumns, brands: availableBrands, _importData: importPreview });
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

  const requestSave = async () => {
    setHasUserInteracted(true);
    if (tabValidation.name || tabValidation.columns || tabValidation.sections) {
      return;
    }

    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    setIsSaving(true);
    try {
      await handleSaveTab();
    } finally {
      setIsSaving(false);
    }
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

  const tabTitleStickyClass = isNewTab ? "sticky top-[4.5rem] z-20 border-b border-slate-200 bg-slate-50/95 px-6 py-5 sm:px-8 backdrop-blur-sm" : "sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 px-6 py-5 sm:px-8 backdrop-blur-sm";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
      <div className="relative flex w-full max-w-2xl max-h-[85vh] flex-col gap-0 overflow-hidden rounded-[28px] sm:rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex-1 overflow-y-auto inventory-modal-scrollbar">
          {/* Wizard Stepper */}
          {isNewTab && (
            <div className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-slate-50 px-6 pt-5 pb-4 sm:px-8">
              <div className="flex items-center justify-center">
                {STEPS.map((step, idx) => {
                  const stepNum = idx + 1;
                  const isActive = wizardStep === stepNum;
                  const isCompleted = wizardStep > stepNum;
                  const { Icon } = stepIcons[idx];

                  return (
                    <div key={stepIcons[idx].key} className="flex shrink-0 items-center">
                      <div className="flex w-[88px] flex-col items-center gap-1.5 text-center">
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
                            "w-full whitespace-nowrap text-[11px] font-medium leading-none tracking-wide text-center",
                            isActive && "text-[#4a1111]",
                            isCompleted && "text-[#4a1111]/60",
                            !isActive && !isCompleted && "text-slate-400"
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div
                          className={cn(
                            "mx-2 mb-5 h-0.5 w-8 rounded-full transition-colors",
                            wizardStep > stepNum ? "bg-[#4a1111]" : "bg-slate-200"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className={tabTitleStickyClass}>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {tab
                  ? `Edit: ${tab.name}`
                  : wizardStep === 1
                    ? "Create New Inventory"
                    : `Step ${wizardStep}: ${STEPS[wizardStep - 1]?.label || ""}`}
              </h3>
              {!tab && (
                <p className="mt-1 text-sm text-slate-500">
                  {wizardStep === 1
                    ? "Choose a parent template or start from scratch"
                    : wizardStep === 2
                      ? "Give your inventory a name"
                      : wizardStep === 3
                        ? isImportTemplate
                          ? "Upload a CSV file to import your inventory structure"
                          : "Organize items into sections"
                        : wizardStep === 4
                          ? isImportTemplate
                            ? "Review auto-mapped columns from your file"
                            : "Define columns for each section"
                          : "Review and save your inventory"}
                </p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto inventory-modal-scrollbar">
            {/* Wizard Step Content */}
            {isNewTab && wizardStep === 1 && (
              <div className="p-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {TEMPLATE_DISPLAY_ORDER.map((id) => {
                    const template = INVENTORY_TEMPLATES.find((t) => t.id === id);
                    if (!template) return null;
                    const totalCols = Object.values(template.sectionColumns || {}).reduce((n, cols) => n + cols.length, 0);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => handleTemplateSelect(template)}
                        className={`group relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all hover:border-[#4a1111] hover:shadow-md ${
                          selectedTemplate?.id === template.id
                            ? "border-[#4a1111] bg-rose-50 shadow-sm ring-1 ring-[#4a1111]/20"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex w-full items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-[#4a1111]/10 group-hover:text-[#4a1111]">
                            {template.icon && <template.icon className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-slate-900">{template.name}</h4>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{template.description}</p>
                          </div>
                        </div>
                        {template.isImportTemplate && (
                          <span className="mt-3 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                            CSV / Excel upload
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Basic Info (for new tabs) or default form */}
            {((isNewTab && wizardStep === 2) || !isNewTab) && (
              <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tab name</label>
                  <Input
                    className={`mt-2 ${isTabNameTouched
                        ? tabValidation.name
                          ? "border-red-500 bg-red-50 focus:border-red-500"
                          : "border-green-500 bg-green-50 focus:border-green-500"
                        : ""
                      }`}
                    value={tabForm.name}
                    onChange={(event) => {
                      const capitalized = event.target.value.replace(/\b\w/g, (char) => char.toUpperCase());
                      setTabForm((current) => ({ ...current, name: capitalized }));
                      setHasUserInteracted(true);
                    }}
                    onBlur={() => {
                      setTabForm((current) => ({
                        ...current,
                        name: current.name.replace(/\b\w/g, (char) => char.toUpperCase()),
                      }));
                      setIsTabNameTouched(true);
                    }}
                    placeholder=""
                  />
                  {isTabNameTouched && hasUserInteracted && tabValidation.name ? (
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
            )}

            {/* Sections step — new tab step 3, edit flow step 2 */}
            {((isNewTab && wizardStep === 3) || (!isNewTab && wizardStep === 2)) && tabType === "legacy" && (
              <div className="border-t border-slate-200 px-5 py-5">
                {isNewTab && isImportTemplate && wizardStep === 3 ? (
                  // ── Smart Importer: handles .xlsx, .csv with noise stripping, multi-section, inline edit ──
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Upload Inventory File</h4>
                        <p className="mt-1 text-xs text-slate-500">Upload a CSV or Excel file. Banners, footers, and metadata will be stripped automatically.</p>
                      </div>
                    </div>
                    <SmartImporter
                      onSave={(activeSections) => {
                        if (!activeSections || activeSections.length === 0) return;

                        const headerToKey = (h) =>
                          h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

                        // Create one wizard section per detected file section
                        const newSections = activeSections.map((sec, idx) => ({
                          name: sec.name || `Section ${idx + 1}`,
                          description: `Imported from file`,
                          sort_order: idx + 1,
                        }));

                        // Merge all unique headers across ALL sections into one column set.
                        // Each section may have different columns; the DB table needs every column.
                        // Skip auto-generated identifier columns (serial number, row id, etc.)
                        const seenKeys = new Set();
                        const mergedColumns = [];
                        for (const sec of activeSections) {
                          for (const header of (sec.headers || [])) {
                            const key = headerToKey(header);
                            if (key && !seenKeys.has(key) && key !== "serial_number" && key !== "id" && key !== "row_number") {
                              seenKeys.add(key);
                              mergedColumns.push({
                                key,
                                label: header,
                                data_type: "text",
                                visible: true,
                                fieldType: "text",
                                options: [],
                              });
                            }
                          }
                        }

                        // Strip serial-number values from row data so they don't leak
                        // into the review preview or bulk insert payload.
                        const skipKeys = new Set(["serial_number", "id", "row_number"]);
                        const cleanedSections = activeSections.map((sec) => {
                          const keepColIdx = (sec.headers || []).map((h, i) => {
                            const key = headerToKey(h);
                            return key && !skipKeys.has(key) ? i : -1;
                          }).filter((i) => i >= 0);
                          return {
                            ...sec,
                            headers: keepColIdx.map((i) => sec.headers[i]),
                            rows: sec.rows.map((row) => keepColIdx.map((i) => row[i])),
                          };
                        });

                        // Store the full parsed data for the review step + bulk insert.
                        // _allSections retains each section's original headers so the bulk
                        // insert can map values to the correct DB columns per-section.
                        setImportPreview({
                          headers: mergedColumns.map((c) => c.label),
                          rows: cleanedSections[0].rows,
                          _allSections: cleanedSections,
                        });
                        setSections(newSections);
                        setColumns(mergedColumns);

                        const totalRows = activeSections.reduce((n, s) => n + s.rows.length, 0);
                        const totalCols = mergedColumns.length;
                        toast.success(
                          `Detected ${activeSections.length} section(s) · ${totalRows} rows · ${totalCols} columns`
                        );
                      }}
                      onCancel={() => {
                        setImportPreview(null);
                        setImportFile(null);
                      }}
                    />
                  </div>
                ) : (
                  // ── Normal Sections UI ──
                  <div>
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
                        className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f0f0f]"
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
                              <tr key={currentSection.id || currentSection.slug || index} className="even:bg-slate-50/50 hover:bg-slate-50">
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
              )}
              </div>
            )}

            {/* Section Columns editor: new tab step 4, edit tab step 3 */}
            {((isNewTab && wizardStep === 4) || (!isNewTab && wizardStep === 3)) && !isImportTemplate && (
              <div className="p-5 space-y-4">
                {sections.length === 0 ? (
                  <p className="text-sm text-slate-400">No sections defined. Go back to Step 3 to add sections first.</p>
                ) : (
                  <div className="space-y-4">
                    {/* Section tab strip */}
                    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                      {sections.map((sec, idx) => (
                        <button
                          key={sec.id || sec.slug || idx}
                          type="button"
                          onClick={() => setActiveSectionTab(idx)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                            activeSectionTab === idx
                              ? "bg-[#4a1111] text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {sec.name}
                          <span className="ml-1.5 text-[10px] opacity-70">
                            ({(sectionColumns[sec.name] || []).length})
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Active section column editor */}
                    {sections[activeSectionTab] && (() => {
                      const secName = sections[activeSectionTab].name;
                      const secCols = sectionColumns[secName] || [];
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-sm font-semibold text-slate-700">
                              {secName} — {secCols.length} field{secCols.length !== 1 ? "s" : ""}
                            </h5>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs"
                              onClick={() => {
                                setColumnToEdit(null);
                                setEditingColumnIndex(null);
                                setEditingColumnSectionKey(secName);
                                setShowColumnModal(true);
                              }}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Add Field
                            </Button>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                <tr>
                                  <th className="px-4 py-3">Field Name</th>
                                  <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {secCols.length === 0 ? (
                                  <tr>
                                    <td className="px-4 py-8 text-center text-slate-500" colSpan={2}>
                                      No fields defined for this section. Click "Add Field" to start.
                                    </td>
                                  </tr>
                                ) : (
                                  secCols.map((col, colIdx) => (
                                    <tr key={col.id || col.key || colIdx} className="even:bg-slate-50/50 hover:bg-slate-50">
                                      <td className="px-4 py-3 text-slate-600">{col.label}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setColumnToEdit({ ...col });
                                              setEditingColumnIndex(colIdx);
                                              setEditingColumnSectionKey(secName);
                                              setShowColumnModal(true);
                                            }}
                                            className={iconButtonClass}
                                            title="Edit Field"
                                          >
                                            <Edit className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSectionColumns((prev) => {
                                                const updated = { ...prev };
                                                updated[secName] = (updated[secName] || []).filter((_, i) => i !== colIdx);
                                                return updated;
                                              });
                                            }}
                                            className={iconButtonClass}
                                            title="Delete Field"
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
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Edit flow: Step 4 = Review */}
            {!isNewTab && wizardStep === 4 && (
              <div className="border-t border-slate-200 px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Review</h4>
                    <p className="mt-1 text-sm text-slate-500">Review your sections and columns before saving.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Sections ({sections.length})
                    </h5>
                    <div className="mt-3 space-y-2">
                      {sections.length === 0 ? (
                        <p className="text-sm text-slate-400">No sections defined.</p>
                      ) : (
                        sections.map((sec, idx) => {
                          const secCols = sectionColumns[sec.name] || [];
                          return (
                            <div key={sec.id || sec.slug || idx} className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="text-sm font-medium text-slate-900">{sec.name}</p>
                              <p className="text-xs text-slate-500">
                                {secCols.length} field{secCols.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Columns ({columns.length})
                    </h5>
                    <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto">
                      {columns.length === 0 ? (
                        <p className="text-sm text-slate-400">No columns defined.</p>
                      ) : (
                        columns.map((col, idx) => (
                          <div key={col.id || col.key || idx} className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900">{col.label}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4 for import template = Review columns */}
            {isNewTab && wizardStep === 4 && isImportTemplate && (
              <div className="border-t border-slate-200 px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Review Mapped Columns</h4>
                    <p className="mt-1 text-sm text-slate-500">Review auto-mapped columns from your file before saving.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 max-h-[320px] overflow-y-auto">
                  {columns.length === 0 ? (
                    <p className="text-sm text-slate-400">No columns mapped.</p>
                  ) : (
                    columns.map((currentColumn, index) => (
                      <div key={currentColumn.id || currentColumn.key || index} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-900">{currentColumn.label}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Review (new tab, non-import) */}
            {isNewTab && wizardStep === 5 && !isImportTemplate && (
              <div className="border-t border-slate-200 px-5 py-5">
                

                <div className="mt-4 space-y-4">
                  {sections.map((sec, idx) => {
                    const secCols = sectionColumns[sec.name] || [];
                    return (
                      <div key={sec.id || sec.slug || idx} className="rounded-xl border border-slate-200 bg-white p-4">
                        <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {sec.name} — {secCols.length} field{secCols.length !== 1 ? "s" : ""}
                        </h5>
                        <div className="mt-3 space-y-1.5">
                          {secCols.length === 0 ? (
                            <p className="text-xs text-slate-400">No fields defined.</p>
                          ) : (
                            secCols.map((col, colIdx) => (
                              <div key={col.id || col.key || colIdx} className="rounded-lg bg-slate-50 px-3 py-1.5">
                                <span className="text-sm text-slate-700">{col.label}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sections.length === 0 && (
                  <p className="mt-4 text-sm text-slate-400">No sections defined.</p>
                )}
              </div>
            )}

            {/* Step 5: Review (import template) */}
            {isNewTab && wizardStep === 5 && isImportTemplate && (
              <div className="border-t border-slate-200 px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Review</h4>
                    <p className="mt-1 text-sm text-slate-500">Check your sections and columns before saving.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Sections ({sections.length})
                    </h5>
                    <div className="mt-3 space-y-2">
                      {sections.length === 0 ? (
                        <p className="text-sm text-slate-400">No sections defined.</p>
                      ) : (
                        sections.map((currentSection, index) => (
                          <div key={currentSection.id || currentSection.slug || index} className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900">{currentSection.name}</p>
                            <p className="text-xs text-slate-500">{currentSection.description || "No description"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Columns ({columns.length})
                    </h5>
                    <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto">
                      {columns.length === 0 ? (
                        <p className="text-sm text-slate-400">No columns defined.</p>
                      ) : (
                        columns.map((currentColumn, index) => (
                          <div key={currentColumn.id || currentColumn.key || index} className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900">{currentColumn.label}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tabType === "dynamic" && (
              <div className="flex flex-col items-center justify-center flex-1 p-10">
                <h4 className="text-lg font-semibold text-slate-900 mb-4">Dynamic Tab Creation (Coming Soon)</h4>
                <p className="text-slate-600">This feature will allow you to create dynamic inventory tabs with advanced options.</p>
              </div>
            )}
          </div>

          {/* Navigation Footer with Add Buttons */}
          <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50/95 px-6 py-4 sm:px-8 backdrop-blur-sm">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                {wizardStep > 1 && (
                  <Button
                    type="button"
                    onClick={handlePrev}
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                  >
                    Previous
                  </Button>
                )}
              </div>
              <div className="flex gap-3 sm:gap-4">
                <Button
                  type="button"
                  onClick={requestClose}
                  disabled={isSaving}
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                >
                  Cancel
                </Button>
                {isNewTab ? (
                  wizardStep > 1 && wizardStep < STEPS.length ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="sm"
                      className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
                    >
                      {wizardStep === STEPS.length - 1 ? "Review" : "Continue"}
                    </Button>
                  ) : wizardStep === STEPS.length ? (
                    <Button
                      type="button"
                      onClick={requestSave}
                      disabled={isSaveDisabled}
                      size="sm"
                      className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
                    >
                      Save Tab
                    </Button>
                  ) : null
                ) : (
                  wizardStep < STEPS.length ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="sm"
                      className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
                    >
                      {wizardStep === STEPS.length - 1 ? "Review" : "Continue"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={requestSave}
                      disabled={isSaveDisabled}
                      size="sm"
                      className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
                    >
                      Save Tab
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>

          {isSaving && Boolean(tab?.id) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm !m-0 !p-0">
              <div className="inline-flex items-center gap-3 rounded-2xl bg-slate-950/95 px-5 py-4 text-sm font-medium text-white shadow-lg">
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                Saving table...
              </div>
            </div>
          )}
        </div>

        {showDiscardConfirm && (
          <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. If you close now, those changes will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex justify-end gap-3">
                <AlertDialogCancel onClick={cancelDiscard} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">
                  Keep Editing
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmDiscard} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-6">
                  Discard
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {showSaveConfirm && (
          <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Save changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to save these changes?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex justify-end gap-3">
                <AlertDialogCancel disabled={isSaving} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmSave}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-[#4a1111] hover:bg-[#3f0f0f] text-white rounded-lg px-6"
                >
                  {isSaving ? "Saving..." : "Save"}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
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
                const name = form.name.trim();

                if (!name) {
                  alert("Section name is required.");
                  return;
                }

                const isNewSection = editingSectionIndex === null;
                const currentSection = editingSectionIndex !== null ? sections[editingSectionIndex] : null;

                setSections((currentSections) => {
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
                    nextSections[editingSectionIndex] = nextSection;
                  } else {
                    nextSections.push(nextSection);
                  }

                  // If section name changed, update sectionColumns key
                  if (currentSection && currentSection.name !== name) {
                    setSectionColumns((prev) => {
                      const updated = { ...prev };
                      if (updated[currentSection.name]) {
                        updated[name] = updated[currentSection.name];
                        delete updated[currentSection.name];
                      }
                      return updated;
                    });
                  }

                  return nextSections;
                });

                // Auto-populate default columns for new sections
                if (isNewSection) {
                  setSectionColumns((prev) => ({
                    ...prev,
                    [name]: DEFAULT_SECTION_COLUMNS.map((c) => ({ ...c })),
                  }));
                }

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
              setEditingColumnSectionKey(null);
            }}
            onSave={(colForm) => {
              try {
                const label = (colForm.label || "").trim();

                if (!label) {
                  alert("Column name is required.");
                  return;
                }

                // Auto-generate key from label if not provided
                const labelToKey = (l) => l.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                const key = labelToKey(label);

                if (!key) {
                  alert("Column name contains only special characters. Please use alphanumeric characters.");
                  return;
                }

                const nextColumn = normalizeColumnConfig({ ...colForm, key, label });

                // If editing within a section (Step 4), update sectionColumns
                if (editingColumnSectionKey) {
                  setSectionColumns((prev) => {
                    const updated = { ...prev };
                    const secCols = [...(updated[editingColumnSectionKey] || [])];
                    if (editingColumnIndex !== null && secCols[editingColumnIndex]) {
                      secCols[editingColumnIndex] = nextColumn;
                    } else {
                      secCols.push(nextColumn);
                    }
                    updated[editingColumnSectionKey] = secCols;
                    return updated;
                  });
                  // Also update merged columns union
                  setColumns((currentColumns) => {
                    const existingKeys = new Set(currentColumns.map((c) => c.key));
                    if (!existingKeys.has(nextColumn.key)) {
                      return [...currentColumns, nextColumn];
                    }
                    return currentColumns;
                  });
                } else {
                  setColumns((currentColumns) => {
                    const next = [...currentColumns];
                    if (editingColumnIndex !== null && next[editingColumnIndex]) {
                      next[editingColumnIndex] = nextColumn;
                    } else {
                      next.push(nextColumn);
                    }
                    return next;
                  });
                }

                setShowColumnModal(false);
                setColumnToEdit(null);
                setEditingColumnIndex(null);
                setEditingColumnSectionKey(null);
              } catch (err) {
                console.error("Error saving column:", err);
                alert(`Error saving column: ${err.message}`);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Inventory() {
  const { tabs, loading, error, refetch } = useInventoryCatalog();
  const { showGlobalLoader, hideGlobalLoader } = useAuth();
  const navigate = useNavigate();
  const [computerLaboratoryCount, setComputerLaboratoryCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [exportRetentionDays, setExportRetentionDays] = useState(30);
  const [savingExportRetention, setSavingExportRetention] = useState(false);
  const [cleaningExportLogs, setCleaningExportLogs] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteTab, setPendingDeleteTab] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 7;
  const [showComlabEditModal, setShowComlabEditModal] = useState(false);
  const [comlabList, setComlabList] = useState([]);
  const [comlabLoading, setComlabLoading] = useState(false);
  const [comlabAddName, setComlabAddName] = useState("");
  const [comlabAdding, setComlabAdding] = useState(false);
  const [comlabDeleteTarget, setComlabDeleteTarget] = useState(null);
  const [comlabEditTarget, setComlabEditTarget] = useState(null);
  const [comlabEditName, setComlabEditName] = useState("");
  const [comlabSaving, setComlabSaving] = useState(false);
  const comlabDescription = "CSTA Computer Laboratories";

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
    const creatingNewTab = !currentTab;
    let savedTab = null;

    if (creatingNewTab) {
      showGlobalLoader("Creating a new inventory...");
    } else {
      showGlobalLoader("Saving inventory...");
    }

    try {
      savedTab = await upsertInventoryTab({
        id: currentTab?.id,
        name: form.name.trim(),
        slug: form.slug || form.name,
        description: form.description.trim(),
        sort_order: currentTab?.sort_order || tabs.length + 1,
      });

      const existingSections = currentTab?.sections || [];
      const keptSectionIds = [];

      const savedSectionIdMap = new Map(); // section name → saved section ID
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
        savedSectionIdMap.set(section.name, savedSection.id);
      }

      for (const section of existingSections) {
        if (!keptSectionIds.includes(section.id)) {
          await deleteInventorySection(section.id);
        }
      }

      // Build sectionColumns map keyed by section ID (not name, for stable lookup)
      const sectionColumnsById = {};
      for (const [secName, secCols] of Object.entries(form.sectionColumns || {})) {
        const secId = savedSectionIdMap.get(secName);
        if (secId) {
          sectionColumnsById[secId] = secCols;
        }
      }

      // Handle column modifications for existing tabs
      if (currentTab) {
        try {
          // Get the existing tab config to compare columns
          const existingConfig = await getTabTableConfig(currentTab.id);
          const existingColumns = (existingConfig?.columns || []).filter(col => col && col.key);
          const updatedColumns = (form.columns || [])
            .filter((col) => col && col.key)
            .map((col) => normalizeColumnConfig(col));
          const existingBrands = Array.isArray(existingConfig?.brands) ? existingConfig.brands : [];
          const wizardBrands = Array.isArray(form.brands) ? form.brands : existingBrands;
          const tabConfig = { tableName: existingConfig?.tableName, columns: updatedColumns, sectionColumns: sectionColumnsById, brands: wizardBrands };

          const tableName = existingConfig?.tableName;
          if (tableName) {
            const modifyEndpoint = getInventoryModifyTableEndpoint();

            // Create maps for easy comparison
            const existingColumnMap = new Map();
            existingColumns.forEach(col => {
              if (col.key) existingColumnMap.set(col.key, col);
            });

            const updatedColumnMap = new Map();
            updatedColumns.forEach(col => {
              if (col.key) updatedColumnMap.set(col.key, col);
            });

            // Determine which columns to add and which to remove
            const columnsToAdd = [];
            const columnsToRemove = [];

            // Find columns to add (in updated but not in existing)
            updatedColumns.forEach(col => {
              if (!existingColumnMap.has(col.key)) {
                columnsToAdd.push({ key: col.key, type: col.data_type || col.type || "text" });
              }
            });

            // Find columns to remove (in existing but not in updated)
            existingColumns.forEach(col => {
              if (!updatedColumnMap.has(col.key)) {
                columnsToRemove.push(col.key);
              }
            });

            // Add new columns
            if (columnsToAdd.length > 0) {
              const flattenedAdd = flattenColumnsForDDL(columnsToAdd);
              await callModifyInventoryTable(modifyEndpoint, tableName, "add", flattenedAdd);
            }

            // Remove deleted columns
            if (columnsToRemove.length > 0) {
              await callModifyInventoryTable(modifyEndpoint, tableName, "remove", columnsToRemove);
            }
          }

          // Always persist the latest column config, including nested field metadata.
          try {
            window.localStorage.setItem(`inventory.tab_table.${currentTab.id}`, JSON.stringify(tabConfig));
          } catch (storageErr) {
            console.warn("Failed to update localStorage config:", storageErr);
          }

          try {
            const settingResult = await upsertSetting(`inventory.tab_table.${currentTab.id}`, tabConfig);
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
      if (creatingNewTab) {
        const tableName = `inventory_${String(savedTab.name || "tab")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_]+/g, "_")
          .replace(/^_+|_+$/g, "")}`;
        const userColumns = (form.columns || []).filter((it) => it && it.key);
        const cols = userColumns.map((it) => normalizeColumnConfig(it));

        if (!cols || cols.length === 0) {
          throw new Error("No valid columns provided for table creation.");
        }

        const endpoint = ddlEndpoint;
        const logsEndpoint = getInventoryLogsTableEndpoint();
        // Flatten columns so the Edge Function creates physical sub-columns in the DB
        const flattened = flattenColumnsForDDL(cols);

        // Create the main inventory table
        await callCreateInventoryTable(endpoint, tableName, flattened);

        // Create the corresponding logs table (non-critical: if it fails, we warn but continue)
        try {
          await callCreateInventoryLogsTable(logsEndpoint, tableName, cols);
        } catch (logsError) {
          console.warn("Failed to create logs table (non-critical):", logsError);
          alert(`Warning: Inventory table created but logs table creation failed. Error: ${logsError.message}`);
        }

        // Exports are recorded in the shared dynamic export logs table; no per-table exports creation here.

        // persist mapping and create-time template columns for this tab
        const templateBrands = Array.isArray(form.brands) ? form.brands : [];
        const tabConfig = { tableName, columns: cols, sectionColumns: sectionColumnsById, brands: templateBrands };
        try {
          window.localStorage.setItem(`inventory.tab_table.${savedTab.id}`, JSON.stringify(tabConfig));
        } catch (storageError) {
          console.warn("Failed to write tab config to localStorage:", storageError);
        }

        try {
          const settingResult = await upsertSetting(`inventory.tab_table.${savedTab.id}`, tabConfig);
        } catch (settingError) {
          console.error("Failed to persist tab config to inventory_settings:", settingError);
          // Don't rollback on settings error - the physical table was created successfully
          alert(`Warning: Table created but settings may not have saved. Error: ${settingError.message}`);
        }

        // ── Bulk-insert imported data rows (Smart Importer flow) ──────────
        const importData = form._importData;
        if (importData?._allSections?.length > 0 && keptSectionIds.length > 0) {
          // Build a lookup: header name (lowercase) → DB column key
          // This lets each section map its own headers to the right DB columns,
          // even when sections have different column sets.
          const headerToColumnKey = new Map();
          for (const col of (form.columns || [])) {
            if (col && col.key) {
              headerToColumnKey.set(String(col.label || col.key).toLowerCase().trim(), col.key);
            }
          }

          if (headerToColumnKey.size > 0) {
            showGlobalLoader("Importing data rows...");

            // Match each imported section to its corresponding saved section ID.
            const sectionIdMap = new Map();
            for (let i = 0; i < importData._allSections.length && i < keptSectionIds.length; i++) {
              sectionIdMap.set(i, keptSectionIds[i]);
            }

            for (let secIdx = 0; secIdx < importData._allSections.length; secIdx++) {
              const sectionData = importData._allSections[secIdx];
              if (!sectionData.rows || sectionData.rows.length === 0) continue;

              const sectionId = sectionIdMap.get(secIdx) || keptSectionIds[0];

              // Build a per-section column mapping: for each header in this section,
              // find the matching DB column key. Columns not present in this section
              // will be NULL in the DB row.
              const sectionColumnKeys = (sectionData.headers || []).map((h) => {
                const key = headerToColumnKey.get(String(h).toLowerCase().trim());
                return key || null; // null means this section doesn't have this column
              });

              try {
                const { inserted, errors: rowErrors } = await bulkInsertInventoryRows(
                  tableName,
                  sectionId,
                  sectionColumnKeys,
                  sectionData.rows,
                  { skipLogging: sectionData.rows.length > 200 }
                );

                if (rowErrors.length > 0) {
                  console.warn(`Import warnings for "${sectionData.name}":`, rowErrors);
                  toast.warning(
                    `${rowErrors.length} row(s) failed to import in "${sectionData.name}". Check console for details.`
                  );
                }

                if (inserted > 0) {
                  toast.success(
                    `Imported ${inserted} row(s) into "${sectionData.name}".`
                  );
                }
              } catch (importErr) {
                console.error(`Failed to import rows for "${sectionData.name}":`, importErr);
                toast.error(
                  `Table created, but data import failed for "${sectionData.name}": ${importErr.message}`
                );
              }
            }
          }
        }
      }
    } catch (err) {
      if (creatingNewTab) {
        // keep tab creation strict: rollback tab if physical table setup fails
        console.error("Table creation failed, rolling back:", err);
        try {
          if (savedTab?.id) {
            await deleteInventoryTab(savedTab.id);
          }
        } catch (rollbackError) {
          console.warn("Rollback failed after table creation error:", rollbackError);
        }

        console.warn("Failed to create physical table:", err);
        toast.error(`Tab creation failed: ${err.message || err}`);
        refetch();
        return;
      }

      console.error("Failed to save inventory tab:", err);
      toast.error(`Failed to save inventory tab: ${err.message || err}`);
      refetch();
      return;
    } finally {
      hideGlobalLoader();
    }

    // Close modal and refresh only after all operations complete successfully
    toast.success(creatingNewTab ? "Inventory created successfully." : "Inventory saved successfully.");
    setShowModal(false);
    setEditingSlug("");
    refetch();
  };

  const handleDelete = (tab) => {
    setPendingDeleteTab(tab);
    setShowDeleteConfirm(true);
  };

  const totalPages = Math.ceil(tabs.length / itemsPerPage);
  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const paginatedTabs = tabs.slice(pageStartIndex, pageEndIndex);

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
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
      return;
    }

    if (totalPages === 0 && page !== 1) {
      setPage(1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [tabs]);

  const confirmDelete = async () => {
    if (!pendingDeleteTab?.id) return;
    setIsDeleting(true);
    showGlobalLoader("Deleting inventory table...");
    try {
      await deleteInventoryTab(pendingDeleteTab.id);
      setPendingDeleteTab(null);
      refetch();
      setShowDeleteConfirm(false);
      toast.success("Inventory deleted successfully.");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error(`Delete failed: ${err.message || err}`);
    } finally {
      hideGlobalLoader();
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteTab(null);
  };

  const loadExportRetentionSetting = async () => {
    try {
      const setting = await fetchSetting("export_logs.retention_days");
      const nextValue = Number.parseInt(String(setting?.value?.days ?? setting?.value ?? 30), 10);
      if (Number.isFinite(nextValue) && nextValue > 0) {
        setExportRetentionDays(nextValue);
      }
    } catch (settingError) {
      console.warn("Failed to load export retention setting:", settingError);
    }
  };

  const runExportCleanup = async (days = exportRetentionDays) => {
    const nextDays = Number.parseInt(String(days), 10);
    if (!Number.isFinite(nextDays) || nextDays < 1) {
      throw new Error("Please enter a valid retention period in days.");
    }

    setCleaningExportLogs(true);
    setCleanupStatus("");

    try {
      const endpoint = getInventoryCleanupExportLogsEndpoint();
      const result = await callCleanupExportLogs(endpoint, nextDays);
      const deletedRows = Object.values(result?.deletedTables || {}).reduce((total, count) => total + Number(count || 0), 0);
      const deletedFiles = Number(result?.deletedFileCount || 0);
      const message = `Cleanup completed: removed ${deletedRows} log rows and ${deletedFiles} stored files.`;
      setCleanupStatus(message);
      return result;
    } finally {
      setCleaningExportLogs(false);
    }
  };

  const saveExportRetentionSetting = async () => {
    const nextDays = Number.parseInt(String(exportRetentionDays), 10);
    if (!Number.isFinite(nextDays) || nextDays < 1) {
      alert("Please enter a valid retention period in days.");
      return;
    }

    setSavingExportRetention(true);
    try {
      await upsertSetting("export_logs.retention_days", { days: nextDays });
      await runExportCleanup(nextDays);
      setShowSettingsModal(false);
    } catch (saveError) {
      console.error("Failed to save export retention setting:", saveError);
      alert(saveError?.message || "Failed to save export retention setting.");
    } finally {
      setSavingExportRetention(false);
    }
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

  useEffect(() => {
    loadExportRetentionSetting();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadComputerLaboratoryCount = async () => {
      const { data, error: countError } = await supabase.from("lab_numbers").select("id");

      if (cancelled) return;

      if (countError) {
        console.warn("Failed to load computer laboratory count:", countError.message);
        setComputerLaboratoryCount(0);
        return;
      }

      setComputerLaboratoryCount((data || []).length);
    };

    loadComputerLaboratoryCount();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Computer lab management helpers ──

  const fetchComlabList = async () => {
    setComlabLoading(true);
    try {
      const { data, error } = await supabase
        .from("lab_numbers")
        .select("id, lab_number, name")
        .order("lab_number", { ascending: true });
      if (error) throw error;
      setComlabList(data || []);
    } catch (err) {
      console.warn("Failed to load computer labs:", err.message);
    } finally {
      setComlabLoading(false);
    }
  };

  const openComlabModal = () => {
    fetchComlabList();
    setComlabAddName("");
    setComlabEditTarget(null);
    setComlabDeleteTarget(null);
    setShowComlabEditModal(true);
  };

  const handleAddComlab = async () => {
    const name = comlabAddName.trim();
    if (!name) return;
    setComlabAdding(true);
    try {
      const maxOrder = Math.max(...comlabList.map((l) => Number(l.lab_number) || 0), 0);
      const { error } = await supabase.from("lab_numbers").insert({
        lab_number: maxOrder + 1,
        name,
      });
      if (error) throw error;
      setComlabAddName("");
      await fetchComlabList();
      setComputerLaboratoryCount((c) => c + 1);
    } catch (err) {
      console.error("Failed to add lab:", err.message);
      toast.error(`Failed to add lab: ${err.message}`);
    } finally {
      setComlabAdding(false);
    }
  };

  const handleStartEditComlab = (lab) => {
    setComlabEditTarget(lab.id);
    setComlabEditName(lab.name);
  };

  const handleSaveEditComlab = async (labId) => {
    const name = comlabEditName.trim();
    if (!name) return;
    setComlabSaving(true);
    try {
      const { error } = await supabase
        .from("lab_numbers")
        .update({ name })
        .eq("id", labId);
      if (error) throw error;
      setComlabEditTarget(null);
      setComlabEditName("");
      await fetchComlabList();
    } catch (err) {
      console.error("Failed to update lab:", err.message);
      toast.error(`Failed to update lab: ${err.message}`);
    } finally {
      setComlabSaving(false);
    }
  };

  const handleDeleteComlab = async () => {
    if (!comlabDeleteTarget) return;
    try {
      const { error } = await supabase
        .from("lab_numbers")
        .delete()
        .eq("id", comlabDeleteTarget);
      if (error) throw error;
      setComlabDeleteTarget(null);
      await fetchComlabList();
      setComputerLaboratoryCount((c) => Math.max(0, c - 1));
      toast.success("Laboratory deleted.");
    } catch (err) {
      console.error("Failed to delete lab:", err.message);
      toast.error(`Failed to delete lab: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
            role="status"
            aria-label="Loading inventory tabs"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setEditingSlug("");
                setShowModal(true);
              }}
              className="gap-2 bg-[#4a1111] hover:bg-[#3f0f0f]"
            >
              <Plus className="w-4 h-4" /> Add Tab
            </Button>
            <Button
              onClick={() => setShowSettingsModal(true)}
              className="gap-2 bg-[#4a1111] hover:bg-[#3f0f0f]"
            >
              <Wrench className="w-4 h-4" /> File Export Settings
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Sections</th>
                  <th className="px-4 py-3 text-right">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                <tr
                  className="cursor-pointer even:bg-slate-50/50 hover:bg-slate-50"
                  onClick={() => navigate("/inventory/laboratory")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate("/inventory/laboratory");
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">Computer Laboratories</td>
                  <td className="px-4 py-3 text-slate-600">{comlabDescription}</td>
                  <td className="px-4 py-3 text-slate-600">{computerLaboratoryCount}</td>
                  <td className="px-4 py-3">
                    <div
                      className="flex justify-end"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={rowActionButtonClass}
                            aria-label="Open actions for Computer Laboratories"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-56"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.stopPropagation();
                              openComlabModal();
                            }}
                          >
                            <Edit className="h-4 w-4" />
                            Edit Section
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
                {paginatedTabs.map((tab) => (
                  <tr
                    key={tab.id}
                    className="cursor-pointer even:bg-slate-50/50 hover:bg-slate-50"
                    onClick={() => navigate(getTabRoute(tab))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(getTabRoute(tab));
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{tab.name}</td>
                    <td className="px-4 py-3 text-slate-600">{tab.description || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{tab.sections?.length || 0}</td>
                    <td className="px-4 py-3">
                      <div
                        className="flex justify-end"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={rowActionButtonClass}
                              aria-label={`Open actions for ${tab.name}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-56"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.stopPropagation();
                                setEditingSlug(tab.slug);
                                setShowModal(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                              Edit tab
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.stopPropagation();
                                handleDelete(tab);
                              }}
                              className="text-rose-600 focus:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete tab
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tabs.length > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
              <div className="text-sm text-slate-500">
                Showing {Math.min(pageStartIndex + 1, tabs.length)}–{Math.min(pageEndIndex, tabs.length)} of {tabs.length}
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
          )}
        </div>

        {showModal && (
          <TabModal
            tab={editingTab}
            onClose={() => {
              setShowModal(false);
              setEditingSlug("");
            }}
            onSave={handleSave}
          />
        )}

        {showDeleteConfirm && (
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete tab?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the tab and its data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex justify-end gap-3">
                <AlertDialogCancel
                  disabled={isDeleting}
                  onClick={cancelDelete}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 mt-2 sm:mt-0 rounded-lg"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-6"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {showSettingsModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
            <div className="relative flex w-full max-w-2xl max-h-[85vh] flex-col gap-0 overflow-hidden rounded-[28px] sm:rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
                <h3 className="text-lg font-semibold text-slate-900">File Export Settings</h3>
                <p className="mt-1 text-sm text-slate-500">Set how long export files should remain available before cleanup runs.</p>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Delete export files after
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      type="number"
                      min="1"
                      value={exportRetentionDays}
                      onChange={(event) => setExportRetentionDays(event.target.value)}
                      className="w-32"
                    />
                    <span className="text-sm text-slate-600">days</span>
                  </div>
                </div>

                {cleanupStatus ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    {cleanupStatus}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-8 sm:space-x-2">
                <Button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  disabled={savingExportRetention || cleaningExportLogs}
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveExportRetentionSetting}
                  disabled={savingExportRetention || cleaningExportLogs}
                  size="sm"
                  className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
                >
                  {savingExportRetention || cleaningExportLogs ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showComlabEditModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm !m-0 !p-0">
            <div className="relative flex w-full max-w-xl max-h-[85vh] flex-col gap-0 overflow-hidden rounded-[28px] sm:rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Manage Computer Laboratories</h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto inventory-modal-scrollbar px-6 py-5 space-y-5">
                {/* Add new lab */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Add Laboratory</label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={comlabAddName}
                      onChange={(e) => setComlabAddName(e.target.value)}
                      placeholder="Laboratory name (e.g., Laboratory 7)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleAddComlab}
                      disabled={!comlabAddName.trim() || comlabAdding}
                      className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f] disabled:opacity-50"
                    >
                      {comlabAdding ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </div>

                {/* Existing labs list */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"> Laboratories</label>
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {comlabLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#4a1111]" />
                      </div>
                    ) : comlabList.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">No laboratories yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {comlabList.map((lab) => (
                          <li key={lab.id} className="flex items-center gap-3 px-4 py-3">
                            {comlabEditTarget === lab.id ? (
                              <>
                                <Input
                                  value={comlabEditName}
                                  onChange={(e) => setComlabEditName(e.target.value)}
                                  className="flex-1 h-8 text-sm"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditComlab(lab.id)}
                                  disabled={!comlabEditName.trim() || comlabSaving}
                                  className="inline-flex h-8 items-center gap-1 rounded-md bg-[#4a1111] px-3 text-xs font-medium text-white hover:bg-[#3f0f0f] disabled:opacity-50"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setComlabEditTarget(null); setComlabEditName(""); }}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-900 truncate">{lab.name}</p>
                                  <p className="text-xs text-slate-400">Lab #{lab.lab_number}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditComlab(lab)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                  title="Edit lab name"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setComlabDeleteTarget(lab.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500"
                                  title="Delete lab"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur-sm">
                <Button
                  type="button"
                  onClick={() => setShowComlabEditModal(false)}
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation for lab */}
        {comlabDeleteTarget && (
          <AlertDialog open onOpenChange={() => setComlabDeleteTarget(null)}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete laboratory?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the lab and all its associated computer component data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex justify-end gap-3">
                <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteComlab}
                  className="rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );
}