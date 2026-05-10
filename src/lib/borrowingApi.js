import { supabase } from "@/api/supabaseClient";

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
    returnRemarks: item.return_remarks || "",
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

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(mapBorrowingRecord);
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

    const { error: itemsError } = await supabase.from("borrowing_items").insert(itemPayload);
    if (itemsError) throw itemsError;
  }

  return {
    ...mapBorrowingRecord({ ...record, borrowing_items: [] }),
    items: items.map((item) => ({
      id: item.inventoryItemId,
      inventoryItemId: item.inventoryItemId,
      label: item.label,
      details: item.details || [],
      tab: item.inventoryTabName || "",
      section: item.inventorySectionName || "",
      tableName: item.inventoryTableName || "",
    })),
  };
};

export const returnBorrowingRecord = async (id, returnRemarks = {}) => {
  const { error: recordError } = await supabase
    .from("borrowing_records")
    .update({
      status: "returned",
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

  const itemUpdates = Object.entries(returnRemarks).map(([itemId, remark]) =>
    supabase
      .from("borrowing_items")
      .update({ return_remarks: remark || null })
      .eq("id", itemId)
  );

  const results = await Promise.all(itemUpdates);
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) throw updateError;
};
