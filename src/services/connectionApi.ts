// Connection-request tracking API (LinkedIn connection metrics).
import { API_BASE_URL, getAuthHeaders, throwApiError } from "./_apiBase";

export type ConnectionStatus =
  | "PENDING"
  | "ACCEPTED"
  // DEPRECATED: superseded by EXPIRED, kept so older stored values still type.
  | "NOT_ACCEPTED"
  | "WITHDRAWN"
  | "EXPIRED";

export interface ConnectionStats {
  sent: number;
  pending: number;
  accepted: number;
  withdrawn: number;
  /** Absorbs declines too — LinkedIn exposes no reject signal to the sender. */
  expired: number;
  /** DEPRECATED: legacy rows only; always 0 for new data. */
  notAccepted: number;
}

export interface ConnectionStatsResponse {
  user: ConnectionStats;
  global: ConnectionStats;
}

export interface ReconcilePayload {
  stillPendingIds: string[];
  connected: {
    targetLinkedinId: string;
    name?: string;
    connectedAt?: string;
  }[];
  sentInvitationsFetched: boolean;
  /**
   * True ONLY when the Sent-list walk reached a genuine end-of-list page.
   * The backend refuses to resolve anything to EXPIRED without it, because a
   * partial walk is indistinguishable from every invitation disappearing.
   */
  sentListComplete?: boolean;
  coverageFloor?: string | null;
  actorLinkedinId?: string;
}

export interface ReconcileResult {
  accepted: number;
  expired: number;
  /** Absent for the first time — awaiting a second confirming walk. */
  newlyAbsent: number;
  /** Were absent, then reappeared — marker cleared, nothing resolved. */
  reappeared: number;
  stillPending: number;
}

export const connectionApi = {
  // Record a connection request the user just sent (idempotent per target).
  trackSent: async (payload: {
    targetLinkedinId: string;
    targetProfileUrl?: string;
    targetName?: string;
    actorLinkedinId?: string;
    actorName?: string;
    actorPublicIdentifier?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/connections/track`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to track connection request");
    return response.json();
  },

  // Reconcile a pending request to a terminal status (accepted/withdrawn/…).
  updateStatus: async (payload: {
    targetLinkedinId: string;
    status: ConnectionStatus;
  }) => {
    const response = await fetch(`${API_BASE_URL}/connections/status`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to update connection status");
    return response.json();
  },

  // Fill a missing target display name on an existing row (post-connect enrich).
  backfillName: async (payload: {
    targetLinkedinId: string;
    targetName: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/connections/backfill-name`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) await throwApiError(response, "Failed to backfill name");
    return response.json();
  },

  // Bulk-reconcile PENDING rows from a LinkedIn snapshot (sent-invites + connections).
  reconcile: async (
    payload: ReconcilePayload,
  ): Promise<{ data: ReconcileResult }> => {
    const response = await fetch(`${API_BASE_URL}/connections/reconcile`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to reconcile connections");
    return response.json();
  },

  // Fetch per-user + global connection metrics.
  getStats: async (): Promise<{ data: ConnectionStatsResponse }> => {
    const response = await fetch(`${API_BASE_URL}/connections/stats`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok)
      await throwApiError(response, "Failed to load connection stats");
    return response.json();
  },
};
