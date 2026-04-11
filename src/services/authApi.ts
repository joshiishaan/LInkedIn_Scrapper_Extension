import { API_BASE_URL } from "./_apiBase";

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error("Login failed");
    return response.json();
  },

  signup: async (name: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) throw new Error("Signup failed");
    return response.json();
  },

  // NOTE: the old `resetPassword` method pointed at /auth/reset-password with only {email}.
  // That endpoint is now /auth/forgot-password. The old name is kept below as an alias
  // for any callers that have not been updated yet. [dead code — only ResetPassword.tsx used it]
  resetPassword: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // forgot-password always returns 200; surface rate-limit (429) as a friendly error
    if (response.status === 429) throw new Error("Too many requests. Please wait before trying again.");
    return response.json();
  },

  // Initiate forgot-password: send reset link to the provided email
  forgotPassword: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (response.status === 429) throw new Error("Too many requests. Please wait before trying again.");
    return response.json();
  },

  // Complete password reset using the JWT token from the email link
  confirmResetPassword: async (token: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Failed to reset password. The link may have expired.");
    }
    return data;
  },
};
