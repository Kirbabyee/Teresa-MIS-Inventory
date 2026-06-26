import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle,
  Clock,
  ShieldCheck,
  XCircle,
  Inbox,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/api/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Helpers ──────────────────────────────────────────────────────────────

const formatDate = (value) => {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM dd, yyyy  h:mm a");
  } catch {
    return "—";
  }
};

const formatShortDate = (value) => {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM dd, yyyy");
  } catch {
    return "—";
  }
};

// ── Main Component ────────────────────────────────────────────────────────

export default function BorrowingApprovals() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  // ── Fetch pending approval records ─────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("borrowing_records_approval")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error("Failed to load approval queue:", err);
      toast.error("Failed to load approval queue.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Fetch items for a selected record ────────────────────────────────────
  const handleSelectRecord = useCallback(async (record) => {
    setSelectedRecord(record);
    const { data, error } = await supabase
      .from("borrowing_items_approval")
      .select("*")
      .eq("borrowing_record_id", record.id);

    if (error) {
      console.error("Failed to fetch approval items:", error);
      setSelectedItems([]);
    } else {
      setSelectedItems(data || []);
    }
  }, []);

  // ── Approve ────────────────────────────────────────────────────────────
  const handleApprove = async (record) => {
    setProcessingId(record.id);
    try {
      // 1. Insert into live borrowing_records table
      const { data: inserted, error: insertError } = await supabase
        .from("borrowing_records")
        .insert([
          {
            borrower_name: record.borrower_name,
            borrower_id_number: record.borrower_id_number,
            borrower_role: record.borrower_role,
            status: "borrowed",
            expected_return_at: record.expected_return_at,
            borrowed_at: record.borrowed_at || record.created_at || new Date().toISOString(),
          },
        ])
        .select("id")
        .single();

      if (insertError) {
        console.error("Step 1 - insert borrowing_records failed:", insertError);
        throw insertError;
      }

      // 2. Move associated items from borrowing_items_approval → borrowing_items
      const { data: approvalItems, error: itemsFetchError } = await supabase
        .from("borrowing_items_approval")
        .select("*")
        .eq("borrowing_record_id", record.id);

      if (itemsFetchError) {
        console.error("Step 2 - fetch borrowing_items_approval failed:", itemsFetchError);
        throw itemsFetchError;
      }

      if (approvalItems && approvalItems.length > 0) {
        const liveItems = approvalItems.map((item) => ({
          borrowing_record_id: inserted.id,
          inventory_item_id: item.inventory_item_id,
          inventory_tab_id: item.inventory_tab_id,
          inventory_section_id: item.inventory_section_id,
          inventory_table_name: item.inventory_table_name,
          item_label: item.item_label,
          item_details: item.item_details,
        }));

        const { error: itemsInsertError } = await supabase
          .from("borrowing_items")
          .insert(liveItems);

        if (itemsInsertError) {
          console.error("Step 2b - insert borrowing_items failed:", itemsInsertError);
          throw itemsInsertError;
        }
      }

      // 3. Mark approval record as approved
      const { error: updateError } = await supabase
        .from("borrowing_records_approval")
        .update({ status: "approved" })
        .eq("id", record.id);

      if (updateError) {
        console.error("Step 3 - update borrowing_records_approval failed:", updateError);
        throw updateError;
      }

      toast.success(`Approved borrowing request for ${record.borrower_name}.`);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (err) {
      console.error("Approval failed:", err);
      const detail = err?.message || err?.details || err?.hint || "Unknown error";
      toast.error(`Failed to approve: ${detail}`);
    } finally {
      setProcessingId(null);
    }
  };

  // ── Deny ───────────────────────────────────────────────────────────────
  const handleDeny = async (record) => {
    setProcessingId(record.id);
    try {
      const { error } = await supabase
        .from("borrowing_records_approval")
        .update({ status: "denied" })
        .eq("id", record.id);

      if (error) {
        console.error("Deny update failed:", error);
        throw error;
      }

      toast.success(`Denied borrowing request for ${record.borrower_name}.`);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (err) {
      console.error("Denial failed:", err);
      const detail = err?.message || err?.details || err?.hint || "Unknown error";
      toast.error(`Failed to deny: ${detail}`);
    } finally {
      setProcessingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const pendingCount = records.length;

  return (
    <div className="p-6 bg-slate-50/50 min-h-screen font-sans">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
          Borrowing Request Queue
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {pendingCount === 0
            ? "No pending authorizations"
            : `${pendingCount} pending authorization${pendingCount !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* ── Table Card ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-left border-b border-slate-100">
                  Name &amp; Role
                </th>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-left border-b border-slate-100">
                  ID Number
                </th>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-left border-b border-slate-100">
                  Requested At
                </th>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-left border-b border-slate-100">
                  Expected Return
                </th>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-left border-b border-slate-100">
                  Description
                </th>
                <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 py-2.5 px-4 text-right border-b border-slate-100">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Clock className="h-5 w-5 animate-spin text-slate-300" />
                      <span>Loading queue...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                        <Inbox className="h-6 w-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        No pending borrowing authorizations required.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => handleSelectRecord(record)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50/60 ${
                      processingId === record.id ? "opacity-50" : ""
                    }`}
                  >
                    {/* Name & Role */}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800">
                          {record.borrower_name || "—"}
                        </span>
                        <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mt-0.5 inline-block uppercase font-mono w-fit">
                          {record.borrower_role || "STUDENT"}
                        </span>
                      </div>
                    </td>

                    {/* ID Number */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-600">
                        {record.borrower_id_number || "—"}
                      </span>
                    </td>

                    {/* Requested At */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-600">
                        {formatDate(record.created_at || record.borrowed_at)}
                      </span>
                    </td>

                    {/* Expected Return */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-600">
                        {formatShortDate(record.expected_return_at)}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-500 max-w-xs truncate block" title={record.description || ""}>
                        {record.description || "—"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleApprove(record)}
                          disabled={processingId !== null}
                          className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 hover:bg-emerald-100/80 rounded px-2.5 py-1 transition-colors mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeny(record)}
                          disabled={processingId !== null}
                          className="text-xs font-medium text-slate-400 hover:text-rose-600 rounded px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5" />
                            Deny
                          </span>
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

      {/* ── Detail Modal ───────────────────────────────────────────────── */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent
          className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <DialogHeader className="border-b border-slate-200 bg-white px-8 pt-8 pb-6 sm:px-10">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Borrowing Request
            </DialogTitle>
            <p className="mt-1 text-sm text-slate-400">
              {formatDate(selectedRecord?.created_at || selectedRecord?.borrowed_at)}
            </p>
          </DialogHeader>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-8 py-8 sm:px-10 space-y-8">
            {/* Borrower Info */}
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
                Transaction Details
              </h3>
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {/* Left column: Borrower */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Full Name</p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">
                      {selectedRecord?.borrower_name || "—"}
                    </p>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs font-medium text-slate-400">ID Number</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {selectedRecord?.borrower_id_number || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">Role</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {selectedRecord?.borrower_role || "—"}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Right column: Dates */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Requested At</p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">
                      {formatDate(selectedRecord?.created_at || selectedRecord?.borrowed_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Expected Return</p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">
                      {formatShortDate(selectedRecord?.expected_return_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Items List */}
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Requested Items
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span>{selectedItems.length} {selectedItems.length === 1 ? "item" : "items"}</span>
                </div>
              </div>

              {selectedItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Clock className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">No items found for this request.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedItems.map((item, idx) => {
                    const details = Array.isArray(item.item_details) ? item.item_details : [];
                    const tabName = item.inventory_table_name || "Inventory";
                    const sectionName = item.inventory_section_id || "";
                    return (
                      <div
                        key={item.id || idx}
                        className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                      >
                        {/* Header strip */}
                        <div className="bg-slate-50/60 border-b border-slate-100 px-5 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-slate-900 leading-snug truncate">
                                {item.item_label || "Unnamed Item"}
                              </p>
                              <p className="mt-0.5 text-sm text-slate-400 truncate">
                                {tabName}{sectionName ? ` · ${sectionName}` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                        {/* Item details */}
                        {details.length > 0 && (
                          <div className="px-5 pt-4 pb-4">
                            <div className="flex flex-col gap-y-2">
                              {details.map((field, dIdx) => {
                                const key = String(field?.key || "");
                                const label = field?.label || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                                const value = typeof field?.value === "object" ? JSON.stringify(field.value) : String(field?.value ?? "");
                                if (!value || value === "null" || value === "undefined" || value === "[object Object]") return null;
                                return (
                                  <div key={`${item.id}-${key}-${dIdx}`} className="flex items-baseline gap-2 min-w-0">
                                    <span className="shrink-0 text-xs font-medium text-slate-400">
                                      {label}:
                                    </span>
                                    <span className="truncate text-sm font-semibold text-slate-900">{value}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Footer Actions ─────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/50 px-8 py-4 sm:px-10">
            <button
              type="button"
              onClick={() => setSelectedRecord(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                handleDeny(selectedRecord);
                setSelectedRecord(null);
              }}
              disabled={processingId !== null}
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-4 w-4" />
                Deny
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleApprove(selectedRecord);
                setSelectedRecord(null);
              }}
              disabled={processingId !== null}
              className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a0d0d] transition-colors disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                Approve
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
