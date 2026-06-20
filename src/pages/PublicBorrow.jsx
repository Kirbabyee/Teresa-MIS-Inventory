import { useEffect, useState, useCallback, useMemo } from "react";
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
import { createBorrowingRecord } from "@/lib/borrowingApi";
import { useInventoryItems } from "@/hooks/useInventoryItems";
import { detectItemColumns } from "@/lib/inventoryApi";
import { User, Package, CheckCircle, Search, X, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSION_KEY = "app_session";

// ── Helpers (mirroring Borrowing.jsx for consistent dynamic-table support) ──

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
  const [form, setForm] = useState({ name: "", studentId: "", role: "" });
  const [formErrors, setFormErrors] = useState({});
  const [customItemForm, setCustomItemForm] = useState({ name: "", brand: "", quantity: 1, condition: "Working", remarks: "" });
  const [customItems, setCustomItems] = useState([]);
  const [saving, setSaving] = useState(false);

  // ── Inventory items (shared hook) ─────────────────────────────────────────
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

  // ── Cart: selected inventory items ───────────────────────────────────────
  const [borrowCart, setBorrowCart] = useState([]);

  const cartIdSet = useMemo(() => new Set(borrowCart.map((c) => c.cartId)), [borrowCart]);

  const addToCart = useCallback((item) => {
    const cartId = `inv-${item.tabId}-${item.sectionId}-${item.id}`;
    if (borrowCart.some((c) => c.cartId === cartId)) return;
    const maxQty = Math.max(1, getLiveStock(item));
    setBorrowCart((prev) => [
      ...prev,
      {
        ...item,
        cartId,
        isCustom: false,
        quantity: 1,
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

  const [formError, setFormError] = useState("");

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
  };

  const removeCustomItem = (idx) => setCustomItems((c) => c.filter((_, i) => i !== idx));

  // ── Validation ────────────────────────────────────────────────────────────
  const validateField = (name, value) => {
    const v = String(value || "").trim();
    if (name === "name") {
      if (!v) return "Borrower name is required.";
      if (!/^[A-Za-z\s]+$/.test(v)) return "Name may contain only letters and spaces.";
    }
    if (name === "studentId") { if (!v) return "ID number is required."; }
    if (name === "role") { if (!v) return "Select borrower role."; }
    return "";
  };

  const validateStep = (step) => {
    const errs = {};
    if (step === 1) {
      ["name", "studentId", "role"].forEach((k) => {
        const e = validateField(k, form[k]);
        if (e) errs[k] = e;
      });
    }
    if (step === 2) {
      const totalItems = borrowCart.length + customItems.length;
      if (totalItems === 0) errs.items = "Add at least one item to borrow.";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isStepValid = (step) => {
    if (step === 1) return ["name", "studentId", "role"].every((k) => !validateField(k, form[k]));
    if (step === 2) return borrowCart.length + customItems.length > 0;
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const confirmBorrow = async () => {
    if (!validateStep(1) || !validateStep(2)) return;
    setSaving(true);
    try {
      const invItems = borrowCart.map((c) => ({
        label: getItemLabel(c),
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

      await createBorrowingRecord({
        borrowerName: form.name,
        borrowerIdNumber: form.studentId,
        borrowerRole: form.role,
        items: allItems,
      });
      toast.success("Borrowing submitted. Thank you.");
      setForm({ name: "", studentId: "", role: "" });
      setCustomItems([]);
      setBorrowCart([]);
      setActiveStep(1);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to submit borrowing.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <Header isPublic setMobileOpen={() => {}} sectionTitleDisplay="Public Borrow" now={new Date()} initials={initials} displayName={displayName} displayRole={displayRole} />

      <div className="flex justify-center px-4 py-10">
        <div className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0 bg-transparent w-full">
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

            {/* ═══ STEP 1: Identity ═══ */}
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
                  <Label htmlFor="borrow-studentId" className="mb-1 block text-sm font-medium text-slate-700">ID Number <span className="text-destructive">*</span></Label>
                  <Input id="borrow-studentId" name="studentId" placeholder="Enter ID number" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className={cn("h-10", formErrors.studentId && "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive")} />
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
              </div>
            )}

            {/* ═══ STEP 2: Select Items ═══ */}
            {activeStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Select Items</h3>
                  <p className="mt-1 text-sm">Browse inventory and add items to your cart.</p>
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
                  <div className="grid grid-cols-[1fr_80px_90px_80px] gap-2 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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

                        return (
                          <div key={cartId} className="grid grid-cols-[1fr_80px_90px_80px] gap-2 items-center border-b border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{getItemLabel(item)}</p>
                              <p className="truncate text-[11px] text-slate-400">{item.tabName} • {item.sectionName}</p>
                            </div>
                            <div className="text-center">
                              {itemRemark ? (
                                <span className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600">{itemRemark}</span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                            <div className="text-center">
                              <span className={cn(
                                "rounded-md px-2 py-1 text-xs font-semibold",
                                stock > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                              )}>
                                {stock > 0 ? stock : "0"}
                              </span>
                            </div>
                            <div className="text-right">
                              {stock <= 0 && (
                                <span className="block text-[9px] font-semibold text-rose-500 leading-tight">Not available</span>
                              )}
                              {stock > 0 && (
                                <Button
                                  size="sm"
                                  variant={alreadyInCart ? "secondary" : "default"}
                                  onClick={() => !alreadyInCart && addToCart(item)}
                                  disabled={alreadyInCart}
                                  className={cn(
                                    "h-7 px-2.5 text-[11px] font-semibold mt-0.5",
                                    !alreadyInCart && "bg-[#4a1111] hover:bg-[#5a1717]"
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

                {/* ── Custom Item Form ─────────────────────────────────────── */}
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
                  <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-3">Or Add Custom Item (Outside Inventory)</h4>
                  <div className="space-y-3">
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
                  <Button onClick={addCustomItem} disabled={!customItemForm.name || !String(customItemForm.quantity).trim()} className={cn("mt-4 w-full h-10 text-sm font-semibold", customItemForm.name && String(customItemForm.quantity).trim() ? "bg-[#4a1111] hover:bg-[#5a1717]" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100")}>+ Add Custom Item</Button>
                </div>

                {/* ── Cart Summary ─────────────────────────────────────────── */}
                {(borrowCart.length + customItems.length) > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                        Cart ({borrowCart.length + customItems.length} {(borrowCart.length + customItems.length) === 1 ? "item" : "items"})
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
                      {borrowCart.map((item) => (
                        <div key={item.cartId} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{getItemLabel(item)}</p>
                            <p className="text-xs text-slate-400">{item.tabName} • {item.sectionName}</p>
                          </div>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Qty: {item.quantity}</span>
                          <button type="button" onClick={() => removeFromCart(item.cartId)} className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50" title="Remove"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                      {customItems.map((item, idx) => (
                        <div key={`custom-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                            <p className="text-xs text-slate-400">Custom Item</p>
                          </div>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            Qty: {(item.details.find(d => d.key === "quantity") || {}).value}
                          </span>
                          <button type="button" onClick={() => removeCustomItem(idx)} className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50" title="Remove"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ STEP 3: Review & Confirm ═══ */}
            {activeStep === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Review & Confirm</h3>
                  <p className="mt-1 text-sm">Verify all details before confirming the borrowing record.</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-3"><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Borrower</h3></div>
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

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                      Items ({borrowCart.length + customItems.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {borrowCart.map((item) => (
                      <div key={item.cartId} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{getItemLabel(item)}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{item.tabName} • {item.sectionName}</p>
                        </div>
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Qty: {item.quantity}</span>
                      </div>
                    ))}
                    {customItems.map((item, idx) => (
                      <div key={`custom-${idx}`} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{item.label}</p>
                          <p className="mt-0.5 text-xs text-slate-400">Custom Item</p>
                        </div>
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          Qty: {(item.details.find(d => d.key === "quantity") || {}).value}
                        </span>
                      </div>
                    ))}
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
                <Button type="button" variant="outline" size="sm" onClick={() => { setForm({ name: "", studentId: "", role: "" }); setCustomItems([]); setBorrowCart([]); setActiveStep(1); }} className="rounded-lg">Cancel</Button>
              )}

              {activeStep === 1 && (
                <Button type="button" size="sm" onClick={() => { const ok = validateStep(1); if (ok) setActiveStep(2); }} disabled={!isStepValid(1)} className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]">Continue</Button>
              )}

              {activeStep === 2 && (
                <Button type="button" size="sm" onClick={() => {
                  const totalItems = borrowCart.length + customItems.length;
                  if (totalItems === 0) { toast.error("Add at least one item to the cart."); return; }
                  setActiveStep(3);
                }} className={cn("rounded-lg px-5", (borrowCart.length + customItems.length) > 0 ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f]" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100")}>Review</Button>
              )}

              {activeStep === 3 && (
                <Button type="button" size="sm" onClick={confirmBorrow} disabled={saving} className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f] disabled:cursor-wait disabled:opacity-60">{saving ? "Saving..." : "Confirm Borrow"}</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
