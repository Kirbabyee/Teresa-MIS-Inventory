import { useRef, useState, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  RotateCcw,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSmartImporter } from "@/hooks/useSmartImporter";
import { Button } from "@/components/ui/button";

// ─── Inline Editable Cell ────────────────────────────────────────────────────

function EditableCell({ value, error, onChange, onBlur }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  const startEditing = useCallback(() => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) {
      onChange(draft);
    }
    if (onBlur) onBlur();
  }, [draft, value, onChange, onBlur]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        setEditing(false);
        setDraft(value);
      }
    },
    [commit, value]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          "w-full h-full px-2 py-1 text-sm outline-none border-2 rounded",
          error
            ? "border-red-400 bg-red-50 focus:border-red-500"
            : "border-blue-400 bg-white focus:border-blue-500"
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full h-full px-2 py-1.5 text-sm cursor-text min-h-[32px] flex items-center",
        error && "bg-red-50 border-l-2 border-red-400"
      )}
      onDoubleClick={startEditing}
      title={error ? `${value || "(empty)"} — ${error}` : value}
    >
      <span className={cn("truncate", !value && "text-slate-300 italic")}>
        {value || "—"}
      </span>
      {error && (
        <AlertCircle className="ml-auto h-3.5 w-3.5 text-red-400 shrink-0" />
      )}
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────

function DropZone({ onFile, isParsing }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = "";
    },
    [onFile]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all duration-200",
        dragging
          ? "border-blue-400 bg-blue-50 scale-[1.01]"
          : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100",
        isParsing && "opacity-50 pointer-events-none"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />

      {isParsing ? (
        <>
          <div className="h-12 w-12 mb-4 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
          <p className="text-sm font-medium text-slate-600">
            Parsing your file…
          </p>
        </>
      ) : (
        <>
          <div className="h-16 w-16 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center mb-4">
            <Upload className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-700 mb-1">
            Drop your inventory file here
          </p>
          <p className="text-sm text-slate-500 mb-4">
            or click to browse · supports .xlsx, .xls, .csv
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Multi-sheet Excel and multi-table CSV supported</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Validation Summary Badge ────────────────────────────────────────────────

function ValidationBadge({ errorCount, rowCount }) {
  if (errorCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        {errorCount} issue{errorCount !== 1 ? "s" : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      {rowCount} row{rowCount !== 1 ? "s" : ""}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SmartImporter({ onSave, onCancel }) {
  const {
    phase,
    error,
    fileName,
    sections,
    activeTab,
    setActiveTab,
    stats,
    hasErrors,
    handleFile,
    editCell,
    removeRow,
    addRow,
    removeSection,
    handleCancel,
    reset,
  } = useSmartImporter({
    onSave: (activeSections) => {
      if (onSave) onSave(activeSections);
    },
    onCancel: () => {
      if (onCancel) onCancel();
    },
  });

  const currentSection = sections[activeTab];
  const currentStats = stats[activeTab];

  // ── Render: Idle / Drop Zone ────────────────────────────────────────────

  if (phase === "idle" || phase === "parsing") {
    return (
      <div className="w-full">
        <DropZone onFile={handleFile} isParsing={phase === "parsing"} />
      </div>
    );
  }

  // ── Render: Error ───────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div className="w-full rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800">
              Import Failed
            </h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-red-600 hover:bg-red-100"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Preview ─────────────────────────────────────────────────────

  if (phase === "preview" && currentSection) {
    const visibleTabIndices = sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.removed);

    return (
      <div className="w-full space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                {fileName}
              </h3>
              <p className="text-xs text-slate-500">
                {sections.filter((s) => !s.removed).length} section(s)
                detected · Review and edit, then use Continue below
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="text-slate-600"
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Tabs */}
        {visibleTabIndices.length > 1 && (
          <div className="flex items-center gap-1 border-b border-slate-200 pb-0 overflow-x-auto scrollbar-hide">
            {visibleTabIndices.map(({ s, i }) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap rounded-t-lg",
                  activeTab === i
                    ? "text-blue-700 bg-blue-50 border border-b-0 border-blue-200"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                <span>{s.name}</span>
                <ValidationBadge
                  errorCount={stats[i]?.errorCount || 0}
                  rowCount={stats[i]?.rowCount || 0}
                />
                {!s.removed && sections.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSection(i);
                    }}
                    className="ml-1 rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove this section"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Single-section tab label (when only 1 section) */}
        {visibleTabIndices.length === 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">
              {currentSection.name}
            </span>
            <ValidationBadge
              errorCount={currentStats?.errorCount || 0}
              rowCount={currentStats?.rowCount || 0}
            />
          </div>
        )}

        {/* Validation banner */}
        {hasErrors && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Some cells have validation issues. Double-click to fix them
              before saving.
            </span>
          </div>
        )}

        {/* Data Grid */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[420px] computer-lab-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">
                    #
                  </th>
                  {currentSection.headers.map((header, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]"
                    >
                      {header}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentSection.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={currentSection.headers.length + 2}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      No data rows detected in this section.
                    </td>
                  </tr>
                ) : (
                  currentSection.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-2 py-0.5 text-xs text-slate-400 font-mono text-center">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-0 py-0 border-r border-slate-100 last:border-r-0"
                        >
                          <EditableCell
                            value={cell}
                            error={currentSection.errors?.[rIdx]?.[cIdx] || null}
                            onChange={(val) => editCell(rIdx, cIdx, val)}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-0.5">
                        <button
                          onClick={() => removeRow(rIdx)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                          title="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                {currentStats?.rowCount || 0} rows ×{" "}
                {currentStats?.colCount || 0} columns
              </span>
              {currentStats?.errorCount > 0 && (
                <span className="text-red-500 font-medium">
                  {currentStats.errorCount} validation issue
                  {currentStats.errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </button>
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-slate-400 text-center">
          Double-click a cell to edit · Press <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500 font-mono text-[10px]">Enter</kbd> to confirm · <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500 font-mono text-[10px]">Esc</kbd> to cancel
        </p>
      </div>
    );
  }

  return null;
}
