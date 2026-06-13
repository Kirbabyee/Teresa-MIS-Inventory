import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    // ── Authenticate the calling user via their JWT ────────────
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Missing authorization header." }, 401);
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
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !caller?.user) {
      return jsonResponse({ success: false, error: "Invalid or expired session." }, 401);
    }

    // Look up the caller's role from user_accounts
    const { data: callerAccount } = await supabaseAdmin
      .from("user_accounts")
      .select("account_type, is_active")
      .eq("id", caller.user.id)
      .maybeSingle();

    if (!callerAccount || !callerAccount.is_active) {
      return jsonResponse({ success: false, error: "Account is not active." }, 403);
    }

    const role = String(callerAccount.account_type || "").toLowerCase();
    if (role !== "admin" && role !== "superadmin") {
      return jsonResponse({ success: false, error: "Insufficient permissions." }, 403);
    }

    // ── Parse request body ─────────────────────────────────────
    const { account_id } = await request.json();

    if (!account_id || typeof account_id !== "string") {
      return jsonResponse({ success: false, error: "Missing account_id." }, 400);
    }

    // ── Look up the target account ─────────────────────────────
    const { data: targetAccount } = await supabaseAdmin
      .from("user_accounts")
      .select("id, email, first_name, last_name, account_type")
      .eq("id", account_id)
      .maybeSingle();

    if (!targetAccount) {
      return jsonResponse({ success: false, error: "Account not found." }, 404);
    }

    // Prevent self-deletion
    if (targetAccount.id === caller.user.id) {
      return jsonResponse({ success: false, error: "You cannot delete your own account." }, 400);
    }

    // Prevent deleting other admins (only superadmin can)
    const targetRole = String(targetAccount.account_type || "").toLowerCase();
    if ((targetRole === "admin" || targetRole === "superadmin") && role !== "superadmin") {
      return jsonResponse(
        { success: false, error: "Only superadmin can delete admin accounts." },
        403,
      );
    }

    // ── Find the auth_user_id ──────────────────────────────────
    // Strategy 1: Look up via employees table (employee_id → employees.id → employees.auth_id)
    let authUserId: string | null = null;

    const { data: employeeRecord } = await supabaseAdmin
      .from("employees")
      .select("auth_id")
      .eq("id", account_id)
      .maybeSingle();

    if (employeeRecord?.auth_id) {
      authUserId = employeeRecord.auth_id;
    }

    // Strategy 2: If no employee row, find auth user by email via listUsers
    if (!authUserId && targetAccount.email) {
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers(100);
      const matchedUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === targetAccount.email.toLowerCase(),
      );
      if (matchedUser) {
        authUserId = matchedUser.id;
      }
    }

    // Strategy 3: Check if user_accounts.id IS the auth user id (direct signUp flow)
    if (!authUserId) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(account_id);
        if (authUser?.user) {
          authUserId = authUser.user.id;
        }
      } catch {
        // Not found by this strategy, continue
      }
    }

    // ── Delete the auth user ───────────────────────────────────
    if (authUserId) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (deleteAuthError) {
        return jsonResponse(
          { success: false, error: `Failed to delete auth user: ${deleteAuthError.message}` },
          500,
        );
      }
    }

    // ── Delete employee row if it exists ───────────────────────
    await supabaseAdmin
      .from("employees")
      .delete()
      .eq("id", account_id);

    await supabaseAdmin
      .from("employees")
      .delete()
      .eq("auth_id", account_id);

    // ── Delete invites ─────────────────────────────────────────
    await supabaseAdmin
      .from("user_auth_invites")
      .delete()
      .eq("employee_id", account_id);

    await supabaseAdmin
      .from("user_auth_invites")
      .delete()
      .eq("user_id", account_id);

    if (targetAccount.email) {
      await supabaseAdmin
        .from("user_auth_invites")
        .delete()
        .ilike("email", targetAccount.email);
    }

    // ── Delete the user_accounts row ───────────────────────────
    const { error: deleteAccountError } = await supabaseAdmin
      .from("user_accounts")
      .delete()
      .eq("id", account_id);

    if (deleteAccountError) {
      return jsonResponse(
        { success: false, error: `Failed to delete account record: ${deleteAccountError.message}` },
        500,
      );
    }

    return jsonResponse({
      success: true,
      message: `Account for ${targetAccount.first_name || ""} ${targetAccount.last_name || ""} has been permanently deleted.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
