// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const EXPORT_TABLES = ["dynamic_inventory_export_logs", "inventory_section_exports", "export_logs"];
const EXPORT_BUCKET = "export-logs";

// ── Admin auth helpers ─────────────────────────────────────────────────────

const isAllowedAccountType = (accountType) => {
  const normalized = String(accountType || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "superadmin";
};

const fetchAccountTypeByUserId = async (supabaseAdmin, userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  const { data, error } = await supabaseAdmin
    .from("user_accounts")
    .select("account_type")
    .eq("id", normalizedUserId)
    .maybeSingle();
  if (error) return null;
  return data?.account_type ?? null;
};

const fetchAccountTypeByEmail = async (supabaseAdmin, email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await supabaseAdmin
    .from("user_accounts")
    .select("account_type")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.account_type ?? null;
};

const fetchAccountTypeFromSessionHeader = (req) => {
  const appSessionRaw = req.headers.get("X-App-Session") || "";
  try {
    const parsed = appSessionRaw ? JSON.parse(appSessionRaw) : null;
    const accountType = String(parsed?.account_type || parsed?.role || "").trim().toLowerCase();
    if (accountType === "admin" || accountType === "superadmin") return accountType;
  } catch {
    // ignore
  }
  return null;
};

// ── Config reader ──────────────────────────────────────────────────────────

const readConfigFromDB = async (supabaseAdmin) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("system_configurations")
      .select("key, value")
      .in("key", ["export_erasure_enabled", "export_erasure_days"]);

    if (error || !data) return { enabled: false, days: 180 };

    const map = {};
    for (const row of data) map[row.key] = row.value;

    return {
      enabled: map.export_erasure_enabled === "true",
      days: Number(map.export_erasure_days) || 180,
    };
  } catch {
    return { enabled: false, days: 180 };
  }
};

// ── Core cleanup logic ─────────────────────────────────────────────────────

const performCleanup = async (adminClient, retentionDays) => {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoffDate.toISOString();
  const cutoffDay = cutoffIso.slice(0, 10);

  const deletedTables = {};
  const deletedFiles = new Set();
  const tableErrors = [];

  for (const tableName of EXPORT_TABLES) {
    const { data: rows, error: selectError } = await adminClient
      .from(tableName)
      .select("id, file_path, file_name, created_at, export_date")
      .or(`created_at.lt.${cutoffIso},export_date.lt.${cutoffDay}`);

    if (selectError) {
      tableErrors.push({ table: tableName, error: selectError.message });
      continue;
    }

    const exportRows = rows || [];
    const idsToDelete = exportRows.map((row) => row.id).filter(Boolean);
    for (const row of exportRows) {
      const filePath = String(row?.file_path || "").trim();
      if (filePath) deletedFiles.add(filePath);
    }

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await adminClient.from(tableName).delete().in("id", idsToDelete);
      if (deleteError) {
        tableErrors.push({ table: tableName, error: deleteError.message });
        continue;
      }
    }

    deletedTables[tableName] = idsToDelete.length;
  }

  let storageDeleteError = null;
  if (deletedFiles.size > 0) {
    const { error: storageError } = await adminClient.storage.from(EXPORT_BUCKET).remove([...deletedFiles]);
    if (storageError) storageDeleteError = storageError.message;
  }

  return {
    retentionDays,
    cutoffDate: cutoffIso,
    bucket: EXPORT_BUCKET,
    deletedTables,
    deletedFileCount: deletedFiles.size,
    storageDeleteError,
    tableErrors,
  };
};

// ── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        { error: "Missing environment variables. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY." },
        500
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Read config from system_configurations ────────────────────────────
    const config = await readConfigFromDB(adminClient);

    // ── Determine retention days ──────────────────────────────────────────
    // Priority: 1) body.retentionDays, 2) config from DB, 3) default 180
    const body = await req.json().catch(() => null);
    let retentionDays = Number.parseInt(String(body?.retentionDays ?? 0), 10);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      retentionDays = config.days;
    }

    // ── Auth check ───────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const sessionRole = fetchAccountTypeFromSessionHeader(req);

    // Detect unattended call: Authorization starts with "Bearer eyJ" (anon key JWT)
    // but has no valid user session. This is how pg_net calls the function.
    const isUnattendedCall = authHeader.startsWith("Bearer eyJ") && !sessionRole;

    if (isUnattendedCall) {
      // Called from pg_cron/pg_net — no user context, skip user auth.
      // Only proceed if erasure is enabled in system_configurations.
      if (!config.enabled) {
        return jsonResponse({ skipped: true, reason: "disabled" }, 200);
      }
    } else if (authHeader || sessionRole) {
      // Authenticated admin call — verify admin role
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userResult, error: userError } = await authClient.auth.getUser();
      const user = userResult?.user ?? null;

      if (userError || !user) {
        return jsonResponse({ error: "Unauthorized." }, 401);
      }

      let accountType = String(user.user_metadata?.role || user.app_metadata?.role || "").trim().toLowerCase();
      if (!isAllowedAccountType(accountType)) {
        accountType = await fetchAccountTypeByUserId(adminClient, user.id || "");
      }
      if (!isAllowedAccountType(accountType)) {
        accountType = await fetchAccountTypeByEmail(adminClient, user.email || "");
      }
      if (!isAllowedAccountType(accountType) && isAllowedAccountType(sessionRole)) {
        accountType = sessionRole;
      }

      if (!isAllowedAccountType(accountType)) {
        return jsonResponse({ error: "Forbidden. Admin role required." }, 403);
      }
    } else {
      // No auth at all — deny
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    // ── Execute cleanup ───────────────────────────────────────────────────
    const result = await performCleanup(adminClient, retentionDays);

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
