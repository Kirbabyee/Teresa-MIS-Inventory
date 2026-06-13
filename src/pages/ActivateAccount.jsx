import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, Eye, EyeOff, ShieldCheck, XCircle, UserPlus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hashInviteToken } from "@/lib/employeeInvites";
import { validatePasswordStrength } from "@/lib/security/sanitize";
const arkLogo = "/folder/teresalogo-removebg-preview.png";
import { useAuth } from "@/lib/AuthContext";

export default function ActivateAccount() {
  const navigate = useNavigate();
  const { showGlobalLoader, hideGlobalLoader } = useAuth();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState(null);
  const [inviteTarget, setInviteTarget] = useState("employee");
  const [tokenHash, setTokenHash] = useState("");
  const [error, setError] = useState("");
  const [activationNotice, setActivationNotice] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const token = useMemo(() => params.get("token") || "", [params]);
  const activationFunctionUrl =
    import.meta.env.VITE_ACTIVATE_USER_ACCOUNT_FN_URL || "";
  const passwordChecks = useMemo(() => validatePasswordStrength(form.password), [form.password]);
  const passwordScore = useMemo(() => passwordChecks.score, [passwordChecks]);
  const isPasswordValid = useMemo(() => passwordChecks.isStrong, [passwordChecks]);
  const isMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const canSubmit = Boolean(invite) && isPasswordValid && isMatch && !submitting;

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      navigate("/login", { replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  useEffect(() => {
    const validateInvite = async () => {
      if (!token) {
        setError("Invalid activation link.");
        setLoading(false);
        return;
      }

      try {
        const hashedToken = await hashInviteToken(token);
        setTokenHash(hashedToken);

        const { data: inviteRecords, error: inviteError } = await supabase
          .from("user_auth_invites")
          .select("*")
          .eq("invite_token_hash", hashedToken)
          .maybeSingle();

        if (inviteError) throw inviteError;
        const inviteRecord = inviteRecords;

        if (!inviteRecord) {
          throw new Error("This activation link is invalid or has already been used.");
        }
        if (inviteRecord.used_at) {
          throw new Error("This activation link was already used.");
        }

        let target = "employee";
        if (inviteRecord.employee_id) {
          const { data: employeeRecord } = await supabase
            .from("employees")
            .select("id")
            .eq("id", inviteRecord.employee_id)
            .maybeSingle();

          if (!employeeRecord) {
            const { data: accountRecord } = await supabase
              .from("user_accounts")
              .select("id")
              .eq("id", inviteRecord.employee_id)
              .maybeSingle();

            if (!accountRecord) {
              throw new Error("This activation link is not linked to a valid account.");
            }
            target = "user_account";
          }
        }

        setInviteTarget(target);

        const expiresAt = new Date(inviteRecord.expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
          throw new Error("This activation link has expired.");
        }

        setInvite(inviteRecord);
      } catch (validationError) {
        setError(validationError.message || "Failed to validate activation link.");
      } finally {
        setLoading(false);
      }
    };

    validateInvite();
  }, [token]);

  const activateViaEdgeFunction = async () => {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
    const response = await fetch(activationFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ token, password: form.password }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* ignore */ }

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to activate account.");
    }
    if (!payload?.success) {
      throw new Error(payload?.error || "Failed to activate account.");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!invite) return;
    if (!isPasswordValid) { setError("Please meet all password requirements."); return; }
    if (!isMatch) { setError("Password and confirm password do not match."); return; }

    setSubmitting(true);
    setError("");
    setActivationNotice("");
    showGlobalLoader("Activating account...");

    try {
      if (activationFunctionUrl) {
        await activateViaEdgeFunction();
        setSuccess(true);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password: form.password,
        options: { data: { employee_id: invite.employee_id } },
      });

      if (authError) throw authError;

      const requiresEmailConfirmation =
        !authData?.session &&
        Boolean(authData?.user) &&
        !authData?.user?.email_confirmed_at;

      if (requiresEmailConfirmation) {
        setActivationNotice(
          "Activation complete. Please confirm your email in Supabase before your first sign in.",
        );
      }

      const authUserId = authData?.user?.id;
      if (!authUserId) {
        throw new Error("Failed to finalize activation: missing auth user id.");
      }

      if (inviteTarget === "employee") {
        const { error: employeeUpdateError } = await supabase
          .from("employees")
          .update({ auth_id: authUserId })
          .eq("id", invite.employee_id);
        if (employeeUpdateError) throw employeeUpdateError;
      }

      const { error: updateError } = await supabase
        .from("user_auth_invites")
        .update({ used_at: new Date().toISOString() })
        .eq("invite_token_hash", tokenHash);

      if (updateError) throw updateError;
      setSuccess(true);
    } catch (submitError) {
      setError(submitError.message || "Failed to activate account.");
    } finally {
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
          RIGHT PANEL — Workspace (60%)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-[#411111] to-[#2d0b0b] relative overflow-hidden">
        {/* Subtle warm accents */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full bg-white/[0.03] blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-[320px] h-[320px] rounded-full bg-white/[0.02] blur-3xl" />
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
          <div className="absolute top-16 right-[12%] w-28 h-28 rounded-full border border-white/[0.06] rotate-12" />
          <div className="absolute bottom-24 right-[18%] w-16 h-16 rounded-lg border border-white/[0.06] rotate-45" />
          <div className="absolute top-[30%] left-8 w-1.5 h-20 rounded-full bg-white/[0.08]" />
          <div className="absolute top-[30%] left-14 w-1 h-12 rounded-full bg-white/[0.05]" />
          <div className="absolute bottom-[20%] left-[8%] w-20 h-20 rounded-full border border-white/[0.04] -rotate-12" />
          <div className="absolute top-[15%] left-[20%] w-2 h-2 rounded-full bg-white/[0.06]" />
          <div className="absolute top-[18%] left-[22%] w-1.5 h-1.5 rounded-full bg-white/[0.04]" />
          <div className="absolute top-[14%] left-[23%] w-1 h-1 rounded-full bg-white/[0.05]" />
        </div>

        {/* ── Auth card ─────────────────────────────────────────────── */}
        <div className="relative z-10 w-full max-w-md px-4 sm:px-6">
          {/* Mobile-only branding */}
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

          {/* Card */}
          <div className="rounded-lg border border-white/10 bg-white shadow-2xl shadow-black/30 backdrop-blur-sm mt-4">
          {/* Card header */}
          <div className="px-8 pt-8 pb-2 text-center">
            {/* Step icon */}
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#411111]/10">
              <UserPlus className="h-6 w-6 text-[#411111]" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Activate Account
            </h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Set your password to complete your account setup.
            </p>
          </div>

          {/* Card body */}
          <div className="px-8 pb-8 pt-4">
            {/* ── Loading state ──────────────────────────────────── */}
            {loading ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#411111]" />
                <p className="text-sm text-slate-400">Verifying your invitation...</p>
              </div>
            ) : success ? (
              /* ── Success state ─────────────────────────────────── */
              <div className="space-y-4 py-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  <span>Your account has been activated successfully. You can now sign in.</span>
                </div>
                {activationNotice ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                    {activationNotice}
                  </div>
                ) : null}
                <Link to="/login" className="block">
                  <Button className="w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98]">
                    Go to Login
                  </Button>
                </Link>
              </div>
            ) : (
              /* ── Form state ────────────────────────────────────── */
              <form onSubmit={submit} className="space-y-5">
                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                ) : null}

                {/* Email (read-only) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Email address
                  </label>
                  <Input
                    value={invite?.email || ""}
                    disabled
                    className="h-11 rounded-lg border-slate-200 bg-slate-100 px-4 text-[15px] text-slate-500"
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
                      placeholder="Create a strong password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                      className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-[#411111]"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>

                  {/* Password strength checklist */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Password requirements
                    </p>
                    {[
                      { key: "minLength", label: "At least 8 characters" },
                      { key: "hasLowercase", label: "Lowercase letter (a-z)" },
                      { key: "hasUppercase", label: "Uppercase letter (A-Z)" },
                      { key: "hasNumber", label: "Number (0-9)" },
                      { key: "hasSymbol", label: "Symbol (!@#$...)" },
                    ].map((rule) => (
                      <div
                        key={rule.key}
                        className={`flex items-center gap-2 text-xs transition-colors ${
                          passwordChecks[rule.key] ? "text-emerald-700" : "text-slate-400"
                        }`}
                      >
                        {passwordChecks[rule.key] ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                      className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-[#411111]"
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>

                  {form.confirmPassword.length > 0 ? (
                    <p className={`flex items-center gap-2 text-xs transition-colors ${isMatch ? "text-emerald-700" : "text-red-600"}`}>
                      {isMatch ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      {isMatch ? "Passwords match" : "Passwords do not match"}
                    </p>
                  ) : null}
                </div>

                {/* Security notice */}
                <div className="rounded-xl border border-[#411111]/10 bg-[#411111]/[0.03] p-3.5 flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-[#411111]/60" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Use a strong, unique password that you don't reuse on other accounts. Your password is encrypted and securely stored.
                  </p>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Activating...
                    </span>
                  ) : (
                    "Activate Account"
                  )}
                </Button>
              </form>
            )}
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
