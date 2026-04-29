// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

type ColumnDef = {
  key: string;
  type?: string;
  subColumns?: Array<{ key: string; label?: string; type?: string }>;
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

const expandPhysicalColumns = (columns: ColumnDef[]) =>
  columns.flatMap((column) => {
    const parentKey = sanitizeIdentifier(String(column?.key || ""));
    if (!parentKey) return [];

    const subColumns = Array.isArray(column?.subColumns) ? column.subColumns : [];
    if (subColumns.length > 0) {
      return subColumns
        .map((subColumn) => {
          const subKey = sanitizeIdentifier(String(subColumn?.key || ""));
          if (!subKey) return null;
          return {
            key: `${parentKey}_${subKey}`,
            sqlType: normalizeSqlType(subColumn?.type),
          };
        })
        .filter(Boolean) as Array<{ key: string; sqlType: string }>;
    }

    return [
      {
        key: parentKey,
        sqlType: normalizeSqlType(column?.type),
      },
    ];
  });

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
    // support both `account_type` and legacy `role` fields
    const acct = String(parsed?.account_type || parsed?.role || "").trim().toLowerCase();
    if (acct === "admin" || acct === "superadmin") {
      return acct;
    }
  } catch {
    // ignore parse errors
  }

  return null;
};

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

    // dev fallback: accept a JSON session from X-App-Session header when running locally
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

      const isAdmin = isAllowedAccountType(accountType);
      if (!isAdmin) {
        return jsonResponse({ error: "Forbidden. Admin role required." }, 403);
      }

      const body = await req.json().catch(() => null);
      const tableName = String(body?.tableName || "").trim();
      const columns = Array.isArray(body?.columns) ? body.columns : [];
      const schemaName = sanitizeIdentifier(String(body?.schemaName || "public")) || "public";

      if (!tableName) {
        return jsonResponse({ error: "tableName is required." }, 400);
      }

      const safeTableName = sanitizeIdentifier(tableName);
      if (!safeTableName) {
        return jsonResponse({ error: "tableName is invalid after sanitization." }, 400);
      }

      const normalizedColumns = expandPhysicalColumns(columns as ColumnDef[]);

      const createSql = `
        CREATE TABLE IF NOT EXISTS "${schemaName}"."${safeTableName}" (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          section_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `;
      await client.queryObject(createSql);
      await client.queryObject(`ALTER TABLE "${schemaName}"."${safeTableName}" DISABLE ROW LEVEL SECURITY;`);

      const addColumnResults: Array<{ key: string; added: boolean }> = [];
      for (const column of normalizedColumns) {
        const alterSql = `ALTER TABLE "${schemaName}"."${safeTableName}" ADD COLUMN IF NOT EXISTS "${column.key}" ${column.sqlType};`;
        await client.queryObject(alterSql);
        addColumnResults.push({ key: column.key, added: true });
      }
      await client.queryObject(`ALTER TABLE "${schemaName}"."${safeTableName}" DISABLE ROW LEVEL SECURITY;`);

      await client.queryObject(`
        CREATE OR REPLACE FUNCTION public.set_updated_at()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$;
      `);

      await client.queryObject(`DROP TRIGGER IF EXISTS ${safeTableName}_updated_at ON "${schemaName}"."${safeTableName}";`);
      await client.queryObject(`
        CREATE TRIGGER ${safeTableName}_updated_at
        BEFORE UPDATE ON "${schemaName}"."${safeTableName}"
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
      `);

      return jsonResponse({
        ok: true,
        schema: schemaName,
        table: safeTableName,
        columns: addColumnResults,
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
