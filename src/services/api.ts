const API_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL;

interface User {
  token: string;
  name: string;
  email: string;
}

const getAuthHeaders = async () => {
  const result = await chrome.storage.local.get(["user"]);
  const user = result.user as User | undefined;
  return {
    "Content-Type": "application/json",
    ...(user?.token && { Authorization: `Bearer ${user.token}` }),
  };
};

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

  resetPassword: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new Error("Reset failed");
    return response.json();
  },
};

export const hubspotApi = {
  checkStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/status`, {
      headers: await getAuthHeaders(),
    });
    console.log(response);
    if (!response.ok) throw new Error("Failed to check status");
    return response.json();
  },

  getConnectUrl: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/connect`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to get connect URL");
    return response.json();
  },
};

export const linkedinApi = {
  checkSyncStatus: async (profileId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/check-profile?username=${profileId}`,
      {
        headers: await getAuthHeaders(),
      },
    );
    if (!response.ok) throw new Error("Failed to check sync status");
    return response.json();
  },

  saveContactAndCompany: async (payload: any) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/sync-lead`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Failed to save data");
    return response.json();
  },
};
