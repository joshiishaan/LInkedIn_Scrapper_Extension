// Message-activity metrics API (per-user LinkedIn messaging stats).
import { API_BASE_URL, getAuthHeaders, throwApiError } from "./_apiBase";

export interface MessageActivityPayload {
  conversationKey: string;
  participantLinkedinId?: string;
  participantName?: string;
  participantProfileUrl?: string;
  selfLinkedinId?: string;
  selfName?: string;
  selfProfileUrl?: string;
  sentCount: number;
  receivedCount: number;
  followUpCount: number;
  readCount: number;
  hasReply: boolean;
  isConversation: boolean;
  firstMessageAt?: string;
  lastMessageAt?: string;
}

export interface MessageStats {
  sent: number;
  read: number;
  replied: number;
  followUps: number;
  conversations: number;
}

export interface MessageStatsResponse {
  user: MessageStats;
  global: MessageStats;
}

export const messagesApi = {
  // Upsert a conversation's derived metrics.
  recordActivity: async (payload: MessageActivityPayload) => {
    const response = await fetch(`${API_BASE_URL}/messages/activity`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to record message activity");
    return response.json();
  },

  // Fetch per-user + global messaging metrics.
  getStats: async (): Promise<{ data: MessageStatsResponse }> => {
    const response = await fetch(`${API_BASE_URL}/messages/stats`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to load message stats");
    return response.json();
  },
};
