import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

// ─── Validation ────────────────────────────────────────────────────────────
const validators = {
  firstName: (value) => {
    if (!value.trim()) return "First name is required";
    if (value.trim().length < 2) return "Must be at least 2 characters";
    return "";
  },
  lastName: (value) => {
    if (!value.trim()) return "Last name is required";
    if (value.trim().length < 2) return "Must be at least 2 characters";
    return "";
  },
  email: (value) => {
    if (!value.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return "Please enter a valid email";
    return "";
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const capitalizeName = (value) =>
  String(value).replace(/\b\w/g, (char) => char.toUpperCase());

const isNameField = (field) =>
  ["firstName", "lastName", "middleName", "suffix"].includes(field);

export default function UserAccountModal({ open, account, onClose, onSaved }) {
  const { showGlobalLoader: _showGlobalLoader, hideGlobalLoader } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [touched, setTouched] = useState({
    firstName: false,
    lastName: false,
    email: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  // Track cursor position for name fields
  const cursorRefs = useRef({});

  // ─── Populate / reset on account change ──────────────────────────────
  useEffect(() => {
    if (account) {
      setFirstName(account.first_name || "");
      setLastName(account.last_name || "");
      setMiddleName(account.middle_name || "");
      setSuffix(account.suffix || "");
      setEmail(account.email || "");
      setAccountType(account.account_type || "staff");
    } else {
      setFirstName("");
      setLastName("");
      setMiddleName("");
      setSuffix("");
      setEmail("");
      setAccountType("staff");
    }
    setError("");
    setTouched({ firstName: false, lastName: false, email: false });
    setFieldErrors({ firstName: "", lastName: "", email: "" });
  }, [account]);

  // ─── Cursor-safe name field handler ──────────────────────────────────
  // Stores the selection range before React re-renders so we can restore
  // it after state update, preventing the cursor from snapping to the end.
  const handleNameChange = useCallback((field, rawValue, setter) => {
    const input = cursorRefs.current[field];
    const selectionStart = input?.selectionStart ?? rawValue.length;
    const selectionEnd = input?.selectionEnd ?? rawValue.length;

    setter(rawValue);

    // Re-validate on change only if already touched
    if (touched[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: validators[field](rawValue) }));
    }

    // Restore cursor after React commits the state update
    requestAnimationFrame(() => {
      if (input) {
        input.selectionStart = selectionStart;
        input.selectionEnd = selectionEnd;
      }
    });
  }, [touched]);

  // ─── Blur: capitalize + validate ────────────────────────────────────
  const handleBlur = useCallback((field, value, setter) => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    let finalValue = value;
    if (isNameField(field)) {
      finalValue = capitalizeName(value);
      setter(finalValue);
    }

    setFieldErrors((prev) => ({
      ...prev,
      [field]: validators[field] ? validators[field](finalValue) : "",
    }));
  }, []);

  // ─── Email change (no capitalization) ───────────────────────────────
  const handleEmailChange = useCallback((rawValue) => {
    setEmail(rawValue);
    if (touched.email) {
      setFieldErrors((prev) => ({ ...prev, email: validators.email(rawValue) }));
    }
  }, [touched.email]);

  // ─── Validity ───────────────────────────────────────────────────────
  const isValid = useCallback(() => {
    return !validators.firstName(firstName) &&
           !validators.lastName(lastName) &&
           !validators.email(email);
  }, [firstName, lastName, email]);

  // ─── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isValid()) {
      setError("First name, last name, and email are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        first_name: capitalizeName(firstName.trim()),
        last_name: capitalizeName(lastName.trim()),
        middle_name: capitalizeName(middleName.trim()) || null,
        suffix: capitalizeName(suffix.trim()) || null,
        email: email.trim(),
        account_type: accountType,
      };

      if (account?.id) {
        const { error } = await supabase
          .from("user_accounts")
          .update(payload)
          .eq("id", account.id);
        if (error) throw error;
      } else {
        const { data: insertedAccount, error: insertError } = await supabase
          .from("user_accounts")
          .insert([payload])
          .select("id")
          .single();
        if (insertError) throw insertError;

        try {
          await createEmployeeInviteAndSendEmail({
            employeeId: insertedAccount.id,
            email: payload.email,
            toName: `${payload.first_name || ""} ${payload.last_name || ""}`.trim() || "User",
            role: payload.account_type,
          });
        } catch (emailError) {
          await supabase.from("user_accounts").delete().eq("id", insertedAccount.id);
          setError(
            `Account created, but email failed: ${emailError.message || "Unknown email error"}`,
          );
          return;
        }
      }

      onSaved();
    } catch (err) {
      setError(err.message || "Failed to save account.");
    } finally {
      hideGlobalLoader();
      setSaving(false);
    }
  };

  // ─── Input class helper ─────────────────────────────────────────────
  const inputClasses = (field) => {
    const hasError = touched[field] && fieldErrors[field];
    const isValidField = touched[field] && !fieldErrors[field];
    return cn(
      hasError &&
        "border-destructive bg-destructive/5 text-destructive placeholder:text-destructive/60 focus-visible:ring-destructive",
      isValidField &&
        "border-emerald-500 bg-emerald-50/40 focus-visible:ring-emerald-500"
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent
          className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {account ? "Edit User Account" : "Add User Account"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              {account
                ? "Update user account details below."
                : "Fill in the details to create a new user account."}
            </DialogDescription>
          </DialogHeader>

          {/* ── Body ───────────────────────────────────────────────── */}
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* First & Middle Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  First Name *
                </label>
                <Input
                  type="text"
                  value={firstName}
                  placeholder="Enter first name"
                  className={inputClasses("firstName")}
                  ref={(el) => (cursorRefs.current.firstName = el)}
                  onChange={(e) =>
                    handleNameChange("firstName", e.target.value, setFirstName)
                  }
                  onBlur={() => handleBlur("firstName", firstName, setFirstName)}
                />
                {touched.firstName && fieldErrors.firstName && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Middle Name
                </label>
                <Input
                  type="text"
                  value={middleName}
                  placeholder="Optional"
                  ref={(el) => (cursorRefs.current.middleName = el)}
                  onChange={(e) =>
                    handleNameChange("middleName", e.target.value, setMiddleName)
                  }
                  onBlur={() => handleBlur("middleName", middleName, setMiddleName)}
                />
              </div>
            </div>

            {/* Last Name & Suffix */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Last Name *
                </label>
                <Input
                  type="text"
                  value={lastName}
                  placeholder="Enter last name"
                  className={inputClasses("lastName")}
                  ref={(el) => (cursorRefs.current.lastName = el)}
                  onChange={(e) =>
                    handleNameChange("lastName", e.target.value, setLastName)
                  }
                  onBlur={() => handleBlur("lastName", lastName, setLastName)}
                />
                {touched.lastName && fieldErrors.lastName && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Suffix
                </label>
                <Input
                  type="text"
                  value={suffix}
                  placeholder="Jr., Sr., III"
                  ref={(el) => (cursorRefs.current.suffix = el)}
                  onChange={(e) =>
                    handleNameChange("suffix", e.target.value, setSuffix)
                  }
                  onBlur={() => handleBlur("suffix", suffix, setSuffix)}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email *
              </label>
              <Input
                type="email"
                value={email}
                placeholder="Enter email address"
                className={inputClasses("email")}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => handleBlur("email", email, setEmail)}
              />
              {touched.email && fieldErrors.email && (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Account Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Account Type
              </label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
            <Button
              type="button"
              onClick={onClose}
              disabled={saving}
              variant="outline"
              size="sm"
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={saving || !isValid()}
              size="sm"
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              {saving ? "Saving..." : account ? "Update" : "Proceed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation dialog ──────────────────────────────────────── */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {account ? "Update Account" : "Create Account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {account
                ? `Update ${firstName} ${lastName}'s account details?`
                : `Create account for ${firstName} ${lastName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-4">
            <AlertDialogCancel
              disabled={saving}
              className="rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f]"
            >
              {saving ? "Saving..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
