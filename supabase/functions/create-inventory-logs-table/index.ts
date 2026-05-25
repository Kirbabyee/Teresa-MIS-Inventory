// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

type ColumnDef = {
  key?: string;
  type?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const sanitizeIdentifier = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "").toLowerCase();

const normalizeSqlType = (inputType?: string) => {
  const type = String(inputType || "text").toLowerCase();
  if (type === "int" || type === "integer") return "integer";
  if (type === "float" || type === "number" || type === "numeric") return "double precision";
  if (type === "boolean" || type === "bool") return "boolean";
  if (type === "date") return "date";
  if (type === "timestamp") return "timestamptz";
  if (type === "json" || type === "jsonb") return "jsonb";
  return "text";
};

const isAllowedAccountType = (accountType: unknown) => {
  const normalized = String(accountType || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "superadmin";
};

const fetchAccountTypeByUserId = async (client: Client, userId: string) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  const result = await client.queryObject<{ account_type: string | null }>(
    `
      SELECT account_type
      FROM public.user_accounts
      WHERE id::text = $1
      LIMIT 1
    `,
    normalizedUserId,
  );

  return result.rows[0]?.account_type ?? null;
};

const fetchAccountTypeByEmail = async (client: Client, email: string) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const result = await client.queryObject<{ account_type: string | null }>(
    `
      SELECT account_type
      FROM public.user_accounts
      WHERE lower(email) = $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    normalizedEmail,
  );

  return result.rows[0]?.account_type ?? null;
};

const fetchAccountTypeFromSessionHeader = (req: Request) => {
  const appSessionRaw = req.headers.get("X-App-Session") || "";

  try {
    const parsed = appSessionRaw ? JSON.parse(appSessionRaw) : null;
    const accountType = String(parsed?.account_type || parsed?.role || "").trim().toLowerCase();
    if (accountType === "admin" || accountType === "superadmin") {
      return accountType;
    }
  } catch {
    // ignore parse errors
  }

  return null;
};

const expandPhysicalColumns = (columns: ColumnDef[]) =>
  columns
    .filter((column) => column && column.key)
    .map((column) => ({
      key: sanitizeIdentifier(String(column.key || "")),
      sqlType: normalizeSqlType(column.type),
    }))
    .filter((column) => column.key);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const dbUrl = Deno.env.get("DATABASE_URL") ?? Deno.env.get("POSTGRES_CONNECTION_STRING") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !dbUrl) {
      return jsonResponse(
        {
          error:
            "Missing environment variables. Set SUPABASE_URL, SUPABASE_ANON_KEY, and DATABASE_URL for this Edge Function.",
        },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const sessionRole = fetchAccountTypeFromSessionHeader(req);

    let user = null;
    let accountType = null;
    if (!authHeader.startsWith("Bearer ")) {
      const appSessionRaw = req.headers.get("X-App-Session") || "";
      try {
        const parsed = appSessionRaw ? JSON.parse(appSessionRaw) : null;
        if (parsed && (parsed.role === "superadmin" || parsed.role === "admin")) {
          user = {
            email: parsed.email,
            user_metadata: { role: parsed.role },
            app_metadata: { role: parsed.role },
          };
          accountType = parsed.role;
        }
      } catch {
        // ignore parse errors
      }

      if (!user) {
        return jsonResponse({ error: "Missing Authorization bearer token." }, 401);
      }
    } else {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      user = userResult?.user ?? null;

      if (userError || !user) {
        return jsonResponse({ error: "Unauthorized." }, 401);
      }

      const authRole = String(user.user_metadata?.role || user.app_metadata?.role || "").trim().toLowerCase();
      if (authRole === "admin" || authRole === "superadmin") {
        accountType = authRole;
      }
    }

    const client = new Client(dbUrl);
    await client.connect();

    try {
      if (!isAllowedAccountType(accountType)) {
        accountType = await fetchAccountTypeByUserId(client, user.id || "");
      }

      if (!isAllowedAccountType(accountType)) {
        accountType = await fetchAccountTypeByEmail(client, user.email || "");
      }

      if (!isAllowedAccountType(accountType) && isAllowedAccountType(sessionRole)) {
        accountType = sessionRole;
      }

      if (!isAllowedAccountType(accountType)) {
        return jsonResponse({ error: "Forbidden. Admin role required." }, 403);
      }

      const body = await req.json().catch(() => null);
      const rawTableName = String(body?.tableName || body?.inventoryTableName || "").trim();
      const schemaName = sanitizeIdentifier(String(body?.schemaName || "public")) || "public";

      if (!rawTableName) {
        return jsonResponse({ error: "tableName is required." }, 400);
      }

      const safeTableName = sanitizeIdentifier(rawTableName);
      if (!safeTableName) {
        return jsonResponse({ error: "tableName is invalid after sanitization." }, 400);
      }

      const safeColumns = expandPhysicalColumns(Array.isArray(body?.columns) ? body.columns : []);

      const createSql = `
        CREATE TABLE IF NOT EXISTS "${schemaName}"."${safeTableName}" (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          change_ts timestamptz NOT NULL DEFAULT now(),
          action text NOT NULL,
          old_data jsonb,
          new_data jsonb,
          changed_by text
        );
      `;
      await client.queryObject(createSql);

      await client.queryObject(`ALTER TABLE "${schemaName}"."${safeTableName}" DISABLE ROW LEVEL SECURITY;`);
      await client.queryObject(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

      await client.queryObject(`CREATE INDEX IF NOT EXISTS ${safeTableName}_change_ts_idx ON "${schemaName}"."${safeTableName}" (change_ts DESC);`);
      await client.queryObject(`CREATE INDEX IF NOT EXISTS ${safeTableName}_changed_by_idx ON "${schemaName}"."${safeTableName}" (changed_by);`);
      await client.queryObject(`CREATE INDEX IF NOT EXISTS ${safeTableName}_action_idx ON "${schemaName}"."${safeTableName}" (action);`);
      await client.queryObject(`CREATE INDEX IF NOT EXISTS ${safeTableName}_old_data_gin_idx ON "${schemaName}"."${safeTableName}" USING gin (old_data);`);
      await client.queryObject(`CREATE INDEX IF NOT EXISTS ${safeTableName}_new_data_gin_idx ON "${schemaName}"."${safeTableName}" USING gin (new_data);`);

      for (const column of safeColumns) {
        await client.queryObject(`ALTER TABLE "${schemaName}"."${safeTableName}" ADD COLUMN IF NOT EXISTS "${column.key}" ${column.sqlType};`);
      }

      await client.queryObject(`ALTER TABLE "${schemaName}"."${safeTableName}" DISABLE ROW LEVEL SECURITY;`);
      await client.queryObject(`GRANT SELECT, INSERT ON "${schemaName}"."${safeTableName}" TO authenticated;`);

      return jsonResponse({
        ok: true,
        schema: schemaName,
        table: safeTableName,
        columns: safeColumns.map((column) => ({ key: column.key, added: true })),
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
