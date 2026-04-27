import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
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
  const [accountType, setAccountType] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (account) {
      setFirstName(account.first_name || "");
      setLastName(account.last_name || "");
      setMiddleName(account.middle_name || "");
      setSuffix(account.suffix || "");
      setEmail(account.email || "");
      setAccountType(account.account_type || "user");
    } else {
      setFirstName("");
      setLastName("");
      setMiddleName("");
      setSuffix("");
      setEmail("");
      setAccountType("user");
    }
    setError("");
  }, [account, showConfirm]);

  const isValid = () => {
    return firstName.trim() && lastName.trim() && email.trim();
  };

  const handleSave = async () => {
    if (!isValid()) {
      setError("First name, last name, and email are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        suffix: suffix.trim() || null,
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
        const { error } = await supabase
          .from("user_accounts")
          .insert([payload]);
        if (error) throw error;
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
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              {account ? "Edit User Account" : "Add User Account"}
            </h2>
          </div>

          <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
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
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
              />
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
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
              />
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
              />
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
                <option value="viewer">Viewer</option>
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={saving || !isValid()}
            >
              {saving ? "Saving..." : account ? "Update Account" : "Create Account"}
            </Button>
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
              onClick={handleSave}
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
