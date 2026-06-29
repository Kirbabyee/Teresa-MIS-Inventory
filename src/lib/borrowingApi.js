import { supabase } from "@/api/supabaseClient";

const getDetailValue = (details = [], key = "") =>
  (Array.isArray(details) ? details : []).find(
    (detail) => String(detail?.key || "").toLowerCase() === String(key || "").toLowerCase()
  )?.value;

const mergeReturnDetails = (details = [], returnData = {}) => {
  const nextDetails = Array.isArray(details) ? [...details] : [];
  const upsertDetail = (key, label, value) => {
    const index = nextDetails.findIndex(
      (detail) => String(detail?.key || "").toLowerCase() === key
    );
    const detail = { key, label, value: String(value) };

    if (index >= 0) {
      nextDetails[index] = { ...nextDetails[index], ...detail };
      return;
    }

    nextDetails.push(detail);
  };

  const defectiveQuantity = Number(returnData.defectiveQuantity || 0);
  if (Number.isFinite(defectiveQuantity) && defectiveQuantity > 0) {
    upsertDetail("return_defective_quantity", "Defective Qty", defectiveQuantity);
  }

  const workingQuantity = Number(returnData.workingQuantity || 0);
  if (Number.isFinite(workingQuantity) && workingQuantity > 0) {
    upsertDetail("return_working_quantity", "Working Qty", workingQuantity);
  }

  return nextDetails;
};

const mapBorrowingRecord = (record = {}) => ({
  id: record.id,
  name: record.borrower_name || "",
  studentId: record.borrower_id_number || "",
  email: record.borrower_email || "",
  role: record.borrower_role || "",
  borrowId: record.borrow_id || "",
  date: record.borrowed_at || record.created_at,
  returnedAt: record.returned_at || null,
  expectedReturnAt: record.expected_return_at || null,
  status: record.status || "borrowed",
  items: (record.borrowing_items || []).map((item) => ({
    id: item.id,
    inventoryItemId: item.inventory_item_id ?? null,
    inventoryTabId: item.inventory_tab_id,
    inventorySectionId: item.inventory_section_id,
    label: item.item_label || "Item",
    details: Array.isArray(item.item_details) ? item.item_details : [],
    returnCondition: item.return_condition || "",
    returnRemarks: item.return_remarks || "",
    returnDefectiveQuantity: getDetailValue(item.item_details, "return_defective_quantity") || "",
    returnWorkingQuantity: getDetailValue(item.item_details, "return_working_quantity") || "",
    itemReturnedAt: item.item_returned_at || null,
    returnedItemDetails: Array.isArray(item.returned_item_details)
      ? item.returned_item_details
      : [],
    tab: "",
    section: "",
    tableName: item.inventory_table_name || "",
  })),

});

export const fetchBorrowingRecords = async ({ status = "borrowed" } = {}) => {
  // Use simple queries (no nested joins) to avoid Supabase schema cache errors
  let recordsQuery = supabase
    .from("borrowing_records")
    .select(
      "id, borrower_name, borrower_id_number, borrower_role, borrower_email, borrow_id, borrowed_at, returned_at, expected_return_at, status, created_at"
    )
    .order("borrowed_at", { ascending: false });

  if (status === "borrowed") {
    recordsQuery = recordsQuery.in("status", ["borrowed", "not_returned"]);
  } else if (status) {
    recordsQuery = recordsQuery.eq("status", status);
  }

  const [recordsRes, itemsRes] = await Promise.all([
    recordsQuery,
    supabase.from("borrowing_items").select("*"),
  ]);

  if (recordsRes.error) throw recordsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const records = recordsRes.data || [];
  const allItems = itemsRes.data || [];

  // Build lookup: borrowing_record_id → [items]
  const itemsByRecord = {};
  for (const item of allItems) {
    const rid = item.borrowing_record_id;
    if (!itemsByRecord[rid]) itemsByRecord[rid] = [];
    itemsByRecord[rid].push(item);
  }

  return records.map((record) => ({
    ...mapBorrowingRecord({ ...record, borrowing_items: itemsByRecord[record.id] || [] }),
  }));
};

/**
 * Fetches borrowing velocity data for the last N days.
 * Replicates the Supabase SQL aggregation client-side:
 *
 *   SELECT to_char(br.borrowed_at, 'Mon DD') AS display_date,
 *          DATE(br.borrowed_at) AS raw_date,
 *          COUNT(DISTINCT br.id) AS total_transactions,
 *          SUM(CASE WHEN br.returned_at IS NOT NULL THEN COALESCE(bi.quantity,1) ELSE 0 END) AS items_returned,
 *          SUM(CASE WHEN br.returned_at IS NULL     THEN COALESCE(bi.quantity,1) ELSE 0 END) AS items_outstanding,
 *          SUM(COALESCE(bi.quantity,1)) AS total_items_borrowed
 *   FROM borrowing_records br
 *   LEFT JOIN borrowing_items bi ON br.id = bi.borrowing_record_id
 *   WHERE br.borrowed_at >= NOW() - INTERVAL '30 days'
 *   GROUP BY DATE(br.borrowed_at), to_char(br.borrowed_at, 'Mon DD')
 *   ORDER BY raw_date ASC
 */
export const fetchBorrowingVelocity = async ({ days = 30 } = {}) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  // Use simple queries (no nested joins) to avoid Supabase schema cache errors
  const [recordsRes, itemsRes] = await Promise.all([
    supabase
      .from("borrowing_records")
      .select("id, borrowed_at, returned_at")
      .gte("borrowed_at", cutoff.toISOString())
      .order("borrowed_at", { ascending: true }),
    supabase
      .from("borrowing_items")
      .select("borrowing_record_id, quantity"),
  ]);

  if (recordsRes.error) throw recordsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const records = recordsRes.data || [];
  const items = itemsRes.data || [];

  // Build lookup: borrowing_record_id → [quantity, ...]
  const itemsByRecord = {};
  for (const item of items) {
    const rid = item.borrowing_record_id;
    if (!itemsByRecord[rid]) itemsByRecord[rid] = [];
    itemsByRecord[rid].push(item);
  }

  // Group by local date string YYYY-MM-DD
  const byDate = new Map();

  for (const record of records) {
    const borrowedAt = record.borrowed_at ? new Date(record.borrowed_at) : null;
    if (!borrowedAt || Number.isNaN(borrowedAt.getTime())) continue;

    const rawKey = borrowedAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const displayDate = borrowedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    }); // e.g. "Jun 10"

    if (!byDate.has(rawKey)) {
      byDate.set(rawKey, {
        display_date: displayDate,
        raw_date: rawKey,
        transactionIds: new Set(),
        items_returned: 0,
        items_outstanding: 0,
        total_items_borrowed: 0,
      });
    }

    const bucket = byDate.get(rawKey);
    bucket.transactionIds.add(record.id);

    const recordItems = itemsByRecord[record.id] || [];
    for (const item of recordItems) {
      const qty = Number(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      bucket.total_items_borrowed += qty;
      if (record.returned_at) {
        bucket.items_returned += qty;
      } else {
        bucket.items_outstanding += qty;
      }
    }
  }

  // Convert map to sorted array
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      display_date: v.display_date,
      raw_date: v.raw_date,
      total_transactions: v.transactionIds.size,
      items_returned: v.items_returned,
      items_outstanding: v.items_outstanding,
      total_items_borrowed: v.total_items_borrowed,
    }));
};

export const markOverdueBorrowingRecords = async ({ days = 3 } = {}) => {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Mark as not_returned if:
  //   1. expected_return_at is set AND has passed, OR
  //   2. no expected_return_at AND borrowed_at is older than `days` days
  const { data, error } = await supabase
    .from("borrowing_records")
    .update({
      status: "not_returned",
      updated_at: now.toISOString(),
    })
    .eq("status", "borrowed")
    .or(
      `expected_return_at.lte.${now.toISOString()},` +
      `and(expected_return_at.is.null,borrowed_at.lte.${cutoff.toISOString()})`
    )
    .select("id");

  if (error) throw error;
  return data || [];
};

/**
 * Check whether administrative approval is required for borrowing.
 * Reads from inventory_settings → borrowing.require_admin_approval
 */
export const isAdminApprovalRequired = async () => {
  try {
    const { data, error } = await supabase
      .from("inventory_settings")
      .select("value")
      .eq("key", "borrowing.require_admin_approval")
      .maybeSingle();

    if (error || !data) return false;
    const val = data.value;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true";
    if (typeof val === "object" && val !== null) {
      // JSONB stored as { value: true } or similar
      const inner = val.value ?? val.enabled ?? val;
      if (typeof inner === "boolean") return inner;
      if (typeof inner === "string") return inner.toLowerCase() === "true";
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Generate the next borrow_id in the format S-#### (students) or T-#### (teachers).
 * Queries both live and approval tables to find the max numeric suffix.
 */
const PREFIX_BY_ROLE = { student: "S", teacher: "T", staff: "T", faculty: "T", guest: "S" };

export const generateBorrowId = async (role = "") => {
  const prefix = PREFIX_BY_ROLE[String(role || "").toLowerCase()] || "S";

  // Find the max number used so far across both tables
  const [{ data: live }, { data: pending }] = await Promise.all([
    supabase.from("borrowing_records").select("borrow_id"),
    supabase.from("borrowing_records_approval").select("borrow_id"),
  ]);

  let maxNum = 0;
  for (const r of [...(live || []), ...(pending || [])]) {
    const bid = String(r.borrower_id || r.borrow_id || "");
    if (bid.startsWith(`${prefix}-`)) {
      const num = parseInt(bid.slice(2), 10);
      if (Number.isFinite(num) && num > maxNum) maxNum = num;
    }
  }

  return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
};

/**
 * Create a borrowing record.
 * When approval is required, inserts into borrowing_records_approval (staging)
 * and returns { status: "pending_approval", record }.
 * When approval is NOT required, inserts directly into borrowing_records
 * and returns { status: "approved", record }.
 */
export const createBorrowingRecord = async ({
  borrowerName,
  borrowerIdNumber,
  borrowerRole,
  borrowerEmail = "",
  items = [],
  expectedReturnAt = null,
}) => {
  const requiresApproval = await isAdminApprovalRequired();
  const borrowId = await generateBorrowId(borrowerRole);

  if (requiresApproval) {
    // ── Staging path: insert into approval queue ──────────────────────
    const { data: record, error: recordError } = await supabase
      .from("borrowing_records_approval")
      .insert([
        {
          borrower_name: borrowerName,
          borrower_id_number: borrowerIdNumber,
          borrower_role: borrowerRole,
          borrower_email: borrowerEmail || null,
          borrow_id: borrowId,
          status: "pending",
          expected_return_at: expectedReturnAt,
          borrowed_at: new Date().toISOString(),
        },
      ])
      .select("id, borrower_name, borrower_id_number, borrower_role, borrower_email, borrow_id, borrowed_at, expected_return_at, status, created_at")
      .single();

    if (recordError) throw recordError;

    if (items.length > 0) {
      const itemPayload = items.map((item) => ({
        borrowing_record_id: record.id,
        inventory_item_id: item.inventoryItemId || null,
        inventory_tab_id: item.inventoryTabId || null,
        inventory_section_id: item.inventorySectionId || null,
        inventory_table_name: item.inventoryTableName || "",
        item_label: item.label,
        item_details: item.details || [],
      }));

      const { error: itemsError } = await supabase
        .from("borrowing_items_approval")
        .insert(itemPayload);
      if (itemsError) throw itemsError;
    }

    return {
      status: "pending_approval",
      record: {
        id: record.id,
        borrowerName: record.borrower_name,
        borrowerIdNumber: record.borrower_id_number,
        borrowerRole: record.borrower_role,
        borrowId: record.borrow_id,
        borrowedAt: record.borrowed_at,
        expectedReturnAt: record.expected_return_at,
        status: record.status,
        createdAt: record.created_at,
      },
    };
  }

  // ── Direct path: insert into live table ────────────────────────────
  const { data: record, error: recordError } = await supabase
    .from("borrowing_records")
    .insert([
      {
        borrower_name: borrowerName,
        borrower_id_number: borrowerIdNumber,
        borrower_role: borrowerRole,
        borrower_email: borrowerEmail || null,
        borrow_id: borrowId,
        status: "borrowed",
        expected_return_at: expectedReturnAt,
      },
    ])
    .select("id, borrower_name, borrower_id_number, borrower_role, borrower_email, borrow_id, borrowed_at, returned_at, expected_return_at, status, created_at")
    .single();

  if (recordError) throw recordError;

  let insertedItems = [];

  if (items.length > 0) {
    const itemPayload = items.map((item) => ({
      borrowing_record_id: record.id,
      inventory_item_id: item.inventoryItemId || null,
      inventory_tab_id: item.inventoryTabId || null,
      inventory_section_id: item.inventorySectionId || null,
      inventory_table_name: item.inventoryTableName || "",
      item_label: item.label,
      item_details: item.details || [],
    }));

    const { data: savedItems, error: itemsError } = await supabase
      .from("borrowing_items")
      .insert(itemPayload)
      .select("*");
    if (itemsError) throw itemsError;

    insertedItems = savedItems || [];
  }

  return {
    status: "approved",
    record: {
      ...mapBorrowingRecord({ ...record, borrowing_items: insertedItems }),
      items: insertedItems.map((savedItem, index) => ({
        id: savedItem.id,
        inventoryItemId: savedItem.inventory_item_id ?? null,
        inventoryTabId: savedItem.inventory_tab_id,
        inventorySectionId: savedItem.inventory_section_id,
        label: savedItem.item_label || items[index]?.label || "Item",
        details: Array.isArray(savedItem.item_details) ? savedItem.item_details : [],
        tab: items[index]?.inventoryTabName || "",
        section: items[index]?.inventorySectionName || "",
        tableName: savedItem.inventory_table_name || items[index]?.inventoryTableName || "",
      })),
    },
  };
};

export const appendBorrowingRecordItems = async ({ recordId, items = [] }) => {
  if (!recordId) throw new Error("Borrowing record is required.");
  if (!Array.isArray(items) || items.length === 0) return [];

  const itemPayload = items.map((item) => ({
    borrowing_record_id: recordId,
    inventory_item_id: item.inventoryItemId || null,
    inventory_tab_id: item.inventoryTabId || null,
    inventory_section_id: item.inventorySectionId || null,
    inventory_table_name: item.inventoryTableName || "",
    item_label: item.label,
    item_details: item.details || [],
  }));

  const { data, error } = await supabase
    .from("borrowing_items")
    .insert(itemPayload)
    .select("*");

  if (error) throw error;

  return (data || []).map((savedItem, index) => ({
    id: savedItem.id,
    inventoryItemId: savedItem.inventory_item_id ?? null,
    inventoryTabId: savedItem.inventory_tab_id,
    inventorySectionId: savedItem.inventory_section_id,
    label: savedItem.item_label || items[index]?.label || "Item",
    details: Array.isArray(savedItem.item_details) ? savedItem.item_details : [],
    tab: items[index]?.inventoryTabName || "",
    section: items[index]?.inventorySectionName || "",
    tableName: savedItem.inventory_table_name || items[index]?.inventoryTableName || "",
  }));
};

export const returnBorrowingRecord = async (id, returnRemarks = {}) => {
  const { data: borrowingRecord, error: fetchError } = await supabase
    .from("borrowing_records")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const nextStatus = borrowingRecord?.status === "not_returned" ? "returned_late" : "returned";

  const { error: recordError } = await supabase
    .from("borrowing_records")
    .update({
      status: nextStatus,
      returned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (recordError) throw recordError;

  if (typeof returnRemarks === "string") {
    const { error: itemsError } = await supabase
      .from("borrowing_items")
      .update({
        return_remarks: returnRemarks || null,
      })
      .eq("borrowing_record_id", id);

    if (itemsError) throw itemsError;
    return;
  }

  const { data: currentItems, error: currentItemsError } = await supabase
    .from("borrowing_items")
    .select("id, inventory_item_id, item_details, returned_item_details")
    .eq("borrowing_record_id", id);

  if (currentItemsError) throw currentItemsError;

  const currentItemsById = (currentItems || []).reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});

  const itemUpdates = Object.entries(returnRemarks).map(([itemId, remark]) => {
    const targetItem =
      currentItemsById[itemId] ||
      (currentItems || []).find(
        (item) => item.inventory_item_id && String(item.inventory_item_id) === String(itemId)
      );

    if (!targetItem?.id) return Promise.resolve({ error: null });

    const mergedDetails = remark && typeof remark === "object"
      ? mergeReturnDetails(targetItem.item_details, remark)
      : targetItem.item_details;

    // Also set _returned_qty = defective + working qty so the detail modal
    // history filter (getReturnedQuantity > 0) works for full returns
    const nextDetails = Array.isArray(mergedDetails) ? [...mergedDetails] : [];
    const getDetailVal = (details, key) => {
      const entry = (Array.isArray(details) ? details : []).find(
        (d) => String(d.key || "").toLowerCase() === key
      );
      const v = Number(entry?.value);
      return Number.isFinite(v) && v > 0 ? v : 0;
    };
    let dQty = getDetailVal(nextDetails, "return_defective_quantity");
    let wQty = getDetailVal(nextDetails, "return_working_quantity");
    // Fallback: mergeReturnDetails doesn't understand conditionCounts,
    // so extract dQty/wQty from remark.conditionCounts when item_details keys are absent
    if (dQty === 0 && wQty === 0 && remark && typeof remark === "object" && remark.conditionCounts) {
      const cc = remark.conditionCounts;
      dQty = Number(cc["Defective"] || 0);
      wQty = Number(cc["Working"] || 0);
    }
    const totalReturned = dQty + wQty;
    if (totalReturned > 0) {
      const retIdx = nextDetails.findIndex((d) => d.key === "_returned_qty");
      const entry = { key: "_returned_qty", label: "Returned Qty", value: String(totalReturned) };
      if (retIdx >= 0) nextDetails[retIdx] = { ...nextDetails[retIdx], ...entry };
      else nextDetails.push(entry);
    }

    // Build returned_item_details: one entry per returned unit
    const existingReturnEntries = Array.isArray(targetItem.returned_item_details)
      ? targetItem.returned_item_details
      : [];
    const alreadyReturned = existingReturnEntries.length;
    const borrowedQty = Number(getDetailVal(targetItem.item_details, "quantity") || 1);
    const remainingToReturn = Math.max(0, borrowedQty - alreadyReturned);
    const returnedAt = new Date().toISOString();

    // Build returned_item_details entries using dynamic remark labels
    // from conditionCounts (e.g. { "Working": 2, "Damaged": 1 })
    // perConditionRemarks provides per-unit remark text per condition
    const newReturnEntries = [];
    const perCondRemarks = (remark && typeof remark === "object" && remark.perConditionRemarks)
      ? remark.perConditionRemarks
      : {};
    if (remark && typeof remark === "object" && remark.conditionCounts) {
      for (const [cond, count] of Object.entries(remark.conditionCounts)) {
        const condTrimmed = String(cond).trim();
        const condLower = condTrimmed.toLowerCase();
        const isWorking = condLower === "working";
        const entryRemark = condTrimmed;
        const entryCondition = isWorking ? "working" : condLower;
        const condRemarksArr = perCondRemarks[condTrimmed] || perCondRemarks[cond] || [];
        for (let i = 0; i < count && newReturnEntries.length < remainingToReturn; i++) {
          newReturnEntries.push({
            remark: entryRemark,
            condition: entryCondition,
            remarks: String(condRemarksArr[i] || "").trim(),
            returnedAt,
          });
        }
      }
    }
    // Fallback: if no conditionCounts, use dQty/wQty with generic labels
    if (newReturnEntries.length === 0) {
      const fallbackRemarks = remark?.remarks ? String(remark.remarks).trim() : "";
      for (let i = 0; i < dQty && newReturnEntries.length < remainingToReturn; i++) {
        newReturnEntries.push({
          remark: "Defective",
          condition: "defective",
          remarks: fallbackRemarks,
          returnedAt,
        });
      }
      for (let i = 0; i < wQty && newReturnEntries.length < remainingToReturn; i++) {
        newReturnEntries.push({
          remark: "Working",
          condition: "working",
          remarks: fallbackRemarks,
          returnedAt,
        });
      }
    }
    // Final fallback: simple return with no breakdown
    while (newReturnEntries.length < remainingToReturn) {
      newReturnEntries.push({
        remark: "Working",
        condition: "working",
        remarks: "",
        returnedAt,
      });
    }

    const updatePayload =
      remark && typeof remark === "object"
        ? {
            return_condition: String(remark.condition || "working").toLowerCase(),
            return_remarks: remark.remarks ? String(remark.remarks).trim() : null,
            item_details: nextDetails,
            returned_item_details: [...existingReturnEntries, ...newReturnEntries],
            item_returned_at: new Date().toISOString(),
          }
        : {
            return_remarks: remark || null,
            item_returned_at: new Date().toISOString(),
          };

    return supabase.from("borrowing_items").update(updatePayload).eq("id", targetItem.id);
  });

  const results = await Promise.all(itemUpdates);
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) throw updateError;
};

/**
 * Update per-item returned quantity on a borrowing record.
 * Increments _returned_qty inside the item_details JSONB array
 * (no dedicated column needed).
 */
export const updateBorrowingItemsStatus = async (recordId, itemStatusMap = {}) => {
  if (!recordId) throw new Error("Borrowing record is required.");

  const { data: currentItems, error: fetchError } = await supabase
    .from("borrowing_items")
    .select("id, inventory_item_id, item_details, item_returned_at, returned_item_details")
    .eq("borrowing_record_id", recordId);

  if (fetchError) throw fetchError;

  const currentItemsById = (currentItems || []).reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const updates = Object.entries(itemStatusMap).map(([itemId, newlyReturned]) => {
    const targetItem =
      currentItemsById[itemId] ||
      (currentItems || []).find(
        (item) => item.inventory_item_id && String(item.inventory_item_id) === String(itemId)
      );

    if (!targetItem?.id) return Promise.resolve({ error: null });

    const details = Array.isArray(targetItem.item_details) ? [...targetItem.item_details] : [];

    // Increment _returned_qty in item_details
    const returnedQtyIdx = details.findIndex((d) => d.key === "_returned_qty");
    const currentReturned = returnedQtyIdx >= 0 ? Number(details[returnedQtyIdx].value) || 0 : 0;
    const nextReturned = currentReturned + (Number(newlyReturned) || 0);

    if (returnedQtyIdx >= 0) {
      details[returnedQtyIdx] = { key: "_returned_qty", label: "Returned Qty", value: String(nextReturned) };
    } else {
      details.push({ key: "_returned_qty", label: "Returned Qty", value: String(nextReturned) });
    }

    const statusPayload = { item_details: details };
    // Set item_returned_at only on the first partial return for this item
    if (!targetItem.item_returned_at) {
      statusPayload.item_returned_at = new Date().toISOString();
    }

    // Also append placeholder entries to returned_item_details
    // (one per newly-returned unit; remarks will be updated by updateBorrowingItemsRemarks)
    const existingEntries = Array.isArray(targetItem.returned_item_details)
      ? targetItem.returned_item_details
      : [];
    const newReturnCount = Number(newlyReturned) || 0;
    if (newReturnCount > 0) {
      const returnedAt = new Date().toISOString();
      const newEntries = [];
      for (let i = 0; i < newReturnCount; i++) {
        newEntries.push({
          remark: "Working",
          condition: "working",
          remarks: "",
          returnedAt,
        });
      }
      statusPayload.returned_item_details = [...existingEntries, ...newEntries];
    }

    return supabase
      .from("borrowing_items")
      .update(statusPayload)
      .eq("id", targetItem.id);
  });

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;
};

/**
 * Write return remarks to borrowing_items for a given borrowing record.
 * remarksMap: { itemId: { condition, remarks } }
 * where itemId is the borrowing_items.id (or inventory_item_id as fallback).
 */
export const updateBorrowingItemsRemarks = async (recordId, remarksMap = {}) => {
  if (!recordId) return;

  const { data: currentItems, error: fetchError } = await supabase
    .from("borrowing_items")
    .select("id, inventory_item_id, return_remarks, item_returned_at, returned_item_details")
    .eq("borrowing_record_id", recordId);

  if (fetchError) throw fetchError;

  const currentItemsById = (currentItems || []).reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const updates = Object.entries(remarksMap).map(([itemId, remarkData]) => {
    const targetItem =
      currentItemsById[itemId] ||
      (currentItems || []).find(
        (item) => item.inventory_item_id && String(item.inventory_item_id) === String(itemId)
      );

    if (!targetItem?.id) return Promise.resolve({ error: null });

    const remarkText =
      remarkData && typeof remarkData === "object" ? remarkData.remarks || "" : String(remarkData || "");
    const conditionText =
      remarkData && typeof remarkData === "object" ? remarkData.condition || "" : "";

    // Merge: keep existing remarks, append new ones
    const existing = String(targetItem.return_remarks || "").trim();
    const nextRemarks = remarkText
      ? existing
        ? `${existing}\n${remarkText}`
        : remarkText
      : existing;

    const updatePayload = { return_remarks: nextRemarks || null };
    if (conditionText) updatePayload.return_condition = conditionText;
    // Set item_returned_at only if not already set by a prior partial return
    if (!targetItem.item_returned_at) {
      updatePayload.item_returned_at = new Date().toISOString();
    }

    // Rebuild returned_item_details: keep entries from previous batches,
    // replace the current-batch placeholders (written by updateBorrowingItemsStatus)
    // with correct condition/remark from conditionCounts.
    const cc = remarkData && typeof remarkData === "object" ? remarkData.conditionCounts || {} : {};
    const batchTotal = Object.values(cc).reduce((s, c) => s + (Number(c) || 0), 0);

    if (batchTotal > 0) {
      const existingEntries = Array.isArray(targetItem.returned_item_details)
        ? [...targetItem.returned_item_details]
        : [];
      // Remove the last `batchTotal` entries (they are placeholders from updateBorrowingItemsStatus)
      const prevEntries = existingEntries.slice(0, Math.max(0, existingEntries.length - batchTotal));
      // Build correct entries for this batch — use per-unit remarks from perConditionRemarks
      const returnedAt = new Date().toISOString();
      const newEntries = [];
      const perCondRemarks = remarkData && typeof remarkData === "object" ? remarkData.perConditionRemarks || {} : {};
      for (const [cond, count] of Object.entries(cc)) {
        const condTrimmed = String(cond).trim();
        const condLower = condTrimmed.toLowerCase();
        const isWorking = condLower === "working";
        const entryRemark = condTrimmed;
        const entryCondition = isWorking ? "working" : condLower;
        const condRemarksArr = perCondRemarks[condTrimmed] || perCondRemarks[cond] || [];
        for (let i = 0; i < count; i++) {
          newEntries.push({
            remark: entryRemark,
            condition: entryCondition,
            remarks: String(condRemarksArr[i] || "").trim(),
            returnedAt,
          });
        }
      }
      updatePayload.returned_item_details = [...prevEntries, ...newEntries];
    }

    return supabase.from("borrowing_items").update(updatePayload).eq("id", targetItem.id);
  });

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;
};

// ── Pending Approval Records ──────────────────────────────────────────────

/**
 * Fetches all pending approval requests from the staging tables.
 * Returns records in the same shape as fetchBorrowingRecords (camelCase + items array).
 */
export const fetchPendingApprovals = async () => {
  const [recordsRes, itemsRes] = await Promise.all([
    supabase
      .from("borrowing_records_approval")
      .select(
        "id, borrower_name, borrower_id_number, borrower_role, borrower_email, borrow_id, borrowed_at, expected_return_at, status, created_at"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("borrowing_items_approval").select("*"),
  ]);

  if (recordsRes.error) throw recordsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const records = recordsRes.data || [];
  const allItems = itemsRes.data || [];

  const itemsByRecord = {};
  for (const item of allItems) {
    const rid = item.borrowing_record_id;
    if (!itemsByRecord[rid]) itemsByRecord[rid] = [];
    itemsByRecord[rid].push(item);
  }

  return records.map((record) => ({
    ...mapBorrowingRecord({
      ...record,
      borrowing_items: itemsByRecord[record.id] || [],
    }),
    _source: "approval",
  }));
};

/**
 * Approves a pending request: moves it from staging → live tables.
 */
export const approvePendingRecord = async (recordId) => {
  const { data: approvalRecord, error: fetchErr } = await supabase
    .from("borrowing_records_approval")
    .select("*")
    .eq("id", recordId)
    .single();
  if (fetchErr) throw fetchErr;

  const { data: inserted, error: insertErr } = await supabase
    .from("borrowing_records")
    .insert([
      {
        borrower_name: approvalRecord.borrower_name,
        borrower_id_number: approvalRecord.borrower_id_number,
        borrower_role: approvalRecord.borrower_role,
        borrower_email: approvalRecord.borrower_email || null,
        borrow_id: approvalRecord.borrow_id || null,
        status: "borrowed",
        expected_return_at: approvalRecord.expected_return_at,
        borrowed_at:
          approvalRecord.borrowed_at || approvalRecord.created_at,
      },
    ])
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const { data: approvalItems } = await supabase
    .from("borrowing_items_approval")
    .select("*")
    .eq("borrowing_record_id", recordId);

  if (approvalItems && approvalItems.length > 0) {
    const liveItems = approvalItems.map((item) => ({
      borrowing_record_id: inserted.id,
      inventory_item_id: item.inventory_item_id,
      inventory_tab_id: item.inventory_tab_id,
      inventory_section_id: item.inventory_section_id,
      inventory_table_name: item.inventory_table_name,
      item_label: item.item_label,
      item_details: item.item_details,
    }));
    const { error: itemsErr } = await supabase
      .from("borrowing_items")
      .insert(liveItems);
    if (itemsErr) throw itemsErr;
  }

  const { error: updateErr } = await supabase
    .from("borrowing_records_approval")
    .update({ status: "approved" })
    .eq("id", recordId);
  if (updateErr) throw updateErr;

  return { id: inserted.id };
};

/**
 * Denies a pending request: marks it as "denied" in the staging table.
 */
export const denyPendingRecord = async (recordId) => {
  const { error } = await supabase
    .from("borrowing_records_approval")
    .update({ status: "denied" })
    .eq("id", recordId);
  if (error) throw error;
};
