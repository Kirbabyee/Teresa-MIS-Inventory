import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
const arkLogo = "/folder/teresalogo-removebg-preview.png";
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-100 p-4 sm:p-6 lg:p-8">
      {/* ── Ambient background accents ──────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* Large top-left glow */}
        <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-[#411111]/[0.07] blur-3xl" />
        {/* Mid-right accent */}
        <div className="absolute top-1/3 -right-20 w-[360px] h-[360px] rounded-full bg-[#411111]/[0.05] blur-3xl" />
        {/* Bottom-left soft wash */}
        <div className="absolute -bottom-28 -left-16 w-[300px] h-[300px] rounded-full bg-[#411111]/[0.04] blur-3xl" />
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#411111 1px, transparent 1px), linear-gradient(90deg, #411111 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* ── Decorative geometric shapes ─────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* Floating ring — top right */}
        <div className="absolute top-16 right-[12%] w-28 h-28 rounded-full border border-[#411111]/[0.08] rotate-12" />
        {/* Floating diamond — bottom right */}
        <div className="absolute bottom-24 right-[18%] w-16 h-16 rounded-lg border border-[#411111]/[0.08] rotate-45" />
        {/* Accent bar — left */}
        <div className="absolute top-[30%] left-8 w-1.5 h-20 rounded-full bg-[#411111]/[0.12]" />
        <div className="absolute top-[30%] left-14 w-1 h-12 rounded-full bg-[#411111]/[0.08]" />
      </div>

      {/* ── Login card ──────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-md">
        {/* Top branding strip */}
        <div className="flex flex-col items-center justify-center gap-2 mb-6">
          <img
            src={arkLogo}
            alt="St Teresa"
            className="h-20 w-20 object-contain drop-shadow-lg"
          />
          <div className="text-center">
            <p className="text-base font-bold tracking-tight text-slate-900">
              Colegio de Sta. Teresa de Avila
            </p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
              Management Information System
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur-sm">
          {/* Card header */}
          <div className="px-8 pt-8 pb-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Sign In
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Use your authorized credentials to access the portal.
            </p>
          </div>

          {/* Card body */}
          <div className="px-8 pb-8 pt-4">
            {error ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Email address
                </label>
                <Input
                  type="email"
                  placeholder="name@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-[#411111]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
                <div className="flex justify-center pt-0.5">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-[#411111] transition hover:text-[#2a0b0b]"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={submitting}
                className="mt-1 w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </div>

          {/* Card footer */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-4 rounded-b-2xl">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Secured by CSTA &mdash; MIS Portal</span>
            </div>
          </div>
        </div>

        {/* Bottom caption */}
        <p className="mt-6 text-center text-[11px] text-slate-400">
          &copy; {new Date().getFullYear()} Colegio de Sta. Teresa de Avila. All rights reserved.
        </p>
      </div>
    </div>
  );
}
