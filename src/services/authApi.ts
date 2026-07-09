import { API_BASE_URL } from "./_apiBase";

// Persist the auth result: the user (with its short-lived access token) and the
// long-lived refresh token, in chrome.storage.local. Backend returns both in
// the JSON body (no cookies); the extension is the token store.
async function persistAuth(data: {
  user?: unknown;
  refreshToken?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data?.user) updates.user = data.user;
  if (data?.refreshToken) updates.refreshToken = data.refreshToken;
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
}

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Login failed");
    }
    const json = await response.json();
    await persistAuth(json.data);
    return json;
  },

  signup: async (name: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Signup failed");
    }
    const json = await response.json();
    await persistAuth(json.data);
    return json;
  },

  // Request a password-reset OTP. The backend always responds 200 (it won't
  // reveal whether the email exists), so any ok response is treated as success.
  forgotPassword: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Failed to send reset code");
    }
    return response.json();
  },

  // Reset the password using the emailed 6-digit code.
  resetPassword: async (email: string, code: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Failed to reset password");
    }
    return response.json();
  },
};
