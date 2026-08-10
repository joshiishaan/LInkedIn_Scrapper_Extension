// Message-activity metrics API (per-user LinkedIn messaging stats).
import { API_BASE_URL, getAuthHeaders, throwApiError } from "./_apiBase";

// One entry per message, appended to the backend's append-only message-events
// log so the report's chart can bucket by when each message actually
// happened rather than a conversation's aggregate lastMessageAt.
export interface MessageEventEntry {
  messageId: string;
  type: "SENT" | "RECEIVED";
  occurredAt: string;
  isFirstTouch?: boolean;
  isFollowUp?: boolean;
  isFirstReply?: boolean;
  // The immediately preceding message's occurredAt (either side) — what this
  // message is a response to. Undefined for the conversation's first message.
  respondsToAt?: string;
  // The rep's IANA timezone at record time (browser-sourced). Powers the Late
  // Messages report's quiet-hours deadline math on the backend.
  selfTimeZone?: string;
  // The message's own text (LinkedIn's `msg.body.text`) — powers the
  // Messages report's in-app chat popup instead of a deep link to LinkedIn's
  // own chat page.
  text?: string;
}

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
  events?: MessageEventEntry[];
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

// Today-only counters (see backend's getMessageStatsToday) — read from the
// per-message event log, not message_activity's lifetime conversation
// aggregates (which have no per-day breakdown), so the tile set is different
// from MessageStats above: matches the Messages report's own metrics exactly.
export interface MessageStatsToday {
  fresh: number;
  followups: number;
  sent: number;
  received: number;
  replied: number;
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

  // Today-only counters for the popup — see backend's getMessageStatsToday.
  getStatsToday: async (window: {
    from: string;
    to: string;
  }): Promise<{ data: MessageStatsToday }> => {
    const params = new URLSearchParams(window);
    const response = await fetch(
      `${API_BASE_URL}/messages/stats/today?${params.toString()}`,
      { headers: await getAuthHeaders() },
    );
    if (!response.ok)
      await throwApiError(response, "Failed to load today's message stats");
    return response.json();
  },
};
