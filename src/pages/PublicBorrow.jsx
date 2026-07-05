import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { createBorrowingRecord } from "@/lib/borrowingApi";
import { useInventoryItems } from "@/hooks/useInventoryItems";
import { detectItemColumns, fetchInventoryItems, getTabTableConfig } from "@/lib/inventoryApi";
import { normalizeBorrowerText } from "@/lib/borrowerAllowlistApi";
import { User, Package, CheckCircle, Search, X, Plus, Minus, ShoppingCart, Check, ArrowLeft, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SESSION_KEY = "app_session";

// ── Helpers ───────────────────────────────────────────────────────────────

const normalizeSchoolId = (value = "") => {
  const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 7);
  if (digitsOnly.length <= 2) return digitsOnly;
  return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
};

const readBorrowerAllowlist = async () => {
  if (typeof window === "undefined") return [];

  try {
    const { data, error } = await supabase
      .from("borrower_allowlist")
      .select("name, school_id")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || [])
      .map((record) => ({
        name: normalizeBorrowerText(record?.name ?? record?.full_name ?? ""),
        schoolId: normalizeSchoolId(record?.school_id ?? record?.schoolId ?? ""),
      }))
      .filter((record) => record.name || record.schoolId);
  } catch {
    return [];
  }
};

const isBorrowerAllowed = async (name = "", schoolId = "") => {
  const normalizedName = normalizeBorrowerText(name);
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedName || !normalizedSchoolId) return false;

  const allowlist = await readBorrowerAllowlist();
  return allowlist.some((record) => {
    const matchesName = record.name === normalizedName;
    const matchesSchoolId = record.schoolId === normalizedSchoolId;
    return matchesName && matchesSchoolId;
  });
};

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

const getItemRemark = (item = {}) => {
  const { remarkKey } = detectItemColumns(item);
  if (!remarkKey) return null;
  const val = item[remarkKey];
  return val != null && String(val).trim() !== "" ? String(val).trim() : null;
};

const getLiveStock = (item = {}) => {
  const fromData = Number(item.data?.quantity);
  if (Number.isFinite(fromData) && fromData >= 0) return fromData;
  const fromTop = Number(item.quantity);
  if (Number.isFinite(fromTop) && fromTop >= 0) return fromTop;
  return 0;
};

export default function PublicBorrow() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      setSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    }
  }, []);

  const displayName = session?.displayName || session?.email || "Guest";
  const displayRole = session?.role || "Visitor";
  const initials = (displayName || "").split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase();

  const [activeStep, setActiveStep] = useState(1);
  // ── Default dates: borrow now, return 3 days from now ──────────────────
  const getDefaultDates = () => {
    const now = new Date();
    const borrowDate = now.toISOString();
    const ret = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    ret.setHours(23, 59, 59, 0);
    const y = ret.getFullYear();
    const m = String(ret.getMonth() + 1).padStart(2, "0");
    const d = String(ret.getDate()).padStart(2, "0");
    return { borrowDate, expectedReturnAt: `${y}-${m}-${d}` };
  };
  const [form, setForm] = useState(() => {
    const { borrowDate, expectedReturnAt } = getDefaultDates();
    return { name: "", email: "", studentId: "", role: "", borrowDate, expectedReturnAt };
  });
  const [formErrors, setFormErrors] = useState({});
  const [customItemForm, setCustomItemForm] = useState({ name: "", brand: "", quantity: 1, condition: "Working", remarks: "" });
  const [customItems, setCustomItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successBorrowId, setSuccessBorrowId] = useState("");

  // ── Custom Item Modal ────────────────────────────────────────────────────
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);

  // ── Cart Modal ──────────────────────────────────────────────────────────
  const [showCartModal, setShowCartModal] = useState(false);
  const catalogScrollRef = useRef(0);

  // ── Date Pickers ────────────────────────────────────────────────────────
  const [showBorrowDatePicker, setShowBorrowDatePicker] = useState(false);
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false);

  // ── Quantity Dialog ──────────────────────────────────────────────────────
  const [qtyDialogItem, setQtyDialogItem] = useState(null);
  const [qtyDialogValue, setQtyDialogValue] = useState(1);

  // ── Inventory items (shared hook) ───────────────────────────────────────
  const {
    tabs,
    filteredItems,
    loading: inventoryLoading,
    filterTabId,
    setFilterTabId,
    filterSectionId,
    setFilterSectionId,
    filterSections,
    search,
    setSearch,
  } = useInventoryItems();

  // ── Cart: selected inventory items ─────────────────────────────────────
  const [borrowCart, setBorrowCart] = useState([]);

  const cartIdSet = useMemo(() => new Set(borrowCart.map((c) => c.cartId)), [borrowCart]);

  const addToCart = useCallback((item, forcedQuantity) => {
    const cartId = `inv-${item.tabId}-${item.sectionId}-${item.id}`;
    if (borrowCart.some((c) => c.cartId === cartId)) return;
    const maxQty = Math.max(1, getLiveStock(item));
    const qty = forcedQuantity ? Math.min(forcedQuantity, maxQty) : 1;
    setBorrowCart((prev) => [
      ...prev,
      {
        ...item,
        cartId,
        isCustom: false,
        quantity: qty,
        maxQuantity: maxQty,
        tabName: item.tabName || "",
        sectionName: item.sectionName || "",
        tabId: item.tabId || null,
        sectionId: item.sectionId || null,
        tableName: item.tableName || "",
      },
    ]);
    setFormErrors((prev) => ({ ...prev, items: "" }));
    setFormError("");
  }, [borrowCart]);

  const removeFromCart = useCallback((cartId) => {
    setBorrowCart((prev) => prev.filter((c) => c.cartId !== cartId));
  }, []);

  const updateCartQuantity = useCallback((cartId, newQty) => {
    if (newQty < 1) return;
    setBorrowCart((prev) => prev.map((c) => c.cartId === cartId ? { ...c, quantity: newQty } : c));
  }, []);

  const addCustomItem = () => {
    const name = String(customItemForm.name || "").trim();
    if (!name) { toast.error("Item name is required."); return; }
    const quantity = Number(customItemForm.quantity) || 1;
    const next = {
      label: name + (customItemForm.brand ? ` — ${customItemForm.brand}` : ""),
      details: [
        { key: "quantity", label: "Quantity", value: String(quantity) },
        { key: "brand", label: "Brand", value: String(customItemForm.brand || "") },
        { key: "condition", label: "Condition", value: String(customItemForm.condition || "Working") },
        { key: "remarks", label: "Remarks", value: String(customItemForm.remarks || "") },
      ],
    };
    setCustomItems((c) => [...c, next]);
    setCustomItemForm({ name: "", brand: "", quantity: 1, condition: "Working", remarks: "" });
    setFormErrors((prev) => ({ ...prev, items: "" }));
    setShowCustomItemModal(false);
  };

  const removeCustomItem = (idx) => setCustomItems((c) => c.filter((_, i) => i !== idx));

  // ── Validation ──────────────────────────────────────────────────────────
  const validateField = async (name, value) => {
    const v = String(value || "").trim();
    if (name === "name") {
      if (!v) return "Borrower name is required.";
      if (!/^[A-Za-z\s]+$/.test(v)) return "Name may contain only letters and spaces.";
    }
    if (name === "email") {
      if (!v) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address.";
    }
    if (name === "studentId") {
      if (!v) return "School ID is required.";
      if (!/^\d{2}-\d{5}$/.test(normalizeSchoolId(v))) return "School ID must follow the format 26-00123.";
    }
    if (name === "role") { if (!v) return "Select borrower role."; }
    return "";
  };

  const validateStep = (step) => {
    const errs = {};
    if (step === 1) {
      ["name", "email", "studentId", "role"].forEach((k) => {
        const e = validateField(k, form[k]);
        if (e) errs[k] = e;
      });

      const hasSchoolIdValue = String(form.studentId || "").trim() !== "";
      const hasValidSchoolIdFormat = /^\d{2}-\d{5}$/.test(normalizeSchoolId(form.studentId));
      const hasNameValue = String(form.name || "").trim() !== "";

      if (hasSchoolIdValue && hasValidSchoolIdFormat && hasNameValue && !isBorrowerAllowed(form.name, form.studentId)) {
        errs.studentId = "School ID is not registered for public borrowing.";
      }
    }
    if (step === 2) {
      const totalItems = borrowCart.length + customItems.length;
      if (totalItems === 0) errs.items = "Add at least one item to borrow.";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isStepValid = (step) => {
    if (step === 1) {
      // Field-level validation is enough to enable Continue.
      // Membership in the borrower allowlist is checked on click so the error message can be shown.
      return ["name", "email", "studentId", "role"].every((k) => !validateField(k, form[k]));
    }
    if (step === 2) return borrowCart.length + customItems.length > 0;
    return true;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const confirmBorrow = async () => {
    if (saving) return;
    if (!validateStep(1) || !validateStep(2)) return;
    setSaving(true);
    setFormError("");
    try {
      const invItems = borrowCart.map((c) => ({
        label: getItemLabel(c),
        // Preserve inventory reference IDs so the admin side recognizes these as catalog items
        inventoryItemId: c.id || null,
        inventoryTabId: c.tabId || null,
        inventorySectionId: c.sectionId || null,
        inventoryTableName: c.tableName || "",
        details: (c.details || []).length > 0
          ? c.details
          : [
              { key: "quantity", label: "Quantity", value: String(c.quantity || 1) },
              { key: "brand", label: "Brand", value: String(c.brand || "") },
              { key: "condition", label: "Condition", value: String(getItemRemark(c) || "Working") },
              { key: "tab", label: "Inventory", value: String(c.tabName || "") },
              { key: "section", label: "Section", value: String(c.sectionName || "") },
            ],
      }));
      const cstItems = customItems.map((it) => ({ label: it.label, details: it.details }));
      const allItems = [...invItems, ...cstItems];

      // Compute timestamps
      const borrowDate = form.borrowDate ? new Date(form.borrowDate) : new Date();
      let expectedReturnAt = null;
      if (form.expectedReturnAt) {
        expectedReturnAt = new Date(form.expectedReturnAt + "T23:59:59");
      } else {
        expectedReturnAt = new Date(borrowDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        expectedReturnAt.setHours(23, 59, 59, 0);
      }

      // ── Deduct stock from inventory (same as admin borrow flow) ──
      const dbUpdates = [];
      for (const cartItem of borrowCart) {
        let tableName = cartItem.tableName || "";
        // Fallback: resolve tableName from tab config if missing
        if (!tableName && cartItem.tabId) {
          try {
            const config = await getTabTableConfig(cartItem.tabId);
            tableName = config?.tableName || "";
          } catch { /* ignore */ }
        }
        if (!tableName) {
          console.warn("[PublicBorrow] Skipping item without tableName:", getItemLabel(cartItem));
          continue;
        }

        const sectionRows = await fetchInventoryItems(cartItem.sectionId, tableName);
        const targetRow = sectionRows.find((r) => String(r.id) === String(cartItem.id));
        if (!targetRow) throw new Error(`Item not found in ${tableName}.`);

        const { quantityKey } = detectItemColumns(targetRow);
        const borrowedQty = Number(cartItem.quantity || 1);
        const currentQty = Number(targetRow[quantityKey] || 0);

        if (borrowedQty > currentQty) {
          throw new Error(`${getItemLabel(cartItem)}: insufficient stock (requested ${borrowedQty}, available ${currentQty}).`);
        }

        const remaining = currentQty - borrowedQty;
        dbUpdates.push(
          supabase.from(tableName).update({ [quantityKey]: remaining }).eq("id", cartItem.id)
        );
      }

      // Execute all stock deduction updates
      if (dbUpdates.length > 0) {
        const results = await Promise.allSettled(dbUpdates);
        for (const r of results) {
          if (r.status === "rejected") throw r.reason;
        }
      }

      // ── Stage the borrowing record ──
      const result = await createBorrowingRecord({
        borrowerName: form.name,
        borrowerIdNumber: form.studentId,
        borrowerRole: form.role,
        borrowerEmail: form.email,
        items: allItems,
        expectedReturnAt: expectedReturnAt.toISOString(),
      });

      // Capture borrow_id from the created record
      const borrowId = result?.record?.borrowId || result?.record?.borrow_id || "";
      setSuccessBorrowId(borrowId);
      setShowSuccessModal(true);

      // Reset form state (but don't reload — user sees success modal first)
      const defaults = getDefaultDates();
      setForm({ name: "", email: "", studentId: "", role: "", borrowDate: defaults.borrowDate, expectedReturnAt: defaults.expectedReturnAt });
      setCustomItems([]);
      setBorrowCart([]);
    } catch (err) {
      console.error(err);
      setFormError(err?.message || "Failed to submit borrowing.");
      toast.error(err?.message || "Failed to submit borrowing.");
    } finally {
      setSaving(false);
    }
  };

  const totalCartItems = borrowCart.length + customItems.length;

  // ── Reusable cart list (single source of truth) ────────────────────────
  // `compact` = desktop sidebar (read-only qty, trash only).
  // `!compact` = mobile modal (inline +/- controls, trash).
  const renderCartContent = ({ compact = false } = {}) => (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className={cn(
        "bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500",
        compact
          ? "grid grid-cols-[1fr_44px_28px] gap-2"
          : "grid grid-cols-[1fr_80px_120px_32px] gap-3"
      )}>
        <span>Item</span>
        {!compact && <span className="text-center">Status</span>}
        <span className="text-center">Qty</span>
        <span />
      </div>
      <div className={cn("divide-y divide-slate-100", !compact && "max-h-[300px] overflow-y-auto")}>
        {totalCartItems === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-400">Your cart is empty.</div>
        ) : (
          <>
            {borrowCart.map((item) => (
              <div
                key={item.cartId}
                className={cn(
                  "items-center px-3 py-2.5",
                  compact
                    ? "grid grid-cols-[1fr_44px_28px] gap-2"
                    : "grid grid-cols-[1fr_80px_120px_32px] gap-3"
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{getItemLabel(item)}</p>
                  <p className="text-xs text-slate-400 truncate">{item.tabName} / {item.sectionName}</p>
                </div>
                {!compact && (
                  <div className="text-center">
                    {getItemRemark(item) ? (
                      <span className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600">{getItemRemark(item)}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                )}
                <div className={cn("flex items-center gap-1.5", compact ? "justify-center" : "pl-4")}>
                  {!compact && (
                    <>
                      <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                        onClick={() => updateCartQuantity(item.cartId, item.quantity - 1)} disabled={item.quantity <= 1}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold text-slate-700">{item.quantity}</span>
                      <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                        onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)} disabled={item.quantity >= (item.maxQuantity || 999)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {compact && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{item.quantity}</span>
                  )}
                </div>
                <button type="button" onClick={() => removeFromCart(item.cartId)}
                  className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {customItems.map((item, idx) => {
              const qty = Number((item.details.find(d => d.key === "quantity") || {}).value) || 1;
              return (
                <div
                  key={`custom-${idx}`}
                  className={cn(
                    "items-center px-3 py-2.5",
                    compact
                      ? "grid grid-cols-[1fr_44px_28px] gap-2"
                      : "grid grid-cols-[1fr_80px_120px_32px] gap-3"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                    <p className="text-xs text-slate-400">Custom Item</p>
                  </div>
                  {!compact && (
                    <div className="text-center">
                      <span className="text-xs text-slate-400">—</span>
                    </div>
                  )}
                  <div className={cn("flex items-center gap-1.5", compact ? "justify-center" : "pl-4")}>
                    {!compact && (
                      <>
                        <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                          onClick={() => {
                            if (qty <= 1) return;
                            const newDetails = item.details.map(d => d.key === "quantity" ? { ...d, value: String(qty - 1) } : d);
                            setCustomItems((prev) => prev.map((c, i) => i === idx ? { ...c, details: newDetails } : c));
                          }} disabled={qty <= 1}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold text-slate-700">{qty}</span>
                        <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                          onClick={() => {
                            const newDetails = item.details.map(d => d.key === "quantity" ? { ...d, value: String(qty + 1) } : d);
                            setCustomItems((prev) => prev.map((c, i) => i === idx ? { ...c, details: newDetails } : c));
                          }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {compact && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{qty}</span>
                    )}
                  </div>
                  <button type="button" onClick={() => removeCustomItem(idx)}
                    className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <Header isPublic setMobileOpen={() => {}} sectionTitleDisplay="Public Borrow" now={new Date()} initials={initials} displayName={displayName} displayRole={displayRole} />

      {/*
        Responsive shell:
          - Mobile (< lg): single centered card (stepper + form), cart via floating button + modal.
          - Desktop (≥ lg): two-column row — left = stepper+form (75%), right = live cart sidebar (25%).
      */}
      <div className="flex justify-center px-4 py-10">
        <div className="flex w-full max-w-7xl flex-col items-start gap-6 transition-all duration-200 lg:flex-row">

          {/* ═══════════════════════════════════════════════════════════════
              LEFT COLUMN (75% on desktop) — stepper + active step + footer
              ═══════════════════════════════════════════════════════════════ */}
          <div className="w-full min-w-0 lg:flex-[3]">
            <div className="flex flex-col gap-0 overflow-hidden rounded-[25px] border-2 border-slate-200 bg-white p-0 shadow-sm">
              {/* Stepper Header */}
              <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 pt-5 pb-4 sm:px-8">
                <div className="flex items-center justify-center">
                  {["Identity", "Select Items", "Review"].map((label, idx) => {
                    const stepNum = idx + 1;
                    const isActive = activeStep === stepNum;
                    const isCompleted = activeStep > stepNum;
                    const Icon = [User, Package, CheckCircle][idx];
                    return (
                      <div key={label} className="flex items-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                            isActive && "border-[#4a1111] bg-[#4a1111] text-white",
                            isCompleted && "border-[#4a1111] bg-[#4a1111] text-white",
                            !isActive && !isCompleted && "border-slate-200 bg-white text-slate-400"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className={cn("text-[11px] font-medium tracking-wide", isActive && "text-[#4a1111]", isCompleted && "text-[#4a1111]/60", !isActive && !isCompleted && "text-slate-400")}>
                            {label}
                          </span>
                        </div>
                        {idx < 2 && (
                          <div className={cn("mx-4 mb-5 h-0.5 w-16 rounded-full transition-colors", activeStep > stepNum ? "bg-[#4a1111]" : "bg-slate-200")} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 bg-white">

                {/* ═══ STEP 1: Borrower Identity ═══ */}
                {activeStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Borrower Information</h3>
                      <p className="mt-1 text-sm">Enter the borrower's identity details to begin.</p>
                    </div>
                    <div>
                      <Label htmlFor="borrow-name" className="mb-1 block text-sm font-medium text-slate-700">Full Name <span className="text-destructive">*</span></Label>
                      <Input id="borrow-name" name="name" placeholder="Enter full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className={cn("h-10", formErrors.name && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive")} />
                      {formErrors.name && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.name}</p>}
                    </div>
                    <div>
                      <Label htmlFor="borrow-email" className="mb-1 block text-sm font-medium text-slate-700">Email <span className="text-destructive">*</span></Label>
                      <Input id="borrow-email" name="email" type="email" placeholder="Enter email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={cn("h-10", formErrors.email && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive")} />
                      {formErrors.email && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.email}</p>}
                    </div>
                    <div>
                      <Label htmlFor="borrow-studentId" className="mb-1 block text-sm font-medium text-slate-700">School ID <span className="text-destructive">*</span></Label>
                      <Input id="borrow-studentId" name="studentId" placeholder="26-00123" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: normalizeSchoolId(e.target.value) })} className={cn("h-10", formErrors.studentId && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive")} />
                      {formErrors.studentId && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.studentId}</p>}
                    </div>
                    <div>
                      <Label htmlFor="borrow-role" className="mb-1 block text-sm font-medium text-slate-700">Role <span className="text-destructive">*</span></Label>
                      <Select value={form.role || ""} onValueChange={(val) => setForm({ ...form, role: val })}>
                        <SelectTrigger id="borrow-role" className="h-10"><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Student">Student</SelectItem>
                          <SelectItem value="Teacher">Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                      {formErrors.role && <p className="mt-1 text-xs font-medium text-destructive">{formErrors.role}</p>}
                    </div>

                    {/* ── Time Frame ─────────────────────────────────────── */}
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-sm font-medium text-slate-700 mb-3">Time Frame</p>
                      <div className="grid grid-cols-2 gap-3">

                        {/* ── Borrow Date & Time ── */}
                        <div>
                          <Label className="mb-1 block text-sm font-medium text-slate-700">Borrow Date &amp; Time</Label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowBorrowDatePicker((open) => !open)}
                              className="flex w-full items-center gap-2.5 rounded-lg border border-input bg-white px-3 text-left text-sm shadow-sm transition hover:border-slate-300 h-9"
                            >
                              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className={`flex-1 truncate ${form.borrowDate ? "text-slate-700 font-medium" : "text-slate-400"}`}>
                                {form.borrowDate
                                  ? new Date(form.borrowDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                  : "Select date & time"}
                              </span>
                            </button>

                            {showBorrowDatePicker && (
                              <>
                                <div className="fixed -top-[100vh] inset-x-0 bottom-0 z-[200] bg-black/20 backdrop-blur-[2px]" onClick={() => setShowBorrowDatePicker(false)} />
                                <div className="fixed left-1/2 top-1/2 z-[201] w-[320px] -translate-x-1/2 -translate-y-1/2 animate-[calPopIn_200ms_ease-out] rounded-lg border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/60">
                                  <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Borrow Date &amp; Time</span>
                                    <button type="button" onClick={() => setShowBorrowDatePicker(false)} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div className="px-3 pt-2">
                                    <DayPicker
                                      className="rdp-sidebar-picker text-sm"
                                      mode="single"
                                      selected={form.borrowDate ? new Date(form.borrowDate) : undefined}
                                      disabled={{ before: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })() }}
                                      fromDate={new Date()}
                                      onSelect={(date) => {
                                        if (date) {
                                          const pad = (n) => String(n).padStart(2, "0");
                                          const now = new Date(form.borrowDate ? new Date(form.borrowDate) : new Date());
                                          const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
                                          const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${timeStr}`;
                                          setForm({ ...form, borrowDate: dateStr });
                                        }
                                      }}
                                    />
                                  </div>
                                  <div className="border-t border-slate-100 px-4 py-3">
                                    <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Time</p>
                                    <div className="flex items-center gap-1.5">
                                      <div className="relative w-16">
                                        <select
                                          value={form.borrowDate ? String(new Date(form.borrowDate).getHours()).padStart(2, "0") : "08"}
                                          onChange={(e) => {
                                            const pad = (n) => String(n).padStart(2, "0");
                                            const base = form.borrowDate ? new Date(form.borrowDate) : new Date();
                                            base.setHours(parseInt(e.target.value));
                                            const dateStr = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
                                            setForm({ ...form, borrowDate: dateStr });
                                          }}
                                          className="w-full appearance-none rounded-md border border-input bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                          {Array.from({ length: 12 }, (_, i) => { const v = String(i + 1).padStart(2, "0"); return <option key={i} value={v}>{v}</option>; })}
                                        </select>
                                      </div>
                                      <span className="text-lg font-bold text-slate-300">:</span>
                                      <div className="relative w-16">
                                        <select
                                          value={form.borrowDate ? String(new Date(form.borrowDate).getMinutes()).padStart(2, "0") : "00"}
                                          onChange={(e) => {
                                            const pad = (n) => String(n).padStart(2, "0");
                                            const base = form.borrowDate ? new Date(form.borrowDate) : new Date();
                                            base.setMinutes(parseInt(e.target.value));
                                            const dateStr = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
                                            setForm({ ...form, borrowDate: dateStr });
                                          }}
                                          className="w-full appearance-none rounded-md border border-input bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                          {Array.from({ length: 60 }, (_, i) => { const v = String(i).padStart(2, "0"); return <option key={i} value={v}>{v}</option>; })}
                                        </select>
                                      </div>
                                      <div className="relative w-[60px]">
                                        <select
                                          value={form.borrowDate ? (new Date(form.borrowDate).getHours() >= 12 ? "PM" : "AM") : "AM"}
                                          onChange={(e) => {
                                            const pad = (n) => String(n).padStart(2, "0");
                                            const base = form.borrowDate ? new Date(form.borrowDate) : new Date();
                                            const wasPM = base.getHours() >= 12;
                                            const goingPM = e.target.value === "PM";
                                            if (wasPM && !goingPM) base.setHours(base.getHours() - 12);
                                            else if (!wasPM && goingPM) base.setHours(base.getHours() + 12);
                                            const dateStr = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
                                            setForm({ ...form, borrowDate: dateStr });
                                          }}
                                          className="w-full appearance-none rounded-md border border-input bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                          <option value="AM">AM</option>
                                          <option value="PM">PM</option>
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
                                    <button type="button" onClick={() => { setForm({ ...form, borrowDate: new Date().toISOString() }); setShowBorrowDatePicker(false); }} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">Reset</button>
                                    <button type="button" onClick={() => setShowBorrowDatePicker(false)} className="rounded-full bg-[#4a1111] px-4 py-1 text-xs font-medium text-white hover:bg-[#5a1717]">Done</button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Expected Return Date ── */}
                        <div>
                          <Label className="mb-1 block text-sm font-medium text-slate-700">Expected Return Date</Label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowReturnDatePicker((open) => !open)}
                              className="flex w-full items-center gap-2.5 rounded-lg border border-input bg-white px-3 text-left text-sm shadow-sm transition hover:border-slate-300 h-9"
                            >
                              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className={`flex-1 truncate ${form.expectedReturnAt ? "text-slate-700 font-medium" : "text-slate-400"}`}>
                                {form.expectedReturnAt
                                  ? new Date(form.expectedReturnAt + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                  : "Select return date"}
                              </span>
                            </button>

                            {showReturnDatePicker && (
                              <>
                                <div className="fixed -top-[100vh] inset-x-0 bottom-0 z-[200] bg-black/20 backdrop-blur-[2px]" onClick={() => setShowReturnDatePicker(false)} />
                                <div className="fixed left-1/2 top-1/2 z-[201] w-[320px] -translate-x-1/2 -translate-y-1/2 animate-[calPopIn_200ms_ease-out] rounded-lg border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/60">
                                  <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Expected Return Date</span>
                                    <button type="button" onClick={() => setShowReturnDatePicker(false)} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div className="px-3 pt-2">
                                    <DayPicker
                                      className="rdp-sidebar-picker text-sm"
                                      mode="single"
                                      selected={form.expectedReturnAt ? new Date(form.expectedReturnAt + "T00:00:00") : undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          const y = date.getFullYear();
                                          const m = String(date.getMonth() + 1).padStart(2, "0");
                                          const d = String(date.getDate()).padStart(2, "0");
                                          setForm({ ...form, expectedReturnAt: `${y}-${m}-${d}` });
                                        }
                                        setShowReturnDatePicker(false);
                                      }}
                                      disabled={form.borrowDate ? { before: new Date(form.borrowDate) } : undefined}
                                      fromDate={form.borrowDate ? new Date(form.borrowDate) : new Date()}
                                      footer={
                                        form.expectedReturnAt
                                          ? new Date(form.expectedReturnAt + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                          : ""
                                      }
                                    />
                                  </div>
                                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
                                    <button type="button" onClick={() => { const ret = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); ret.setHours(23, 59, 59, 0); setForm({ ...form, expectedReturnAt: `${ret.getFullYear()}-${String(ret.getMonth() + 1).padStart(2, "0")}-${String(ret.getDate()).padStart(2, "0")}` }); setShowReturnDatePicker(false); }} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">Reset</button>
                                    <button type="button" onClick={() => setShowReturnDatePicker(false)} className="rounded-full bg-[#4a1111] px-4 py-1 text-xs font-medium text-white hover:bg-[#5a1717]">Done</button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ STEP 2: Select Items ═══ */}
                {activeStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Select Items</h3>
                      <p className="mt-1 text-sm">Browse by location, pick items, and manage your cart.</p>
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

                    {/* ── Search ──────────────────────────────────────────────── */}
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search within selection..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 pl-9 pr-9 text-sm"
                      />
                      {search && (
                        <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* ── Inventory Item List ──────────────────────────────────── */}
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px_90px_90px] gap-2 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <span>Item</span>
                        <span className="text-center">Status</span>
                        <span className="text-center">In Stock</span>
                        <span className="text-right">Action</span>
                      </div>
                      {inventoryLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#4a1111]" />
                          <span className="ml-2 text-sm text-slate-500">Loading inventory...</span>
                        </div>
                      ) : filteredItems.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">
                          {search ? "No items match your search." : "No inventory items available."}
                        </p>
                      ) : (
                        <div className="max-h-[250px] overflow-y-auto">
                          {filteredItems.map((item) => {
                            const cartId = `inv-${item.tabId}-${item.sectionId}-${item.id}`;
                            const alreadyInCart = cartIdSet.has(cartId);
                            const stock = getLiveStock(item);
                            const itemRemark = getItemRemark(item);

                            if (stock <= 0) return null;

                            return (
                              <div
                                key={cartId}
                                className={cn(
                                  "grid grid-cols-[1fr_80px_90px_80px] gap-2 items-center border-b border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors relative",
                                  alreadyInCart && "bg-emerald-50/40 border-l-4 border-l-emerald-500"
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800">{getItemLabel(item)}</p>
                                  <p className="truncate text-[11px] text-slate-400">{item.tabName} • {item.sectionName}</p>
                                </div>
                                <div className="text-center">
                                  {itemRemark ? (
                                    <span className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600">
                                      {itemRemark}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </div>
                                <div className="text-center">
                                  <span className={cn(
                                    "rounded-md px-2 py-1 text-xs font-semibold",
                                    stock > 0
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  )}>
                                    {stock > 0 ? stock : "0"}
                                  </span>
                                </div>
                                <div className="text-right">
                                  {stock <= 0 && (
                                    <span className="block text-[9px] font-semibold text-rose-500 leading-tight">
                                      Not available
                                    </span>
                                  )}
                                  {stock > 0 && (
                                    <Button
                                      size="sm"
                                      variant={alreadyInCart ? "secondary" : "default"}
                                      onClick={() => {
                                        if (!alreadyInCart && stock > 0) {
                                          setQtyDialogItem(item);
                                          setQtyDialogValue(1);
                                        }
                                      }}
                                      disabled={alreadyInCart || stock <= 0}
                                      className={cn(
                                        "h-7 px-2.5 text-[11px] font-semibold mt-0.5",
                                        !alreadyInCart && stock > 0 && "bg-[#4a1111] hover:bg-[#5a1717]"
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
                      <>
                        <div className="fixed -top-[100vh] inset-x-0 bottom-0 z-[200] bg-black/20 backdrop-blur-[2px]" onClick={() => setQtyDialogItem(null)} />
                        <div className="fixed left-1/2 top-1/2 z-[201] w-[320px] -translate-x-1/2 -translate-y-1/2 animate-[calPopIn_200ms_ease-out] rounded-lg border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/60">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">How many to borrow?</h3>
                            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                              {getItemLabel(qtyDialogItem)}
                              {getItemRemark(qtyDialogItem) && (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600">
                                  {getItemRemark(qtyDialogItem)}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="mt-4 flex flex-col items-center gap-3">
                            <span className="text-xs text-slate-400">Available: {Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 0)}</span>
                            <div className="flex items-center gap-3">
                              <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-full"
                                onClick={() => setQtyDialogValue((v) => { const cur = (v === "" || v == null) ? 1 : Number(v); return Math.max(1, cur - 1); })} disabled={qtyDialogValue <= 1}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <input type="number" min="1" max={Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1)}
                                value={qtyDialogValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") { setQtyDialogValue(""); return; }
                                  const v = Number(raw);
                                  if (!Number.isNaN(v)) setQtyDialogValue(v);
                                }}
                                onBlur={() => {
                                  const max = Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1);
                                  setQtyDialogValue((v) => { if (v === "" || v == null) return 1; const n = Number(v); if (Number.isNaN(n)) return 1; return Math.max(1, Math.min(n, max)); });
                                }}
                                className="no-number-spinner h-10 w-20 rounded-md border border-input bg-white text-center text-lg font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              />
                              <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-full"
                                onClick={() => { const max = Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1); setQtyDialogValue((v) => { const cur = (v === "" || v == null) ? 1 : Number(v); return Math.min(max, cur + 1); }); }}
                                disabled={qtyDialogValue >= Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-5 flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setQtyDialogItem(null)} className="rounded-lg">Cancel</Button>
                            <Button type="button" size="sm" onClick={() => {
                              const max = Number(qtyDialogItem.quantity ?? qtyDialogItem.data?.quantity ?? 1);
                              const qty = (qtyDialogValue === "" || qtyDialogValue == null || Number.isNaN(Number(qtyDialogValue))) ? 1 : Math.max(1, Math.min(Number(qtyDialogValue), max));
                              addToCart(qtyDialogItem, qty);
                              setQtyDialogItem(null);
                            }} className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]">
                              Add to List
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── Custom Item Modal (nested) ─────────────────────────── */}
                    {showCustomItemModal && (
                      <>
                        <div className="fixed -top-[100vh] inset-x-0 bottom-0 z-[200] bg-black/20 backdrop-blur-[2px]" onClick={() => setShowCustomItemModal(false)} />
                        <div className="fixed left-1/2 top-1/2 z-[201] w-[480px] max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 animate-[calPopIn_200ms_ease-out] rounded-lg border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/60">
                          <h3 className="text-base font-semibold text-slate-900">Add Custom Item</h3>
                          <p className="mt-1 text-sm text-slate-500">Add an item that is not in the inventory catalog.</p>
                          <div className="mt-4 space-y-3">
                            <div>
                              <Label className="mb-1 block text-sm font-medium text-slate-700">Item Name</Label>
                              <Input type="text" placeholder="e.g. External Hard Drive" value={customItemForm.name} onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })} className="h-10" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="mb-1 block text-sm font-medium text-slate-700">Brand <span className="text-slate-400 font-normal">(optional)</span></Label>
                                <Input type="text" placeholder="e.g. Samsung" value={customItemForm.brand} onChange={(e) => setCustomItemForm({ ...customItemForm, brand: e.target.value })} className="h-10" />
                              </div>
                              <div>
                                <Label className="mb-1 block text-sm font-medium text-slate-700">Quantity</Label>
                                <Input type="number" min="1" placeholder="e.g. 1" value={customItemForm.quantity} onChange={(e) => setCustomItemForm({ ...customItemForm, quantity: e.target.value })} className="no-number-spinner h-10" />
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
                                <Label className="mb-1 block text-sm font-medium text-slate-700">Remarks <span className="text-slate-400 font-normal">(optional)</span></Label>
                                <Input type="text" placeholder="Any notes..." value={customItemForm.remarks} onChange={(e) => setCustomItemForm({ ...customItemForm, remarks: e.target.value })} className="h-10" />
                              </div>
                            </div>
                          </div>
                          <div className="mt-5 flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setShowCustomItemModal(false)} className="rounded-lg">Cancel</Button>
                            <Button size="sm" onClick={() => { addCustomItem(); setShowCustomItemModal(false); }} disabled={!customItemForm.name.trim() || !customItemForm.quantity.toString().trim()}
                              className={cn("rounded-lg", customItemForm.name.trim() && customItemForm.quantity.toString().trim() ? "bg-[#4a1111] hover:bg-[#5a1717] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100")}>
                              + Add to List
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── Mobile-only: Custom Item Button + Cart Button + Cart Modal ──
                        On desktop (≥ lg) the live cart sidebar replaces all of this. */}
                    <div className="lg:hidden">
                      {/* ── Custom Item Button (opens modal) ──────────────────── */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { catalogScrollRef.current = window.scrollY; setShowCustomItemModal(true); }}
                        className="w-full h-10 border-dashed border-2 border-slate-300 text-slate-500 hover:text-[#4a1111] hover:border-[#4a1111]/40 hover:bg-[#4a1111]/5"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Custom Item (Outside Inventory)
                      </Button>

                      {/* ── Cart Modal (nested) ───────────────────────────────── */}
                      {showCartModal && (
                        <>
                          <div className="fixed -top-[100vh] inset-x-0 bottom-0 z-[200] bg-black/20 backdrop-blur-[2px]" onClick={() => setShowCartModal(false)} />
                          <div className="fixed left-1/2 top-1/2 z-[201] w-[540px] max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 animate-[calPopIn_200ms_ease-out] rounded-lg border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/60">
                            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                              <ShoppingCart className="h-5 w-5 text-[#4a1111]" />
                              Cart ({totalCartItems} {totalCartItems === 1 ? "item" : "items"})
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">Review and adjust quantities before proceeding.</p>
                            <div className="mt-4">
                              {renderCartContent()}
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowCartModal(false)}
                              className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              <ArrowLeft className="mr-2 h-4 w-4" />
                              Return to Item Selection
                            </button>
                          </div>
                        </>
                      )}

                      {/* ── Floating Cart Button ────────────────────────────────── */}
                      {totalCartItems > 0 && (
                        <Button
                          type="button"
                          onClick={() => { catalogScrollRef.current = window.scrollY; setShowCartModal(true); }}
                          className="fixed bottom-20 right-6 z-50 h-8 rounded-full shadow-md bg-[#4a1111] hover:bg-[#5a1717] px-3.5 text-white font-semibold text-[11px]"
                        >
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          View Cart
                          <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#4a1111]">
                            {totalCartItems}
                          </span>
                        </Button>
                      )}
                    </div>

                    {formError && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p>
                    )}
                  </div>
                )}

                {/* ═══ STEP 3: Review & Summary ═══ */}
                {activeStep === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Review & Confirm</h3>
                      <p className="mt-1 text-sm">Verify all details before confirming the borrowing record.</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3"><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Borrower</h3></div>
                      <div className="px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Full Name</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{form.name.trim()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Email</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{form.email.trim()}</p>
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

                    {/* ── Time Frame Block ──────────────────────────────────── */}
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3"><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Time Frame</h3></div>
                      <div className="px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Borrow Date &amp; Time</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {form.borrowDate
                                ? new Date(form.borrowDate).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                : new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Expected Return</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {form.expectedReturnAt
                                ? new Date(form.expectedReturnAt + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                          Items ({totalCartItems})
                        </h3>
                      </div>
                      <div className="grid grid-cols-[1fr_80px_140px] gap-4 bg-slate-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <span>Item</span>
                        <span className="text-center">Status</span>
                        <span className="text-center">Quantity</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {borrowCart.map((item) => (
                          <div key={item.cartId} className="grid grid-cols-[1fr_80px_140px] gap-4 items-center px-5 py-3.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{getItemLabel(item)}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{item.tabName} • {item.sectionName}</p>
                            </div>
                            <div className="text-center">
                              {getItemRemark(item) ? (
                                <span className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600">{getItemRemark(item)}</span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                            <div className="flex items-center justify-center gap-1.5">
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                                onClick={() => updateCartQuantity(item.cartId, item.quantity - 1)} disabled={item.quantity <= 1}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold text-slate-700">{item.quantity}</span>
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                                onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)} disabled={item.quantity >= (item.maxQuantity || 999)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {customItems.map((item, idx) => {
                          const qty = Number((item.details.find(d => d.key === "quantity") || {}).value) || 1;
                          return (
                            <div key={`custom-${idx}`} className="grid grid-cols-[1fr_80px_140px] gap-4 items-center px-5 py-3.5">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                                <p className="mt-0.5 text-xs text-slate-400">Custom Item</p>
                              </div>
                              <div className="text-center">
                                <span className="text-xs text-slate-400">—</span>
                              </div>
                              <div className="flex items-center justify-center gap-1.5">
                                <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                                  onClick={() => {
                                    if (qty <= 1) return;
                                    const newDetails = item.details.map(d => d.key === "quantity" ? { ...d, value: String(qty - 1) } : d);
                                    setCustomItems((prev) => prev.map((c, i) => i === idx ? { ...c, details: newDetails } : c));
                                  }} disabled={qty <= 1}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-semibold text-slate-700">{qty}</span>
                                <Button type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full border-slate-200"
                                  onClick={() => {
                                    const newDetails = item.details.map(d => d.key === "quantity" ? { ...d, value: String(qty + 1) } : d);
                                    setCustomItems((prev) => prev.map((c, i) => i === idx ? { ...c, details: newDetails } : c));
                                  }}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
                <div className="flex items-center gap-2 justify-between w-full sm:w-auto">
                  {activeStep > 1 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setActiveStep((s) => s - 1)} className="rounded-lg">Back</Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setForm({ name: "", email: "", studentId: "", role: "", borrowDate: "", expectedReturnAt: "" }); setCustomItems([]); setBorrowCart([]); setActiveStep(1); }} className="rounded-lg">Cancel</Button>
                  )}

                  {activeStep === 1 && (
                    <Button type="button" size="sm" onClick={() => { const ok = validateStep(1); if (ok) setActiveStep(2); }} disabled={!isStepValid(1)} className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]">Continue</Button>
                  )}

                  {activeStep === 2 && (
                    <Button type="button" size="sm" onClick={() => {
                      const totalItems = borrowCart.length + customItems.length;
                      if (totalItems === 0) { setFormError("Add at least one item to the cart."); return; }
                      setActiveStep(3);
                      setFormError("");
                    }} disabled={totalCartItems === 0} className={cn("rounded-lg px-5", totalCartItems > 0 ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f]" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100")}>Review</Button>
                  )}

                  {activeStep === 3 && (
                    <Button type="button" size="sm" onClick={confirmBorrow} disabled={saving} className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f] disabled:cursor-wait disabled:opacity-60">{saving ? "Saving..." : "Confirm Borrow"}</Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              RIGHT COLUMN (25% on desktop) — live cart sidebar
              Hidden on mobile/tablet (< lg), where the floating button + modal are used.
              ═══════════════════════════════════════════════════════════════ */}
          <div className="hidden w-full min-w-0 lg:block lg:flex-[1]">
            <div className="sticky top-10 flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-[25px] border-2 border-slate-200 bg-white p-0 shadow-sm">
              {/* Sidebar header */}
              <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 pt-5 pb-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShoppingCart className="h-5 w-5 text-[#4a1111]" />
                  Cart
                  {totalCartItems > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4a1111] px-1.5 text-[10px] font-bold text-white">
                      {totalCartItems}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-xs text-slate-500">Items you're about to borrow. Adjust quantities in the Review step.</p>
              </div>

              {/* Scrollable cart list */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {renderCartContent({ compact: true })}
              </div>

              {/* Sidebar footer — add custom item */}
              <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { catalogScrollRef.current = window.scrollY; setShowCustomItemModal(true); }}
                  className="w-full h-10 border-dashed border-2 border-slate-300 text-slate-500 hover:text-[#4a1111] hover:border-[#4a1111]/40 hover:bg-[#4a1111]/5"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Custom Item
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BORROW SUCCESS MODAL — shows borrow ID, prompts to take a picture
          ═══════════════════════════════════════════════════════════════════ */}
      {showSuccessModal && (
        <Dialog open={showSuccessModal} onOpenChange={(open) => { if (!open) { setShowSuccessModal(false); setActiveStep(1); setTimeout(() => window.location.reload(), 300); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center sm:text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <DialogTitle className="text-xl font-semibold text-slate-900">
                Borrowing Submitted!
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-slate-500">
                Your borrowing request has been submitted successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col items-center gap-4">
              {/* Borrow ID display */}
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Your Borrow ID</p>
                <p className="mt-2 text-3xl font-bold tracking-widest text-[#4a1111]">
                  {successBorrowId || "—"}
                </p>
              </div>

              {/* Take a picture reminder */}
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
                <p className="text-sm font-semibold text-amber-900">
                   Please take a picture of your Borrow ID
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  You will need this ID for reference.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-6 sm:justify-center">
              <Button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  setActiveStep(1);
                  setTimeout(() => window.location.reload(), 300);
                }}
                className="rounded-lg bg-[#4a1111] px-8 text-white hover:bg-[#3f0f0f]"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
