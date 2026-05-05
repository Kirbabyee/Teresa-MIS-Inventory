import { useEffect, useState } from "react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { CheckCircle2, Circle } from "lucide-react";
import arkLogo from "@/assets/imgs/ark-logo.png";
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

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          try {
            localStorage.removeItem(COOLDOWN_STORAGE_KEY);
          } catch (e) {}
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  // Initialize cooldown from previous session if present
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(COOLDOWN_STORAGE_KEY) || 0);
      if (until && until > Date.now()) {
        const seconds = Math.ceil((until - Date.now()) / 1000);
        setCooldownSeconds(seconds);
      }
    } catch (e) {}
  }, []);

  const maskEmail = (value) => {
    const emailValue = String(value || "").trim().toLowerCase();
    const atIndex = emailValue.indexOf("@");
    if (atIndex <= 0) return "****";
    const domain = emailValue.slice(atIndex);
    return `****${domain}`;
  };

  const formatCooldown = (value) => {
    const total = Number(value || 0);
    const minutes = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(total % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const extractRateLimitCooldown = (source) => {
    const text = String(source || "").toLowerCase();
    const match = text.match(/(\d+)\s*(second|minute|sec|min)/i);
    if (!match) return 180;
    const amount = Number(match[1] || 0);
    if (!amount) return 180;
    const unit = String(match[2] || "second").toLowerCase();
    if (unit.startsWith("min")) {
      return Math.max(1, amount) * 60;
    }
    return Math.max(1, amount);
  };

  const updateOtpDigit = (index, rawValue) => {
    const value = String(rawValue || "").replace(/\D/g, "").slice(-1);
    setOtpDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });

    if (value && index < 7) {
      const nextInput = document.getElementById(`otp-digit-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (event, index) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      const previousInput = document.getElementById(`otp-digit-${index - 1}`);
      previousInput?.focus();
    }
  };

  const sendOtp = async () => {
    setError("");
    setMessage("");

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: existingAccount, error: accountLookupError } = await supabase
        .from("user_accounts")
        .select("id")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (accountLookupError) {
        setError(accountLookupError.message || "Failed to validate email.");
        return;
      }

      if (!existingAccount?.id) {
        setError("There is no record with that email.");
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        const otpErrorText = String(otpError.message || "");
        if (otpErrorText.toLowerCase().includes("rate limit")) {
          const waitSeconds = extractRateLimitCooldown(otpErrorText);
          // exponential backoff to avoid repeated 429s
          const backoff = Math.min(3600, Math.pow(2, rateLimitCount) * 60); // cap at 1 hour
          const total = Math.max(waitSeconds, backoff);
          setStep("otp");
          setCooldownSeconds(total);
          setRateLimitCount((c) => c + 1);
          setError("");
          setMessage("");
          try {
            localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now() + total * 1000));
          } catch (e) {}
          return;
        }
        setError(otpError.message || "Failed to send OTP.");
        return;
      }

      setStep("otp");
      setCooldownSeconds(180);
      setRateLimitCount(0);
      setOtpDigits(["", "", "", "", "", "", "", ""]);
      setMessage(`We've sent an email to ${normalizedEmail}.`);
      try {
        localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now() + 180 * 1000));
      } catch (e) {}
    } catch (requestError) {
      setError(requestError?.message || "Failed to send OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldownSeconds > 0) {
      setError("");
      setMessage("");
      return;
    }
    await sendOtp();
  };

  const verifyOtp = async () => {
    setError("");
    setMessage("");

    const normalizedOtp = String(otp || "").trim();
    if (normalizedOtp.length !== 8) {
      setError("Please enter the 8-digit OTP.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedOtp,
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message || "Invalid OTP.");
        return;
      }

      if (!data?.session && !data?.user) {
        setError("OTP verified but no active session was created.");
        return;
      }

      setStep("password");
      setMessage("OTP verified. You can now set your new password.");
    } catch (verifyException) {
      setError(verifyException?.message || "Failed to verify OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");

    if (!newPassword.trim()) {
      setError("New password is required.");
      return;
    }

    if (!isPasswordValid) {
      setError("Please meet all password requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Failed to reset password.");
        return;
      }

      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (updateException) {
      setError(updateException?.message || "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  const evaluatePassword = (password) => {
    const value = String(password || "");
    return {
      minLength: value.length >= 8,
      hasLowercase: /[a-z]/.test(value),
      hasUppercase: /[A-Z]/.test(value),
      hasNumber: /\d/.test(value),
      hasSymbol: /[^A-Za-z0-9]/.test(value),
    };
  };

  const passwordChecks = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const passwordScore = useMemo(() => Object.values(passwordChecks).filter(Boolean).length, [passwordChecks]);
  const isPasswordValid = useMemo(() => passwordScore === 5, [passwordScore]);

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
              Reset Password
            </p>
            <p className="text-white/85 text-base">
              Verify your email with OTP and set a new password.
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
              <p className="text-lg font-bold text-slate-900 leading-tight">St Teresa</p>
              <p className="text-xs text-slate-500">Management System</p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
            <p className="text-sm text-slate-500 mt-1">
              {step === "email"
                ? "Enter your email to receive an OTP."
                : step === "otp"
                ? "Enter the 8-digit code sent to your email."
                : "Set your new password."}
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          {step === "email" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                sendOtp();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#450c0c] hover:bg-[#170000]"
                disabled={submitting}
              >
                {submitting ? "Sending OTP..." : "Send OTP"}
              </Button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                verifyOtp();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">OTP (8 digits)</label>
                <div className="grid grid-cols-8 gap-3 justify-center mt-2">
                  {otpDigits.map((digit, index) => (
                    <Input
                      key={`otp-${index}`}
                      id={`otp-digit-${index}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      value={digit}
                      maxLength={1}
                      onChange={(event) => updateOtpDigit(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKeyDown(event, index)}
                      className="w-12 h-12 text-center text-lg font-semibold"
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="text-sm font-medium text-[#450c0c] hover:text-[#170000]"
                  disabled={submitting || cooldownSeconds > 0}
                >
                  {cooldownSeconds > 0
                    ? `Resend OTP in ${formatCooldown(cooldownSeconds)}`
                    : "Resend OTP"}
                </button>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#450c0c] hover:bg-[#170000]"
                disabled={submitting}
              >
                {submitting ? "Verifying..." : "Verify OTP"}
              </Button>
            </form>
          ) : null}

          {step === "password" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                resetPassword();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 mt-2">
                  {[
                    { key: "minLength", label: "At least 8 characters" },
                    { key: "hasLowercase", label: "Contains lowercase letter" },
                    { key: "hasUppercase", label: "Contains uppercase letter" },
                    { key: "hasNumber", label: "Contains number" },
                    { key: "hasSymbol", label: "Contains symbol" },
                  ].map((rule) => (
                    <p
                      key={rule.key}
                      className={`text-xs flex items-center gap-2 ${passwordChecks[rule.key] ? "text-green-700" : "text-slate-500"}`}
                    >
                      {passwordChecks[rule.key] ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5" />
                      )}
                      {rule.label}
                    </p>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Confirm Password</label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#450c0c] hover:bg-[#170000]"
                disabled={submitting}
              >
                {submitting ? "Updating Password..." : "Reset Password"}
              </Button>
            </form>
          ) : null}

          <div className="mt-6 text-center text-sm text-slate-600">
            Back to{" "}
            <Link to="/login" className="font-medium text-[#450c0c] hover:text-[#170000]">
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
