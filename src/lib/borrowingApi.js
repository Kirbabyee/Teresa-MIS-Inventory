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
          }
        : {
            return_remarks: remark || null,
          };

    return supabase.from("borrowing_items").update(updatePayload).eq("id", targetItem.id);
  });

  const results = await Promise.all(itemUpdates);
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) throw updateError;
};
