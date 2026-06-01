import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

export const INVENTORY_CATALOG_CHANGED_EVENT = "inventory-catalog-changed";
export const INVENTORY_ITEMS_CHANGED_EVENT = "inventory-items-changed";

// Log inventory changes to the logs table
export const logInventoryChange = async (tableName, action, oldData, newData, sectionId = null) => {
  try {
    const normalizedTableName = String(tableName || "").trim();
    const isLegacyInventoryTable = normalizedTableName === "inventory_items";

    // Try to get the current user for changed_by
    let changedBy = "system";
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        changedBy = user.email || user.id || "system";
      }
    } catch (e) {
      // If we can't get the user, use system
      changedBy = "system";
    }

    if (isLegacyInventoryTable) {
      const legacyLogEntry = {
        action,
        table_name: normalizedTableName,
        record_id: newData?.id ?? oldData?.id ?? null,
        lab_number_id: sectionId ?? oldData?.section_id ?? newData?.section_id ?? null,
        computer_number: newData?.computer_number ?? oldData?.computer_number ?? null,
        component_type: newData?.type ?? oldData?.type ?? null,
        old_data: oldData,
        new_data: newData,
        changed_by: changedBy,
        metadata: {
          source: "client",
          section_id: sectionId ?? oldData?.section_id ?? newData?.section_id ?? null,
        },
      };

      const { error } = await supabase.from("inventory_change_logs").insert([legacyLogEntry]);
      if (error) {
        console.warn("Failed to insert legacy inventory log entry:", error);
      }
      return;
    }

    // Prepare the log entry for the per-table logs table
    const logEntry = {
      action,
      old_data: oldData,
      new_data: newData,
      changed_by: changedBy,
      change_ts: new Date().toISOString(),
    };

    // Insert into the logs table using Supabase directly
    // Note: We're using the logs table directly, not an Edge Function
    // The logs table should be: {tableName}_logs
    const logsTableName = `${normalizedTableName}_logs`;

    const { error } = await supabase
      .from(logsTableName)
      .insert([logEntry]);

    if (error) {
      console.warn("Failed to insert log entry:", error);
      // Don't throw - continue operation even if logging fails
    }
  } catch (error) {
    console.warn("Error in logInventoryChange:", error);
    // Don't throw - continue operation even if logging fails
  }
};

const DEFAULT_CREATE_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/create-inventory-table";
const DEFAULT_MODIFY_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/modify-inventory-table";
const DEFAULT_DROP_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-table";
const DEFAULT_DROP_COLUMNS_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-columns";
const DEFAULT_CLEANUP_EXPORT_LOGS_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/cleanup-export-logs";

export const getInventoryCreateTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_CREATE_TABLE_ENDPOINT__) {
    return window.__INVENTORY_CREATE_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_CREATE_TABLE_ENDPOINT || DEFAULT_CREATE_TABLE_ENDPOINT;
};

export const getInventoryModifyTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_MODIFY_TABLE_ENDPOINT__) {
    return window.__INVENTORY_MODIFY_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_MODIFY_TABLE_ENDPOINT || DEFAULT_MODIFY_TABLE_ENDPOINT;
};

export const getInventoryDropTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_DROP_TABLE_ENDPOINT__) {
    return window.__INVENTORY_DROP_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_DROP_TABLE_ENDPOINT || DEFAULT_DROP_TABLE_ENDPOINT;
};

export const getInventoryDropColumnsEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_DROP_COLUMNS_ENDPOINT__) {
    return window.__INVENTORY_DROP_COLUMNS_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_DROP_COLUMNS_ENDPOINT || DEFAULT_DROP_COLUMNS_ENDPOINT;
};

export const getInventoryCleanupExportLogsEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_CLEANUP_EXPORT_LOGS_ENDPOINT__) {
    return window.__INVENTORY_CLEANUP_EXPORT_LOGS_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_CLEANUP_EXPORT_LOGS_ENDPOINT || DEFAULT_CLEANUP_EXPORT_LOGS_ENDPOINT;
};

export const getInventoryLogsTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_LOGS_TABLE_ENDPOINT__) {
    return window.__INVENTORY_LOGS_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_LOGS_TABLE_ENDPOINT || "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/create-inventory-logs-table";
};

export const getInventoryDropLogsTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_DROP_LOGS_TABLE_ENDPOINT__) {
    return window.__INVENTORY_DROP_LOGS_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_DROP_LOGS_TABLE_ENDPOINT || "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-logs-table";
};

export const getInventoryExportsTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_EXPORTS_TABLE_ENDPOINT__) {
    return window.__INVENTORY_EXPORTS_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_EXPORTS_TABLE_ENDPOINT || "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/create-inventory-exports-table";
};

export const getInventoryDropExportsTableEndpoint = () => {
  if (typeof window !== "undefined" && window.__INVENTORY_DROP_EXPORTS_TABLE_ENDPOINT__) {
    return window.__INVENTORY_DROP_EXPORTS_TABLE_ENDPOINT__;
  }

  return import.meta.env.VITE_INVENTORY_DROP_EXPORTS_TABLE_ENDPOINT || "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-exports-table";
};

export const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const makeUniqueSlug = (baseSlug, existingSlugs = [], currentSlug = "") => {
  const normalizedBase = slugify(baseSlug) || "item";
  const taken = new Set(existingSlugs.filter(Boolean).filter((slug) => slug !== currentSlug));

  if (!taken.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  let nextSlug = `${normalizedBase}-${suffix}`;
  while (taken.has(nextSlug)) {
    suffix += 1;
    nextSlug = `${normalizedBase}-${suffix}`;
  }

  return nextSlug;
};

const sortByOrder = (items = []) =>
  [...items].sort((left, right) => {
    const orderDelta = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });

export const normalizeCatalog = (tabs = [], sections = []) => {
  const sectionByTabId = sections.reduce((accumulator, section) => {
    if (!accumulator[section.tab_id]) {
      accumulator[section.tab_id] = [];
    }
    accumulator[section.tab_id].push(section);
    return accumulator;
  }, {});

  return sortByOrder(tabs).map((tab) => ({
    ...tab,
    sections: sortByOrder(sectionByTabId[tab.id] || []),
  }));
};

export const fetchInventoryCatalog = async () => {
  const [tabsResult, sectionsResult] = await Promise.all([
    supabase.from("inventory_tabs").select("id, name, slug, description, sort_order, created_at, updated_at").order("sort_order", { ascending: true }),
    supabase.from("inventory_sections").select("id, tab_id, name, slug, description, sort_order, created_at, updated_at").order("sort_order", { ascending: true }),
  ]);

  if (tabsResult.error) throw tabsResult.error;
  if (sectionsResult.error) throw sectionsResult.error;

  return normalizeCatalog(tabsResult.data || [], sectionsResult.data || []);
};

export const notifyInventoryCatalogChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INVENTORY_CATALOG_CHANGED_EVENT));
};

export const notifyInventoryItemsChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INVENTORY_ITEMS_CHANGED_EVENT));
};

export const useInventoryCatalog = () => {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const catalog = await fetchInventoryCatalog();
        if (!cancelled) {
          setTabs(catalog);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setTabs([]);
          setError(fetchError?.message || "Failed to load inventory catalog.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCatalogChanged = () => {
      setRefreshIndex((current) => current + 1);
    };

    window.addEventListener(INVENTORY_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    return () => {
      window.removeEventListener(INVENTORY_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    };
  }, []);

  const refetch = () => setRefreshIndex((current) => current + 1);

  return { tabs, loading, error, refetch };
};

export const fetchInventoryTabBySlug = async (slug) => {
  const { data, error } = await supabase
    .from("inventory_tabs")
    .select("id, name, slug, description, sort_order, created_at, updated_at")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const fetchInventorySectionBySlug = async (tabId, sectionSlug) => {
  const { data, error } = await supabase
    .from("inventory_sections")
    .select("id, tab_id, name, slug, description, sort_order, created_at, updated_at")
    .eq("tab_id", tabId)
    .eq("slug", sectionSlug)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const fetchInventoryItems = async (sectionId, tableName = null) => {
  if (tableName) {
    // Custom tables: order by created_at since computer_number/sort_order don't exist
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("section_id", sectionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // Legacy inventory_items table: order by computer_number and sort_order
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, section_id, computer_number, type, brand, description, status, data, sort_order, created_at, updated_at")
    .eq("section_id", sectionId)
    .order("computer_number", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;
    return data || [];
};

export const upsertInventoryTab = async ({ id, name, slug, description = "", sort_order = 0 }) => {
  const payload = {
    name,
    slug: slugify(slug || name || "tab"),
    description,
    sort_order,
  };

  if (id) {
    const { data, error } = await supabase
      .from("inventory_tabs")
      .update(payload)
      .eq("id", id)
      .select("id, name, slug, description, sort_order, created_at, updated_at")
      .single();
    if (error) throw error;

    notifyInventoryCatalogChanged();
    return data;
  }

  const { data, error } = await supabase
    .from("inventory_tabs")
    .insert([payload])
    .select("id, name, slug, description, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;

  notifyInventoryCatalogChanged();
  return data;
};

export const deleteInventoryTab = async (id) => {
  // Get the tab's table configuration before deletion
  let tableName = null;
  try {
    const config = await getTabTableConfig(id);
    tableName = config?.tableName;
  } catch (err) {
    // Configuration might not exist
  }

  // Also fetch the tab row (name/slug) to help probe for possible physical table names
  let tabRow = null;
  try {
    const { data, error: tabErr } = await supabase.from('inventory_tabs').select('id, name, slug').eq('id', id).limit(1).maybeSingle();
    if (!tabErr) tabRow = data || null;
  } catch (e) {
    // ignore
  }

  // Delete the physical table if it exists (via Edge Function)
  // NOTE: Edge Functions must be deployed to Supabase. See EDGE_FUNCTIONS_DEPLOYMENT.md
  if (tableName) {
    try {
      const dropEndpoint = getInventoryDropTableEndpoint();
      console.log("[deleteInventoryTab] Calling drop endpoint:", dropEndpoint, "for table:", tableName);
      const result = await callDropInventoryTable(dropEndpoint, tableName);
      console.info(`[deleteInventoryTab] Successfully dropped physical table: ${tableName}`, result);
      // If the drop reported that the table did not exist, try probing a few candidate names
      if (result && result.existed === false) {
        // Physical table reported as not existing. Rather than probing candidate table names
        // (which issues REST queries and can generate 400 errors in the browser), we will
        // log a set of suggested candidate names for manual inspection or admin cleanup.
        const suggestions = [];
        if (tableName) suggestions.push(tableName);
        if (tabRow?.name) {
          suggestions.push(`inventory_${String(tabRow.name || 'tab').toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')}`);
        }
        if (tabRow?.slug) {
          suggestions.push(`inventory_${String(tabRow.slug || '').toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')}`);
        }
        if (suggestions.length > 0) {
          console.info('[deleteInventoryTab] Physical table did not exist. Candidate table names to inspect manually:', suggestions);
        }
      }
    } catch (dropErr) {
      console.error("[deleteInventoryTab] Error during table drop:", {
        message: dropErr?.message,
        error: dropErr,
        tableName,
      });
      const isNotDeployed = dropErr.message?.includes("Drop table function not deployed");
      if (isNotDeployed) {
        console.error(dropErr.message);
        console.warn(`Physical table ${tableName} will not be deleted. See EDGE_FUNCTIONS_DEPLOYMENT.md`);
      } else {
        console.warn("Failed to drop physical table", tableName, dropErr);
      }
      // Continue with metadata deletion even if physical table drop fails
    }

    // Delete the corresponding logs table (non-critical: if it fails, we warn but continue)
    try {
      const dropLogsEndpoint = getInventoryDropLogsTableEndpoint();
      console.log("[deleteInventoryTab] Calling drop logs endpoint:", dropLogsEndpoint, "for table:", `${tableName}_logs`);
      const logsResult = await callDropInventoryLogsTable(dropLogsEndpoint, tableName);
      console.info(`[deleteInventoryTab] Successfully dropped logs table: ${tableName}_logs`, logsResult);
    } catch (logsDropErr) {
      console.warn("[deleteInventoryTab] Failed to drop logs table (non-critical):", {
        message: logsDropErr?.message,
        error: logsDropErr,
        tableName,
      });
      // Don't throw error - continue with tab deletion even if logs table drop fails
    }
    // Skipping drop of per-table exports edge function due to CORS / environment constraints.
    // Exports are stored centrally in `dynamic_inventory_export_logs`, so per-table exports cleanup
    // is not required on the client side.
  }

  // Always try to drop the physical table using the derived name from tab name as a robust fallback
  // This ensures we attempt to drop the table even if config lookup fails or Edge Function fails
  const derivedTableName = tabRow?.name
    ? `inventory_${String(tabRow.name || 'tab').toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')}`
    : null;

  const tableNamesToTry = [];
  if (tableName) tableNamesToTry.push(tableName);
  if (derivedTableName && derivedTableName !== tableName) tableNamesToTry.push(derivedTableName);

  // Try to drop physical tables for all candidate names
  for (const candidate of tableNamesToTry) {
    try {
      const dropEndpoint = getInventoryDropTableEndpoint();
      console.log('[deleteInventoryTab] Attempting to drop table:', candidate);
      await callDropInventoryTable(dropEndpoint, candidate);
      console.info('[deleteInventoryTab] Dropped physical table:', candidate);

      // Also attempt to drop logs tied to candidate.
      // Export logs are shared in dynamic_inventory_export_logs, so there is no per-table exports table to drop.
      try {
        const dropLogsEndpoint = getInventoryDropLogsTableEndpoint();
        await callDropInventoryLogsTable(dropLogsEndpoint, candidate);
      } catch (e) {
        console.warn('[deleteInventoryTab] Failed to drop logs table (non-critical):', e);
      }
    } catch (e) {
      console.warn('[deleteInventoryTab] Failed to drop table (non-critical):', candidate, e);
    }
  }

  // Delete all sections (which cascades to items due to DB constraints)
  const { error: sectionsError } = await supabase
    .from("inventory_sections")
    .delete()
    .eq("tab_id", id);
  if (sectionsError) throw sectionsError;

  // Delete all items in the legacy table for this tab (for backward compatibility)
  const { data: sections } = await supabase
    .from("inventory_sections")
    .select("id")
    .eq("tab_id", id);

  if (sections && sections.length > 0) {
    for (const section of sections) {
      try {
        await supabase.from("inventory_items").delete().eq("section_id", section.id);
      } catch (e) {
        // Ignore errors - items might not exist
      }
    }
  }

  // Delete export files and logs associated with this tab
  try {
    // Get all export logs for this tab
    const { data: exportLogs, error: fetchLogsError } = await supabase
      .from("dynamic_inventory_export_logs")
      .select("id, file_path")
      .eq("tab_id", id);

    if (!fetchLogsError && exportLogs && exportLogs.length > 0) {
      console.log("[deleteInventoryTab] Found export logs to delete:", exportLogs.length);

      // Delete files from Supabase Storage
      for (const log of exportLogs) {
        if (log.file_path) {
          try {
            const { error: storageError } = await supabase.storage
              .from("section-exports")
              .remove([log.file_path]);
            if (storageError) {
              console.warn("[deleteInventoryTab] Failed to delete export file:", log.file_path, storageError);
            } else {
              console.log("[deleteInventoryTab] Deleted export file:", log.file_path);
            }
          } catch (storageErr) {
            console.warn("[deleteInventoryTab] Error deleting export file:", log.file_path, storageErr);
          }
        }
      }

      // Delete export log entries
      const { error: deleteLogsError } = await supabase
        .from("dynamic_inventory_export_logs")
        .delete()
        .eq("tab_id", id);

      if (deleteLogsError) {
        console.warn("[deleteInventoryTab] Failed to delete export logs:", deleteLogsError);
      } else {
        console.log("[deleteInventoryTab] Deleted export log entries:", exportLogs.length);
      }
    }
  } catch (exportCleanupErr) {
    console.warn("[deleteInventoryTab] Error cleaning up export files/logs:", exportCleanupErr);
    // Don't throw - this is non-critical
  }

  // Delete tab configuration settings
  try {
    await supabase
      .from("inventory_settings")
      .delete()
      .like("key", `inventory.tab_table.${id}%`);
  } catch (e) {
    // Ignore settings error - might not exist
  }

  // Delete the tab itself
  const { error } = await supabase.from("inventory_tabs").delete().eq("id", id);
  if (error) throw error;

  notifyInventoryCatalogChanged();
};

export const upsertInventorySection = async ({ id, tabId, name, slug, description = "", sort_order = 0 }) => {
  const payload = {
    tab_id: tabId,
    name,
    slug: slugify(slug || name || "section"),
    description,
    sort_order,
  };

  if (id) {
    const { data, error } = await supabase
      .from("inventory_sections")
      .update(payload)
      .eq("id", id)
      .select("id, tab_id, name, slug, description, sort_order, created_at, updated_at")
      .single();
    if (error) throw error;

    notifyInventoryCatalogChanged();
    return data;
  }

  const { data, error } = await supabase
    .from("inventory_sections")
    .insert([payload])
    .select("id, tab_id, name, slug, description, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;

  notifyInventoryCatalogChanged();
  return data;
};

export const deleteInventorySection = async (id) => {
  // Delete all items in the legacy inventory_items table
  const { error: legacyItemsError } = await supabase
    .from("inventory_items")
    .delete()
    .eq("section_id", id);
  // Ignore errors - items might be stored in a custom table instead

  // Delete the section itself
  const { error } = await supabase.from("inventory_sections").delete().eq("id", id);
  if (error) throw error;

  notifyInventoryCatalogChanged();
};

export const upsertInventoryItem = async ({ id, sectionId, computerNumber, type, brand, description, status, sort_order, tableName = null, recordData = null }) => {
  const sortOrderPayload = sort_order === undefined ? {} : { sort_order };
  const payload = recordData && typeof recordData === "object"
    ? { section_id: sectionId, ...sortOrderPayload, ...recordData }
    : {
      section_id: sectionId,
      computer_number: computerNumber,
      type,
      brand,
      description,
      status,
      ...sortOrderPayload,
    };
  let result;
  if (tableName) {
    if (id) {
      // For UPDATE, we need to fetch old data for logging
      let oldData = null;
      try {
        const { data: oldDataRes } = await supabase.from(tableName).select("*").eq("id", id).single();
        oldData = oldDataRes;
      } catch (e) {
        console.warn("Failed to fetch old data for logging:", e);
      }
      const { data, error } = await supabase.from(tableName).update(payload).eq("id", id).select("*").single();
      if (error) throw error;
      result = data;
      // Log the update
      try {
        await logInventoryChange(tableName, 'UPDATE', oldData, result, sectionId);
      } catch (logError) {
        console.warn("Failed to log inventory update:", logError);
      }
    } else {
      // For INSERT
      const { data, error } = await supabase.from(tableName).insert([payload]).select("*").single();
      if (error) throw error;
      result = data;
      // Log the insert
      try {
        await logInventoryChange(tableName, 'INSERT', null, result, sectionId);
      } catch (logError) {
        console.warn("Failed to log inventory insert:", logError);
      }
    }
  } else {
    // Legacy inventory_items table
    if (id) {
      const { data, error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", id)
        .select("id, section_id, computer_number, type, brand, description, status, sort_order, created_at, updated_at")
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert([payload])
        .select("id, section_id, computer_number, type, brand, description, status, sort_order, created_at, updated_at")
        .single();
      if (error) throw error;
      result = data;
    }
  }
  return result;
};

export const updateInventoryItemQuantity = async ({
  id,
  sectionId,
  tableName = null,
  quantity,
}) => {
  if (!id) throw new Error("Inventory item is required.");
  if (!sectionId) throw new Error("Inventory section is required.");

  const nextQuantity = Number(quantity);
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
    throw new Error("Inventory quantity must be a valid non-negative number.");
  }

  let result;
  if (tableName) {
    // For UPDATE, we need to fetch old data for logging
    let oldData = null;
    try {
      const { data: oldDataRes } = await supabase.from(tableName).select("*").eq("id", id).single();
      oldData = oldDataRes;
    } catch (e) {
      console.warn("Failed to fetch old data for logging:", e);
    }
    const { data, error } = await supabase
      .from(tableName)
      .update({
        quantity: nextQuantity,
      })
      .eq("id", id)
      .eq("section_id", sectionId)
      .select("*")
      .single();
    if (error) throw error;
    result = data;
    // Log the update
    try {
      await logInventoryChange(tableName, 'UPDATE', oldData, result, sectionId);
    } catch (logError) {
      console.warn("Failed to log inventory quantity update:", logError);
    }
  } else {
    // Legacy inventory_items table
    const { data: existingItem, error: existingError } = await supabase
      .from("inventory_items")
      .select("data")
      .eq("id", id)
      .eq("section_id", sectionId)
      .single();

    if (existingError) throw existingError;

    // For UPDATE, we need to fetch old data for logging
    let oldData = null;
    try {
      const { data: oldDataRes } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("id", id)
        .eq("section_id", sectionId)
        .single();
      oldData = oldDataRes;
    } catch (e) {
      console.warn("Failed to fetch old data for logging:", e);
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        data: {
          ...(existingItem?.data && typeof existingItem.data === "object" ? existingItem.data : {}),
          quantity: nextQuantity,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("section_id", sectionId)
      .select("id, section_id, computer_number, type, brand, description, status, data, sort_order, created_at, updated_at")
      .single();
    if (error) throw error;
    result = data;
    // Log the update
    try {
      await logInventoryChange('inventory_items', 'UPDATE', oldData, result, sectionId);
    } catch (logError) {
      console.warn("Failed to log inventory quantity update:", logError);
    }
  }

  notifyInventoryItemsChanged();
  return result;
};

export const adjustInventoryItemQuantity = async ({
  id,
  sectionId,
  tableName = null,
  delta,
}) => {
  if (!id) throw new Error("Inventory item is required.");
  if (!sectionId) throw new Error("Inventory section is required.");

  const quantityDelta = Number(delta);
  if (!Number.isFinite(quantityDelta)) {
    throw new Error("Inventory quantity adjustment must be a valid number.");
  }

  const resolvedTableName = String(tableName || "").trim();
  if (!resolvedTableName) {
    throw new Error("Inventory table name is missing for this borrowing record.");
  }

  const { data: existingItem, error: existingError } = await supabase
    .from(resolvedTableName)
    .select("quantity")
    .eq("id", id)
    .eq("section_id", sectionId)
    .single();

  if (existingError) throw existingError;

  const currentQuantity = Number(existingItem?.quantity ?? 0);
  if (!Number.isFinite(currentQuantity)) {
    throw new Error("Current inventory quantity is invalid.");
  }

  return updateInventoryItemQuantity({
    id,
    sectionId,
    tableName: resolvedTableName,
    quantity: Math.max(0, currentQuantity + quantityDelta),
  });
};

const GENERATED_INVENTORY_FIELDS = new Set([
  "id",
  "section_id",
  "created_at",
  "updated_at",
  "sort_order",
]);

const isQuantityFieldKey = (key = "") => {
  const normalizedKey = String(key || "").trim().toLowerCase();
  return normalizedKey === "quantity" || normalizedKey.endsWith("_quantity");
};

const isDefectFieldKey = (key = "") => {
  const normalizedKey = String(key || "").trim().toLowerCase();
  return (
    normalizedKey.includes("condition") ||
    normalizedKey.includes("status") ||
    normalizedKey.includes("remarks")
  );
};

const normalizeInventoryMatchValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim().toLowerCase();
};

const isDefectiveInventoryRow = (record = {}) =>
  Object.entries(record || {}).some(([key, value]) => {
    if (GENERATED_INVENTORY_FIELDS.has(key) || isQuantityFieldKey(key)) return false;
    if (value && typeof value === "object") return isDefectiveInventoryRow(value);

    const normalizedValue = String(value || "").trim().toLowerCase();
    return normalizedValue.includes("defect") || normalizedValue.includes("broken");
  });

const doInventoryRowsMatchSameItem = (sourceItem = {}, candidateItem = {}) => {
  const comparisonKeys = Object.keys(sourceItem || {}).filter((key) => {
    if (GENERATED_INVENTORY_FIELDS.has(key)) return false;
    if (isQuantityFieldKey(key)) return false;
    if (isDefectFieldKey(key)) return false;
    return sourceItem[key] !== null && sourceItem[key] !== undefined && String(sourceItem[key]).trim() !== "";
  });

  if (comparisonKeys.length === 0) return false;

  return comparisonKeys.every(
    (key) =>
      normalizeInventoryMatchValue(sourceItem[key]) ===
      normalizeInventoryMatchValue(candidateItem[key])
  );
};

const getDefectFieldKey = (record = {}) => {
  const keys = Object.keys(record || {});
  const exactMatch = [
    "condition",
    "status",
    "remarks",
    "return_condition",
    "item_status",
  ].find((key) => keys.includes(key));

  if (exactMatch) return exactMatch;

  return keys.find((key) => {
    const normalizedKey = String(key || "").toLowerCase();
    return (
      normalizedKey.includes("condition") ||
      normalizedKey.includes("status") ||
      normalizedKey.includes("remarks")
    );
  });
};

const getDefectiveFieldValue = (fieldKey = "", remarks = "") => {
  const normalizedKey = String(fieldKey || "").toLowerCase();
  const cleanRemarks = String(remarks || "").trim();

  if (normalizedKey.includes("remarks")) {
    return cleanRemarks ? `Defective` : "Defective";
  }

  return "Defective";
};

export const createReturnedDefectiveInventoryItem = async ({
  id,
  sectionId,
  tableName = null,
  quantity,
  remarks = "",
}) => {
  if (!id) throw new Error("Inventory item is required.");
  if (!sectionId) throw new Error("Inventory section is required.");

  const returnedQuantity = Number(quantity);
  if (!Number.isFinite(returnedQuantity) || returnedQuantity <= 0) {
    throw new Error("Returned defective quantity must be a valid positive number.");
  }

  const resolvedTableName = String(tableName || "").trim();
  if (!resolvedTableName) {
    throw new Error("Inventory table name is missing for this borrowing record.");
  }

  const { data: sourceItem, error: sourceError } = await supabase
    .from(resolvedTableName)
    .select("*")
    .eq("id", id)
    .eq("section_id", sectionId)
    .single();

  if (sourceError) throw sourceError;

  const defectFieldKey = getDefectFieldKey(sourceItem);
  const { data: sectionItems, error: sectionItemsError } = await supabase
    .from(resolvedTableName)
    .select("*")
    .eq("section_id", sectionId);

  if (sectionItemsError) throw sectionItemsError;

  const existingDefectiveItem = (sectionItems || []).find(
    (candidateItem) =>
      String(candidateItem?.id) !== String(sourceItem?.id) &&
      isDefectiveInventoryRow(candidateItem) &&
      doInventoryRowsMatchSameItem(sourceItem, candidateItem)
  );

  if (existingDefectiveItem?.id) {
    const currentDefectiveQuantity = Number(existingDefectiveItem.quantity ?? 0);

    if (!Number.isFinite(currentDefectiveQuantity)) {
      throw new Error("Existing defective inventory quantity is invalid.");
    }

    return updateInventoryItemQuantity({
      id: existingDefectiveItem.id,
      sectionId,
      tableName: resolvedTableName,
      quantity: currentDefectiveQuantity + returnedQuantity,
    });
  }

  const recordData = Object.entries(sourceItem || {}).reduce((payload, [key, value]) => {
    if (GENERATED_INVENTORY_FIELDS.has(key)) return payload;
    payload[key] = value;
    return payload;
  }, {});

  recordData.quantity = returnedQuantity;

  if (defectFieldKey) {
    recordData[defectFieldKey] = getDefectiveFieldValue(defectFieldKey, remarks);
  }

  if (Object.prototype.hasOwnProperty.call(recordData, "remarks")) {
    recordData.remarks = getDefectiveFieldValue("remarks", remarks);
  }

  return upsertInventoryItem({
    sectionId,
    tableName: resolvedTableName,
    recordData,
  });
};

export const deleteInventoryItem = async (id, tableName = null, sectionId = null) => {
  // For DELETE, we need to fetch old data for logging
  let oldData = null;
  try {
    if (tableName) {
      const { data: oldDataRes } = await supabase.from(tableName).select("*").eq("id", id).single();
      oldData = oldDataRes;
    } else {
      const { data: oldDataRes } = await supabase.from("inventory_items").select("*").eq("id", id).single();
      oldData = oldDataRes;
    }
  } catch (e) {
    console.warn("Failed to fetch old data for deletion logging:", e);
  }

  if (tableName) {
    const { error } = await supabase.from(tableName).delete().eq("id", id);
    if (error) throw error;
    // Log the deletion
    try {
      await logInventoryChange(tableName, 'DELETE', oldData, null, sectionId);
    } catch (logError) {
      console.warn("Failed to log inventory deletion:", logError);
    }
    return;
  }

  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
  // Log the deletion for legacy table
  try {
    await logInventoryChange('inventory_items', 'DELETE', oldData, null, sectionId);
  } catch (logError) {
    console.warn("Failed to log inventory deletion:", logError);
  }
};

export const getTabTableConfig = async (tabId) => {
  if (!tabId) return null;
  const key = `inventory.tab_table.${tabId}`;
  try {
    const { data, error } = await supabase.from("inventory_settings").select("value").eq("key", key).limit(1).maybeSingle();
    if (!error && data?.value) return data.value;
  } catch (err) {
    // fall through to localStorage
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      // ignore localStorage parse errors
    }
  }

  return null;
};

export const getTabTableName = async (tabId) => {
  const config = await getTabTableConfig(tabId);
  return config?.tableName || null;
};

// Column metadata CRUD
// Helper to call an admin Edge Function that executes DDL to create a table
export const callCreateInventoryTable = async (edgeFunctionUrl, tableName, columns = []) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to create tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  let hasValidAuth = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      hasValidAuth = true;
    }
  } catch (e) {
    // If getting session fails, fall back to app_session
  }

  // Always include app_session when available so the edge function can resolve role from the browser session too.
  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) {
        headers["X-App-Session"] = sessionRaw;
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ tableName, columns }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create table failed: ${res.status} ${text}`);
  }
  return res.json();
};

// Helper to add or remove columns from an existing table
export const callModifyInventoryTable = async (edgeFunctionUrl, tableName, action = "add", columnsOrKeys = []) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to modify tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  let hasValidAuth = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      hasValidAuth = true;
    }
  } catch (e) {
    // If getting session fails, fall back to app_session
  }

  // Always include app_session when available so the edge function can resolve role from the browser session too.
  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) {
        headers["X-App-Session"] = sessionRaw;
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  const payload = {
    tableName,
    action, // "add" or "remove"
  };

  if (action === "add" || action === "addcolumns" || action === "sync" || action === "synccolumns") {
    payload.columns = columnsOrKeys; // array of { key, type }
  } else if (action === "remove" || action === "removecolumns") {
    payload.removeColumns = columnsOrKeys; // array of column names to remove
  }

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Modify table failed: ${res.status} ${text}`);
  }
  return res.json();
};

// Drop an entire inventory table from the database
export const callDropInventoryTable = async (edgeFunctionUrl, tableName) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to drop tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  let hasValidAuth = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      hasValidAuth = true;
    }
  } catch (e) {
    // If getting session fails, fall back to app_session
  }

  // Always include app_session when available so the edge function can resolve role from the browser session too.
  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) headers["X-App-Session"] = sessionRaw;
    } catch (e) {
      // ignore
    }
  }

  console.log("[callDropInventoryTable] Starting fetch:", {
    url: edgeFunctionUrl,
    tableName,
    headersKeys: Object.keys(headers),
  });

  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ tableName }),
    });

    console.log("[callDropInventoryTable] Response status:", res.status, res.statusText);

    if (!res.ok) {
      const text = await res.text();
      console.error("[callDropInventoryTable] Response not ok:", { status: res.status, text });
      const errorMsg = res.status === 404 
        ? `Drop table function not deployed. See EDGE_FUNCTIONS_DEPLOYMENT.md for deployment instructions.`
        : `Drop table failed: ${res.status} ${text}`;
      throw new Error(errorMsg);
    }

    const result = await res.json();
    console.log("[callDropInventoryTable] Success:", result);
    return result;
  } catch (error) {
    console.error("[callDropInventoryTable] Fetch error:", error);
    throw error;
  }
};

// Drop specific columns from an inventory table
export const callDropInventoryColumns = async (edgeFunctionUrl, tableName, columnNames = []) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to drop columns.");
  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    throw new Error("columnNames must be a non-empty array.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) headers["X-App-Session"] = sessionRaw;
    } catch (e) {
      // ignore
    }
  }

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ tableName, columnNames }),
  });

  console.log("[callDropInventoryColumns] Response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text();
    console.error("[callDropInventoryColumns] Response not ok:", { status: res.status, text });
    throw new Error(`Drop columns failed: ${res.status} ${text}`);
  }
  const result = await res.json();
  console.log("[callDropInventoryColumns] Success:", result);
  return result;
};

// Create logs table for inventory table
export const callCreateInventoryLogsTable = async (edgeFunctionUrl, inventoryTableName, columns = []) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to create logs tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  let hasValidAuth = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      hasValidAuth = true;
    }
  } catch (e) {
    // If getting session fails, fall back to app_session
  }

  // Always include app_session when available so the edge function can resolve role from the browser session too.
  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) {
        headers["X-App-Session"] = sessionRaw;
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tableName: `${inventoryTableName}_logs`,
      inventoryTableName,
      columns
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create inventory logs table failed: ${res.status} ${text}`);
  }
  return res.json();
};

// Drop logs table for inventory table
export const callDropInventoryLogsTable = async (edgeFunctionUrl, inventoryTableName) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to drop logs tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  let hasValidAuth = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      hasValidAuth = true;
    }
  } catch (e) {
    // If getting session fails, fall back to app_session
  }

  // Always include app_session when available so the edge function can resolve role from the browser session too.
  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) {
        headers["X-App-Session"] = sessionRaw;
      }
    } catch (e) {
      // ignore
    }
  }

  console.log("[callDropInventoryLogsTable] Starting fetch:", {
    url: edgeFunctionUrl,
    inventoryTableName,
    headersKeys: Object.keys(headers),
  });

  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ tableName: `${inventoryTableName}_logs` }),
    });

    console.log("[callDropInventoryLogsTable] Response status:", res.status, res.statusText);

    if (!res.ok) {
      const text = await res.text();
      console.error("[callDropInventoryLogsTable] Response not ok:", { status: res.status, text });
      const errorMsg = res.status === 404
        ? `Drop logs table function not deployed. See EDGE_FUNCTIONS_DEPLOYMENT.md for deployment instructions.`
        : `Drop logs table failed: ${res.status} ${text}`;
      throw new Error(errorMsg);
    }

    const result = await res.json();
    console.log("[callDropInventoryLogsTable] Success:", result);
    return result;
  } catch (error) {
    console.error("[callDropInventoryLogsTable] Fetch error:", error);
    throw error;
  }
};

// Drop exports table for inventory table (used by delete flow)
export const callDropInventoryExportsTable = async (edgeFunctionUrl, inventoryTableName) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to drop exports tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } catch (e) {
    // ignore
  }

  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) headers["X-App-Session"] = sessionRaw;
    } catch (e) {
      // ignore
    }
  }

  console.log("[callDropInventoryExportsTable] Starting fetch:", {
    url: edgeFunctionUrl,
    inventoryTableName,
    headersKeys: Object.keys(headers),
  });

  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ tableName: `${inventoryTableName}_exports` }),
    });

    console.log("[callDropInventoryExportsTable] Response status:", res.status, res.statusText);

    if (!res.ok) {
      const text = await res.text();
      console.error("[callDropInventoryExportsTable] Response not ok:", { status: res.status, text });
      const errorMsg = res.status === 404
        ? `Drop exports table function not deployed. See EDGE_FUNCTIONS_DEPLOYMENT.md for deployment instructions.`
        : `Drop exports table failed: ${res.status} ${text}`;
      throw new Error(errorMsg);
    }

    const result = await res.json();
    console.log("[callDropInventoryExportsTable] Success:", result);
    return result;
  } catch (error) {
    console.error("[callDropInventoryExportsTable] Fetch error:", error);
    throw error;
  }
};

export const callCleanupExportLogs = async (edgeFunctionUrl, retentionDays) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to clean up export logs.");
  const headers = { "Content-Type": "application/json" };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } catch (e) {
    // ignore
  }

  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) headers["X-App-Session"] = sessionRaw;
    } catch (e) {
      // ignore
    }
  }

  const response = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ retentionDays }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cleanup export logs failed: ${response.status} ${text}`);
  }

  return response.json();
};

// Create exports table for inventory table
export const callCreateInventoryExportsTable = async (edgeFunctionUrl, inventoryTableName, columns = []) => {
  if (!edgeFunctionUrl) throw new Error("Edge function URL is required to create exports tables.");
  const headers = { "Content-Type": "application/json" };

  // Try to get Supabase access token first
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } catch (e) {
    // ignore
  }

  if (typeof window !== "undefined") {
    try {
      const sessionRaw = window.localStorage.getItem("app_session");
      if (sessionRaw) headers["X-App-Session"] = sessionRaw;
    } catch (e) {
      // ignore
    }
  }

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tableName: `${inventoryTableName}_exports`,
      inventoryTableName,
      columns,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create inventory exports table failed: ${res.status} ${text}`);
  }
  return res.json();
};

// (duplicate `callDropInventoryExportsTable` removed — single implementation retained earlier)

// Simple settings CRUD (key -> jsonb value)
export const fetchSetting = async (key) => {
  const { data, error } = await supabase.from("inventory_settings").select("id, key, value").eq("key", key).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
};

export const upsertSetting = async (key, value = {}) => {
  const payload = { key, value };
  // try update first
  const { data: existing } = await supabase.from("inventory_settings").select("id").eq("key", key).limit(1).maybeSingle();
  if (existing?.id) {
    const { data, error } = await supabase.from("inventory_settings").update({ value }).eq("id", existing.id).select("id, key, value").single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("inventory_settings").insert([payload]).select("id, key, value").single();
  if (error) throw error;
  return data;
};

// Auth / role helpers
export const fetchCurrentUser = async () => {
  // supabase-js v2
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
};

export const isCurrentUserAdmin = async () => {
  try {
    const user = await fetchCurrentUser();
    if (!user) return false;
    const normalizedUserId = String(user.id || "").trim();
    const normalizedEmail = String(user.email || "").trim().toLowerCase();

    if (user.user_metadata?.role === "admin" || user.app_metadata?.role === "admin") {
      return true;
    }

    if (normalizedUserId) {
      const { data: byId, error: byIdError } = await supabase
        .from("user_accounts")
        .select("account_type")
        .eq("id", normalizedUserId)
        .maybeSingle();

      if (!byIdError && ["admin", "superadmin"].includes(String(byId?.account_type || "").toLowerCase())) {
        return true;
      }
    }

    if (!normalizedEmail) return false;

    const { data, error } = await supabase
      .from("user_accounts")
      .select("account_type")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return false;

    return ["admin", "superadmin"].includes(String(data?.account_type || "").toLowerCase());
  } catch (err) {
    return false;
  }
};

export const groupInventoryItems = (items = []) => {
  const validTypes = new Set([
    "MOTHERBOARD",
    "PROCESSOR",
    "MEMORY",
    "SSD",
    "HDD",
    "VIDEO CARD",
    "AVR",
    "MOUSE",
    "POWER SUPPLY",
    "KEYBOARD",
    "MONITOR",
    "OPERATING SYSTEM",
  ]);

  const grouped = Object.values(
    items.reduce((accumulator, item) => {
      const computerKey = item.computer_number ?? "Unknown";
      if (!accumulator[computerKey]) {
        accumulator[computerKey] = { "COMPUTER #": item.computer_number, components: {} };
      }

      const componentType = item.type?.toString().trim().toUpperCase();
      if (componentType && validTypes.has(componentType)) {
        accumulator[computerKey].components[componentType] = {
          brand: item.brand || "-",
          description: item.description || "-",
          remarks: item.status || "-",
        };
      }

      return accumulator;
    }, {}),
  );

  return grouped.sort((left, right) => Number(left["COMPUTER #"]) - Number(right["COMPUTER #"]));
};

// ────────────────────────────────────────────────────────────────────────────
// Inventory Instance CRUD — Individual asset tracking (parent_id child rows)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all child instances for a parent inventory item.
 * Child rows live in the same dynamic table, linked via parent_id FK.
 */
export const fetchItemInstances = async ({ tableName, parentId }) => {
  if (!tableName || parentId == null) return [];
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("parent_id", parentId)
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
};

/**
 * Create a new instance (child row) linked to a parent item.
 * Inherits parent's name, tab_id, section_id. Sets parent_id FK.
 */
export const createItemInstance = async ({ tableName, parentItem, childData }) => {
  if (!tableName || !parentItem?.id) throw new Error("tableName and parentItem.id are required");

  // Derive parent name from whatever name column exists
  const parentName =
    parentItem.name ||
    parentItem.item_name ||
    parentItem.asset_name ||
    parentItem.brand ||
    parentItem.type ||
    "Item";

  const payload = {
    ...childData,
    parent_id: parentItem.id,
    name: parentName,
    tab_id: parentItem.tab_id ?? null,
    section_id: parentItem.section_id ?? null,
    condition: childData.condition || "Working",
  };

  const { data, error } = await supabase
    .from(tableName)
    .insert([payload])
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Update instance fields (condition, tag, serial, remarks, etc.)
 */
export const updateItemInstance = async ({ tableName, instanceId, updates }) => {
  if (!tableName || !instanceId) throw new Error("tableName and instanceId are required");

  const { data, error } = await supabase
    .from(tableName)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", instanceId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Delete a single instance (child row)
 */
export const deleteItemInstance = async ({ tableName, instanceId }) => {
  if (!tableName || !instanceId) throw new Error("tableName and instanceId are required");
  const { error } = await supabase.from(tableName).delete().eq("id", instanceId);
  if (error) throw error;
};

/**
 * Compute working / defective / under-repair counts from an array of instance rows.
 * @param {Array} instances - child rows
 * @returns {{ working: number, defective: number, underRepair: number, total: number }}
 */
/**
 * Compute working / defective / under-repair counts from an array of instance rows.
 * @param {Array} instances - child rows
 * @param {Array} [conditionOptions] - optional classified options [{value, conditionGroup}] for dynamic classification
 * @returns {{ working: number, defective: number, underRepair: number, total: number }}
 */
export const getInstanceCounts = (instances = [], conditionOptions = null) => {
  let working = 0;
  let defective = 0;
  let underRepair = 0;

  for (const inst of instances) {
    const c = String(inst.condition || "Working").toLowerCase().trim();

    // Check for "under repair" first (special case)
    if (c === "under repair" || c === "under_repair" || c === "repair") {
      underRepair++;
      continue;
    }

    // Use dynamic classification if conditionOptions provided
    if (conditionOptions && conditionOptions.length > 0) {
      // Find matching option
      const match = conditionOptions.find((o) => {
        const v = (o && typeof o === "object" && "value" in o) ? String(o.value) : String(o);
        return v.trim().toLowerCase() === c;
      });
      if (match && typeof match === "object" && match.conditionGroup === "operational") {
        working++;
      } else if (match && typeof match === "object" && match.conditionGroup === "quarantine") {
        defective++;
      } else {
        // Unknown value — default to working
        working++;
      }
      continue;
    }

    // Fallback to hardcoded logic
    if (c === "defective") defective++;
    else working++;
  }

  return { working, defective, underRepair, total: instances.length };
};
