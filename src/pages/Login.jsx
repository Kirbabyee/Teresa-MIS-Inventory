import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import arkLogo from "@/assets/imgs/ark-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";

const fetchAccountForUser = async (user) => {
  const normalizedUserId = String(user?.id || "").trim();
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();

  if (normalizedUserId) {
    const byId = await supabase
      .from("user_accounts")
      .select("account_type, is_active")
      .eq("id", normalizedUserId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      return byId.data;
    }
  }

  if (normalizedEmail) {
    const byEmail = await supabase
      .from("user_accounts")
      .select("account_type, is_active")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return byEmail.data;
    }
  }

  return null;
};

export default function Login() {
  const navigate = useNavigate();
  const { showGlobalLoader, hideGlobalLoader } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    const normalizedPassword = password.trim();

    if (!normalizedPassword) {
      setError("Password is required.");
      return;
    }

    setSubmitting(true);
    showGlobalLoader("Verifying Credentials...");

    const timeoutId = window.setTimeout(() => {
      showGlobalLoader("Check your internet connection...");
    }, 5000);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (signInError) {
        setError(signInError.message || "Invalid email or password.");
        return;
      }

      const session = data?.session || null;
      const user = data?.user || session?.user || null;

      if (!session || !user) {
        setError("Login succeeded but no session was returned.");
        return;
      }

      if (typeof window !== "undefined") {
        const now = Date.now();
        const accountRow = await fetchAccountForUser(user);
        if (accountRow?.is_active === false) {
          await supabase.auth.signOut();
          setError("This account has been deactivated. Contact an administrator to restore access.");
          return;
        }

        const accountType = accountRow?.account_type || null;
        const role = accountType || user.user_metadata?.role || user.app_metadata?.role || "employee";
        const displayName = user.user_metadata?.name || user.user_metadata?.full_name || user.email || "User";
        const expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : now + 8 * 60 * 60 * 1000;

        window.localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            email: user.email || normalizedEmail,
            role,
            account_type: accountType || null,
            displayName,
            loggedInAt: now,
            expiresAt,
            supabaseUserId: user.id,
          }),
        );
        window.dispatchEvent(new Event(SESSION_EVENT));
      }

      navigate("/", { replace: true });
    } catch (authError) {
      setError(authError?.message || "Unable to sign in.");
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
      hideGlobalLoader();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 grid lg:grid-cols-2">
      <div className="hidden lg:flex relative overflow-hidden bg-[#170000] p-10">
        <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-10 w-64 h-64 rounded-full bg-black/10" />

        <div className="relative z-10 flex flex-col justify-between h-full text-white">
          <div className="flex items-center gap-3">
            <img
              src={arkLogo}
              alt="St Teresa"
              className="w-12 bg-white rounded p-1 object-contain"
            />
            <div>
              <p className="text-2xl font-bold leading-tight">Colegio de Sta. Teresa de Avila</p>
              <p className="text-white/80 text-sm">Management System</p>
            </div>
          </div>

          <div className="space-y-3 max-w-md">
            <p className="text-4xl font-black leading-tight tracking-tight">
              Welcome Back,
            </p>
            <p className="text-white/85 text-base">
              Log in to continue into St Teresa.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 lg:hidden">
            <img
              src={arkLogo}
              alt="St Teresa"
              className="w-10 h-10 bg-[#450c0c] rounded p-1 object-contain"
            />
            <div>
              <p className="text-lg font-bold text-slate-900 leading-tight">
                St Teresa
              </p>
              <p className="text-xs text-slate-500">Management System</p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Login</h1>
            <p className="text-sm text-slate-500 mt-1">
              Use your authorized credentials to continue.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-[#450c0c] hover:text-[#170000]"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#450c0c] hover:bg-[#170000]"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
