/**
 * Login Component
 * Handles user authentication with theme support
 */

import { useState } from "react";
import { authApi } from "../../services/api";

interface Props {
  onAuth: (user: any) => void;
  onSignup: () => void;
  onReset: () => void;
}

export default function Login({ onAuth, onSignup, onReset }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Handle login form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await authApi.login(email, password);
      onAuth(response.data.user);
    } catch (err: any) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Welcome Back</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      <div className="auth-links">
        <button onClick={onReset} className="link-btn">
          Forgot Password?
        </button>
        <button onClick={onSignup} className="link-btn">
          Create Account
        </button>
      </div>
    </div>
  );
}
