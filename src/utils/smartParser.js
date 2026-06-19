import * as XLSX from "xlsx";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Patterns for column headers that should be skipped during import
 * (auto-generated identifiers that don't represent real inventory data).
 */
const SKIP_COLUMN_PATTERNS = [
  /^serial\s*(number|#|no\.?|num\.?)?$/i,
  /^s\/n$/i,
  /^no\.?$/i,
  /^#$/,
  /^row\s*(number|#|no\.?|num\.?)$/i,
  /^id$/i,
  /^record\s*(number|#|no\.?|num\.?)$/i,
  /^line\s*(number|#|no\.?|num\.?)$/i,
  /^__row(n|num|index|idx|count)__?$/i,
  /^__rownum__$/i,
  /^rowindex$/i,
  /^rowid$/i,
];

function shouldSkipColumn(header) {
  const str = String(header ?? "").trim();
  if (!str) return false;
  return SKIP_COLUMN_PATTERNS.some((p) => p.test(str));
}

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

// ─── Noise / Footer Detection ────────────────────────────────────────────────

/**
 * Detect if a row is "noise" — metadata, footer, page info, etc.
 */
function isNoiseRow(row) {
  const cells = Array.isArray(row) ? row : Object.values(row);
  const rowText = cells.map((c) => String(c ?? "")).join(" ");

  const nonEmpty = cells.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ""
  );
  if (nonEmpty.length === 0) return "separator";

  if (nonEmpty.length <= 2) {
    for (const cell of nonEmpty) {
      for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(String(cell).trim())) return "noise";
      }
    }
  }

  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(rowText)) return "noise";
  }

  return null;
}

// ─── Dynamic Header Detection ────────────────────────────────────────────────

/**
 * Compute the column count of the sheet: the maximum row length seen in the
 * first `scanLimit` rows.  This is the "width" of the table area, used to
 * evaluate how densely each row is populated.
 */
function getSheetColumnCount(rawRows, scanLimit = 30) {
  let max = 0;
  const end = Math.min(rawRows.length, scanLimit);
  for (let i = 0; i < end; i++) {
    const len = Array.isArray(rawRows[i]) ? rawRows[i].length : 0;
    if (len > max) max = len;
  }
  return max;
}

/**
 * Classify every cell in a row as "text", "number", or "empty".
 * Used to measure how "header-like" a row is — headers are predominantly
 * short text strings, whereas data rows often contain numbers.
 */
function classifyCell(cell) {
  if (cell === null || cell === undefined || String(cell).trim() === "") return "empty";
  const n = Number(cell);
  if (!isNaN(n) && String(cell).trim() !== "") return "number";
  return "text";
}

/**
 * Score a row as a potential header using two signals combined:
 *
 *   1.  **Fill density** — fraction of the sheet's total columns that are
 *       non-empty.  A real header row is usually fully populated (or close
 *       to it).  A data row with many blanks scores lower.
 *
 *   2.  **Text dominance** — fraction of non-empty cells that are text
 *       (not numbers).  Headers are almost always text; data rows often
 *       contain numbers (quantities, prices, etc.).
 *
 * Returns a score from 0 to 1.
 */
function scoreRowAsHeader(row, sheetColCount) {
  const cells = Array.isArray(row) ? row : Object.values(row);
  if (cells.length === 0) return 0;

  const nonEmpty = cells.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ""
  );
  if (nonEmpty.length === 0) return 0;

  const effectiveWidth = Math.max(sheetColCount, cells.length);

  // Signal 1: fill density (how many of the sheet's columns have a value)
  const fillDensity = nonEmpty.length / effectiveWidth;

  // Signal 2: text dominance (headers are text, data rows are often numeric)
  const textCount = nonEmpty.filter(
    (c) => classifyCell(c) === "text"
  ).length;
  const textDominance = textCount / nonEmpty.length;

  // Weighted combination — text dominance matters more because a row with
  // many blank cells but all text in the filled cells is very likely a header.
  return fillDensity * 0.4 + textDominance * 0.6;
}

/**
 * Find the header row index in a 2D array of raw cell values.
 *
 * Strategy:
 *   1.  Determine the sheet's column width (max row length in the top rows).
 *   2.  Scan every non-noise, non-separator row and compute a combined
 *       fill-density + text-dominance score.
 *   3.  The row with the highest score wins — provided it clears a minimum
 *       absolute threshold (must have at least 2 non-empty cells and a
 *       score ≥ 0.30).
 *   4.  Among ties the *first* such row wins (closer to the top = more
 *       likely the real header).
 */
function findAnchorRowIndex(rawRows) {
  if (!rawRows || rawRows.length === 0) return -1;

  const sheetColCount = getSheetColumnCount(rawRows);

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const noiseType = isNoiseRow(rawRows[i]);
    if (noiseType === "noise" || noiseType === "separator") continue;

    const cells = Array.isArray(rawRows[i]) ? rawRows[i] : Object.values(rawRows[i]);
    const nonEmptyCount = cells.filter(
      (c) => c !== null && c !== undefined && String(c).trim() !== ""
    ).length;

    // A header must have at least 2 populated cells
    if (nonEmptyCount < 2) continue;

    const score = scoreRowAsHeader(rawRows[i], sheetColCount);

    // Require a minimum quality bar — otherwise we'd pick a sparse data row
    if (score < 0.30) continue;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
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
 * Resolve a blank header cell by looking at the cell directly below it.
 *
 *   - If the next row has a non-empty text value at the same column index,
 *     that value becomes the column name.
 *   - Otherwise the column is named `Column_[index+1]` as a fallback.
 *
 * @param {string|null|undefined} headerCell  - The raw header cell value
 * @param {string|null|undefined} cellBelow    - The cell in the row immediately below
 * @param {number} colIdx                      - Zero-based column index
 * @returns {string|null} Resolved header string, or null if the column should be skipped
 */
function resolveBlankHeader(headerCell, cellBelow, colIdx) {
  const str = String(headerCell ?? "").trim();
  if (str && shouldSkipColumn(str)) return null;
  if (str) return str;

  // Header cell is blank — try the cell directly below
  const below = String(cellBelow ?? "").trim();
  if (below) return below;

  // Both blank — generate a positional name
  return `Column_${colIdx + 1}`;
}

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

  const rawHeader = rawRows[anchorIdx];
  const nextRow = rawRows[anchorIdx + 1] || [];

  // Build headers: resolve blanks by looking at the cell below
  const skipCols = new Set();
  const headers = rawHeader.map((cell, idx) => {
    const resolved = resolveBlankHeader(cell, nextRow[idx], idx);
    if (resolved === null) {
      skipCols.add(idx);
      return null;
    }
    return resolved;
  });

  // Data rows: everything after anchor until next noise/footer
  const dataRows = [];
  for (let i = anchorIdx + 1; i < rawRows.length; i++) {
    const noiseType = isNoiseRow(rawRows[i]);
    if (noiseType === "noise") break;

    if (noiseType === "separator") continue;

    const row = rawRows[i];
    const normalized = [];
    for (let j = 0; j < rawHeader.length; j++) {
      if (skipCols.has(j)) continue;
      normalized.push(String(row[j] ?? "").trim());
    }
    dataRows.push(normalized);
  }

  const cleanHeaders = headers.filter((h) => h !== null);

  return { headers: cleanHeaders, rows: dataRows };
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
