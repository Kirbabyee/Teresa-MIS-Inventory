import { useEffect, useState, useMemo } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/api/supabaseClient";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatDate = (dateString) => {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch (e) {
    return dateString;
  }
};

const formatDateLabel = (dateString) => {
  try {
    const date = new Date(dateString);
    return format(date, "MM/dd/yyyy");
  } catch (e) {
    return String(dateString || "");
  }
};

const parseSafeDate = (dateString) => {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    // try to display common fields
    if (value.brand) return String(value.brand);
    if (value.description) return String(value.description);
    if (value.status) return String(value.status);
    if (value.name) return String(value.name);
    if (value.type) return String(value.type);
    if (value.computer_number !== undefined && value.computer_number !== null) return String(value.computer_number);
    if (value.item_number !== undefined && value.item_number !== null) return String(value.item_number);
    if (value.serial_number) return String(value.serial_number);
    // fallback to first string value
    for (const key in value) {
      if (typeof value[key] === 'string' && value[key].trim() !== '') {
        return String(value[key]);
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
};

const formatChangeText = (oldVal, newVal) => `${formatValue(oldVal)} -> ${formatValue(newVal)}`;

const formatColumnLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return "-";

  return text
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
};

const renderChangeContent = (oldVal, newVal) => (
  <div className="inline-flex items-center justify-center gap-1 whitespace-pre-wrap break-words text-center">
    <span>{formatValue(oldVal)}</span>
    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#4a1111]" aria-hidden="true" />
    <span>{formatValue(newVal)}</span>
  </div>
);

const extractChangedPair = (oldData, newData, action) => {
  const skipKeys = new Set(['id', 'created_at', 'updated_at', 'change_ts', 'changed_by', 'action', 'section_id']);
  const preferredKeys = ['description', 'status', 'name', 'type', 'brand', 'remarks'];

  const pickDisplayValue = (payload) => {
    if (!payload || typeof payload !== 'object') return payload ?? null;

    for (const key of preferredKeys) {
      if (skipKeys.has(key)) continue;
      const value = payload[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return value;
      }
    }

    const fallbackKey = Object.keys(payload).find((key) => {
      if (skipKeys.has(key)) return false;
      const value = payload[key];
      return value !== null && value !== undefined && String(value).trim() !== '';
    });

    return fallbackKey ? payload[fallbackKey] : null;
  };

  const normalizedAction = String(action || '').toUpperCase();
  if (normalizedAction === 'INSERT') {
    return { oldVal: null, newVal: pickDisplayValue(newData), changedField: "created record" };
  }
  if (normalizedAction === 'DELETE') {
    return { oldVal: pickDisplayValue(oldData), newVal: null, changedField: "deleted record" };
  }

  if (oldData && newData && typeof oldData === 'object' && typeof newData === 'object') {
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    for (const k of keys) {
      if (skipKeys.has(k)) continue;
      const ov = oldData[k];
      const nv = newData[k];
      try {
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
          return { oldVal: ov ?? null, newVal: nv ?? null, changedField: k };
        }
      } catch (e) {
        if (String(ov) !== String(nv)) return { oldVal: ov ?? null, newVal: nv ?? null, changedField: k };
      }
    }
  }

  return {
    oldVal: pickDisplayValue(oldData),
    newVal: pickDisplayValue(newData),
    changedField: null,
  };
};

const getItemNumber = (oldData, newData) => {
  const candidateValues = [newData, oldData];

  for (const payload of candidateValues) {
    if (!payload || typeof payload !== 'object') continue;

    const itemNumber = payload.item_number;
    if (itemNumber !== null && itemNumber !== undefined && String(itemNumber).trim() !== '') {
      return itemNumber;
    }

    const computerNumber = payload.computer_number;
    if (computerNumber !== null && computerNumber !== undefined && String(computerNumber).trim() !== '') {
      return computerNumber;
    }
  }

  return null;
};

export default function InventorySectionHistoryView({ selectedTab, selectedSection, searchQuery = "", dateRange = { from: undefined, to: undefined } }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userMap, setUserMap] = useState({}); // maps uid or email -> display name
  const [dateOrder, setDateOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Form the logs table name from the tab's table name
  const logsTableName = selectedTab?.tableName ? `${selectedTab.tableName}_logs` : "";

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError("");

      if (!logsTableName || !selectedSection?.id) {
        setLogs([]);
        setUserMap({});
        setLoading(false);
        return;
      }

      try {
        let q = supabase
          .from(logsTableName)
          .select("id, change_ts, action, old_data, new_data, changed_by")
          .order("change_ts", { ascending: dateOrder === 'asc' })
          .limit(500);

        // Note: We cannot directly filter by section_id in the JSONB columns with supabase.js easily.
        // We'll fetch all logs and filter client-side by section_id in old_data or new_data.
        // For performance, we might want to limit the number of logs fetched (we already limit to 500).
        const { data, error: qErr } = await q;
        if (qErr) throw qErr;
        if (!mounted) return;
        const logsData = data || [];

        // Filter logs by section_id: check if old_data or new_data contains the section_id
        const sectionId = selectedSection.id;
        const filteredLogs = logsData.filter((log) => {
          const oldData = log.old_data;
          const newData = log.new_data;
          const hasSectionIdInOld = oldData && typeof oldData === 'object' && oldData.section_id === sectionId;
          const hasSectionIdInNew = newData && typeof newData === 'object' && newData.section_id === sectionId;
          return hasSectionIdInOld || hasSectionIdInNew;
        });

        setLogs(filteredLogs);

        // Resolve users: collect unique identifiers (email-like or uuid)
        const ids = new Set();
        const emails = new Set();
        for (const e of filteredLogs) {
          if (!e.changed_by) continue;
          if (typeof e.changed_by === 'string' && e.changed_by.includes && e.changed_by.includes('@')) emails.add(e.changed_by);
          else ids.add(e.changed_by);
        }

        const map = {};
        const normalizeName = (profile) => {
          const firstName = String(profile?.first_name || "").trim();
          const lastName = String(profile?.last_name || "").trim();
          const candidate = [firstName, lastName].filter(Boolean).join(" ").trim();

          return candidate || profile?.email || profile?.id || "system";
        };

        // Query by id if any
        if (ids.size > 0) {
          try {
            const { data: usersById } = await supabase.from('user_accounts').select('id, email, first_name, last_name').in('id', Array.from(ids));
            (usersById || []).forEach((u) => {
              const name = normalizeName(u);
              map[u.id] = name;
              if (u.email) map[u.email] = name;
            });
          } catch (e) {
            // ignore
          }
        }

        if (emails.size > 0) {
          try {
            const { data: usersByEmail } = await supabase.from('user_accounts').select('id, email, first_name, last_name').in('email', Array.from(emails));
            (usersByEmail || []).forEach((u) => {
              const name = normalizeName(u);
              map[u.email] = name;
              map[u.id] = name;
            });
          } catch (e) {
            // ignore
          }
        }

        if (mounted) setUserMap(map);
      } catch (err) {
        console.error("Failed to load history:", err);
        setError(err.message || "Failed to load history");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => (mounted = false);
  }, [selectedTab, selectedSection, dateOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSection?.id]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const displayedLogs = useMemo(() => {
    const minDate = dateRange?.from ? new Date(`${dateRange.from.toISOString().slice(0, 10)}T00:00:00.000`) : null;
    const maxDate = dateRange?.to ? new Date(`${dateRange.to.toISOString().slice(0, 10)}T23:59:59.999`) : null;

    return logs.filter((entry) => {
      const entryDate = parseSafeDate(entry.change_ts);
      if (!entryDate) return false;
      const matchesStart = !minDate || entryDate >= minDate;
      const matchesEnd = !maxDate || entryDate <= maxDate;
      if (!matchesStart || !matchesEnd) return false;

      if (!normalizedSearchQuery) return true;

      const changedBy = userMap[entry.changed_by] || entry.changed_by || "system";
      const { oldVal, newVal, changedField } = extractChangedPair(entry.old_data, entry.new_data, entry.action);
      const itemNumber = getItemNumber(entry.old_data, entry.new_data);
      const combined = [
        String(entry.action || ""),
        String(itemNumber ?? ""),
        String(changedBy || ""),
        formatColumnLabel(changedField),
        formatChangeText(oldVal, newVal),
        formatDateLabel(entry.change_ts),
        format(entryDate, "yyyy-MM-dd"),
        formatDate(entry.change_ts),
      ].join(" ").toLowerCase();
      return combined.includes(normalizedSearchQuery);
    });
  }, [logs, userMap, normalizedSearchQuery, dateRange]);

  const totalPages = Math.ceil(displayedLogs.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedLogs = displayedLogs.slice(startIdx, endIdx);
  const showingStart = displayedLogs.length === 0 ? 0 : startIdx + 1;
  const showingEnd = Math.min(endIdx, displayedLogs.length);

  const visiblePageNumbers = (() => {
    const maxVisible = 3;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const offset = Math.min(Math.max(currentPage - 2, 0), totalPages - maxVisible);
    const startPage = offset + 1;
    return Array.from({ length: maxVisible }, (_, index) => startPage + index);
  })();

  return (
    <div>
      {loading && (
        <div className="flex min-h-[220px] items-center justify-center p-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]" role="status" aria-label="Loading history" />
        </div>
      )}
      {error && <div className="p-4 text-sm text-rose-600">{error}</div>}

      {!loading && logs.length === 0 && <div className="p-4 text-sm text-slate-500">No history entries found.</div>}

      {!loading && logs.length > 0 && normalizedSearchQuery && displayedLogs.length === 0 && (
        <div className="p-4 text-sm text-slate-500">No logs match your search.</div>
      )
      }

      {!loading && displayedLogs.length > 0 ? (
        <div>
          <div className="w-full overflow-x-auto rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="text-sm font-medium text-slate-700">History</div>
            </div>
            <table className="min-w-full divide-y divide-slate-200 bg-white table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Action</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Item #</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Updated Column</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Changes</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Changed By</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 cursor-pointer hover:bg-slate-200" onClick={() => setDateOrder(dateOrder === 'desc' ? 'asc' : 'desc')}>Date {dateOrder === 'desc' ? '↓' : '↑'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedLogs.map((entry) => {
                  const { oldVal, newVal, changedField } = extractChangedPair(entry.old_data, entry.new_data, entry.action);
                  const itemNumber = getItemNumber(entry.old_data, entry.new_data);
                  const changedByKey = entry.changed_by || 'system';
                  const displayName = userMap[changedByKey] || entry.changed_by || 'system';
                  return (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-700 text-center align-top">{entry.action || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{itemNumber ?? "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{formatColumnLabel(changedField)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 align-top text-center">
                        <div className="text-xs text-center break-words">{renderChangeContent(oldVal, newVal)}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{displayName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{formatDate(entry.change_ts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
              <div className="text-sm text-muted-foreground">
                Showing {showingStart}–{showingEnd} of {displayedLogs.length}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {visiblePageNumbers.map((pageNumber) => {
                  const isActive = currentPage === pageNumber;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      className={isActive ? "rounded-md px-3 py-1 text-sm transition bg-[#4a1111] text-primary-foreground" : "rounded-md px-3 py-1 text-sm transition text-foreground hover:bg-accent hover:text-accent-foreground"}
                    >
                      {pageNumber}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : !loading && logs.length > 0 ? (
        <div className="p-4 text-sm text-slate-500">No history entries to show.</div>
      ) : null}
    </div>
  );
}