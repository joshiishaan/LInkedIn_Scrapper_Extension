/**
 * ResetPassword Component
 * Handles password reset requests
 */

import { useState } from "react";
import { authApi } from "../../services/api";

interface Props {
  onBack: () => void;
}

export default function ResetPassword({ onBack }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Handle password reset form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await authApi.resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Reset Password</h2>
      {success ? (
        <div className="success-message">
          <p>✓ Password reset link sent to your email</p>
          <button onClick={onBack}>Back to Login</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
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
      )}
      <div className="auth-links">
        <button onClick={onBack} className="link-btn">
          ← Back to Login
        </button>
      </div>
    </div>
  );
}
