// ══════════════════════════════════════════════════════════════════════════════
// Edge Function: purge-export-files
// ══════════════════════════════════════════════════════════════════════════════
//
// Called by the purge_expired_storage_files() SQL function via pg_net.
// Receives a JSON body with { bucket, paths, cutoff } and deletes the
// listed files from Supabase Storage using the Storage SDK.
//
// Deploy:
//   supabase functions deploy purge-export-files
// ══════════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Use POST" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Config missing" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { bucket, paths } = body;

  if (!bucket || !Array.isArray(paths)) {
    return new Response(
      JSON.stringify({ error: "Missing bucket or paths" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (paths.length === 0) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "no paths provided" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Delete files in batches of 50
    let deleted = 0;
    const errors: string[] = [];

    for (let i = 0; i < paths.length; i += 50) {
      const batch = paths.slice(i, i + 50);
      const { error: delErr } = await supabase.storage
        .from(bucket)
        .remove(batch);

      if (delErr) {
        errors.push(delErr.message);
        console.error(`Batch ${Math.floor(i / 50) + 1} delete error:`, delErr);
      } else {
        deleted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        skipped: false,
        deleted,
        requested: paths.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Purge failed:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
