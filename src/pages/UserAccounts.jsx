import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import {
  Plus,
  Search,
  Edit,
  Mail,
  Trash2,
} from "lucide-react";
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
import UserAccountModal from "@/components/UserAccountModal";

const accountTypeColors = {
  staff: "bg-blue-100 text-blue-700 border-blue-200",
  admin: "bg-red-100 text-red-700 border-red-200",
};

export default function UserAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteUsedByAccountId, setInviteUsedByAccountId] = useState({});
  const [inviteUsedByEmail, setInviteUsedByEmail] = useState({});
  const [search, setSearch] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("user_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
      // Load related invites so we can hide the Mail button when invite.used_at exists
      try {
        const accountIds = (data || []).map((a) => a.id).filter(Boolean);
        const emails = (data || []).map((a) => a.email).filter(Boolean);
        const inviteQueries = [];
        if (accountIds.length > 0) {
          inviteQueries.push(
            supabase
              .from("user_auth_invites")
              .select("user_id, email, used_at")
              .in("user_id", accountIds)
          );
        }
        if (emails.length > 0) {
          inviteQueries.push(
            supabase
              .from("user_auth_invites")
              .select("user_id, email, used_at")
              .in("email", emails)
          );
        }
        if (inviteQueries.length > 0) {
          const inviteResults = await Promise.all(inviteQueries);
          const allInvites = inviteResults.flatMap((r) => r.data || []);
          const usedById = {};
          const usedByEmail = {};
          allInvites.forEach((row) => {
            if (row.user_id) usedById[String(row.user_id)] = usedById[String(row.user_id)] || Boolean(row.used_at);
            if (row.email) usedByEmail[String(row.email).toLowerCase()] = usedByEmail[String(row.email).toLowerCase()] || Boolean(row.used_at);
          });
          setInviteUsedByAccountId(usedById);
          setInviteUsedByEmail(usedByEmail);
        } else {
          setInviteUsedByAccountId({});
          setInviteUsedByEmail({});
        }
      } catch (e) {
        console.error("Failed to load invites for user accounts:", e?.message || e);
        setInviteUsedByAccountId({});
        setInviteUsedByEmail({});
      }
    } catch (error) {
      console.error("Error loading user accounts:", error.message);
      setLoadError(error.message || "Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async () => {
    if (!deleteCandidate?.id) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from("user_accounts")
        .delete()
        .eq("id", deleteCandidate.id);

      if (error) throw error;
      setDeleteCandidate(null);
      await load();
    } catch (error) {
      console.error("Delete failed:", error.message);
      alert(`Failed to delete account: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = accounts.filter((acc) => {
    const name = `${acc.first_name || ""} ${acc.last_name || ""}`.toLowerCase();
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      (acc.email || "").toLowerCase().includes(search.toLowerCase());
    const matchType = !accountTypeFilter || acc.account_type === accountTypeFilter;
    return matchSearch && matchType;
  });

  const uniqueAccountTypes = [...new Set(accounts.map(a => a.account_type).filter(Boolean))];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Accounts
          </h1>
          <p className="text-slate-500 text-sm">
            {accounts.length} total accounts
          </p>
        </div>
        <Button
          onClick={() => {
            setEditAccount(null);
            setShowModal(true);
          }}
          className="gap-2 bg-[#4a1111] hover:bg-[#3f0f0f] text-white"
        >
          <Plus className="w-4 h-4" /> Add Account
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 bg-white"
        >
          <option value="">All Types</option>
          {uniqueAccountTypes.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loadError && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error loading accounts: {loadError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>No accounts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    "Name",
                    "Email",
                    "Account Type",
                    "Created",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((acc) => (
                  <tr
                    key={acc.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs shrink-0">
                          {acc.first_name?.[0]}
                          {acc.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {acc.first_name} {acc.middle_name ? `${acc.middle_name} ` : ""}{acc.last_name}
                            {acc.suffix ? ` ${acc.suffix}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {acc.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full border ${accountTypeColors[acc.account_type] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                      >
                        {acc.account_type ? acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {acc.created_at
                        ? new Date(acc.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        
                        {/* Edit */}
                        <button
                          onClick={() => {
                            setEditAccount(acc);
                            setShowModal(true);
                          }}
                          className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-200"
                          title="Edit Account"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {/* Email */}
                        {(!inviteUsedByAccountId[String(acc.id)] && !(acc.email && inviteUsedByEmail[String(acc.email).toLowerCase()])) && (
                          <button
                            onClick={() => {
                              if (acc.email) {
                                window.location.href = `mailto:${acc.email}`;
                              }
                            }}
                            disabled={!acc.email}
                            className="p-2 rounded-lg bg-green-100 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Send Email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteCandidate(acc)}
                          className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200"
                          title="Delete Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <UserAccountModal
          account={editAccount}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate
                ? `Are you sure you want to delete ${deleteCandidate.first_name || ""} ${deleteCandidate.last_name || ""}'s account? This action cannot be undone.`
                : "Delete account?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
