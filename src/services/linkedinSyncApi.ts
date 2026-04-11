// refactored: renamed from linkedinApi to linkedinSyncApi to avoid confusion with
// src/utils/linkedinApi.ts (LinkedIn Voyager fetch helpers). Re-exported as linkedinApi in api.ts.
import { API_BASE_URL, getAuthHeaders } from "./_apiBase";

export const linkedinApi = {
  checkSyncStatus: async (profileId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/check-profile?username=${profileId}`,
      { headers: await getAuthHeaders() },
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

  upsertMessages: async (payload: {
    conversationKey: string;
    messages: {
      text: string;
      sentAt: string;
      sender: { name: string; profileUrl: string; distance: string };
      receiver: { name: string; profileUrl: string; distance: string };
    }[];
  }) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/upsert-messages`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("API Error (upsert-messages):", errorText);
      throw new Error("Failed to upsert messages");
    }
    return response.json();
  },
};
