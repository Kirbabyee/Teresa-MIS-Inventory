import React, { createContext, useState, useContext, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint";

const AuthContext = createContext(null);
const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";

const fetchUserProfileFromAccount = async (sessionUser) => {
  if (!sessionUser) return null;
  
  // Attempt to find the user in user_accounts table
  const { data, error } = await supabase
    .from("user_accounts")
    .select("*")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (!error && data) return data;

  // Fallback to email lookup if ID doesn't match (useful during migrations)
  const { data: byEmail } = await supabase
    .from("user_accounts")
    .select("*")
    .ilike("email", sessionUser.email)
    .maybeSingle();

  return byEmail || null;
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
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState("Loading...");
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // Track whether we've completed the initial session restore.
  // The splash screen (isLoadingAuth === true) should only appear on first
  // page load / reload — not on every auth state change (e.g. tab switch
  // token refreshes).
  const initialLoadDone = useRef(false);

  const showGlobalLoader = (message = "Loading...") => {
    setGlobalLoadingMessage(message);
    setIsGlobalLoading(true);
  };

  const hideGlobalLoader = () => {
    setIsGlobalLoading(false);
    setGlobalLoadingMessage("Loading...");
  };

  useEffect(() => {
    checkAppState(true);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, _session) => {
      // Only show loading spinner on the very first check (page reload).
      // Subsequent auth events (token refresh on tab switch, etc.) should
      // update state silently.
      checkAppState(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const buildAuthUser = (sessionUser, accountRow) => {
    const role = (accountRow?.account_type || sessionUser.user_metadata?.role || "staff").toLowerCase();
    const displayName = accountRow 
      ? `${accountRow.first_name} ${accountRow.last_name}`.trim()
      : (sessionUser.user_metadata?.full_name || sessionUser.email || "User");

    return {
      id: accountRow?.id || sessionUser.id,
      auth_user_id: sessionUser.id,
      email: sessionUser.email,
      first_name: accountRow?.first_name || "",
      last_name: accountRow?.last_name || "",
      role,
      displayName,
      page_access: accountRow?.page_access || [],
    };
  };

  const checkAppState = async (isInitialLoad = false) => {
    setAuthError(null);
    if (isInitialLoad) {
      setIsLoadingAuth(true);
    }

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const sessionUser = sessionResult?.session?.user;

      if (!sessionUser) {
        setUser(null);
        setIsAuthenticated(false);
      } else {
        const accountRow = await fetchUserProfileFromAccount(sessionUser);
        if (accountRow?.is_active === false) {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: "account_inactive", message: "This account has been deactivated. Contact an administrator to restore access." });
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(SESSION_KEY);
            window.dispatchEvent(new Event(SESSION_EVENT));
          }
          await supabase.auth.signOut();
          return;
        }

        // ── Lockout check: is this user's email or device currently locked out? ──
        try {
          const email = sessionUser.email?.toLowerCase().trim();
          const fingerprint = getDeviceFingerprint();
          const now = new Date().toISOString();
          const { data: lockoutRows } = await supabase
            .from("login_attempts_tracker")
            .select("id")
            .gt("suspended_until", now)
            .or(
              `email.eq.${email},` +
              `fingerprint_hash.eq.${fingerprint},` +
              `identifier_hash.eq.${fingerprint}`
            )
            .limit(1);
          if (lockoutRows && lockoutRows.length > 0) {
            setUser(null);
            setIsAuthenticated(false);
            setAuthError({ type: "account_locked", message: "Your account has been locked due to excessive failed login attempts. Please contact an administrator." });
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(SESSION_KEY);
              window.dispatchEvent(new Event(SESSION_EVENT));
            }
            await supabase.auth.signOut();
            return;
          }
        } catch (_e) {
          // If the lockout check fails, don't block the user
        }

        setUser(buildAuthUser(sessionUser, accountRow));
        setIsAuthenticated(true);
        // persist lightweight session for layout and other components
        try {
          if (typeof window !== "undefined") {
            const now = Date.now();
            const expiresAt = sessionResult?.session?.expires_at ? Number(sessionResult.session.expires_at) * 1000 : now + 8 * 60 * 60 * 1000;
            const accountType = accountRow?.account_type || null;
            const role = (accountType || sessionUser.user_metadata?.role || sessionUser.app_metadata?.role || "staff").toLowerCase();
            const displayName = accountRow ? `${accountRow.first_name} ${accountRow.last_name}`.trim() : (sessionUser.user_metadata?.full_name || sessionUser.email || "User");

            window.localStorage.setItem(SESSION_KEY, JSON.stringify({
              email: sessionUser.email || null,
              role,
              account_type: accountType,
              displayName,
              loggedInAt: now,
              expiresAt,
              supabaseUserId: sessionUser.id,
            }));
            window.dispatchEvent(new Event(SESSION_EVENT));
          }
        } catch (e) {
          // ignore localStorage errors
        }
      }
    } catch (error) {
      console.error("Failed to restore auth session:", error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingPublicSettings(false);
      if (isInitialLoad) {
        initialLoadDone.current = true;
        setIsLoadingAuth(false);
      }
    }
  };

  const login = async ({ email, password }) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

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

      const accountRow = await fetchUserProfileFromAccount(sessionUser);
      if (accountRow?.is_active === false) {
        await supabase.auth.signOut();
        return {
          success: false,
          message: "This account has been deactivated. Contact an administrator to restore access.",
        };
      }
      setUser(buildAuthUser(sessionUser, accountRow));
      setIsAuthenticated(true);
      setAuthError(null);

      checkAppState();
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
    showGlobalLoader("Logging you out...");

    try {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event(SESSION_EVENT));
      }
      await supabase.auth.signOut();
    } finally {
      hideGlobalLoader();
    }
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
        isGlobalLoading,
        globalLoadingMessage,
        setIsGlobalLoading,
        setGlobalLoadingMessage,
        showGlobalLoader,
        hideGlobalLoader,
        authError,
        appPublicSettings,
        login,
        logout,
        navigateToLogin,
        hasPageAccess: (pageKey) => {
          if (!user) return false;
          if ((user.role || "").toLowerCase() === "superadmin") return true;
          return Array.isArray(user.page_access) && user.page_access.includes(pageKey);
        },
        isInRole: (roleName) => {
          if (!user || !roleName) return false;
          return String(user.role || "").toLowerCase() === String(roleName || "").toLowerCase();
        },
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
