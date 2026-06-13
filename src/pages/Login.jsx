import React, { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldAlert, ShieldCheck, Lock } from "lucide-react";
const arkLogo = "/folder/teresalogo-removebg-preview.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { cn } from "@/lib/utils";
import { useSecuredCountdown } from "@/lib/security/useSecuredCountdown";

const SESSION_KEY = "app_session";
const SESSION_EVENT = "app_session_change";

// Generic auth error — never reveals whether email exists, is deactivated, etc.
const GENERIC_AUTH_ERROR = "Invalid email or password.";


export default function Login() {
  const navigate = useNavigate();
  const { showGlobalLoader, hideGlobalLoader } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // ── Server-side exponential backoff rate limiter ───────────
  const secured = useSecuredCountdown();
  const isLocked = secured.locked;

  // Restore lockout from server on mount and when email field loses focus
  // (handles page refresh while locked — server is the source of truth)
  // Debounced to avoid spamming the server on every keystroke.
  const restoreTimeoutRef = useRef(null);
  const handleEmailBlur = useCallback(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current);
    restoreTimeoutRef.current = window.setTimeout(() => {
      secured.restoreLockout(trimmed);
    }, 300);
  }, [email, secured.restoreLockout]);

  // On mount: check if this IP is locked out (no email needed).
  // This blocks the page immediately — attacker can't even see the form.
  useEffect(() => {
    (async () => {
      const result = await secured.checkIpLockout();
      if (result.locked && result.retryAfterMs > 0) {
        secured.startCountdown(result.retryAfterMs);
        // We don't have the email yet, so suppress the email-specific
        // lockout message — the IP-level message is shown instead.
      }
    })();
    return () => {
      if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Sanitize email input before any processing
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setSubmitting(true);
    showGlobalLoader("Verifying Credentials...");

    const timeoutId = window.setTimeout(() => {
      showGlobalLoader("Check your internet connection...");
    }, 5000);

    try {
      // ── Delegate to server-side rate limiter Edge Function ──
      const result = await secured.retry(sanitizedEmail, password);

      if (result.success && result.user && result.session?.accessToken) {
        // ── Successful login — restore Supabase session from Edge Function ──
        // The Edge Function authenticated on its own client, so we need to
        // set the session on the local Supabase client for AuthContext to work.
        await supabase.auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken || "",
        });

        // Now the local Supabase client has a valid session.
        // Let AuthContext pick it up by navigating.
        navigate("/", { replace: true });
        return;
      }

      // ── Failed login (locked or auth error) ────────────────
      setError(result.error || GENERIC_AUTH_ERROR);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
      hideGlobalLoader();
    }
  };

  return (
    <div className="relative min-h-screen flex overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════
          LEFT PANEL — Institutional Brand Banner (40%)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[40%] relative flex-col items-center justify-center bg-gradient-to-b from-white to-slate-100 overflow-hidden">
        {/* Subtle warm vignette */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(65,17,17,0.04) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(0,0,0,0.03) 0%, transparent 50%)",
          }}
        />

        {/* Branding content */}
        <div className="relative z-10 flex flex-col items-center gap-5 px-12 text-center">
          <img
            src={arkLogo}
            alt="St Teresa"
            className="h-36 w-36 object-contain drop-shadow-xl"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-[#411111] leading-tight">
              Colegio de Sta. Teresa de Avila
            </h1>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#411111]/40">
              Management Information System
            </p>
          </div>
          <div className="mt-4 w-16 h-px bg-[#411111]/15" />
          <p className="text-xs text-[#411111]/35 max-w-[260px] leading-relaxed">
            Empowering education through technology. Access your institutional portal securely.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          RIGHT PANEL — Login Workspace (60%)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-[#411111] to-[#2d0b0b] relative overflow-hidden">
        {/* Subtle warm accents on the workspace */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full bg-white/[0.03] blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-[320px] h-[320px] rounded-full bg-white/[0.02] blur-3xl" />
          {/* Grid texture */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        {/* Decorative geometric shapes */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* Floating ring — top right */}
          <div className="absolute top-16 right-[12%] w-28 h-28 rounded-full border border-white/[0.06] rotate-12" />
          {/* Floating diamond — bottom right */}
          <div className="absolute bottom-24 right-[18%] w-16 h-16 rounded-lg border border-white/[0.06] rotate-45" />
          {/* Accent bar — left */}
          <div className="absolute top-[30%] left-8 w-1.5 h-20 rounded-full bg-white/[0.08]" />
          <div className="absolute top-[30%] left-14 w-1 h-12 rounded-full bg-white/[0.05]" />
          {/* Floating ring — bottom left */}
          <div className="absolute bottom-[20%] left-[8%] w-20 h-20 rounded-full border border-white/[0.04] -rotate-12" />
          {/* Small dot cluster — top center */}
          <div className="absolute top-[15%] left-[20%] w-2 h-2 rounded-full bg-white/[0.06]" />
          <div className="absolute top-[18%] left-[22%] w-1.5 h-1.5 rounded-full bg-white/[0.04]" />
          <div className="absolute top-[14%] left-[23%] w-1 h-1 rounded-full bg-white/[0.05]" />
        </div>

        {/* ── Login card ──────────────────────────────────────────────── */}
        <div className="relative z-10 w-full max-w-md px-4 sm:px-6">
          {/* Mobile-only branding (shown only when left panel is hidden) */}
          <div className="flex flex-col items-center justify-center gap-2 mb-6 lg:hidden">
            <img
              src={arkLogo}
              alt="St Teresa"
              className="h-20 w-20 object-contain drop-shadow-lg brightness-0 invert"
            />
            <div className="text-center">
              <p className="text-base font-bold tracking-tight text-white">
                Colegio de Sta. Teresa de Avila
              </p>
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/40">
                Management Information System
              </p>
            </div>
          </div>

          <div className="relative rounded-lg border border-white/10 bg-white/95 shadow-2xl shadow-black/30 backdrop-blur-sm overflow-hidden">
            {/* ── Premium brand-lockout overlay ───────────────────────────── */}
            {isLocked && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-lg bg-[#411111]/95 backdrop-blur-md p-8 text-center animate-in fade-in duration-300 overflow-y-auto">

                {/* Shield icon anchor — crimson glass circle */}
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 border border-white/20 shadow-inner">
                  <ShieldAlert className="h-8 w-8 text-red-400" />
                </div>

                {/* Permanent ban — remaining time exceeds ~2 years */}
                {secured.isPermanentlyBanned ? (
                  <>
                    <p className="text-xl font-bold text-white tracking-wide mb-2">
                      Device Permanently Locked
                    </p>
                    <p className="text-sm text-slate-300 max-w-xs leading-relaxed mb-6">
                      This device has been permanently locked due to excessive failed login attempts.
                    </p>
                  </>
                ) : (
                  <>
                    {/* Primary header — authoritative white type */}
                    <p className="text-xl font-bold text-white tracking-wide mb-2">
                      Login Temporarily Suspended
                    </p>

                    {/* Context micro-copy — muted silver-slate */}
                    <p className="text-sm text-slate-300 max-w-xs leading-relaxed mb-6">
                      Too many consecutive failed login attempts detected. To safeguard institutional user credentials, further attempts are blocked for:
                    </p>

                    {/* Tech timer block — terminal-style dark badge */}
                    <span className="bg-black/40 border border-white/10 px-5 py-2.5 rounded-xl font-mono text-xl font-bold tracking-widest text-red-400 shadow-md shadow-black/30 mb-3">
                      {secured.formatted}
                    </span>
                  </>
                )}

                {/* Tier indicator */}
                {secured.tier > 0 && (
                  <p className="text-xs text-red-400/70 font-medium tracking-wide mb-5">
                    Escalation Tier {secured.tier} of 5
                  </p>
                )}

                {/* Persistence footer — low-opacity border-top notice */}
                <p className="text-xs text-slate-400 font-medium tracking-wide border-t border-white/10 pt-4 w-4/5">
                  Please contact the administrator if there seems to be a mistake.
                </p>

              </div>
            )}

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
                    onBlur={handleEmailBlur}
                    autoComplete="email"
                    disabled={isLocked}
                    className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      disabled={isLocked}
                      className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isLocked}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-[#411111] disabled:pointer-events-none"
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
                      className={cn(
                        "text-xs font-medium transition",
                        isLocked
                          ? "pointer-events-none text-slate-300"
                          : "text-[#411111] hover:text-[#2a0b0b]"
                      )}
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={submitting || isLocked}
                  className="mt-1 w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#411111] disabled:active:scale-100"
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
          <p className="mt-6 text-center text-[11px] text-white/30">
            &copy; {new Date().getFullYear()} Colegio de Sta. Teresa de Avila. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
