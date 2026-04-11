/**
 * Reset Password Component
 * Step 1: Enter email to receive a reset link.
 * Step 2: Paste the token from the email and set a new password.
 *         (The extension popup can also auto-populate the token when it detects
 *          a `?reset_token=…` query param in the page URL — see Popup.tsx.)
 */

import { useState } from "react";
import { authApi } from "../../services/api";

type Step = "request" | "confirm" | "done";

interface Props {
  onBack: () => void;
  /** Pre-filled token extracted from the reset link URL (optional) */
  initialToken?: string;
}

export default function ResetPassword({ onBack, initialToken }: Props) {
  // If a token was passed in (e.g. from the deep-link handler in Popup.tsx),
  // skip straight to the confirm step.
  const [step, setStep] = useState<Step>(initialToken ? "confirm" : "request");

  // Step 1 state
  const [email, setEmail] = useState("");

  // Step 2 state
  const [token, setToken] = useState(initialToken ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Step 1: request reset email ─────────────────────────────────────────────
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await authApi.forgotPassword(email);
      // Always advance to the confirm step regardless of whether the email exists
      // (server never reveals that). The user will either receive an email or not.
      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: confirm reset with token + new password ─────────────────────────
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await authApi.confirmResetPassword(token.trim(), password);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  // ── Done ────────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="auth-form">
        <div className="success-message">
          <h2>Password Reset</h2>
          <p>Your password has been updated. You can now log in with your new password.</p>
          <button onClick={onBack}>Back to Login</button>
        </div>
      </div>
    );
  }

  // ── Step 2: enter token + new password ──────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="auth-form">
        <h2>Set New Password</h2>
        {!initialToken && (
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            Check your email for the reset link. Copy the token from the link and paste it below, then choose a new password.
          </p>
        )}
        <form onSubmit={handleConfirmReset}>
          {/* Only show the token field when the token was not pre-filled by the deep-link */}
          {!initialToken && (
            <input
              type="text"
              placeholder="Reset token (from the email link)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
          )}
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
        <div className="auth-links">
          {!initialToken && (
            <button onClick={() => { setStep("request"); setError(""); }} className="link-btn">
              Resend reset email
            </button>
          )}
          <button onClick={onBack} className="link-btn">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: request reset email ─────────────────────────────────────────────
  return (
    <div className="auth-form">
      <h2>Reset Password</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
        Enter the email address associated with your account and we will send you a reset link.
      </p>
      <form onSubmit={handleRequestReset}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
      <div className="auth-links">
        <button onClick={onBack} className="link-btn">
          Back to Login
        </button>
      </div>
    </div>
  );
}
