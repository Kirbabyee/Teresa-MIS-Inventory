import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { saveAs } from "file-saver";
import { supabase } from "@/api/supabaseClient";
import ExcelJS from "exceljs";

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

const sanitizeSheetName = (value) =>
  String(value || "Inventory Section").replace(/[\\/:*?"<>|]/g, "").slice(0, 31);

const getColumnLetter = (columnNumber) => {
  let value = columnNumber;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
};

const createHeaderSeparatorBase64 = () => {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 24;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#4a1111";
  context.fillRect(0, 9, canvas.width, 5);

  return canvas.toDataURL("image/png").split(",")[1];
};

const applyExportHeader = (worksheet, titleText, exportDate, logoImage, separatorImage, totalColumns, options = {}) => {
  const headerColor = { argb: "FF4A1111" };
  const endColumnNumber = Math.max(13, totalColumns + 1);
  const endColumnLetter = getColumnLetter(endColumnNumber);

  for (let i = 1; i <= 5; i++) {
    worksheet.getRow(i).height = 25;
  }

  if (logoImage) {
    const image = worksheet.workbook.addImage({
      buffer: logoImage,
      extension: "png",
    });

    // place logo roughly in the middle of column B
    worksheet.addImage(image, {
      tl: { col: 1.5, row: 0.35 },
      ext: { width: 125, height: 125 },
    });
  }

  if (separatorImage) {
    const separator = worksheet.workbook.addImage({
      base64: separatorImage,
      extension: "png",
    });

    worksheet.addImage(separator, {
      tl: { col: 0.5, row: 5.35 },
      br: { col: endColumnNumber + 0.5, row: 5.65 },
    });
  }

  worksheet.mergeCells(`B1:${endColumnLetter}1`);
  const titleCell = worksheet.getCell("B1");
  titleCell.value = "COLEGIO DE STA. TERESA DE AVILA, INC.";
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.font = { bold: true, size: 22, color: headerColor, name: "Corbel" };

  worksheet.mergeCells(`B2:${endColumnLetter}2`);
  const addr1 = worksheet.getCell("B2");
  addr1.value = "1177 Quirino Highway, Brgy. Kaligayahan, Novaliches";
  addr1.alignment = { horizontal: "center", vertical: "middle" };
  addr1.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B3:${endColumnLetter}3`);
  const addr2 = worksheet.getCell("B3");
  addr2.value = "Quezon City 1124 Philippines";
  addr2.alignment = { horizontal: "center", vertical: "middle" };
  addr2.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B4:${endColumnLetter}4`);
  const phone = worksheet.getCell("B4");
  phone.value = "Tel. No. (02) 8-275-3916";
  phone.alignment = { horizontal: "center", vertical: "middle" };
  phone.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };

  worksheet.mergeCells(`B5:${endColumnLetter}5`);
  const email = worksheet.getCell("B5");
  email.value = "Email: officialcstaregistrar@gmail.com";
  email.alignment = { horizontal: "center", vertical: "middle" };
  email.font = { bold: false, size: 8, color: { argb: "FF663300" }, name: "Arial" };
  worksheet.getRow(6).height = 15;

  worksheet.mergeCells(`B7:${endColumnLetter}7`);
  const exportTitle = worksheet.getCell("B7");
  exportTitle.value = titleText;
  exportTitle.alignment = { horizontal: "center", vertical: "middle" };
  exportTitle.font = { bold: true, size: 11, color: headerColor, name: "Arial" };

  worksheet.mergeCells(`B8:${endColumnLetter}8`);
  const dateCell = worksheet.getCell("B8");
  dateCell.value =
    "AS OF " +
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
      .format(new Date(exportDate))
      .replace(/^[A-Za-z]+/, (month) => month.toUpperCase());
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  dateCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };

  worksheet.mergeCells(`B9:${endColumnLetter}9`);
  const schoolYearCell = worksheet.getCell("B9");
  const schoolYearText = (options.schoolYear || "").toString().trim() || "____________________";
  const semesterText = (options.semester || "").toString().trim() || "____________________";
  schoolYearCell.value = `${semesterText} Semester | S.Y ${schoolYearText}`;
  schoolYearCell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  schoolYearCell.font = { bold: true, size: 11, color: headerColor, name: "Arial" };
};

export default function InventorySectionExportPanel({
  searchQuery = "",
  refreshToken = 0,
  selectedSection,
  selectedTab,
  items,
  exportColumnOptions,
  onExported,
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateOrder, setDateOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const [exportSchoolYear, setExportSchoolYear] = useState("");
  const [exportSemester, setExportSemester] = useState("");
  const [preparedByName, setPreparedByName] = useState("");
  const [inspectedByName, setInspectedByName] = useState("");
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [showColumnOptions, setShowColumnOptions] = useState(true);
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);
  const [userNameMap, setUserNameMap] = useState({});

  // Use passed-in exportColumnOptions or default to basic columns if not provided
  const columnsToUse = useMemo(() => {
    if (exportColumnOptions && exportColumnOptions.length > 0) {
      return exportColumnOptions;
    }
    // Fallback to basic columns if none provided
    return [
      { key: "item_number", label: "Item #" },
      { key: "description", label: "Description" },
      { key: "brand", label: "Brand" },
      { key: "status", label: "Status" },
    ];
  }, [exportColumnOptions]);

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
        // Try the dynamic shared exports table first
        let data = null;
        try {
          const query = supabase
            .from('dynamic_inventory_export_logs')
            .select('id, exported_by, file_name, export_date, created_at, file_path, tab_id, inventory_uuid')
            .order('created_at', { ascending: false })
            .limit(500);

          // If we have a tab context, filter by it
          if (selectedSection?.id || selectedTab?.id) {
            if (selectedTab?.id) query.eq('tab_id', selectedTab.id);
            else if (selectedSection?.id) query.eq('inventory_uuid', selectedSection.id);
          }

          const res = await query;
          if (res.error) throw res.error;
          data = res.data || [];
        } catch (err) {
          // dynamic table may not exist yet - fall back
          data = null;
        }

        if (!data) {
          // Fetch inventory section exports from fallback table
          const { data: fallbackData, error: qErr } = await supabase
            .from('inventory_section_exports')
            .select('id, exported_by, file_name, export_date, created_at, file_path, section_id, tab_id')
            .order('created_at', { ascending: false })
            .limit(500);
          if (qErr) throw qErr;
          if (!mounted) return;
          setLogs(fallbackData || []);
        } else {
          if (!mounted) return;
          setLogs(data || []);
        }

        const uniqueEmails = new Set();
        const uniqueIds = new Set();
        for (const entry of data || []) {
          const rawValue = String(entry.exported_by || "").trim();
          if (!rawValue) continue;
          if (rawValue.includes("@")) uniqueEmails.add(rawValue);
          else if (/^[0-9a-f-]{16,}$/i.test(rawValue)) uniqueIds.add(rawValue);
        }

        if (uniqueEmails.size > 0 || uniqueIds.size > 0) {
          const nextNameMap = {};
          const normalizeName = (profile) => {
            const firstName = String(profile?.first_name || "").trim();
            const lastName = String(profile?.last_name || "").trim();
            const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
            return combinedName || String(profile?.email || profile?.id || "").trim();
          };

          try {
            if (uniqueIds.size > 0) {
              const { data: usersById } = await supabase
                .from("user_accounts")
                .select("id, email, first_name, last_name")
                .in("id", Array.from(uniqueIds));

              (usersById || []).forEach((user) => {
                const displayName = normalizeName(user);
                nextNameMap[user.id] = displayName;
                if (user.email) nextNameMap[user.email] = displayName;
              });
            }

            if (uniqueEmails.size > 0) {
              const { data: usersByEmail } = await supabase
                .from("user_accounts")
                .select("id, email, first_name, last_name")
                .in("email", Array.from(uniqueEmails));

              (usersByEmail || []).forEach((user) => {
                const displayName = normalizeName(user);
                nextNameMap[user.email] = displayName;
                nextNameMap[user.id] = displayName;
              });
            }
          } catch (userError) {
            console.warn("Failed to resolve export-by names:", userError);
          }

          if (mounted) setUserNameMap(nextNameMap);
        }
      } catch (err) {
        // If the table doesn't exist yet, that's okay for now
        console.warn('Failed to load inventory section exports (table may not exist yet):', err);
        setError(''); // Clear error to avoid showing misleading message
        setLogs([]); // Empty logs is fine
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
      const displayBy = userNameMap[entry.exported_by] || entry.exported_by || "";
      const combined = [
        String(displayBy || ""),
        String(entry.file_name || ""),
        String(entry.export_date || ""),
        formatDate(entry.export_date),
        formatDate(entry.created_at),
      ].join(" ").toLowerCase();
      return combined.includes(normalizedSearchQuery);
    });
  }, [sortedExportLogs, normalizedSearchQuery, userNameMap]);

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

  const resolveExportedByName = (entry) => {
    const rawValue = String(entry?.exported_by || "").trim();
    if (!rawValue) return "-";
    return userNameMap[rawValue] || rawValue;
  };

  const handleExportSection = async () => {
    if (!selectedSection || !selectedTab || !items || items.length === 0) {
      setError("Please select a section with items to export.");
      return;
    }

    if (selectedExportColumns.length === 0) {
      setError("Please select at least one column to export.");
      return;
    }

    if (!exportSchoolYear || !exportSemester) {
      setError("Please fill in School Year and Semester.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      let logoBuffer = null;
      let separatorBuffer = null;

      try {
        // Fetch logo (you'd need to provide the actual logo URL)
        // For now, we'll skip logo to avoid fetch errors in export
      } catch (logoError) {
        console.warn("Failed to load logo:", logoError);
      }

      separatorBuffer = createHeaderSeparatorBase64();

      const workbook = new ExcelJS.Workbook();

      // Export all selected sections (for now, just the selected section)
      const sectionSlugsToExport = selectedSection ? [selectedSection.slug] : [];

      for (const sectionSlug of sectionSlugsToExport) {
        const section = selectedSection; // We're only exporting the currently selected section for simplicity
        if (!section) continue;

        // Use the items passed in (already filtered for this section)
        const sectionItems = items;

        const worksheet = workbook.addWorksheet(sanitizeSheetName(section.name));

        // Filter columns to export based on selectedExportColumns
        const columnsToExport = columnsToUse.filter((column) =>
          selectedExportColumns.includes(column.key)
        );

        applyExportHeader(
          worksheet,
          `INVENTORY - ${(section.name || "SECTION").toUpperCase()}`,
          exportDate,
          logoBuffer,
          separatorBuffer,
          columnsToExport.length + 1,
          { schoolYear: exportSchoolYear, semester: exportSemester }
        );

        worksheet.addRow([]);

        // Start headers at column B
        const startColumn = 2;
        const headerRowIndex = worksheet.lastRow.number + 1;
        const headerRow = worksheet.getRow(headerRowIndex);
        headerRow.height = 26;

        columnsToExport.forEach((column, index) => {
          const cell = headerRow.getCell(startColumn + index);
          cell.value = column.label;
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
          cell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Data rows
        sectionItems.forEach((item, rowIndex) => {
          const excelRow = worksheet.getRow(headerRowIndex + 1 + rowIndex);
          const isGrayRow = rowIndex % 2 === 0;
          const rowFill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isGrayRow ? "FFF8FAFC" : "FFFFFFFF" },
          };

          columnsToExport.forEach((column, colIndex) => {
            const cell = excelRow.getCell(startColumn + colIndex);
            const rawValue = item?.[column.key];
            cell.value = rawValue === null || rawValue === undefined ? "" : String(rawValue);
            cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
            cell.font = { size: 10, name: "Arial" };
            cell.fill = rowFill;
            cell.border = {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            };
          });
        });

        // column widths
        columnsToExport.forEach((column, index) => {
          const colNumber = startColumn + index;
          const longestData = sectionItems.reduce((max, item) => {
            const value = item?.[column.key];
            const length = value === null || value === undefined ? 0 : String(value).length;
            return Math.max(max, length);
          }, 0);
          const width = Math.min(40, Math.max(14, column.label.length + 4, longestData + 2));
          worksheet.getColumn(colNumber).width = width;
        });

        const signatoryStart = headerRowIndex + sectionItems.length + 5;
        const safePreparedBy = preparedByName.trim() || "____________________";
        const safeInspectedBy = inspectedByName.trim() || "____________________";

        worksheet.getCell(`B${signatoryStart}`).value = "Prepared and submitted by:";
        worksheet.getCell(`B${signatoryStart}`).font = { bold: true, size: 10 };
        worksheet.getCell(`B${signatoryStart + 2}`).value = safePreparedBy;
        worksheet.getCell(`B${signatoryStart + 2}`).font = { bold: true, size: 12, name: "Arial" };
        worksheet.getCell(`B${signatoryStart + 3}`).value = "Inventory Coordinator";
        worksheet.getCell(`B${signatoryStart + 3}`).font = { italic: true, size: 10 };

        worksheet.getCell(`B${signatoryStart + 5}`).value = "Inspected and verified by:";
        worksheet.getCell(`B${signatoryStart + 5}`).font = { bold: true, size: 10 };
        worksheet.getCell(`B${signatoryStart + 7}`).value = safeInspectedBy;
        worksheet.getCell(`B${signatoryStart + 7}`).font = { bold: true, size: 12, name: "Arial" };
        worksheet.getCell(`B${signatoryStart + 8}`).value = "Property Custodian";
        worksheet.getCell(`B${signatoryStart + 8}`).font = { italic: true, size: 10 };

        worksheet.views = [];
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `inventory-section-${selectedSection?.name || 'export'}-${timestamp}.xlsx`;

      saveAs(blob, filename);

        // Upload to storage and record export in the database
      try {
        const storagePath = `section-exports/${selectedTab?.tableName || 'sections'}/${selectedSection?.id || 'unknown'}/${filename}`;
        const { error: uploadError } = await supabase.storage.from(EXPORT_BUCKET).upload(storagePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        });

        if (uploadError) {
          console.warn('Failed to upload export to storage:', uploadError);
        }

        // determine exported_by from auth if available
        let exportedBy = 'system';
        try {
          const userResult = await supabase.auth.getUser();
          const user = userResult?.data?.user;
          exportedBy = (user?.user_metadata?.full_name || user?.email || user?.id || 'system').trim();
        } catch (e) {
          // ignore
        }

        // Try writing to dynamic shared table first
        let wroteRecord = false;
        try {
          const { data: dynData, error: dynErr } = await supabase.from('dynamic_inventory_export_logs').insert({
            exported_by: exportedBy || 'system',
            file_name: filename,
            export_date: exportDate,
            file_path: storagePath,
            tab_id: selectedTab?.id || null,
            inventory_uuid: selectedSection?.id || null,
            table_name: selectedTab?.tableName || null,
            metadata: { section_slug: selectedSection?.slug } || null,
          }).select();
          console.debug('[InventorySectionExportPanel] dynamic_inventory_export_logs insert result:', { dynData, dynErr });
          if (!dynErr) {
            wroteRecord = true;
            onExported?.();
          }
        } catch (e) {
          console.warn('[InventorySectionExportPanel] dynamic insert threw:', e);
        }

        // If dynamic table wasn't available, try per-table then fallback
        if (!wroteRecord) {
          const perTableExports = selectedTab?.tableName ? `${selectedTab.tableName}_exports` : null;
          let insertError = null;
          if (perTableExports) {
            try {
              const { data: perData, error: insertErrorRes } = await supabase.from(perTableExports).insert({
                exported_by: exportedBy || 'system',
                file_name: filename,
                export_date: exportDate,
                file_path: storagePath,
                section_id: selectedSection?.id || null,
                tab_id: selectedTab?.id || null,
              }).select();
              console.debug('[InventorySectionExportPanel] per-table insert result:', { perData, insertErrorRes });
              insertError = insertErrorRes;
              if (!insertError) {
                onExported?.();
                wroteRecord = true;
              }
            } catch (e) {
              insertError = e;
              console.warn('[InventorySectionExportPanel] per-table insert threw:', e);
            }
          }

          if (!wroteRecord) {
            try {
              const { data: fbData, error: fallbackErr } = await supabase.from('inventory_section_exports').insert({
                exported_by: exportedBy || 'system',
                file_name: filename,
                export_date: exportDate,
                file_path: storagePath,
                section_id: selectedSection?.id || null,
                tab_id: selectedTab?.id || null,
              }).select();
              console.debug('[InventorySectionExportPanel] fallback insert result:', { fbData, fallbackErr });
              if (fallbackErr) {
                console.warn('Failed to insert export record into dynamic/per-table and fallback inventory_section_exports:', fallbackErr);
              } else {
                onExported?.();
              }
            } catch (e) {
              console.warn('[InventorySectionExportPanel] fallback insert threw:', e);
            }
          }
        }
      } catch (e) {
        console.warn('Error recording/exporting section file:', e);
      }

    } catch (exportError) {
      console.error("Failed to export inventory section:", exportError);
      setError(exportError.message || "Failed to export inventory section.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-medium text-slate-700">Export History</div>
      </div>
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
          {loading ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-xs text-slate-500">
                <div className="flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#4a1111]" role="status" aria-label="Loading export history" />
                </div>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-xs text-rose-600">{error}</td>
            </tr>
          ) : paginatedExportLogs.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-xs text-slate-500">No export history found.</td>
            </tr>
          ) : (
            paginatedExportLogs.map((entry) => (
              <tr key={`export-${entry.id}`}>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 text-center align-top">{resolveExportedByName(entry)}</td>
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
            ))
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
    </div>
  );
}