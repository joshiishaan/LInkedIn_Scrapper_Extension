/**
 * ForgotPassword Component
 * Popup-only password reset via a 6-digit OTP emailed to the user:
 *   Step 1: enter email  -> backend emails a code
 *   Step 2: enter code + new password -> password reset -> back to login
 *
 * Chrome extension popups fully unmount when they lose focus (e.g. the user
 * switches to Gmail to read the code), which would otherwise reset this flow
 * back to step 1. To survive that, we persist the current step + email in
 * chrome.storage.local and restore them on mount, so reopening the popup lands
 * the user straight back on the code-entry screen (no need to resend a code).
 */

import { useEffect, useState } from "react";
import { authApi } from "../../services/api";
import OtpInput from "./OtpInput";

interface Props {
  onBack: () => void;
  onDone: () => void;
}

type Step = "email" | "code";

const FLOW_KEY = "passwordResetFlow";

export default function ForgotPassword({ onBack, onDone }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Restore an in-progress reset (survives the popup closing).
  useEffect(() => {
    chrome.storage.local.get([FLOW_KEY], (result) => {
      const flow = (result as Record<string, any>)[FLOW_KEY] as
        | { step?: Step; email?: string }
        | undefined;
      if (flow?.step === "code" && flow.email) {
        setEmail(flow.email);
        setStep("code");
      }
      setHydrated(true);
    });
  }, []);

  const persistFlow = (data: { step: Step; email: string }) => {
    chrome.storage.local.set({ [FLOW_KEY]: data });
  };

  const clearFlow = () => {
    chrome.storage.local.remove(FLOW_KEY);
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await authApi.forgotPassword(email);
      setInfo("Code sent — check your email.");
      setStep("code");
      persistFlow({ step: "code", email });
    } catch (err: any) {
      setError(err.message || "Could not send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authApi.resetPassword(email, code.trim(), password);
      clearFlow();
      onDone();
    } catch (err: any) {
      setError(err.message || "Could not reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const useDifferentEmail = () => {
    clearFlow();
    setStep("email");
    setCode("");
    setPassword("");
    setError("");
    setInfo("");
  };

  const backToLogin = () => {
    clearFlow();
    onBack();
  };

  // Avoid a flash of the email step before the stored flow is restored.
  if (!hydrated) return null;

  return (
    <div className="auth-form">
      <h2>Reset Password</h2>

      {step === "email" ? (
        <form onSubmit={requestCode}>
          <p className="auth-subtitle">
            Enter your account email and we'll send you a 6-digit reset code.
          </p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset code"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset}>
          <p className="auth-subtitle">
            Enter the 6-digit code sent to <strong>{email}</strong> and choose a
            new password.
          </p>
          {info && <div className="info">{info}</div>}
          <OtpInput value={code} onChange={setCode} autoFocus />
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span key={String(showPassword)} className="eye-icon">
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </span>
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          <button
            type="submit"
            disabled={loading || code.length !== 6 || password.length < 6}
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
          <button
            type="button"
            className="link-btn form-link"
            onClick={useDifferentEmail}
          >
            Use a different email
          </button>
        </form>
      )}

      <div className="auth-links">
        <button onClick={backToLogin} className="link-btn">
          Back to login
        </button>
      </div>
    </div>
  );
}
