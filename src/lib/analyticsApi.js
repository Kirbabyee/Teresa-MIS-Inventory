import { supabase } from "@/api/supabaseClient";

// ─── Helper: Build list of candidate dynamic table names ──────────────────
// Dynamic tables are created per-tab via edge functions and named using
// the convention "inventory_{tabSlug}". We also check inventory_settings
// for any explicitly configured table names.
const getCandidateTableNames = async (tabs) => {
  const tableNames = new Set();

  // Source 1: inventory_settings (key: "inventory.tab_table.{tabId}")
  try {
    const { data: settingsData } = await supabase
      .from("inventory_settings")
      .select("key, value")
      .like("key", "inventory.tab_table.%");
    for (const row of settingsData || []) {
      const tableName = row.value?.tableName;
      if (tableName) tableNames.add(tableName);
    }
  } catch (e) {
    // ignore settings query errors
  }

  // Source 2: convention-based names from tabs
  for (const tab of tabs) {
    if (tab.slug) tableNames.add(`inventory_${tab.slug}`);
  }

  return [...tableNames];
};

// ─── Fetch All Item Details (for brand/lifecycle analysis) ───────────────
// Returns a flat array of all items across all dynamic tables with their
// brand, model, purchase_date, status, and section_id fields.
export const fetchAllItemDetails = async () => {
  const tabsRes = await supabase
    .from("inventory_tabs")
    .select("id, name, slug");
  if (tabsRes.error) throw tabsRes.error;
  const tabs = tabsRes.data || [];

  const tableNames = await getCandidateTableNames(tabs);

  const tableResults = await Promise.allSettled(
    tableNames.map((name) => supabase.from(name).select("*"))
  );

  // Deduplicate items by id (in case same item appears in multiple tables)
  const seenIds = new Set();
  const allItems = [];
  for (const result of tableResults) {
    if (result.status !== "fulfilled") continue;
    if (result.value.error) continue;
    for (const item of result.value.data || []) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }
  }

  return allItems;
};

// ─── Defect Rate by Section ──────────────────────────────────────────────
// Queries dynamic inventory tables (not the legacy inventory_items table).
export const fetchDefectRateBySection = async () => {
  const [sectionsRes, tabsRes, borrowsRes, borrowItemsRes] = await Promise.all([
    supabase.from("inventory_sections").select("id, name, slug, tab_id"),
    supabase.from("inventory_tabs").select("id, name, slug"),
    supabase
      .from("borrowing_records")
      .select("id, status")
      .in("status", ["borrowed", "not_returned"]),
    supabase
      .from("borrowing_items")
      .select("borrowing_record_id, inventory_section_id"),
  ]);

  if (sectionsRes.error) throw sectionsRes.error;
  if (tabsRes.error) throw tabsRes.error;

  const sections = sectionsRes.data || [];
  const tabs = tabsRes.data || [];
  const activeBorrows = borrowsRes.data || [];
  const allBorrowItems = borrowItemsRes.data || [];

  // Build tab_id → tab lookup
  const tabById = {};
  for (const tab of tabs) {
    tabById[tab.id] = tab;
  }

  // Build section_id → { name, slug, tabId, tabName, tabSlug } lookup
  const sectionMap = {};
  for (const section of sections) {
    const tab = tabById[section.tab_id];
    sectionMap[section.id] = {
      name: section.name,
      slug: section.slug || "",
      tabId: section.tab_id,
      tabName: tab?.name || "",
      tabSlug: tab?.slug || "",
    };
  }

  // Build set of active borrowing_record_ids for quick lookup
  const activeBorrowIds = new Set(activeBorrows.map((b) => b.id));

  // Count borrowed items per section
  const borrowedBySection = {};
  for (const bi of allBorrowItems) {
    if (activeBorrowIds.has(bi.borrowing_record_id) && bi.inventory_section_id) {
      borrowedBySection[bi.inventory_section_id] =
        (borrowedBySection[bi.inventory_section_id] || 0) + 1;
    }
  }

  // Get candidate table names and query them all (skip missing ones)
  const tableNames = await getCandidateTableNames(tabs);

  // Select * because dynamic tables have varying columns.
  // Every dynamic table has at least: id, section_id, created_at, updated_at.
  // Custom columns (status, data, etc.) are optional and defined per-tab.
  const tableResults = await Promise.allSettled(
    tableNames.map((name) => supabase.from(name).select("*"))
  );

  // Aggregate items by section across all dynamic tables
  const resultMap = {};
  for (const result of tableResults) {
    if (result.status !== "fulfilled") continue;
    if (result.value.error) continue;
    const items = result.value.data || [];
    for (const item of items) {
      const section = sectionMap[item.section_id];
      if (!section) continue;

      const key = item.section_id;
      if (!resultMap[key]) {
        resultMap[key] = {
          sectionId: key,
          sectionName: section.name,
          sectionSlug: section.slug || "",
          tabId: section.tabId,
          tabName: section.tabName,
          tabSlug: section.tabSlug,
          total: 0,
          defective: 0,
        };
      }
      resultMap[key].total++;
      // Check multiple possible defect indicators across different column names
      const statusStr = String(item.status || item.condition || item.item_status || "").toLowerCase();
      const dataStr = String(
        item.data ? JSON.stringify(item.data) :
        item.remarks || item.notes || item.details || ""
      ).toLowerCase();
      if (statusStr.includes("defect") || dataStr.includes("defect")) {
        resultMap[key].defective++;
      }
    }
  }

  return Object.values(resultMap).map((s) => ({
    ...s,
    borrowed: borrowedBySection[s.sectionId] || 0,
    defectRate: s.total > 0 ? Math.round((s.defective / s.total) * 10000) / 100 : 0,
  }));
};

// ─── Borrowing Compliance ────────────────────────────────────────────────
export const fetchBorrowingCompliance = async (days = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from("borrowing_records")
    .select("id, borrowed_at, returned_at, expected_return_at, status")
    .gte("borrowed_at", cutoff.toISOString());

  if (error) throw error;

  const records = data || [];
  let totalBorrowDays = 0;
  let returnedCount = 0;
  let onTime = 0;
  let late = 0;
  let outstanding = 0;

  for (const r of records) {
    if (r.returned_at) {
      const borrowDays =
        (new Date(r.returned_at) - new Date(r.borrowed_at)) / (1000 * 60 * 60 * 24);
      totalBorrowDays += borrowDays;
      returnedCount++;

      if (r.status === "returned_late") {
        late++;
      } else if (
        r.expected_return_at &&
        new Date(r.returned_at) > new Date(r.expected_return_at)
      ) {
        late++;
        onTime++;
      } else {
        onTime++;
      }
    } else {
      outstanding++;
    }
  }

  const completedReturns = onTime + late;
  return {
    totalTransactions: records.length,
    avgBorrowDays:
      returnedCount > 0
        ? Math.round((totalBorrowDays / returnedCount) * 10) / 10
        : 0,
    complianceRate:
      completedReturns > 0 ? Math.round((onTime / completedReturns) * 100) : 100,
    onTimeReturns: onTime,
    lateReturns: late,
    outstanding,
  };
};

// ─── Security Threat Assessment ──────────────────────────────────────────
export const fetchSecurityThreatAssessment = async () => {
  const { data, error } = await supabase
    .from("login_attempts_tracker")
    .select("*");

  if (error) throw error;

  const records = data || [];
  const now = new Date();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);

  const activeLockouts = records.filter(
    (r) => r.suspended_until && new Date(r.suspended_until) > now
  );
  const highTier = activeLockouts.filter((r) => r.lockout_tier >= 3);
  const permanentBans = records.filter((r) => r.lockout_tier >= 5);
  const recentEscalations = records.filter(
    (r) => new Date(r.updated_at) > last24h && r.lockout_tier >= 3
  );

  // Detect suspicious IPs
  const ipTargets = {};
  for (const r of records.filter((r) => new Date(r.updated_at) > last24h)) {
    if (!r.last_ip) continue;
    if (!ipTargets[r.last_ip]) ipTargets[r.last_ip] = new Set();
    ipTargets[r.last_ip].add(r.email);
  }
  const suspiciousIPs = Object.entries(ipTargets)
    .filter(([, emails]) => emails.size > 1)
    .map(([ip, emails]) => ({ ip, targetedAccounts: emails.size }));

  // Threat score (0-100)
  let threatScore = 0;
  threatScore += Math.min(activeLockouts.length * 5, 30);
  threatScore += Math.min(highTier.length * 10, 40);
  threatScore += Math.min(suspiciousIPs.length * 15, 30);
  threatScore = Math.min(threatScore, 100);

  let threatLevel = "low";
  if (threatScore >= 70) threatLevel = "critical";
  else if (threatScore >= 40) threatLevel = "elevated";
  else if (threatScore >= 20) threatLevel = "moderate";

  return {
    activeLockouts: activeLockouts.length,
    highTierLockouts: highTier.length,
    permanentBans: permanentBans.length,
    recentEscalations: recentEscalations.length,
    uniqueTargetedAccounts: new Set(activeLockouts.map((r) => r.email)).size,
    uniqueSourceIPs: new Set(activeLockouts.map((r) => r.last_ip)).size,
    suspiciousIPs,
    threatScore,
    threatLevel,
  };
};

// ─── Top Borrowers with Compliance ───────────────────────────────────────
export const fetchTopBorrowers = async (days = 90, limit = 15) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from("borrowing_records")
    .select("id, borrower_name, borrower_id_number, borrower_role, borrowed_at, returned_at, expected_return_at, status")
    .gte("borrowed_at", cutoff.toISOString());

  if (error) throw error;

  const userMap = new Map();
  for (const r of data || []) {
    const userId = r.borrower_id_number || r.borrower_name;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        name: r.borrower_name,
        idNumber: r.borrower_id_number,
        role: r.borrower_role,
        totalBorrows: 0,
        onTime: 0,
        late: 0,
        outstanding: 0,
        borrowDates: [],
      });
    }
    const user = userMap.get(userId);
    user.totalBorrows++;
    if (r.borrowed_at) {
      user.borrowDates.push(r.borrowed_at);
    }

    if (r.returned_at) {
      if (r.status === "returned_late") {
        user.late++;
      } else if (
        r.expected_return_at &&
        new Date(r.returned_at) > new Date(r.expected_return_at)
      ) {
        user.late++;
      } else {
        user.onTime++;
      }
    } else if (r.status === "returned_late") {
      user.late++;
    } else {
      user.outstanding++;
    }
  }

  return Array.from(userMap.values())
    .map((u) => ({
      ...u,
      complianceRate:
        u.onTime + u.late > 0
          ? Math.round((u.onTime / (u.onTime + u.late)) * 100)
          : 100,
      // Sort dates descending (most recent first) and format
      borrowDates: u.borrowDates
        .sort((a, b) => new Date(b) - new Date(a))
        .map((d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
    }))
    .sort((a, b) => b.totalBorrows - a.totalBorrows)
    .slice(0, limit);
};

// ─── Audit Anomalies ─────────────────────────────────────────────────────
export const fetchAuditAnomalies = async (days = 7) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from("inventory_change_logs")
    .select("change_ts, table_name, action, changed_by, old_data, new_data")
    .gte("change_ts", cutoff.toISOString())
    .order("change_ts", { ascending: false });

  if (error) throw error;

  const logs = data || [];
  const dailyChanges = {};
  const offHours = [];
  const userActivity = {};
  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;

  for (const log of logs) {
    const ts = new Date(log.change_ts);
    const dateKey = ts.toISOString().slice(0, 10);
    const hour = ts.getUTCHours();
    const dayOfWeek = ts.getUTCDay();

    // Daily aggregation
    if (!dailyChanges[dateKey]) {
      dailyChanges[dateKey] = { date: dateKey, insert: 0, update: 0, delete: 0, total: 0 };
    }
    dailyChanges[dateKey].total++;
    const action = (log.action || "").toLowerCase();
    if (action === "insert") { dailyChanges[dateKey].insert++; insertCount++; }
    else if (action === "update") { dailyChanges[dateKey].update++; updateCount++; }
    else if (action === "delete") { dailyChanges[dateKey].delete++; deleteCount++; }

    // Off-hours detection (before 8am or after 6pm UTC, or weekends)
    if (hour < 8 || hour > 18 || dayOfWeek === 0 || dayOfWeek === 6) {
      offHours.push({
        changeTs: log.change_ts,
        tableName: log.table_name,
        action: log.action,
        changedBy: log.changed_by,
        hour,
      });
    }

    // User activity
    const changedBy = log.changed_by || "unknown";
    userActivity[changedBy] = (userActivity[changedBy] || 0) + 1;
  }

  const topUsers = Object.entries(userActivity)
    .map(([user, changes]) => ({ user, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 10);

  return {
    totalChanges: logs.length,
    actionCounts: { insert: insertCount, update: updateCount, delete: deleteCount },
    dailyChanges: Object.values(dailyChanges).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    offHoursChanges: offHours.slice(0, 50),
    offHoursCount: offHours.length,
    topUsers,
  };
};

// ─── Defect Rate Trend ───────────────────────────────────────────────────
export const fetchDefectRateTrend = async (days = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from("inventory_change_logs")
    .select("change_ts, action, new_data")
    .gte("change_ts", cutoff.toISOString())
    .order("change_ts", { ascending: true });

  if (error) throw error;

  const dailyData = {};
  for (const record of data || []) {
    const date = new Date(record.change_ts).toISOString().slice(0, 10);
    if (!dailyData[date]) {
      dailyData[date] = { date, total: 0, defects: 0 };
    }
    dailyData[date].total++;
    if (JSON.stringify(record.new_data || "").toLowerCase().includes("defect")) {
      dailyData[date].defects++;
    }
  }

  return Object.values(dailyData).map((d) => ({
    date: d.date,
    defectRate: d.total > 0 ? Math.round((d.defects / d.total) * 10000) / 100 : 0,
    total: d.total,
    defects: d.defects,
  }));
};

// ─── Borrowing Items by Section (for Item Borrowing Analysis chart) ──────
// Fetches all borrowing_items with their section + item type/brand info.
// Type and brand are extracted from the item_details JSONB array that is
// stored at borrow time, so no re-join to dynamic tables is needed.
// Returns a flat array: { sectionName, itemType, brand, quantity }
export const fetchBorrowingItemsBySection = async (days = 90) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // 1. Get borrowing records within the time window
  const { data: recordsRes, error: recordsErr } = await supabase
    .from("borrowing_records")
    .select("id")
    .gte("borrowed_at", cutoff.toISOString());
  if (recordsErr) throw recordsErr;
  const recordIds = (recordsRes || []).map((r) => r.id);
  if (recordIds.length === 0) return [];

  // 2. Get borrowing_items for those records (batched)
  const BATCH = 500;
  const allBorrowItems = [];
  for (let i = 0; i < recordIds.length; i += BATCH) {
    const batch = recordIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("borrowing_items")
      .select("inventory_section_id, item_label, item_details, quantity")
      .in("borrowing_record_id", batch);
    if (error) throw error;
    allBorrowItems.push(...(data || []));
  }

  // 3. Get section names
  const { data: sectionsRes, error: sectionsErr } = await supabase
    .from("inventory_sections")
    .select("id, name");
  if (sectionsErr) throw sectionsErr;
  const sectionNameById = {};
  for (const s of sectionsRes || []) sectionNameById[s.id] = s.name;

  // 4. Helper: extract a field value from item_details array
  const getDetail = (itemDetails, fieldKey) => {
    if (!Array.isArray(itemDetails)) return null;
    const entry = itemDetails.find(
      (d) => d && String(d.key || "").toLowerCase() === fieldKey.toLowerCase()
    );
    const val = entry ? String(entry.value || "").trim() : null;
    return val || null;
  };

  // 5. Build flat result array
  //    The "variant" dimension is the item name (from item_details).
  //    The "category" dimension is the section name.
  return allBorrowItems.map((bi) => {
    // item_label is the computed display name set at borrow time
    // (e.g. "SSD Testing", "Dell Latitude 5520", etc.)
    const name = bi.item_label || "Uncategorized";
    const qty = Number(bi.quantity) || 1;

    return {
      sectionName: sectionNameById[bi.inventory_section_id] || "Custom Item",
      variant: name,
      quantity: qty,
    };
  });
};

// ─── Defective Returns ───────────────────────────────────────────────────
// Counts borrowing_items returned with a defective condition.
export const fetchDefectiveReturns = async (days = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Get returned borrowing records within the time range
  const { data: returnedRecords, error: recErr } = await supabase
    .from("borrowing_records")
    .select("id")
    .eq("status", "returned")
    .gte("returned_at", cutoff.toISOString());
  if (recErr) throw recErr;

  const recordIds = (returnedRecords || []).map((r) => r.id);
  if (recordIds.length === 0) return 0;

  // Count borrowing_items with defective return_condition
  const { count, error } = await supabase
    .from("borrowing_items")
    .select("id", { count: "exact", head: true })
    .in("borrowing_record_id", recordIds)
    .ilike("return_condition", "%defect%");

  if (error) throw error;
  return count || 0;
};

// ─── Inventory Utilization ───────────────────────────────────────────────
// Queries dynamic inventory tables (not the legacy inventory_items table).
export const fetchInventoryUtilization = async () => {
  const [sectionsRes, borrowsRes, borrowItemsRes, tabsRes] = await Promise.all([
    supabase.from("inventory_sections").select("id, name, tab_id"),
    supabase
      .from("borrowing_records")
      .select("id, status")
      .in("status", ["borrowed", "not_returned"]),
    supabase
      .from("borrowing_items")
      .select("borrowing_record_id, inventory_section_id"),
    supabase.from("inventory_tabs").select("id, name, slug"),
  ]);

  if (sectionsRes.error) throw sectionsRes.error;
  if (borrowsRes.error) throw borrowsRes.error;
  if (borrowItemsRes.error) throw borrowItemsRes.error;

  const sections = sectionsRes.data || [];
  const activeBorrows = borrowsRes.data || [];
  const allBorrowItems = borrowItemsRes.data || [];
  const tabs = tabsRes.data || [];

  // Build tab_id → name lookup
  const tabNameById = {};
  for (const tab of tabs) {
    tabNameById[tab.id] = tab.name;
  }

  // Build set of active borrowing_record_ids for quick lookup
  const activeBorrowIds = new Set(activeBorrows.map((b) => b.id));

  // Build set of section_ids that have active borrows
  const borrowedSectionIds = new Set();
  for (const bi of allBorrowItems) {
    if (activeBorrowIds.has(bi.borrowing_record_id) && bi.inventory_section_id) {
      borrowedSectionIds.add(bi.inventory_section_id);
    }
  }

  // Get candidate table names and query them all (skip missing ones)
  const tableNames = await getCandidateTableNames(tabs);

  // Select * because dynamic tables have varying columns
  const tableResults = await Promise.allSettled(
    tableNames.map((name) => supabase.from(name).select("*"))
  );

  // Aggregate items by section across all dynamic tables
  const itemsBySection = {};
  for (const result of tableResults) {
    if (result.status !== "fulfilled") continue;
    if (result.value.error) continue;
    const items = result.value.data || [];
    for (const item of items) {
      if (!itemsBySection[item.section_id]) {
        itemsBySection[item.section_id] = [];
      }
      itemsBySection[item.section_id].push(item);
    }
  }

  return sections.map((section) => {
    const sectionItems = itemsBySection[section.id] || [];
    const defective = sectionItems.filter((i) => {
      const statusStr = String(i.status || i.condition || i.item_status || "").toLowerCase();
      const dataStr = String(
        i.data ? JSON.stringify(i.data) :
        i.remarks || i.notes || i.details || ""
      ).toLowerCase();
      return statusStr.includes("defect") || dataStr.includes("defect");
    });
    const borrowed = borrowedSectionIds.has(section.id)
      ? activeBorrows.filter((b) =>
          allBorrowItems.some(
            (bi) =>
              bi.borrowing_record_id === b.id &&
              bi.inventory_section_id === section.id
          )
        ).length
      : 0;
    const available = sectionItems.length - defective.length;

    return {
      sectionId: section.id,
      sectionName: section.name,
      tabName: tabNameById[section.tab_id] || "—",
      total: sectionItems.length,
      defective: defective.length,
      borrowed,
      available,
      utilizationRate:
        available > 0 ? Math.round((borrowed / available) * 100) : 0,
      defectRate:
        sectionItems.length > 0
          ? Math.round((defective.length / sectionItems.length) * 10000) / 100
          : 0,
    };
  });
};

// ─── Stock Replenishment Watchlist ─────────────────────────────────────────
// Identifies high-velocity items that are approaching depletion.
// Combines borrow frequency (last 90 days) with current available pool.
export const fetchStockReplenishmentWatchlist = async () => {
  const cutoff90 = new Date();
  cutoff90.setDate(cutoff90.getDate() - 90);

  // 1. Get all active borrows (currently out)
  const { data: activeRecords, error: activeErr } = await supabase
    .from("borrowing_records")
    .select("id")
    .in("status", ["borrowed", "not_returned"]);
  if (activeErr) throw activeErr;
  const activeIds = (activeRecords || []).map((r) => r.id);

  // 2. Get borrowing_items for active borrows (what sections are borrowed)
  const { data: activeItems, error: activeItemsErr } = await supabase
    .from("borrowing_items")
    .select("inventory_section_id, item_label, item_details, quantity")
    .in("borrowing_record_id", activeIds);
  if (activeItemsErr) throw activeItemsErr;

  // 3. Get borrowing_items from last 90 days (velocity)
  const { data: recentRecords, error: recentErr } = await supabase
    .from("borrowing_records")
    .select("id")
    .gte("borrowed_at", cutoff90.toISOString());
  if (recentErr) throw recentErr;
  const recentIds = (recentRecords || []).map((r) => r.id);

  const { data: recentItems, error: recentItemsErr } = await supabase
    .from("borrowing_items")
    .select("inventory_section_id, item_label, item_details, quantity")
    .in("borrowing_record_id", recentIds);
  if (recentItemsErr) throw recentItemsErr;

  // 4. Get all inventory items to know total pool per section
  const { data: sectionsRes, error: secErr } = await supabase
    .from("inventory_sections")
    .select("id, name, tab_id");
  if (secErr) throw secErr;

  const { data: tabsRes, error: tabsErr } = await supabase
    .from("inventory_tabs")
    .select("id, name");
  if (tabsErr) throw tabsErr;

  const tabNameById = {};
  for (const t of tabsRes || []) tabNameById[t.id] = t.name;

  // 5. Get dynamic table items
  const tableNames = await getCandidateTableNames(tabsRes || []);
  const tableResults = await Promise.allSettled(
    tableNames.map((name) => supabase.from(name).select("*"))
  );

  // Aggregate items by section_id
  const itemsBySection = {};
  for (const result of tableResults) {
    if (result.status !== "fulfilled" || result.value.error) continue;
    for (const item of result.value.data || []) {
      if (!itemsBySection[item.section_id]) itemsBySection[item.section_id] = [];
      itemsBySection[item.section_id].push(item);
    }
  }

  // 6. Count active borrows per section
  const borrowedPerSection = {};
  for (const ai of activeItems || []) {
    const sid = ai.inventory_section_id;
    if (!sid) continue;
    borrowedPerSection[sid] = (borrowedPerSection[sid] || 0) + (Number(ai.quantity) || 1);
  }

  // 7. Count 90-day borrow velocity per section
  const velocityPerSection = {};
  for (const ri of recentItems || []) {
    const sid = ri.inventory_section_id;
    if (!sid) continue;
    velocityPerSection[sid] = (velocityPerSection[sid] || 0) + (Number(ri.quantity) || 1);
  }

  // 8. Build watchlist: sections with high velocity and low available pool
  const sectionMap = {};
  for (const section of sectionsRes || []) {
    const items = itemsBySection[section.id] || [];
    const defective = items.filter((i) => {
      const s = String(i.status || i.condition || i.item_status || "").toLowerCase();
      const d = String(i.data ? JSON.stringify(i.data) : i.remarks || i.notes || i.details || "").toLowerCase();
      return s.includes("defect") || d.includes("defect");
    });
    const totalPool = items.length;
    const available = totalPool - defective.length - (borrowedPerSection[section.id] || 0);
    const velocity = velocityPerSection[section.id] || 0;
    const utilization = totalPool > 0 ? Math.round(((borrowedPerSection[section.id] || 0) / totalPool) * 100) : 0;

    // Flag: high velocity (>10 borrows in 90d) AND low available (<5) OR utilization > 70%
    if (velocity > 10 && (available < 5 || utilization > 70)) {
      sectionMap[section.id] = {
        sectionId: section.id,
        sectionName: section.name,
        tabName: tabNameById[section.tab_id] || "—",
        totalPool,
        availableCount: Math.max(0, available),
        borrowedCount: borrowedPerSection[section.id] || 0,
        velocity,
        utilization,
      };
    }
  }

  // Also check items by name across sections for high-velocity specific items
  const itemVelocity = new Map();
  for (const ri of recentItems || []) {
    const label = ri.item_label || "Unknown";
    const sid = ri.inventory_section_id;
    const key = `${label}::${sid}`;
    if (!itemVelocity.has(key)) {
      itemVelocity.set(key, { label, sectionId: sid, count: 0 });
    }
    itemVelocity.get(key).count += Number(ri.quantity) || 1;
  }

  // Merge: pick top items by velocity that are in flagged sections
  const watchlistItems = [];
  for (const [key, iv] of itemVelocity.entries()) {
    if (iv.count < 5) continue; // minimum velocity threshold
    const section = sectionMap[iv.sectionId];
    if (!section) continue;

    // Find the item details to get a proper name
    const sectionItems = itemsBySection[iv.sectionId] || [];
    const sampleItem = sectionItems.find((i) => {
      const iLabel = i.item_label || i.name || i.model || "";
      return iLabel === iv.label;
    });

    const displayName = iv.label || sampleItem?.name || sampleItem?.model || "Uncategorized";
    const category = section.tabName;

    watchlistItems.push({
      name: displayName,
      category,
      availableCount: section.availableCount,
      velocity: iv.count,
      sectionName: section.sectionName,
    });
  }

  // Deduplicate by name+category, keep highest velocity
  const deduped = new Map();
  for (const item of watchlistItems) {
    const key = `${item.name}::${item.category}`;
    if (!deduped.has(key) || deduped.get(key).velocity < item.velocity) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => {
      // Sort by risk: low available + high velocity first
      const scoreA = a.velocity / (a.availableCount + 1);
      const scoreB = b.velocity / (b.availableCount + 1);
      return scoreB - scoreA;
    })
    .slice(0, 5);
};
