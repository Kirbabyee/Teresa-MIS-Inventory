import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { saveAs } from "file-saver";
import { supabase } from "@/api/supabaseClient";

const EXPORT_BUCKET = "export-logs";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatDate = (dateString) => {
  try {
    const value = String(dateString || "").trim();
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
      ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
      : new Date(value);
    const month = monthNames[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (e) {
    return dateString;
  }
};

export default function ExportLogsPanel({ searchQuery = "", refreshToken = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateOrder, setDateOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  const downloadLogFile = async (entry) => {
    if (!entry?.file_path) return;

    const { data, error: urlError } = supabase.storage
      .from(EXPORT_BUCKET)
      .getPublicUrl(entry.file_path);

    if (urlError) throw urlError;

    const response = await fetch(data.publicUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch export file.");
    }

    const blob = await response.blob();
    saveAs(blob, entry.file_name || "export.xlsx");
  };

  useEffect(() => {
    let mounted = true;
    const fetchExports = async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error: qErr } = await supabase
          .from('export_logs')
          .select('id, export_by, file_name, export_date, created_at, file_path')
          .order('created_at', { ascending: false })
          .limit(500);
        if (qErr) throw qErr;
        if (!mounted) return;
        setLogs(data || []);
      } catch (err) {
        console.error('Failed to load export logs:', err);
        setError(err.message || 'Failed to load export logs');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchExports();
    return () => (mounted = false);
  }, [refreshToken]);

  const normalizedSearchQuery = (searchQuery || '').trim().toLowerCase();

  const sortedExportLogs = useMemo(() => {
    const nextLogs = [...(logs || [])];
    nextLogs.sort((left, right) => {
      const leftDate = new Date(left.export_date || left.created_at || 0).getTime();
      const rightDate = new Date(right.export_date || right.created_at || 0).getTime();
      return dateOrder === "asc" ? leftDate - rightDate : rightDate - leftDate;
    });
    return nextLogs;
  }, [logs, dateOrder]);

  const displayedExportLogs = useMemo(() => {
    const exportLikeLogs = sortedExportLogs;
    if (!normalizedSearchQuery) return exportLikeLogs;

    return exportLikeLogs.filter((entry) => {
      const combined = [
        String(entry.export_by || ""),
        String(entry.file_name || ""),
        String(entry.export_date || ""),
        formatDate(entry.export_date),
        formatDate(entry.created_at),
      ].join(" ").toLowerCase();
      return combined.includes(normalizedSearchQuery);
    });
  }, [sortedExportLogs, normalizedSearchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [displayedExportLogs.length]);

  const totalPages = Math.ceil(displayedExportLogs.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedExportLogs = displayedExportLogs.slice(startIdx, endIdx);
  const showingStart = displayedExportLogs.length === 0 ? 0 : startIdx + 1;
  const showingEnd = Math.min(endIdx, displayedExportLogs.length);

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
    <div className="w-full overflow-x-auto rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-medium text-slate-700">Export Logs</div>
      </div>
      {loading && (
        <div className="flex min-h-[220px] items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]" role="status" aria-label="Loading export logs" />
            <p className="text-sm text-slate-500">Loading export logs...</p>
          </div>
        </div>
      )}
      {!loading && (
      <>
      <table className="min-w-full divide-y divide-slate-200 bg-white table-fixed">
        <thead className="bg-slate-100">
          <tr>
            <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">Export By</th>
            <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">File</th>
            <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">
              <button
                type="button"
                onClick={() => setDateOrder((current) => (current === "desc" ? "asc" : "desc"))}
                className="inline-flex items-center justify-center gap-1 hover:text-slate-900"
                title={`Sort date ${dateOrder === "desc" ? "ascending" : "descending"}`}
              >
                Date
                <span aria-hidden="true">{dateOrder === "desc" ? "↓" : "↑"}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {paginatedExportLogs.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-xs text-slate-500">No export logs found.</td>
            </tr>
          ) : (
            paginatedExportLogs.map((entry) => {
              return (
                <tr key={`export-${entry.id}`}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 text-center align-top">{entry.export_by || "-"}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 text-center align-top break-all">
                    {entry.file_path ? (
                      <button
                        type="button"
                        onClick={() => downloadLogFile(entry).catch((downloadError) => setError(downloadError.message || "Failed to download export file."))}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-blue-600 transition hover:bg-blue-50 hover:underline"
                        title={`Download ${entry.file_name || "export file"}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{entry.file_name || "Download file"}</span>
                      </button>
                    ) : (
                      <span>{entry.file_name || "-"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 text-center align-top">{formatDate(entry.export_date || entry.created_at)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 text-card-foreground">
        <div className="text-sm text-slate-500">
          Showing {showingStart}–{showingEnd} of {displayedExportLogs.length}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
