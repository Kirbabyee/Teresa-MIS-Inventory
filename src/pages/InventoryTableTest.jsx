import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FlaskConical, Sparkles, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSetting, callCreateInventoryTable, getInventoryCreateTableEndpoint } from "@/lib/inventoryApi";

const emptyColumn = () => ({ key: "", type: "text" });

function sanitizeTableName(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function InventoryTableTest() {
  const [endpoint, setEndpoint] = useState("");
  const [tableName, setTableName] = useState("inventory_test_devices");
  const [columns, setColumns] = useState([
    { key: "serial_number", type: "text" },
    { key: "brand", type: "text" },
    { key: "is_active", type: "boolean" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadEndpoint = async () => {
      try {
        const setting = await fetchSetting("inventory.create_table_endpoint");
        if (!cancelled) {
          setEndpoint(setting?.value?.endpoint || getInventoryCreateTableEndpoint());
        }
      } catch {
        if (!cancelled) {
          setEndpoint(getInventoryCreateTableEndpoint());
        }
      }
    };

    loadEndpoint();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(() => {
    const validName = sanitizeTableName(tableName);
    const validColumns = columns.filter((item) => item.key.trim()).length > 0;
    return Boolean(endpoint.trim() && validName && validColumns);
  }, [endpoint, tableName, columns]);

  const updateColumn = (index, patch) => {
    setColumns((current) => {
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addColumn = () => setColumns((current) => [...current, emptyColumn()]);
  const removeColumn = (index) => setColumns((current) => current.filter((_, i) => i !== index));

  const runTest = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const cleanedName = sanitizeTableName(tableName);
      if (!cleanedName) throw new Error("Table name is required.");

      const cleanedColumns = columns
        .map((item) => ({ key: sanitizeTableName(item.key), type: item.type || "text" }))
        .filter((item) => item.key);

      if (cleanedColumns.length === 0) {
        throw new Error("Add at least one valid column key.");
      }

      const response = await callCreateInventoryTable(endpoint.trim(), cleanedName, cleanedColumns);
      setResult(response);
    } catch (err) {
      setError(err?.message || "Failed to create test table.");
    } finally {
      setLoading(false);
    }
  };

  const fillSample = () => {
    const suffix = Date.now().toString().slice(-6);
    setTableName(`inventory_test_${suffix}`);
    setColumns([
      { key: "asset_code", type: "text" },
      { key: "quantity", type: "int" },
      { key: "purchase_price", type: "float" },
      { key: "is_available", type: "boolean" },
      { key: "received_on", type: "date" },
    ]);
  };

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory Table Creation Test</h1>
            <p className="mt-1 text-sm text-slate-500">
             
            </p>
          </div>
          <FlaskConical className="h-6 w-6 text-emerald-600" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Edge Function endpoint</label>
            <Input
              className="mt-2"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://<project>.supabase.co/functions/v1/create-inventory-table"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Table name</label>
            <Input
              className="mt-2"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="inventory_test_devices"
            />
            <p className="mt-1 text-xs text-slate-500">
              Final name: <span className="font-mono">{sanitizeTableName(tableName) || "(invalid)"}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Columns</h2>
            <p className="text-xs text-slate-500">Define the test columns to create in the physical table.</p>
          </div>
          <Button type="button" className="gap-2" onClick={addColumn}>
            <Plus className="h-4 w-4" /> Add Column
          </Button>
        </div>

        <div className="space-y-3">
          {columns.map((column, index) => (
            <div key={`${index}-${column.key}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_auto]">
              <Input
                value={column.key}
                onChange={(e) => updateColumn(index, { key: e.target.value })}
                placeholder="column_key"
              />
              <select
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={column.type}
                onChange={(e) => updateColumn(index, { type: e.target.value })}
              >
                <option value="text">text</option>
                <option value="int">int</option>
                <option value="float">float</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
              </select>
              <Button type="button" variant="outline" onClick={() => removeColumn(index)} className="gap-2">
                <Trash2 className="h-4 w-4 text-rose-500" /> Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={fillSample} icon={Sparkles}>
            Generate Sample
          </Button>
          <Button type="button" onClick={runTest} disabled={!canSubmit || loading} icon={Rocket}>
            {loading ? "Creating..." : "Run Table Creation Test"}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">Table creation request succeeded.</p>
            <pre className="mt-2 overflow-x-auto rounded bg-white/70 p-2 text-xs text-slate-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
