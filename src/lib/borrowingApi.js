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
  role: record.borrower_role || "",
  date: record.borrowed_at || record.created_at,
  returnedAt: record.returned_at || null,
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
    tab: "",
    section: "",
    tableName: item.inventory_table_name || "",
  })),

});

export const fetchBorrowingRecords = async ({ status = "borrowed" } = {}) => {
  let query = supabase
    .from("borrowing_records")
    .select(
      "id, borrower_name, borrower_id_number, borrower_role, borrowed_at, returned_at, status, created_at, borrowing_items(*)"
    )
    .order("borrowed_at", { ascending: false });

  if (status === "borrowed") {
    query = query.in("status", ["borrowed", "not_returned"]);
  } else if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(mapBorrowingRecord);
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

  const { data, error } = await supabase
    .from("borrowing_records")
    .select(
      "id, borrowed_at, returned_at, borrowing_items(id, quantity)"
    )
    .gte("borrowed_at", cutoff.toISOString())
    .order("borrowed_at", { ascending: true });

  if (error) throw error;

  const rows = data || [];

  // Group by local date string YYYY-MM-DD
  const byDate = new Map();

  for (const record of rows) {
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

    const items = record.borrowing_items || [];
    for (const item of items) {
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
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from("borrowing_records")
    .update({
      status: "not_returned",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "borrowed")
    .lte("borrowed_at", cutoff.toISOString())
    .select("id");

  if (error) throw error;
  return data || [];
};

export const createBorrowingRecord = async ({
  borrowerName,
  borrowerIdNumber,
  borrowerRole,
  items = [],
}) => {
  const { data: record, error: recordError } = await supabase
    .from("borrowing_records")
    .insert([
      {
        borrower_name: borrowerName,
        borrower_id_number: borrowerIdNumber,
        borrower_role: borrowerRole,
        status: "borrowed",
      },
    ])
    .select("id, borrower_name, borrower_id_number, borrower_role, borrowed_at, returned_at, status, created_at")
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
    .select("id, inventory_item_id, item_details")
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

    const updatePayload =
      remark && typeof remark === "object"
        ? {
            return_condition: String(remark.condition || "working").toLowerCase(),
            return_remarks: remark.remarks ? String(remark.remarks).trim() : null,
            item_details: mergeReturnDetails(targetItem.item_details, remark),
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
    .select("id, inventory_item_id, item_details, item_returned_at")
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
    .select("id, inventory_item_id, return_remarks, item_returned_at")
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

    return supabase.from("borrowing_items").update(updatePayload).eq("id", targetItem.id);
  });

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;
};
