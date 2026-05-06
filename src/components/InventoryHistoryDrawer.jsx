import { useEffect, useState } from "react";
import { FileText, Clock, User } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";

const timeFormat = (ts) => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch (e) {
    return ts;
  }
};

export default function InventoryHistoryDrawer({ open, onOpenChange, selectedLab }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    if (!open) return () => (mounted = false);

    const fetchLogs = async () => {
      setLoading(true);
      setError("");
      try {
        let query = supabase
          .from("inventory_change_logs")
          .select("id, change_ts, action, component_type, computer_number, lab_number_id, old_data, new_data, changed_by, metadata")
          .order("change_ts", { ascending: false })
          .limit(200);

        if (selectedLab) {
          query = query.eq("lab_number_id", selectedLab);
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        if (!mounted) return;
        setLogs(data || []);
      } catch (err) {
        console.error("Failed to load history:", err);
        setError(err.message || "Failed to load history");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLogs();
    return () => (mounted = false);
  }, [open, selectedLab]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[80vh] w-full sm:w-[520px]">
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-700" />
            <div>
              <DrawerTitle>Inventory History</DrawerTitle>
              <DrawerDescription className="text-sm">Recent changes and activity</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="p-4 space-y-3 overflow-auto">
          {loading && <div className="text-sm text-slate-500">Loading history…</div>}
          {error && <div className="text-sm text-rose-600">{error}</div>}

          {!loading && logs.length === 0 && (
            <div className="text-sm text-slate-500">No history entries found for this selection.</div>
          )}

          <ul className="space-y-3">
            {logs.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <div className="text-xs text-slate-600">{timeFormat(entry.change_ts)}</div>
                    <div className="ml-3 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{entry.action}</div>
                  </div>
                  <div className="text-xs text-slate-500">#{entry.computer_number ?? "-"}</div>
                </div>

                <div className="mt-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <User className="h-3 w-3" />
                    <span>{entry.changed_by ?? "system"}</span>
                    <span className="mx-1">•</span>
                    <span>{entry.component_type ?? "-"}</span>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs">
                    <div className="text-xs font-semibold">Old</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 p-2 text-xs">{JSON.stringify(entry.old_data || {}, null, 2)}</pre>
                    <div className="text-xs font-semibold">New</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-100 bg-white p-2 text-xs">{JSON.stringify(entry.new_data || {}, null, 2)}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <DrawerFooter>
          <div className="flex w-full justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
