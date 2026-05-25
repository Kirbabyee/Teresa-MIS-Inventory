import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, Eye, EyeOff, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hashInviteToken } from "@/lib/employeeInvites";
import arkLogo from "@/assets/imgs/ark-logo.png";
//ive edited this file again

function evaluatePassword(password) {
  const value = String(password || "");
  return {
    minLength: value.length >= 8,
    hasLowercase: /[a-z]/.test(value),
    hasUppercase: /[A-Z]/.test(value),
    hasNumber: /\d/.test(value),
    hasSymbol: /[^A-Za-z0-9]/.test(value),
  };
}

export default function ActivateAccount() {
  const navigate = useNavigate();
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
  const passwordChecks = useMemo(() => evaluatePassword(form.password), [form.password]);
  const passwordScore = useMemo(() => Object.values(passwordChecks).filter(Boolean).length, [passwordChecks]);
  const isPasswordValid = useMemo(() => passwordScore === 5, [passwordScore]);
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

        console.log("[ActivateAccount] Token from URL:", token);
        console.log("[ActivateAccount] Hashed token:", hashedToken);

        // Fetch from user_auth_invites table
        const { data: inviteRecords, error: inviteError } = await supabase
          .from("user_auth_invites")
          .select("*")
          .eq("invite_token_hash", hashedToken)
          .maybeSingle();

        console.log("[ActivateAccount] Query error:", inviteError);
        console.log("[ActivateAccount] Query result:", inviteRecords);

        // Debug: Check all records in the table
        const { data: allRecords } = await supabase.from("user_auth_invites").select("*");
        console.log("[ActivateAccount] All records in table:", allRecords);

        if (inviteError) throw inviteError;
        const inviteRecord = inviteRecords;

        if (!inviteRecord) {
          throw new Error("This activation link is invalid.");
        }
        if (inviteRecord.used_at) {
          throw new Error("This activation link was already used.");
        }

        // Check if this is for an employee or user_account
        let inviteTarget = "employee";
        
        if (inviteRecord.employee_id) {
          const { data: employeeRecord } = await supabase
            .from("employees")
            .select("id")
            .eq("id", inviteRecord.employee_id)
            .maybeSingle();

          if (!employeeRecord) {
            // Try user_accounts
            const { data: accountRecord } = await supabase
              .from("user_accounts")
              .select("id")
              .eq("id", inviteRecord.employee_id)
              .maybeSingle();

            if (!accountRecord) {
              throw new Error("This activation link is not linked to a valid account.");
            }
            inviteTarget = "user_account";
          }
        }

        setInviteTarget(inviteTarget);

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
      body: JSON.stringify({
        token,
        password: form.password,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

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
    if (!isPasswordValid) {
      setError("Please meet all password requirements.");
      return;
    }
    if (!isMatch) {
      setError("Password and confirm password do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    setActivationNotice("");

    try {
      if (activationFunctionUrl) {
        await activateViaEdgeFunction();
        setSuccess(true);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password: form.password,
        options: {
          data: {
            employee_id: invite.employee_id,
          },
        },
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

      // Mark the invite as consumed
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
              Secure Account Setup
            </p>
            <p className="text-white/85 text-base">
              Create your password to continue into St Teresa.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
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

          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
              Activation
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Activate Your Account</h1>
            <p className="text-sm text-slate-500">
              Set your password to complete employee account setup.
            </p>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Your account has been activated. You can now sign in.
              </div>
              {activationNotice ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  {activationNotice}
                </div>
              ) : null}
              <Link to="/login" className="block">
                <Button className="w-full bg-[#450c0c] hover:bg-[#170000]">Go To Login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <Input value={invite?.email || ""} disabled className="bg-slate-50" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Enter password"
                    className="pr-10"
                    required
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

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
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
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="Confirm password"
                    className="pr-10"
                    required
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

                {form.confirmPassword ? (
                  <p className={`text-xs flex items-center gap-2 ${isMatch ? "text-green-700" : "text-red-600"}`}>
                    {isMatch ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {isMatch ? "Passwords match" : "Passwords do not match"}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#450c0c] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                Use a strong password that you do not reuse on other accounts.
              </div>

              <Button className="w-full bg-[#450c0c] hover:bg-[#170000]" disabled={!canSubmit}>
                {submitting ? "Activating..." : "Activate Account"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}