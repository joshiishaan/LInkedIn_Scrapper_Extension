/**
 * Reset Password Component
 * Handles password reset requests with theme support
 */

import { useState } from "react";
import { authApi } from "../../services/api";

interface Props {
  onBack: () => void;
}

export default function ResetPassword({ onBack }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Handle password reset form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await authApi.resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-form">
        <div className="success-message">
          <h2>Check Your Email</h2>
          <p>We've sent password reset instructions to {email}</p>
          <button onClick={onBack}>Back to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <h2>Reset Password</h2>
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
      <div className="auth-links">
        <button onClick={onBack} className="link-btn">
          Back to Login
        </button>
      </div>
    </div>
  );
}
