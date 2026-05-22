import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // Get field status (valid, invalid, or untouched)
  const getFieldStatus = (field, value) => {
    if (!touched[field]) return "untouched"; // No warning yet
    const error = 
      field === "firstName" ? validateFirstName(value) :
      field === "lastName" ? validateLastName(value) :
      field === "email" ? validateEmail(value) : "";
    return error ? "invalid" : "valid";
  };

  // Handle field change and real-time validation
  const handleFieldChange = (field, value, setter) => {
    setter(value);
    
    // Validate on change if field has been touched
    if (touched[field]) {
      let error = "";
      if (field === "firstName") error = validateFirstName(value);
      else if (field === "lastName") error = validateLastName(value);
      else if (field === "email") error = validateEmail(value);
      
      setFieldErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  // Handle field blur (mark as touched)
  const handleFieldBlur = (field, value) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    
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
    console.log("handleSave called");
    if (!isValid()) {
      console.log("Validation failed");
      setError("First name, last name, and email are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
        console.log("Starting save with:", { firstName, lastName, email, accountType });

      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        suffix: suffix.trim() || null,
        email: email.trim(),
        account_type: accountType,
      };

      if (account?.id) {
          console.log("Updating account:", account.id);
        const { error } = await supabase
          .from("user_accounts")
          .update(payload)
          .eq("id", account.id);
        if (error) throw error;
      } else {
          console.log("Creating new account");
        const { data: insertedAccount, error: insertError } = await supabase
          .from("user_accounts")
          .insert([payload])
          .select("id")
          .single();
          console.log("Insert response - error:", insertError, "data:", insertedAccount);
        if (insertError) throw insertError;

        try {
          console.log("Sending activation invite email");
          await createEmployeeInviteAndSendEmail({
            employeeId: insertedAccount.id,
            email: payload.email,
            toName: `${payload.first_name || ""} ${payload.last_name || ""}`.trim() || "User",
            role: payload.account_type,
          });
          console.log("Account email sent");
        } catch (emailError) {
          console.error("Account email failed:", emailError);
          await supabase.from("user_accounts").delete().eq("id", insertedAccount.id);
          setError(
            `Account created, but email failed: ${emailError.message || "Unknown email error"}`,
          );
          return;
        }
      }

      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
      setError(err.message || "Failed to save account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm !m-0 !p-0"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex h-full w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between rounded-t-[28px] border-b border-slate-100 bg-slate-50 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">User account</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                {account ? "Edit User Account" : "Add User Account"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 px-6 py-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

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
              {touched.firstName && !fieldErrors.firstName && (
                <p className="mt-1 text-xs text-green-600 font-medium">✓ Valid</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Middle Name
              </label>
              <Input
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Enter middle name (optional)"
              />
            </div>

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
              {touched.lastName && !fieldErrors.lastName && (
                <p className="mt-1 text-xs text-green-600 font-medium">✓ Valid</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Suffix
              </label>
              <Input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="e.g., Jr., Sr., III (optional)"
              />
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
              {touched.email && !fieldErrors.email && (
                <p className="mt-1 text-xs text-green-600 font-medium">✓ Valid</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Account Type
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 rounded-b-[28px] border-t border-slate-100 bg-slate-50 px-6 py-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </Button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={saving || !isValid()}
              className="rounded-full bg-[#4a1111] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3f0f0f] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : account ? "Update Account" : "Create Account"}
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
                onClick={() => {
                 console.log("Confirm button clicked");
                 handleSave();
                }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
