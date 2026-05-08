import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    const month = monthNames[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (e) {
    return dateString;
  }
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    // try to display common fields
    if (value.brand) return String(value.brand);
    if (value.description) return String(value.description);
    if (value.status) return String(value.status);
    return JSON.stringify(value);
  }
  return String(value);
};

const extractChangedPair = (oldData, newData, action) => {
  const skipKeys = new Set(['id', 'lab_number_id', 'created_at', 'updated_at', 'change_ts', 'changed_by', 'action', 'component_type', 'computer_number', 'type']);
  const preferredKeys = ['brand', 'description', 'status', 'remarks'];

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
    return { oldVal: null, newVal: pickDisplayValue(newData) };
  }
  if (normalizedAction === 'DELETE') {
    return { oldVal: pickDisplayValue(oldData), newVal: null };
  }

  if (oldData && newData && typeof oldData === 'object' && typeof newData === 'object') {
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    for (const k of keys) {
      if (skipKeys.has(k)) continue;
      const ov = oldData[k];
      const nv = newData[k];
      try {
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
          return { oldVal: ov ?? null, newVal: nv ?? null };
        }
      } catch (e) {
        if (String(ov) !== String(nv)) return { oldVal: ov ?? null, newVal: nv ?? null };
      }
    }
  }

  return {
    oldVal: pickDisplayValue(oldData),
    newVal: pickDisplayValue(newData),
  };
};

export default function InventoryHistoryView({ selectedLab }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userMap, setUserMap] = useState({}); // maps uid or email -> display name
  const [labOptions, setLabOptions] = useState([]);
  const [filterLab, setFilterLab] = useState(selectedLab || "all");
  const [filterComponent, setFilterComponent] = useState("all");
  const [dateOrder, setDateOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError("");
      try {
        let q = supabase
          .from("inventory_change_logs")
          .select("id, change_ts, action, component_type, computer_number, lab_number_id, old_data, new_data, changed_by")
          .order("change_ts", { ascending: dateOrder === 'asc' })
          .limit(500);
        if (filterLab && filterLab !== 'all') q = q.eq("lab_number_id", filterLab);
        if (filterComponent && filterComponent !== 'all') q = q.eq("component_type", filterComponent);
        const { data, error: qErr } = await q;
        if (qErr) throw qErr;
        if (!mounted) return;
        const logsData = data || [];
        setLogs(logsData);

        // Resolve users: collect unique identifiers (email-like or uuid)
        const ids = new Set();
        const emails = new Set();
        for (const e of logsData) {
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
        // fetch lab options for filter
        try {
          const { data: labs } = await supabase.from('lab_numbers').select('id, lab_number, name').order('lab_number', { ascending: true });
          if (mounted) setLabOptions((labs || []).map(l => ({ value: l.id, label: l.name || `Laboratory ${l.lab_number}`})));
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error("Failed to load history:", err);
        setError(err.message || "Failed to load history");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => (mounted = false);
  }, [selectedLab, filterLab, filterComponent, dateOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterLab]);

  useEffect(() => {
    // keep filterLab in sync if parent selectedLab changes
    if (selectedLab) setFilterLab(selectedLab);
  }, [selectedLab]);

  const componentOptions = Array.from(new Set(logs.map(l => l.component_type).filter(Boolean))).sort();

  const labMap = useMemo(() => {
    const m = {};
    for (const l of labOptions) m[l.value] = l.label;
    return m;
  }, [labOptions]);

  const sortedLabOptions = useMemo(
    () => [...labOptions].sort((left, right) => String(left.label).localeCompare(String(right.label))),
    [labOptions]
  );

  const displayedLogs = logs;

  const totalPages = Math.ceil(displayedLogs.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedLogs = displayedLogs.slice(startIdx, endIdx);
  const showingStart = displayedLogs.length === 0 ? 0 : startIdx + 1;
  const showingEnd = Math.min(endIdx, displayedLogs.length);

  const FiltersBar = null;

  return (
    <div>
      <div className="computer-lab-scrollbar w-full max-w-full overflow-x-auto">
        {loading && <div className="p-4 text-sm text-slate-500">Loading history…</div>}
        {error && <div className="p-4 text-sm text-rose-600">{error}</div>}

        {!loading && logs.length === 0 && <div className="p-4 text-sm text-slate-500">No history entries found.</div>}

        {!loading && displayedLogs.length > 0 ? (
          <div className="w-full overflow-x-auto rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 bg-white">
            <thead className="sticky top-0 z-20 bg-slate-100">
              <tr>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Action</th>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Computer #</th>
                
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Component</th>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Old Version</th>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">New Version</th>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Changed By</th>
                <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 cursor-pointer hover:bg-slate-200" onClick={() => setDateOrder(dateOrder === 'desc' ? 'asc' : 'desc')}>Date {dateOrder === 'desc' ? '↓' : '↑'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
            {paginatedLogs.map((entry, index) => {
                const isGrayRow = index % 2 === 0;
                const { oldVal, newVal } = extractChangedPair(entry.old_data, entry.new_data, entry.action);
                const changedByKey = entry.changed_by || 'system';
                const displayName = userMap[changedByKey] || entry.changed_by || 'system';
                return (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-700 text-center align-top">{entry.action || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{entry.computer_number ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 text-center align-top">{entry.component_type || "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 align-top max-w-xs overflow-auto">
                      <div className="whitespace-pre-wrap break-words text-xs">{formatValue(oldVal)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 align-top max-w-xs overflow-auto">
                      <div className="whitespace-pre-wrap break-words text-xs">{formatValue(newVal)}</div>
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
                {Array.from({ length: totalPages }).map((_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`rounded-md px-3 py-1 text-sm transition ${
                        currentPage === pageNumber
                          ? "bg-[#4a1111] text-primary-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
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
        ) : null}
      </div>
    </div>
  );
}
