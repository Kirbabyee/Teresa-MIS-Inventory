import { supabase } from "@/api/supabaseClient";

// ══════════════════════════════════════════════════════════════════════════════
// System Settings API — CRUD for the system_configurations table
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch a single configuration value by key.
 * Returns the raw string value, or null if the key doesn't exist.
 */
export const fetchSystemConfig = async (key) => {
  const { data, error } = await supabase
    .from("system_configurations")
    .select("value")
    .eq("key", key)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
};

/**
 * Upsert a single configuration key/value pair.
 * The value is stored as text in the `value` column.
 */
export const upsertSystemConfig = async (key, value) => {
  const stringValue = String(value);
  const { data, error } = await supabase
    .from("system_configurations")
    .upsert(
      { key, value: stringValue, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select("key, value, updated_at")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Fetch all configuration keys that match a prefix pattern.
 * Useful for loading all settings in a single round-trip.
 *
 * @param {string[]} keys - Array of exact key names to fetch.
 * @returns {Object} Map of key → parsed value (boolean for enabled flags, number for days).
 */
export const fetchSystemConfigs = async (keys) => {
  const { data, error } = await supabase
    .from("system_configurations")
    .select("key, value")
    .in("key", keys);

  if (error) throw error;

  // Build a lookup map with smart type coercion
  const map = {};
  for (const row of data || []) {
    const raw = row.value;
    // Detect boolean strings
    if (raw === "true" || raw === "false") {
      map[row.key] = raw === "true";
    } else {
      // Attempt numeric parse; fall back to raw string
      const n = Number(raw);
      map[row.key] = Number.isFinite(n) ? n : raw;
    }
  }

  // Fill in nulls for any keys that weren't found
  for (const k of keys) {
    if (!(k in map)) map[k] = null;
  }

  return map;
};

/**
 * Save all system settings in a single batch mutation.
 * Each entry is upserted via a single multi-row upsert call.
 *
 * @param {Array<{key: string, value: boolean|number}>} entries
 * @returns {Array} The upserted rows from the database.
 */
export const saveSystemConfigs = async (entries) => {
  const rows = entries.map(({ key, value }) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("system_configurations")
    .upsert(rows, { onConflict: "key" })
    .select("key, value, updated_at");

  if (error) throw error;
  return data;
};

// ══════════════════════════════════════════════════════════════════════════════
// Export Settings Key Registry
// Central reference so the frontend and backend never drift apart.
// ══════════════════════════════════════════════════════════════════════════════

export const CONFIG_KEYS = {
  // ── Export file erasure (system_configurations) ──────────────────────
  exportErasureEnabled: "export_erasure_enabled",
  exportErasureDays: "export_erasure_days",

  // ── Borrowing log erasure (system_configurations — new cron function) ──
  borrowingErasureEnabled: "borrowing_erasure_enabled",
  borrowingErasureDays: "borrowing_erasure_days",

  // ── Borrowing retention (legacy — inventory_settings table) ──────────
  borrowRetentionEnabled: "retention.borrowing.enabled",
  borrowRetentionDays: "retention.borrowing.days",

  // ── Inventory audit log erasure (legacy — inventory_settings table) ───
  inventoryRetentionEnabled: "retention.inventory.enabled",
  inventoryRetentionDays: "retention.inventory.days",

  // ── Inventory audit log erasure (new — system_configurations + pg_cron) ──
  inventoryErasureEnabled: "inventory_erasure_enabled",
  inventoryErasureDays: "inventory_erasure_days",

  // ── Admin approval guard (legacy — inventory_settings table) ──────────
  adminApprovalRequired: "borrowing.require_admin_approval",
};

/**
 * Convenience: load ALL settings needed by the SystemSettings page
 * in a single query, returning a normalized object.
 */
export const loadAllSystemSettings = async () => {
  const keys = Object.values(CONFIG_KEYS);
  const map = await fetchSystemConfigs(keys);

  return {
    exportRetentionEnabled: map[CONFIG_KEYS.exportErasureEnabled] ?? false,
    exportRetentionDays:
      map[CONFIG_KEYS.exportErasureDays] ?? 180,
    borrowingErasureEnabled:
      map[CONFIG_KEYS.borrowingErasureEnabled] ?? false,
    borrowingErasureDays:
      map[CONFIG_KEYS.borrowingErasureDays] ?? 365,
    borrowRetentionEnabled:
      map[CONFIG_KEYS.borrowRetentionEnabled] ?? false,
    borrowRetentionDays:
      map[CONFIG_KEYS.borrowRetentionDays] ?? 90,
    inventoryRetentionEnabled:
      map[CONFIG_KEYS.inventoryRetentionEnabled] ?? false,
    inventoryRetentionDays:
      map[CONFIG_KEYS.inventoryRetentionDays] ?? 60,
    isAdminApprovalRequired:
      map[CONFIG_KEYS.adminApprovalRequired] ?? false,

    // New system_configurations-backed inventory erasure settings
    inventoryErasureEnabled:
      map[CONFIG_KEYS.inventoryErasureEnabled] ?? false,
    inventoryErasureDays:
      map[CONFIG_KEYS.inventoryErasureDays] ?? 60,
  };
};

/**
 * Convenience: save ALL SystemSettings page values in one batch call.
 * Accepts the same shape returned by loadAllSystemSettings().
 */
export const saveAllSystemSettings = async ({
  exportRetentionEnabled,
  exportRetentionDays,
  borrowingErasureEnabled,
  borrowingErasureDays,
  borrowRetentionEnabled,
  borrowRetentionDays,
  inventoryRetentionEnabled,
  inventoryRetentionDays,
  isAdminApprovalRequired,
  inventoryErasureEnabled,
  inventoryErasureDays,
}) => {
  const entries = [
    { key: CONFIG_KEYS.exportErasureEnabled, value: exportRetentionEnabled },
    { key: CONFIG_KEYS.exportErasureDays, value: Number(exportRetentionDays) },
    { key: CONFIG_KEYS.borrowingErasureEnabled, value: borrowingErasureEnabled },
    { key: CONFIG_KEYS.borrowingErasureDays, value: Number(borrowingErasureDays) },
    { key: CONFIG_KEYS.borrowRetentionEnabled, value: borrowRetentionEnabled },
    {
      key: CONFIG_KEYS.borrowRetentionDays,
      value: Number(borrowRetentionDays),
    },
    {
      key: CONFIG_KEYS.inventoryRetentionEnabled,
      value: inventoryRetentionEnabled,
    },
    {
      key: CONFIG_KEYS.inventoryRetentionDays,
      value: Number(inventoryRetentionDays),
    },
    {
      key: CONFIG_KEYS.adminApprovalRequired,
      value: isAdminApprovalRequired,
    },
    {
      key: CONFIG_KEYS.inventoryErasureEnabled,
      value: inventoryErasureEnabled,
    },
    {
      key: CONFIG_KEYS.inventoryErasureDays,
      value: Number(inventoryErasureDays),
    },
  ];

  return saveSystemConfigs(entries);
};
