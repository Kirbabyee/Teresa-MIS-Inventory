import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, Mail, Lock, KeyRound } from "lucide-react";
import { CheckCircle2, Circle } from "lucide-react";
const arkLogo = "/folder/teresalogo-removebg-preview.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/api/supabaseClient";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [rateLimitCount, setRateLimitCount] = useState(0);
  const COOLDOWN_STORAGE_KEY = "forgot_pwd_cooldown_until";

  const normalizedEmail = email.trim().toLowerCase();
  const otp = otpDigits.join("");

  // ── Cooldown timer ──────────────────────────────────────────────
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          try { localStorage.removeItem(COOLDOWN_STORAGE_KEY); } catch (e) {}
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  // ── Restore cooldown from storage ──────────────────────────────
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(COOLDOWN_STORAGE_KEY) || 0);
      if (until && until > Date.now()) {
        setCooldownSeconds(Math.ceil((until - Date.now()) / 1000));
      }
    } catch (e) {}
  }, []);

  // ── Helpers ────────────────────────────────────────────────────
  const maskEmail = (value) => {
    const v = String(value || "").trim().toLowerCase();
    const at = v.indexOf("@");
    if (at <= 0) return "****";
    return `****${v.slice(at)}`;
  };

  const formatCooldown = (value) => {
    const t = Number(value || 0);
    const m = Math.floor(t / 60).toString().padStart(2, "0");
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const extractRateLimitCooldown = (source) => {
    const text = String(source || "").toLowerCase();
    const match = text.match(/(\d+)\s*(second|minute|sec|min)/i);
    if (!match) return 180;
    const amount = Number(match[1] || 0);
    if (!amount) return 180;
    const unit = String(match[2] || "second").toLowerCase();
    return unit.startsWith("min") ? Math.max(1, amount) * 60 : Math.max(1, amount);
  };

  // ── OTP handlers ───────────────────────────────────────────────
  const updateOtpDigit = (index, rawValue) => {
    const value = String(rawValue || "").replace(/\D/g, "").slice(-1);
    setOtpDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    if (value && index < 7) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (event, index) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    if (pasted.length === 0) return;
    e.preventDefault();
    setOtpDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 8; i++) {
        next[i] = pasted[i] || "";
      }
      return next;
    });
    // Focus the last filled or the first empty
    const focusIdx = Math.min(pasted.length, 7);
    document.getElementById(`otp-${focusIdx}`)?.focus();
  };

  // ── Step: Send OTP ─────────────────────────────────────────────
  const sendOtp = async () => {
    setError("");
    setMessage("");
    if (!normalizedEmail) { setError("Email is required."); return; }

    setSubmitting(true);
    try {
      const { data: existingAccount, error: lookupErr } = await supabase
        .from("user_accounts").select("id").ilike("email", normalizedEmail).limit(1).maybeSingle();

      if (lookupErr) { setError(lookupErr.message || "Failed to validate email."); return; }
      if (!existingAccount?.id) { setError("There is no record with that email."); return; }

      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      });

      if (otpErr) {
        const msg = String(otpErr.message || "");
        if (msg.toLowerCase().includes("rate limit")) {
          const waitSeconds = extractRateLimitCooldown(msg);
          const backoff = Math.min(3600, Math.pow(2, rateLimitCount) * 60);
          const total = Math.max(waitSeconds, backoff);
          setStep("otp");
          setCooldownSeconds(total);
          setRateLimitCount((c) => c + 1);
          try { localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now() + total * 1000)); } catch (e) {}
          return;
        }
        setError(otpErr.message || "Failed to send OTP."); return;
      }

      setStep("otp");
      setCooldownSeconds(180);
      setRateLimitCount(0);
      setOtpDigits(["", "", "", "", "", "", "", ""]);
      setMessage(`We've sent an 8-digit code to ${normalizedEmail}.`);
      try { localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now() + 180 * 1000)); } catch (e) {}
    } catch (err) {
      setError(err?.message || "Failed to send OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step: Resend OTP ───────────────────────────────────────────
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0) return;
    await sendOtp();
  };

  // ── Step: Verify OTP ───────────────────────────────────────────
  const verifyOtp = async () => {
    setError("");
    setMessage("");
    const normalizedOtp = String(otp || "").trim();
    if (normalizedOtp.length !== 8) { setError("Please enter the 8-digit OTP."); return; }

    setSubmitting(true);
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: normalizedEmail, token: normalizedOtp, type: "email",
      });
      if (verifyErr) { setError(verifyErr.message || "Invalid OTP."); return; }
      if (!data?.session && !data?.user) { setError("OTP verified but no active session was created."); return; }
      setStep("password");
      setMessage("OTP verified. You can now set your new password.");
    } catch (err) {
      setError(err?.message || "Failed to verify OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step: Reset Password ───────────────────────────────────────
  const resetPassword = async () => {
    setError("");
    setMessage("");
    if (!newPassword.trim()) { setError("New password is required."); return; }
    if (!isPasswordValid) { setError("Please meet all password requirements."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) { setError(updateErr.message || "Failed to reset password."); return; }
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err?.message || "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Password validation ────────────────────────────────────────
  const evaluatePassword = (password) => {
    const v = String(password || "");
    return {
      minLength: v.length >= 8,
      hasLowercase: /[a-z]/.test(v),
      hasUppercase: /[A-Z]/.test(v),
      hasNumber: /\d/.test(v),
      hasSymbol: /[^A-Za-z0-9]/.test(v),
    };
  };

  const passwordChecks = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const passwordScore = useMemo(() => Object.values(passwordChecks).filter(Boolean).length, [passwordChecks]);
  const isPasswordValid = useMemo(() => passwordScore === 5, [passwordScore]);

  // ── Step config ────────────────────────────────────────────────
  const stepConfig = {
    email: {
      icon: Mail,
      title: "Forgot Password",
      subtitle: "Enter your email address and we'll send you an OTP to verify your identity.",
    },
    otp: {
      icon: KeyRound,
      title: "Verify OTP",
      subtitle: `Enter the 8-digit code sent to ${normalizedEmail ? maskEmail(normalizedEmail) : "your email"}.`,
    },
    password: {
      icon: Lock,
      title: "Reset Password",
      subtitle: "Create a strong new password for your account.",
    },
  };

  const currentStep = stepConfig[step];
  const StepIcon = currentStep.icon;

  // ── Render ─────────────────────────────────────────────────────
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
          <div className="rounded-lg border border-white/10 bg-white shadow-2xl shadow-black/30 backdrop-blur-sm">
          {/* Card header */}
          <div className="px-8 pt-8 pb-2 text-center">
            {/* Step indicator dots */}
            <div className="flex items-center justify-center gap-2 mb-5">
              {["email", "otp", "password"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      step === s
                        ? "w-6 bg-[#411111]"
                        : ["email", "otp", "password"].indexOf(step) > i
                        ? "w-2 bg-[#411111]/40"
                        : "w-2 bg-slate-200"
                    }`}
                  />
                  {i < 2 && <div className="w-4 h-px bg-slate-200" />}
                </div>
              ))}
            </div>

            {/* Step icon */}
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#411111]/10">
              <StepIcon className="h-6 w-6 text-[#411111]" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {currentStep.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              {currentStep.subtitle}
            </p>
          </div>

          {/* Card body */}
          <div className="px-8 pb-8 pt-4">
            {/* Error / success messages */}
            {error ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {/* ── STEP: Email ──────────────────────────────────────── */}
            {step === "email" && (
              <form
                className="space-y-5"
                onSubmit={(e) => { e.preventDefault(); sendOtp(); }}
              >
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
                    className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98]"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Sending...
                    </span>
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </form>
            )}

            {/* ── STEP: OTP ────────────────────────────────────────── */}
            {step === "otp" && (
              <form
                className="space-y-5"
                onSubmit={(e) => { e.preventDefault(); verifyOtp(); }}
              >
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">
                    Enter 8-digit OTP
                  </label>
                  <div className="grid grid-cols-8 gap-2" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, index) => (
                      <input
                        key={`otp-${index}`}
                        id={`otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        value={digit}
                        maxLength={1}
                        onChange={(e) => updateOtpDigit(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-lg font-semibold text-slate-900 transition-all focus:border-[#411111]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#411111]/30"
                      />
                    ))}
                  </div>
                </div>

                {/* Resend */}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-slate-400">
                    Didn't receive it?
                  </p>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-sm font-medium text-[#411111] transition hover:text-[#2a0b0b] disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={submitting || cooldownSeconds > 0}
                  >
                    {cooldownSeconds > 0
                      ? `Resend in ${formatCooldown(cooldownSeconds)}`
                      : "Resend OTP"}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98]"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Verifying...
                    </span>
                  ) : (
                    "Verify OTP"
                  )}
                </Button>
              </form>
            )}

            {/* ── STEP: New Password ───────────────────────────────── */}
            {step === "password" && (
              <form
                className="space-y-5"
                onSubmit={(e) => { e.preventDefault(); resetPassword(); }}
              >
                {/* New password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
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

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-[#411111]/40 focus-visible:border-[#411111]/40"
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
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-[46px] rounded-xl bg-[#411111] text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-[#411111]/20 transition-all hover:bg-[#2e0b0b] hover:shadow-xl hover:shadow-[#411111]/25 active:scale-[0.98]"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Updating...
                    </span>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Card footer */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-4 rounded-b-2xl">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#411111]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
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
