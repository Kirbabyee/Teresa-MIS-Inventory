import * as XLSX from "xlsx";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Core inventory column identifiers used for anchor-row detection.
 * A row scoring high on these keywords is likely the real table header.
 */
const ANCHOR_KEYWORDS = [
  "sku", "item", "quantity", "qty", "price", "part", "product",
  "description", "name", "code", "stock", "inventory", "supplier",
  "unit", "cost", "status", "category", "weight", "serial",
  "location", "barcode", "model", "manufacturer", "condition",
  "minimum", "reorder", "total", "amount",
];

/**
 * Patterns that indicate a non-data row (metadata, footer, summary, etc.).
 * Applied case-insensitively.
 */
const NOISE_PATTERNS = [
  /^\s*page\s+\d+/i,
  /^\s*total\s*(rows|stock|items|quantity|cost|amount|price|sum|records)?\s*[:\-]?\s*\d/i,
  /^\s*end\s+of\s+(report|file|data|export|list)/i,
  /^\s*report\s+(generated|created|printed|exported)/i,
  /^\s*date\s+(generated|created|printed|exported)/i,
  /^\s*copyright\s+/i,
  /^\s*all\s+rights\s+reserved/i,
  /^\s*warehouse\s+(location|name|code)?\s*:/i,
  /^\s*prepared\s+by\s*:/i,
  /^\s*approved\s+by\s*:/i,
  /^\s*confidential/i,
  /^\s*company\s*:/i,
  /^\s*address\s*:/i,
  /^\s*tel(?:ephone)?\s*:/i,
  /^\s*fax\s*:/i,
  /^\s*email\s*:/i,
  /^\s*website\s*:/i,
  /^\s*invoice\s*#?\s*\d*/i,
  /^\s*printed\s+on\s*:/i,
  /^\*\s*note\s*:/i,
  /^\s*disclaimer/i,
];

// ─── Anchor Row Detection ────────────────────────────────────────────────────

/**
 * Score a row by how many of its cells match anchor keywords.
 * Returns a score from 0 to 1 (fraction of non-empty cells that are anchors).
 */
function scoreRowAsHeader(row) {
  const cells = Array.isArray(row) ? row : Object.values(row);
  const nonEmptyCells = cells.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ""
  );
  if (nonEmptyCells.length === 0) return 0;

  const matchCount = nonEmptyCells.filter((cell) =>
    ANCHOR_KEYWORDS.some((kw) =>
      String(cell).toLowerCase().trim().includes(kw)
    )
  ).length;

  return matchCount / nonEmptyCells.length;
}

/**
 * Detect if a row is "noise" — metadata, footer, page info, etc.
 */
function isNoiseRow(row) {
  const cells = Array.isArray(row) ? row : Object.values(row);
  const rowText = cells.map((c) => String(c ?? "")).join(" ");

  // Entirely empty → treated as separator, not noise per se
  const nonEmpty = cells.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ""
  );
  if (nonEmpty.length === 0) return "separator";

  // Only 1 non-empty cell that matches a noise pattern → likely a banner/metadata
  if (nonEmpty.length <= 2) {
    for (const cell of nonEmpty) {
      for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(String(cell).trim())) return "noise";
      }
    }
  }

  // Check if the joined row text itself matches noise
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(rowText)) return "noise";
  }

  return null;
}

/**
 * Find the anchor row index in a 2D array of raw cell values.
 * Scans rows and picks the first one scoring ≥ `threshold` on anchor keywords.
 */
function findAnchorRowIndex(rawRows, threshold = 0.35) {
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const noiseType = isNoiseRow(rawRows[i]);
    if (noiseType === "noise") continue;
    if (noiseType === "separator") continue;

    const score = scoreRowAsHeader(rawRows[i]);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Fallback: if no row scored high, pick the first non-empty, non-noise row
  if (bestIdx === -1) {
    for (let i = 0; i < rawRows.length; i++) {
      const noiseType = isNoiseRow(rawRows[i]);
      if (noiseType !== "noise" && noiseType !== "separator") {
        const nonEmpty = rawRows[i].filter(
          (c) => c !== null && c !== undefined && String(c).trim() !== ""
        );
        if (nonEmpty.length >= 2) {
          bestIdx = i;
          break;
        }
      }
    }
  }

  return bestIdx;
}

// ─── Section Splitting for CSV ──────────────────────────────────────────────

/**
 * Split raw rows into sections separated by ≥ `minGap` consecutive empty rows.
 */
function splitByEmptyRowGaps(rawRows, minGap = 2) {
  const sections = [];
  let currentStart = 0;

  let emptyStreak = 0;
  let lastNonEmptyIdx = -1;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const isEmpty =
      !row ||
      row.every(
        (c) => c === null || c === undefined || String(c).trim() === ""
      );

    if (isEmpty) {
      emptyStreak++;
      if (emptyStreak >= minGap && lastNonEmptyIdx >= currentStart) {
        sections.push({
          rows: rawRows.slice(currentStart, lastNonEmptyIdx + 1),
          _startLine: currentStart,
        });
        currentStart = i + 1;
        lastNonEmptyIdx = -1;
      }
    } else {
      emptyStreak = 0;
      lastNonEmptyIdx = i;
    }
  }

  // Push remaining
  if (lastNonEmptyIdx >= currentStart) {
    sections.push({
      rows: rawRows.slice(currentStart, lastNonEmptyIdx + 1),
      _startLine: currentStart,
    });
  }

  return sections;
}

// ─── Core Section Parser ────────────────────────────────────────────────────

/**
 * Given a 2D array of raw cell values for one section, extract the cleaned table.
 * Returns `{ headers: string[], rows: string[][] }`.
 */
function parseSection(rawRows) {
  if (!rawRows || rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const anchorIdx = findAnchorRowIndex(rawRows);
  if (anchorIdx === -1) {
    return { headers: [], rows: [] };
  }

  // Header row: trim and sanitize
  const rawHeader = rawRows[anchorIdx];
  const headers = rawHeader.map((cell, idx) => {
    const str = String(cell ?? "").trim();
    return str || `Column ${idx + 1}`;
  });

  // Data rows: everything after anchor until next noise/footer
  const dataRows = [];
  for (let i = anchorIdx + 1; i < rawRows.length; i++) {
    const noiseType = isNoiseRow(rawRows[i]);
    if (noiseType === "noise") break; // stop at first footer

    if (noiseType === "separator") continue; // skip blank rows inside table

    const row = rawRows[i];
    // Normalize row length to match header count
    const normalized = [];
    for (let j = 0; j < headers.length; j++) {
      normalized.push(String(row[j] ?? "").trim());
    }
    dataRows.push(normalized);
  }

  return { headers, rows: dataRows };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse an Excel workbook (.xlsx / .xls) into detected sections.
 * Each sheet becomes its own section.
 *
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @returns {{ sections: { name: string, headers: string[], rows: string[][] }[] }}
 */
export function parseExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const sections = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // raw: false gives us formatted strings; defval: "" prevents null cells
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const { headers, rows } = parseSection(rawRows);

    if (headers.length > 0 && rows.length >= 0) {
      sections.push({
        name: sheetName,
        headers,
        rows,
      });
    }
  }

  return { sections };
}

/**
 * Parse a CSV string into detected sections.
 * Handles multi-section CSV files separated by 2+ empty rows.
 *
 * @param {string} text - Raw CSV text
 * @returns {{ sections: { name: string, headers: string[], rows: string[][] }[] }}
 */
export function parseCSVFile(text) {
  // Use SheetJS to parse CSV → gives us a 2D array
  const workbook = XLSX.read(text, { type: "string", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  const emptySections = splitByEmptyRowGaps(rawRows, 2);
  const sections = [];

  emptySections.forEach((section, idx) => {
    const { headers, rows } = parseSection(section.rows);
    if (headers.length > 0 || rows.length > 0) {
      sections.push({
        name: `Section ${idx + 1}`,
        headers,
        rows,
      });
    }
  });

  // If no sections were found via gap splitting, try the whole file as one section
  if (sections.length === 0) {
    const { headers, rows } = parseSection(rawRows);
    if (headers.length > 0 || rows.length > 0) {
      sections.push({
        name: "Section 1",
        headers,
        rows,
      });
    }
  }

  return { sections };
}

/**
 * Universal file parser. Detects file type and delegates.
 *
 * @param {File} file - The uploaded File object
 * @returns {Promise<{ sections: { name: string, headers: string[], rows: string[][] }[], fileName: string }>}
 */
export async function parseFile(file) {
  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    const { sections } = parseCSVFile(text);
    return { sections, fileName: name };
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const { sections } = parseExcelFile(buffer);
    return { sections, fileName: name };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
