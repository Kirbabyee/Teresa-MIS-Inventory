import React, { createContext, useState, useContext, useEffect } from "react";
import { supabase } from "@/api/backendClient";

const AuthContext = createContext(null);

const isSuperadminIdentity = (identity) => {
  const role = String(
    identity?.role ||
      identity?.user_metadata?.role ||
      identity?.app_metadata?.role ||
      "",
  ).toLowerCase();

  return role === "superadmin";
};

const fetchSuperadminAccountProfile = async (sessionUser) => {
  if (!sessionUser) return null;

  const normalizedEmail = String(sessionUser.email || "").trim().toLowerCase();
  const probes = [];

  if (normalizedEmail) {
    probes.push(
      supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("account_type", "superadmin")
        .ilike("account_code", normalizedEmail)
        .maybeSingle(),
    );
  }

  probes.push(
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name")
      .eq("account_type", "superadmin")
      .eq("id", sessionUser.id)
      .maybeSingle(),
  );

  for (const probePromise of probes) {
    const probe = await probePromise;
    if (!probe.error && probe.data) {
      return probe.data;
    }
  }

  return null;
};

const buildSuperadminAuthUser = (identity, projectSite = null, accountProfile = null) => {
  const displayName = String(
    accountProfile?.account_name ||
      identity?.user_metadata?.name ||
      identity?.user_metadata?.full_name ||
      identity?.email ||
      "Ark",
  ).trim();

  return {
    id: identity?.id || "superadmin-local",
    auth_user_id: identity?.id || "superadmin-local",
    email: identity?.email || "",
    account_name: accountProfile?.account_name || null,
    account_code: accountProfile?.account_code || null,
    first_name: identity?.user_metadata?.first_name || displayName.split(" ")[0] || "Ark",
    last_name:
      identity?.user_metadata?.last_name || displayName.split(" ").slice(1).join(" ") || "Superadmin",
    role: "superadmin",
    project_site_id: projectSite?.id || null,
    project_site_name: projectSite?.name || null,
    position_id: null,
    position_title: "Superadmin",
    page_access: [],
  };
};

const isSuperadminSessionUser = async (sessionUser) => {
  if (!sessionUser) return false;
  if (isSuperadminIdentity(sessionUser)) return true;
  return Boolean(await fetchSuperadminAccountProfile(sessionUser));
};

const mapSupabaseAuthError = (authError) => {
  const message = String(authError?.message || "");
  const lowered = message.toLowerCase();

  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox or use the activation link again.";
  }

  if (lowered.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (lowered.includes("too many requests")) {
    return "Too many login attempts. Please wait and try again.";
  }

  return message || "Failed to log in.";
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAppState();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const buildEmployeeAuthUser = (sessionUser, employeeRow) => {
    return {
      id: employeeRow?.id || sessionUser.id,
      auth_user_id: sessionUser.id,
      email: sessionUser.email,
      first_name: employeeRow?.first_name || "",
      last_name: employeeRow?.last_name || "",
      role: "employee",
      project_site_id: employeeRow?.project_site_id || null,
      project_site_name: employeeRow?.project_site_name || null,
      employee_status: employeeRow?.status || null,
      position_id: employeeRow?.position_id || null,
      position_title: employeeRow?.position_title || null,
      page_access: employeeRow?.page_access || [],
    };
  };

  const fetchEmployeeByAuthId = async (authUserId) => {
    let employeeRow = null;

    const withActive = await supabase
      .from("employees")
      .select("id, first_name, last_name, email, status, project_site_id, is_account_active, position_id, position_ids")
      .eq("auth_id", authUserId)
      .maybeSingle();

    if (!withActive.error) {
      employeeRow = withActive.data;
    } else {
      const missingIsAccountActive =
        withActive.error.code === "42703" &&
        String(withActive.error.message || "").includes("is_account_active");

      if (!missingIsAccountActive) {
        throw withActive.error;
      }

      const withoutActive = await supabase
        .from("employees")
        .select("id, first_name, last_name, email, status, project_site_id, position_id, position_ids")
        .eq("auth_id", authUserId)
        .maybeSingle();

      if (withoutActive.error) throw withoutActive.error;
      employeeRow = withoutActive.data
        ? { ...withoutActive.data, is_account_active: true }
        : null;
    }

    if (!employeeRow) return null;

    let projectSiteName = null;
    if (employeeRow.project_site_id) {
      const { data: siteRow, error: siteError } = await supabase
        .from("project_sites")
        .select("name")
        .eq("id", employeeRow.project_site_id)
        .maybeSingle();

      if (!siteError) {
        projectSiteName = siteRow?.name || null;
      }
    }

    // Fetch and combine page access from all positions (multi-role support)
    let combinedPageAccess = [];
    let positionTitle = null;

    // Get position IDs to fetch
    const positionIdsToFetch = Array.isArray(employeeRow.position_ids)
      ? employeeRow.position_ids.filter(Boolean)
      : [];

    // Add primary position if not in multi-role array
    if (employeeRow.position_id && !positionIdsToFetch.includes(employeeRow.position_id)) {
      positionIdsToFetch.push(employeeRow.position_id);
    }

    if (positionIdsToFetch.length > 0) {
      const { data: posRows, error: posError } = await supabase
        .from("positions")
        .select("id, title, page_access")
        .in("id", positionIdsToFetch);

      if (!posError && posRows && posRows.length > 0) {
        // Use the first position's title for display
        positionTitle = posRows[0].title;

        // Combine page access from all positions (union)
        const accessSet = new Set();
        posRows.forEach((pos) => {
          if (Array.isArray(pos.page_access)) {
            pos.page_access.forEach((page) => accessSet.add(page));
          }
        });
        combinedPageAccess = Array.from(accessSet);
      }
    }

    return {
      ...employeeRow,
      project_site_name: projectSiteName,
      position_title: positionTitle,
      page_access: combinedPageAccess,
    };
  };

  const checkAppState = async () => {
    setIsLoadingPublicSettings(false);
    setAuthError(null);
    setAppPublicSettings({ id: "local-app", public_settings: {} });
    setIsLoadingAuth(true);

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const sessionUser = sessionResult?.session?.user;

      if (!sessionUser) {
        setUser(null);
        setIsAuthenticated(false);
      } else if (await isSuperadminSessionUser(sessionUser)) {
        const superadminProfile = await fetchSuperadminAccountProfile(sessionUser);
        setUser(buildSuperadminAuthUser(sessionUser, null, superadminProfile));
        setIsAuthenticated(true);
      } else {
        const employeeRow = await fetchEmployeeByAuthId(sessionUser.id);

        if (!employeeRow) {
          await supabase.auth.signOut();
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: "user_not_registered" });
          return;
        }

        if (employeeRow.is_account_active === false) {
          await supabase.auth.signOut();
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: "account_deactivated" });
          return;
        }

        setUser(buildEmployeeAuthUser(sessionUser, employeeRow));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Failed to restore auth session:", error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = async ({ email, password, projectSite }) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!projectSite?.id) {
      return { success: false, message: "Please select a project site." };
    }

    try {
      const { data: authResult, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (authError) {
        return {
          success: false,
          message: mapSupabaseAuthError(authError),
        };
      }

      const sessionUser = authResult?.user;
      if (!sessionUser) {
        return {
          success: false,
          message: "Login failed. Please try again.",
        };
      }

      if (await isSuperadminSessionUser(sessionUser)) {
        const superadminProfile = await fetchSuperadminAccountProfile(sessionUser);
        setUser(buildSuperadminAuthUser(sessionUser, projectSite, superadminProfile));
        setIsAuthenticated(true);
        setAuthError(null);

        return { success: true };
      }

      const employeeRow = await fetchEmployeeByAuthId(sessionUser.id);

      if (!employeeRow) {
        await supabase.auth.signOut();
        return {
          success: false,
          message: "No employee record is linked to this account.",
        };
      }

      if (employeeRow.is_account_active === false) {
        await supabase.auth.signOut();
        return {
          success: false,
          message: "This account is deactivated. Please contact HR admin.",
        };
      }

      setUser({
        ...buildEmployeeAuthUser(sessionUser, employeeRow),
        project_site_id: projectSite.id,
        project_site_name: projectSite.name,
      });
      setIsAuthenticated(true);
      setAuthError(null);

      return { success: true };
    } catch (error) {
      console.error("Login failed:", error);
      return {
        success: false,
        message: error.message || "Failed to log in.",
      };
    }
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    await supabase.auth.signOut();
  };

  const navigateToLogin = () => {
    setAuthError({ type: "auth_required" });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        login,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
