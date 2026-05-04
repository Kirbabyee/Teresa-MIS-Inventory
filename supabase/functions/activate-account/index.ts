import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hashToken(token: string) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: corsHeaders 
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return jsonResponse({ success: false, error: "Missing activation token." }, 400);
    }

    if (!password || typeof password !== "string") {
      return jsonResponse({ success: false, error: "Missing password." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: "Server is missing Supabase environment variables." },
        500,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const tokenHash = await hashToken(token);

    // Fetch from user_auth_invites table instead of RPC
    const { data: inviteData, error: inviteError } = await supabaseAdmin
      .from("user_auth_invites")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (inviteError) {
      return jsonResponse({ success: false, error: inviteError.message }, 400);
    }

    const inviteRecord = inviteData;

    if (!inviteRecord) {
      return jsonResponse({ success: false, error: "This activation link is invalid." }, 400);
    }

    if (inviteRecord.used_at) {
      return jsonResponse({ success: false, error: "This activation link was already used." }, 400);
    }

    const expiresAt = new Date(inviteRecord.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return jsonResponse({ success: false, error: "This activation link has expired." }, 400);
    }

    // Create the auth user with service role
    const createUserResult = await supabaseAdmin.auth.admin.createUser({
      email: inviteRecord.email,
      password,
      email_confirm: true,
      user_metadata: {
        employee_id: inviteRecord.employee_id,
      },
    });

    if (createUserResult.error) {
      return jsonResponse({ success: false, error: createUserResult.error.message }, 400);
    }

    const authUserId = createUserResult.data.user?.id;
    if (!authUserId) {
      return jsonResponse(
        { success: false, error: "Failed to finalize activation: missing auth user id." },
        500,
      );
    }

    // Check if employee exists and update
    const { data: employeeRecord } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("id", inviteRecord.employee_id)
      .maybeSingle();

    if (employeeRecord) {
      const employeeUpdateResult = await supabaseAdmin
        .from("employees")
        .update({ auth_id: authUserId })
        .eq("id", inviteRecord.employee_id);

      if (employeeUpdateResult.error) {
        return jsonResponse({ success: false, error: employeeUpdateResult.error.message }, 400);
      }
    }

    // Mark invite as consumed via direct table update
    const consumeResult = await supabaseAdmin
      .from("user_auth_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("invite_token_hash", tokenHash);

    if (consumeResult.error) {
      return jsonResponse({ success: false, error: consumeResult.error.message }, 400);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected activation error.";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
