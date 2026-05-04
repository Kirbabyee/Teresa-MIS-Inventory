import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

export const INVENTORY_CATALOG_CHANGED_EVENT = "inventory-catalog-changed";

const DEFAULT_CREATE_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/create-inventory-table";
const DEFAULT_MODIFY_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/modify-inventory-table";
const DEFAULT_DROP_TABLE_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-table";
const DEFAULT_DROP_COLUMNS_ENDPOINT = "https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/drop-inventory-columns";

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
    return data;
  }

  const { data, error } = await supabase
    .from("inventory_tabs")
    .insert([payload])
    .select("id, name, slug, description, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
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

  // Delete the physical table if it exists (via Edge Function)
  // NOTE: Edge Functions must be deployed to Supabase. See EDGE_FUNCTIONS_DEPLOYMENT.md
  if (tableName) {
    try {
      const dropEndpoint = getInventoryDropTableEndpoint();
      console.log("[deleteInventoryTab] Calling drop endpoint:", dropEndpoint, "for table:", tableName);
      const result = await callDropInventoryTable(dropEndpoint, tableName);
      console.info(`[deleteInventoryTab] Successfully dropped physical table: ${tableName}`, result);
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
    return data;
  }

  const { data, error } = await supabase
    .from("inventory_sections")
    .insert([payload])
    .select("id, tab_id, name, slug, description, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
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
  if (tableName) {
    if (id) {
      const { data, error } = await supabase.from(tableName).update(payload).eq("id", id).single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase.from(tableName).insert([payload]).single();
    if (error) throw error;
    return data;
  }

  if (id) {
    const { data, error } = await supabase
      .from("inventory_items")
      .update(payload)
      .eq("id", id)
      .select("id, section_id, computer_number, type, brand, description, status, sort_order, created_at, updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert([payload])
    .select("id, section_id, computer_number, type, brand, description, status, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
};

export const deleteInventoryItem = async (id, tableName = null) => {
  if (tableName) {
    const { error } = await supabase.from(tableName).delete().eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
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
