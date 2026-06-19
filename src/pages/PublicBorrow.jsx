import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { createBorrowingRecord } from "@/lib/borrowingApi";
import { User, Package, CheckCircle, Search, X, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSION_KEY = "app_session";

const initialForm = { name: "", studentId: "", role: "" };

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
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [customItemForm, setCustomItemForm] = useState({ name: "", brand: "", quantity: 1, condition: "Working", remarks: "" });
  const [customItems, setCustomItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // ensure numeric quantity
    setCustomItemForm((f) => ({ ...f, quantity: Number(f.quantity || 1) }));
  }, []);

  const validateField = (name, value) => {
    const v = String(value || "").trim();
    if (name === "name") {
      if (!v) return "Borrower name is required.";
      if (!/^[A-Za-z\s]+$/.test(v)) return "Name may contain only letters and spaces.";
    }
    if (name === "studentId") {
      if (!v) return "ID number is required.";
    }
    if (name === "role") {
      if (!v) return "Select borrower role.";
    }
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
      if (customItems.length === 0) errs.items = "Add at least one item to borrow.";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Pure check without setting state (avoid calling setState during render)
  const isStepValid = (step) => {
    if (step === 1) {
      return ["name", "studentId", "role"].every((k) => !validateField(k, form[k]));
    }
    if (step === 2) {
      return customItems.length > 0;
    }
    return true;
  };

  const addCustomItem = () => {
    const name = String(customItemForm.name || "").trim();
    if (!name) {
      toast.error("Item name is required.");
      return;
    }
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
  };

  const removeCustomItem = (idx) => setCustomItems((c) => c.filter((_, i) => i !== idx));

  const confirmBorrow = async () => {
    if (!validateStep(1) || !validateStep(2)) return;
    setSaving(true);
    try {
      const items = customItems.map((it) => ({ label: it.label, details: it.details }));
      await createBorrowingRecord({ borrowerName: form.name, borrowerIdNumber: form.studentId, borrowerRole: form.role, items });
      toast.success("Borrowing submitted. Thank you.");
      setForm(initialForm);
      setCustomItems([]);
      setActiveStep(1);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to submit borrowing.");
    } finally {
      setSaving(false);
    }
  };

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
            {/* Step 1 */}
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

            {/* Step 2: custom items */}
            {activeStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Select Items</h3>
                  <p className="mt-1 text-sm">Add items to your cart. You can add items outside inventory below.</p>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-[1fr_80px_90px_80px] gap-2 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Item</span>
                    <span className="text-center">Status</span>
                    <span className="text-center">In Stock</span>
                    <span className="text-right">Action</span>
                  </div>
                  <div className="py-6 text-center text-sm text-slate-400">Public borrowing uses a simplified custom-item flow. Use the form below to add items.</div>
                </div>

                {/* Custom Item Form (styled like modal) */}
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

                {/* Cart Summary */}
                {customItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Cart ({customItems.length} {customItems.length === 1 ? "item" : "items"})</h3>
                    </div>
                    <div className="grid grid-cols-[1fr_80px_120px] gap-3 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <span>Item</span>
                      <span className="text-center">Status</span>
                      <span className="text-center">Quantity</span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
                      {customItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_80px_120px] gap-3 items-center px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                            <p className="text-xs text-slate-400">Custom Item</p>
                          </div>
                          <div className="text-center"><span className="text-xs text-slate-400">—</span></div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-8 text-center text-sm font-semibold text-slate-700">{(item.details.find(d=>d.key==="quantity")||{}).value}</span>
                          </div>
                          <button type="button" onClick={() => removeCustomItem(idx)} className="shrink-0 rounded-md p-1.5 text-rose-500 transition hover:bg-rose-50" title="Remove"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3 */}
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
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-3"><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Items ({customItems.length})</h3></div>
                  <div className="grid grid-cols-[1fr_80px_120px] gap-4 bg-slate-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Item</span>
                    <span className="text-center">Status</span>
                    <span className="text-center">Quantity</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {customItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_80px_120px] gap-4 items-center px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.label}</p>
                          <p className="mt-0.5 text-xs text-slate-400">Custom Item</p>
                        </div>
                        <div className="text-center"><span className="text-xs text-slate-400">—</span></div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Qty: {(item.details.find(d=>d.key==="quantity")||{}).value}</span>
                          <button type="button" onClick={() => removeCustomItem(idx)} className="rounded-md p-1.5 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600" title="Remove item"><X className="h-4 w-4" /></button>
                        </div>
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
                <Button type="button" variant="outline" size="sm" onClick={() => { setForm(initialForm); setCustomItems([]); setActiveStep(1); }} className="rounded-lg">Cancel</Button>
              )}

              {activeStep === 1 && (
                <Button type="button" size="sm" onClick={() => { const ok = validateStep(1); if (ok) setActiveStep(2); }} disabled={!isStepValid(1)} className="rounded-lg bg-[#4a1111] px-5 text-white hover:bg-[#3f0f0f]">Continue</Button>
              )}

              {activeStep === 2 && (
                <Button type="button" size="sm" onClick={() => { if (customItems.length === 0) { toast.error("Add at least one item to the cart."); return; } setActiveStep(3); }} className={cn("rounded-lg px-5", customItems.length > 0 ? "bg-[#4a1111] text-white hover:bg-[#3f0f0f]" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100")}>Review</Button>
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
