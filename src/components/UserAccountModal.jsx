import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
import { useAuth } from "@/lib/AuthContext";

import { Input } from "@/components/ui/input";
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

export default function UserAccountModal({ account, onClose, onSaved }) {
  const { showGlobalLoader, hideGlobalLoader } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Validation state
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

  // Validation functions
  const validateFirstName = (value) => {
    if (!value.trim()) return "First name is required";
    if (value.trim().length < 2) return "First name must be at least 2 characters";
    return "";
  };

  const validateLastName = (value) => {
    if (!value.trim()) return "Last name is required";
    if (value.trim().length < 2) return "Last name must be at least 2 characters";
    return "";
  };

  const validateEmail = (value) => {
    if (!value.trim()) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value.trim())) return "Please enter a valid email";
    return "";
  };

  // Auto-capitalize first letter of each word
  const capitalizeName = (value) => {
    return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Handle field change and real-time validation
  const handleFieldChange = (field, value, setter) => {
    // Auto-capitalize name fields
    const capitalized = (field === "firstName" || field === "lastName" || field === "middleName" || field === "suffix")
      ? capitalizeName(value)
      : value;
    setter(capitalized);

    // Validate on change if field has been touched
    if (touched[field]) {
      let error = "";
      if (field === "firstName") error = validateFirstName(capitalized);
      else if (field === "lastName") error = validateLastName(capitalized);
      else if (field === "email") error = validateEmail(capitalized);

      setFieldErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  // Handle field blur (mark as touched, capitalize, validate)
  const handleFieldBlur = (field, value) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    // Re-apply capitalization on blur for name fields
    if (field === "firstName" || field === "lastName" || field === "middleName" || field === "suffix") {
      const capitalized = capitalizeName(value);
      if (field === "firstName") setFirstName(capitalized);
      else if (field === "lastName") setLastName(capitalized);
      else if (field === "middleName") setMiddleName(capitalized);
      else if (field === "suffix") setSuffix(capitalized);
    }

    let error = "";
    if (field === "firstName") error = validateFirstName(value);
    else if (field === "lastName") error = validateLastName(value);
    else if (field === "email") error = validateEmail(value);

    setFieldErrors(prev => ({ ...prev, [field]: error }));
  };


  const isValid = () => {
    const firstNameError = validateFirstName(firstName);
    const lastNameError = validateLastName(lastName);
    const emailError = validateEmail(email);
    return !firstNameError && !lastNameError && !emailError;
  };

  const handleSave = async () => {
    if (!isValid()) {
      setError("First name, last name, and email are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
        console.log("Starting save with:", { firstName, lastName, email, accountType });

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

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm !m-0 !p-0"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="relative flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8 rounded-t-[28px]">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {account ? "Edit User Account" : "Add User Account"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {account ? "Update user account details below." : "Fill in the details to create a new user account."}
              </p>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  First Name *
                </label>
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e) => handleFieldChange("firstName", e.target.value, setFirstName)}
                  onBlur={() => handleFieldBlur("firstName", firstName)}
                  placeholder="Enter first name"
                  className={`${
                    touched.firstName
                      ? fieldErrors.firstName
                        ? "border-red-500 bg-red-50 focus:border-red-500"
                        : "border-green-500 bg-green-50 focus:border-green-500"
                      : ""
                  }`}
                />
                {touched.firstName && fieldErrors.firstName && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors.firstName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Middle Name
                </label>
                <Input
                  type="text"
                  value={middleName}
                  onChange={(e) => handleFieldChange("middleName", e.target.value, setMiddleName)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Last Name *
                </label>
                <Input
                  type="text"
                  value={lastName}
                  onChange={(e) => handleFieldChange("lastName", e.target.value, setLastName)}
                  onBlur={() => handleFieldBlur("lastName", lastName)}
                  placeholder="Enter last name"
                  className={`${
                    touched.lastName
                      ? fieldErrors.lastName
                        ? "border-red-500 bg-red-50 focus:border-red-500"
                        : "border-green-500 bg-green-50 focus:border-green-500"
                      : ""
                  }`}
                />
                {touched.lastName && fieldErrors.lastName && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors.lastName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Suffix
                </label>
                <Input
                  type="text"
                  value={suffix}
                  onChange={(e) => handleFieldChange("suffix", e.target.value, setSuffix)}
                  placeholder="Jr., Sr., III"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email *
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => handleFieldChange("email", e.target.value, setEmail)}
                onBlur={() => handleFieldBlur("email", email)}
                placeholder="Enter email address"
                className={`${
                  touched.email
                    ? fieldErrors.email
                      ? "border-red-500 bg-red-50 focus:border-red-500"
                      : "border-green-500 bg-green-50 focus:border-green-500"
                    : ""
                }`}
              />
              {touched.email && fieldErrors.email && (
                <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Account Type
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-slate-200 bg-white px-6 py-4 sm:px-8 rounded-b-[28px]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-6 py-2 rounded-lg text-sm border border-[#4a1111] text-[#4a1111] hover:bg-[#4a1111] hover:text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={saving || !isValid()}
              className="px-6 py-2 rounded-lg text-sm bg-[#4a1111] text-white hover:opacity-90 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : account ? "UPDATE" : "PROCEED"}
            </button>
          </div>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
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
          <AlertDialogFooter className="gap-4">
            <AlertDialogCancel
              disabled={saving}
              className="px-6 py-2 rounded-lg text-sm border border-[#4a1111] text-[#4a1111] hover:bg-[#4a1111] hover:text-white transition m-0"
            >
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleSave();
              }}
              disabled={saving}
              className="px-6 py-2 rounded-lg text-sm bg-[#4a1111] text-white hover:opacity-90 transition m-0"
            >
              {saving ? "Saving..." : "CONFIRM"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
