import { API_BASE_URL, getAuthHeaders } from "./_apiBase";

export const hubspotApi = {
  checkStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/status`, {
      headers: await getAuthHeaders(),
    });
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

  getPropertyOptions: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/property-options`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to get property options");
    return response.json();
  },

  getAllContacts: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/contacts/all`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch contacts");
    return response.json();
  },

  getContacts: async (params?: { limit?: number; sortBy?: string }) => {
    const p = new URLSearchParams({
      limit: String(params?.limit ?? 200),
      sortBy: params?.sortBy ?? "firstname",
    });
    const response = await fetch(`${API_BASE_URL}/hubspot/contacts?${p}`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch contacts");
    return response.json();
  },

  updateContact: async (payload: any, username: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/update-contact?username=${username}`,
      {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error("Failed to update contact");
    return response.json();
  },
};
