import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { createEmployeeInviteAndSendEmail } from "@/lib/employeeInvites";
import { useAuth } from "@/lib/AuthContext";
import {
  Plus,
  Search,
  Edit,
  Mail,
  Trash2,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  staff: "bg-emerald-100 text-emerald-700 border-emerald-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
};

const accountStatusColors = {
  true: "bg-emerald-100 text-emerald-700 border-emerald-200",
  false: "bg-slate-100 text-slate-700 border-slate-200",
};

const createdAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});

const sortAccountsByStatus = (items) => {
  return [...items].sort((left, right) => {
    const leftInactive = left?.is_active === false ? 1 : 0;
    const rightInactive = right?.is_active === false ? 1 : 0;

    if (leftInactive !== rightInactive) {
      return leftInactive - rightInactive;
    }

    const leftDate = left?.created_at ? new Date(left.created_at).getTime() : 0;
    const rightDate = right?.created_at ? new Date(right.created_at).getTime() : 0;
    return rightDate - leftDate;
  });
};

const formatCreatedAt = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = createdAtFormatter.formatToParts(date).reduce((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
  }, {});

  return `${parts.month}/${parts.day}/${parts.year}`;
};

export default function UserAccounts() {
  const { showGlobalLoader, hideGlobalLoader } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteUsedByAccountId, setInviteUsedByAccountId] = useState({});
  const [inviteUsedByEmail, setInviteUsedByEmail] = useState({});
  const [search, setSearch] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [statusCandidate, setStatusCandidate] = useState(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [inviteActionCandidate, setInviteActionCandidate] = useState(null);
  const [inviteActionLoading, setInviteActionLoading] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 7;

  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

  const revokeExistingInvites = async (account) => {
    const expiryTime = new Date().toISOString();
    const normalizedEmail = normalizeEmail(account?.email);
    const requests = [];

    if (account?.id) {
      requests.push(
        supabase
          .from("user_auth_invites")
          .update({ expires_at: expiryTime })
          .eq("employee_id", account.id),
      );
      requests.push(
        supabase
          .from("user_auth_invites")
          .update({ expires_at: expiryTime })
          .eq("user_id", account.id),
      );
    }

    if (normalizedEmail) {
      requests.push(
        supabase
          .from("user_auth_invites")
          .update({ expires_at: expiryTime })
          .ilike("email", normalizedEmail),
      );
    }

    if (requests.length === 0) return;

    const results = await Promise.all(requests);
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw failure;
  };

  const removeAccountInvites = async (account) => {
    const normalizedEmail = normalizeEmail(account?.email);
    const requests = [];

    if (account?.id) {
      requests.push(
        supabase.from("user_auth_invites").delete().eq("employee_id", account.id),
      );
      requests.push(
        supabase.from("user_auth_invites").delete().eq("user_id", account.id),
      );
    }

    if (normalizedEmail) {
      requests.push(
        supabase.from("user_auth_invites").delete().ilike("email", normalizedEmail),
      );
    }

    if (requests.length === 0) return;

    const results = await Promise.all(requests);
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw failure;
  };

  const handleResendInvite = async (account) => {
    if (!account?.id) return;
    if (!account.email) {
      alert("This account needs an email before an invitation can be sent.");
      return;
    }

    try {
      setInviteActionLoading("resend");
      showGlobalLoader("Resending invitation...");
      await revokeExistingInvites(account);

      await createEmployeeInviteAndSendEmail({
        employeeId: account.id,
        email: account.email,
        toName: `${account.first_name || ""} ${account.last_name || ""}`.trim() || "User",
        role: account.account_type || "staff",
      });

      setInviteActionCandidate(null);
      await load();
      alert("A fresh activation invitation has been sent.");
    } catch (error) {
      console.error("Resend invite failed:", error.message);
      alert(`Failed to resend invitation: ${error.message}`);
    } finally {
      hideGlobalLoader();
      setInviteActionLoading("");
    }
  };

  const handleCancelInvite = async (account) => {
    if (!account?.id) return;

    try {
      setInviteActionLoading("cancel");
      showGlobalLoader("Canceling invitation...");
      await revokeExistingInvites(account);
      await removeAccountInvites(account);

      const { error } = await supabase
        .from("user_accounts")
        .delete()
        .eq("id", account.id);

      if (error) throw error;

      setInviteActionCandidate(null);
      await load();
      alert("Invitation canceled and the account was removed.");
    } catch (error) {
      console.error("Cancel invite failed:", error.message);
      alert(`Failed to cancel invitation: ${error.message}`);
    } finally {
      hideGlobalLoader();
      setInviteActionLoading("");
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("user_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(sortAccountsByStatus(data || []));
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

  const handleToggleAccountStatus = async () => {
    if (!statusCandidate?.id) return;

    try {
      showGlobalLoader(statusCandidate.is_active === false ? "Reactivating account..." : "Deactivating account...");
      const { error } = await supabase
        .from("user_accounts")
        .update({ is_active: !Boolean(statusCandidate.is_active) })
        .eq("id", statusCandidate.id);

      if (error) throw error;
      setStatusCandidate(null);
      await load();
    } catch (error) {
      console.error("Account status update failed:", error.message);
      alert(`Failed to update account status: ${error.message}`);
    } finally {
      hideGlobalLoader();
    }
  };

  const filtered = accounts.filter((acc) => {
    const name = `${acc.first_name || ""} ${acc.last_name || ""}`.toLowerCase();
    const searchTerm = search.trim().toLowerCase();
    const matchSearch =
      !searchTerm ||
      name.includes(searchTerm) ||
      (acc.email || "").toLowerCase().includes(searchTerm);
    const matchType = !accountTypeFilter || acc.account_type === accountTypeFilter;
    return matchSearch && matchType;
  });

  const sortedFiltered = sortAccountsByStatus(filtered);
  const totalPages = Math.ceil(sortedFiltered.length / itemsPerPage);
  const pageStartIndex = (page - 1) * itemsPerPage;
  const pageEndIndex = pageStartIndex + itemsPerPage;
  const paginatedAccounts = sortedFiltered.slice(pageStartIndex, pageEndIndex);

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
  }, [search, accountTypeFilter]);

  const uniqueAccountTypes = [...new Set(accounts.map(a => a.account_type).filter(Boolean))];
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]"
          role="status"
          aria-label="Loading user accounts"
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => {
            setEditAccount(null);
            setShowModal(true);
          }}
          className="gap-2 bg-[#4a1111] text-white hover:bg-[#3f0f0f]"
        >
          <Plus className="h-4 w-4" /> Add Account
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
        <Select
          value={accountTypeFilter || "__ALL__"}
          onValueChange={(v) => setAccountTypeFilter(v === "__ALL__" ? "" : v)}
        >
          <SelectTrigger
            className={"h-9 w-full sm:w-48 rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-600 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"}
          >
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">All Types</SelectItem>
            {uniqueAccountTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity duration-300">
        {loadError && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error loading accounts: {loadError}
          </div>
        )}
        {!loading && sortedFiltered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>No accounts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full transition-opacity duration-300">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    "Name",
                    "Email",
                    "Account Type",
                    "Status",
                    "Created At",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide${h === "Account Type" ? " w-[120px]" : ""}${h === "Status" ? " w-[110px]" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className={`transition-colors ${acc.is_active === false ? "bg-slate-100 text-slate-400 opacity-75 grayscale" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${acc.is_active === false ? "bg-slate-200 text-slate-400" : "bg-slate-300 text-slate-700"}`}>
                          {acc.first_name?.[0]}
                          {acc.last_name?.[0]}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${acc.is_active === false ? "text-slate-500" : "text-slate-900"}`}>
                            {acc.first_name} {acc.middle_name ? `${acc.middle_name} ` : ""}{acc.last_name}
                            {acc.suffix ? ` ${acc.suffix}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${acc.is_active === false ? "text-slate-400" : "text-slate-600"}`}>
                      {acc.email || "—"}
                    </td>
                    <td className="px-4 py-3 w-[120px]">
                      <span
                        className={`inline-flex w-[100px] justify-center text-xs font-semibold px-2 py-1 rounded-md border ${accountTypeColors[acc.account_type] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                      >
                        {acc.account_type ? acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-[110px]">
                      <span
                        className={`inline-flex w-[90px] justify-center text-xs font-semibold px-2 py-1 rounded-md border ${accountStatusColors[String(acc.is_active !== false)]}`}
                      >
                        {acc.is_active === false ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm ${acc.is_active === false ? "text-slate-400" : "text-slate-600"}`}>
                      {formatCreatedAt(acc.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Open actions for ${acc.first_name || acc.last_name || acc.email || "account"}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditAccount(acc);
                                requestAnimationFrame(() => setShowModal(true));
                              }}
                            >
                              <Edit className="h-4 w-4" />
                              Edit account
                            </DropdownMenuItem>

                            {(!inviteUsedByAccountId[String(acc.id)] && !(acc.email && inviteUsedByEmail[String(acc.email).toLowerCase()])) && (
                              <DropdownMenuItem
                                onSelect={() => setInviteActionCandidate(acc)}
                                disabled={!acc.email}
                              >
                                <Mail className="h-4 w-4" />
                                Invitation actions
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onSelect={() => setStatusCandidate(acc)}>
                              {acc.is_active === false ? (
                                <UserCheck className="h-4 w-4" />
                              ) : (
                                <UserX className="h-4 w-4" />
                              )}
                              {acc.is_active === false ? "Reactivate account" : "Deactivate account"}
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
        )}

        {sortedFiltered.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
            <div className="text-sm text-slate-500">
              Showing {Math.min(pageStartIndex + 1, sortedFiltered.length)}–{Math.min(pageEndIndex, sortedFiltered.length)} of {sortedFiltered.length}
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

      {/* Global loader used via AuthContext; local overlay removed to avoid positioning issues */}

      <UserAccountModal
        open={showModal}
        account={editAccount}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          load();
        }}
      />

      <AlertDialog
        open={Boolean(statusCandidate)}
        onOpenChange={(open) => {
          if (!open && !statusChanging) setStatusCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusCandidate?.is_active === false ? "Reactivate Account" : "Deactivate Account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusCandidate
                ? statusCandidate.is_active === false
                  ? `Reactivate ${statusCandidate.first_name || ""} ${statusCandidate.last_name || ""}'s account so they can log in again.`
                  : `Deactivate ${statusCandidate.first_name || ""} ${statusCandidate.last_name || ""}'s account? They will no longer be able to log in until reactivated.`
                : "Update account status?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusChanging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleAccountStatus}
              disabled={statusChanging}
              className={statusCandidate?.is_active === false ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
            >
              {statusChanging
                ? statusCandidate?.is_active === false
                  ? "Reactivating..."
                  : "Deactivating..."
                : statusCandidate?.is_active === false
                  ? "Reactivate"
                  : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(inviteActionCandidate)}
        onOpenChange={(open) => {
          if (!open && !inviteActionLoading) setInviteActionCandidate(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Account invitation
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              Choose how you want to handle the activation invite for this account.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#4a1111] text-sm font-semibold text-white">
                  {inviteActionCandidate?.first_name?.[0] || inviteActionCandidate?.email?.[0] || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {inviteActionCandidate
                      ? `${inviteActionCandidate.first_name || ""} ${inviteActionCandidate.last_name || ""}`.trim() || inviteActionCandidate.email || "User"
                      : "User"}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    {inviteActionCandidate?.email || "No email available"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => handleResendInvite(inviteActionCandidate)}
                disabled={!inviteActionCandidate?.email || inviteActionLoading === "resend" || inviteActionLoading === "cancel"}
                className="group flex w-full items-start gap-4 rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="mt-0.5 flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {inviteActionLoading === "resend" ? "Sending invitation..." : "Resend email invitation"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Send a fresh activation email with a new link and invalidate the previous invite.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCancelInvite(inviteActionCandidate)}
                disabled={inviteActionLoading === "resend" || inviteActionLoading === "cancel"}
                className="group flex w-full items-start gap-4 rounded-2xl border border-rose-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="mt-0.5 flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-rose-100 text-rose-700 transition group-hover:bg-rose-600 group-hover:text-white">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {inviteActionLoading === "cancel" ? "Canceling invitation..." : "Cancel invitation"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Expire the invite, delete the pending account record, and remove it from the list.
                  </p>
                </div>
              </button>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteActionCandidate(null)}
              disabled={inviteActionLoading === "resend" || inviteActionLoading === "cancel"}
              className="rounded-lg"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
