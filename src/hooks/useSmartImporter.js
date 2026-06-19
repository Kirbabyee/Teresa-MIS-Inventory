import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { parseFile } from "@/utils/smartParser";

// ─── Validators ──────────────────────────────────────────────────────────────

/**
 * Run a single cell through inventory validation rules.
 * Returns `null` if valid, or a string error message.
 */
function validateCell(header, value) {
  const h = header.toLowerCase().trim();
  const v = String(value ?? "").trim();

  // SKU / Item Name / Part — cannot be empty
  if (
    /^(sku|item(\s*name)?|part(\s*(number|#)?)?|product(\s*name)?|serial(\s*(number|#)?)?|barcode)$/.test(h)
  ) {
    if (!v) return "Required";
  }

  // Quantity / Stock / Min / Reorder — must be a non-negative integer
  if (/^(qty|quantity|stock|min(imum)?|reorder|total)$/.test(h)) {
    if (v === "") return null; // allow empty (user may fill it)
    const n = Number(v);
    if (isNaN(n) || !Number.isInteger(n) || n < 0)
      return "Must be ≥ 0";
  }

  // Price / Cost / Amount — must be a positive number
  if (/^(price|cost|amount|unit\s*(price|cost)|total\s*(cost|price|amount))$/.test(h)) {
    if (v === "") return null;
    const n = Number(v);
    if (isNaN(n) || n < 0) return "Must be a positive number";
  }

  return null;
}

/**
 * Build a 2D errors grid matching the rows shape.
 */
function validateSection(section) {
  return section.rows.map((row) =>
    row.map((cell, colIdx) => {
      const header = section.headers[colIdx] || "";
      return validateCell(header, cell);
    })
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook that manages the entire Smart Importer state machine:
 *   idle → parsing → preview (editable) → saving
 *
 * @param {{ onSave?: (sections) => void, onCancel?: () => void }} [options]
 */
export function useSmartImporter(options = {}) {
  const { onSave, onCancel } = options;

  const [phase, setPhase] = useState("idle"); // "idle" | "parsing" | "preview" | "saving" | "error"
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [sections, setSections] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [editHistory, setEditHistory] = useState([]); // { tabIdx, rowIdx, colIdx, from, to }

  // ── Parse ───────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    setPhase("parsing");
    setError("");
    setEditHistory([]);

    try {
      const result = await parseFile(file);

      if (!result.sections || result.sections.length === 0) {
        setError(
          "No data tables could be detected in this file. Make sure the file contains a recognizable inventory table."
        );
        setPhase("error");
        return;
      }

      // Validate every section upfront so the UI can highlight errors
      const validatedSections = result.sections.map((sec) => ({
        ...sec,
        errors: validateSection(sec),
        removed: false,
      }));

      setSections(validatedSections);
      setFileName(file.name);
      setActiveTab(0);
      setPhase("preview");
    } catch (err) {
      setError(err.message || "Failed to parse file.");
      setPhase("error");
    }
  }, []);

  // ── Cell Editing (strict: no auto-modification, just store edit) ────────

  const editCell = useCallback((rowIdx, colIdx, value) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[activeTab] };
      const newRows = section.rows.map((r) => [...r]);
      const oldValue = newRows[rowIdx][colIdx];
      newRows[rowIdx][colIdx] = value;

      // Recompute errors for this cell
      const newErrors = section.errors.map((r) => [...r]);
      const header = section.headers[colIdx] || "";
      newErrors[rowIdx][colIdx] = validateCell(header, value);

      section.rows = newRows;
      section.errors = newErrors;
      next[activeTab] = section;
      return next;
    });

    setEditHistory((prev) => [
      ...prev,
      { tabIdx: activeTab, rowIdx, colIdx, from: "", to: value },
    ]);
  }, [activeTab]);

  // ── Row / Column Management ─────────────────────────────────────────────

  const removeRow = useCallback((rowIdx) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[activeTab] };
      section.rows = section.rows.filter((_, i) => i !== rowIdx);
      section.errors = section.errors.filter((_, i) => i !== rowIdx);
      next[activeTab] = section;
      return next;
    });
  }, [activeTab]);

  const addRow = useCallback(() => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[activeTab] };
      const colCount = section.headers.length || 1;
      const newRow = Array(colCount).fill("");
      section.rows = [...section.rows, newRow];
      section.errors = [
        ...section.errors,
        Array(colCount).map((_, ci) =>
          validateCell(section.headers[ci] || "", "")
        ),
      ];
      next[activeTab] = section;
      return next;
    });
  }, [activeTab]);

  const removeSection = useCallback((tabIdx) => {
    setSections((prev) => {
      const next = [...prev];
      next[tabIdx] = { ...next[tabIdx], removed: true };
      return next;
    });
    // If we removed the currently visible tab, switch to the next visible one
    setActiveTab((prev) => {
      // Find the next non-removed tab
      for (let i = 0; i < sections.length; i++) {
        if (i !== tabIdx && !sections[i].removed) return i;
      }
      return 0;
    });
  }, [sections.length]);

  // ── Computed Stats ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    return sections.map((sec) => {
      const totalErrors = sec.errors
        ? sec.errors.flat().filter(Boolean).length
        : 0;
      return {
        rowCount: sec.rows.length,
        colCount: sec.headers.length,
        errorCount: totalErrors,
      };
    });
  }, [sections]);

  const hasErrors = useMemo(
    () => stats.some((s) => s.errorCount > 0),
    [stats]
  );

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (hasErrors) return;
    setPhase("saving");

    const activeSections = sections
      .filter((s) => !s.removed)
      .map((s) => ({
        name: s.name,
        headers: s.headers,
        rows: s.rows,
      }));

    if (onSave) {
      onSave(activeSections);
    }
  }, [sections, hasErrors, onSave]);

  // ── Auto-sync to parent on every edit during preview ───────────────────
  // So the wizard's Continue button always has the latest data without
  // requiring a separate "Save" step inside the SmartImporter.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (phase !== "preview") return;
    const activeSections = sections
      .filter((s) => !s.removed)
      .map((s) => ({ name: s.name, headers: s.headers, rows: s.rows }));
    if (activeSections.length > 0 && onSaveRef.current) {
      onSaveRef.current(activeSections);
    }
  }, [phase, sections]);

  const handleCancel = useCallback(() => {
    setPhase("idle");
    setSections([]);
    setFileName("");
    setError("");
    setEditHistory([]);
    if (onCancel) onCancel();
  }, [onCancel]);

  const reset = useCallback(() => {
    setPhase("idle");
    setSections([]);
    setFileName("");
    setError("");
    setActiveTab(0);
    setEditHistory([]);
  }, []);

  return {
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
    handleSave,
    handleCancel,
    reset,
  };
}
