/**
 * connectionSync — reconcile PENDING connection requests against LinkedIn.
 *
 * Runs ONLY in the content script (same-origin to linkedin.com; the proven
 * Voyager fetch pattern from linkedinApi.ts). It snapshots two LinkedIn lists —
 * "Sent invitations" (still pending) and "Connections" (recently added) — and
 * POSTs a compact reconcile payload to our backend, which flips rows
 * PENDING -> ACCEPTED / NOT_ACCEPTED.
 *
 * Triggers: (a) throttled after a send (force:false), (b) the popup "Sync" button
 * (force:true). The 10h throttle + in-flight guard live here so callers stay dumb.
 *
 * SAFETY: fetch failures no-op. NOT_ACCEPTED is only requested when the
 * sent-invitations list was actually fetched, so a wrong endpoint guess (the
 * endpoints below are pending live confirmation) can never mass-mislabel rows.
 */

import {
  getCsrfTokenFromCookies,
  extractMemberIdFrom,
  fetchLoggedInLinkedInIdentity,
} from "./linkedinApi";
import { connectionApi } from "../services/connectionApi";
import { dlog, dwarn } from "./debug";

const THROTTLE_MS = 10 * 60 * 60 * 1000; // 10h (auto sync-on-send throttle)
const MIN_RUN_INTERVAL_MS = 30 * 1000; // hard floor between ANY runs (anti-spam)
const PAGE_PACING_MS = 400; // spacing between connection pages (protect the account)
const CONN_PAGE = 40;
const CONN_CAP = 500;
const SYNC_TS_KEY = "lastConnectionsSyncAt";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// In-memory floor so even the manual "Sync now" button can't hammer LinkedIn.
let lastRunAt = 0;

// ── Endpoints (confirmed live) ──────────────────────────────────────────────
// Connections: dash endpoint, sorted recently-added. Its `included` array holds
// Connection entities: { connectedMember: "urn:li:fsd_profile:ACoAA…",
// createdAt: <epoch ms>, $type: "…relationships.Connection" }.
const CONNECTION_TYPE = "com.linkedin.voyager.dash.relationships.Connection";
const CONNECTIONS_URL = (start: number, count: number) =>
  `https://www.linkedin.com/voyager/api/relationships/dash/connections?q=search&sortType=RECENTLY_ADDED&count=${count}&start=${start}`;
// Sent-invitations endpoint not yet located on today's (SDUI) LinkedIn. Until it
// is, the sync runs ACCEPTED-only (see fetchSentInvitationMemberIds).

export interface SyncResult {
  accepted: number;
  notAccepted: number;
  stillPending: number;
  skipped?: boolean;
  error?: string;
}

let syncInFlight: Promise<SyncResult> | null = null;

const ZERO: SyncResult = { accepted: 0, notAccepted: 0, stillPending: 0 };

// True while this content script still has a live extension connection.
function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function voyagerHeaders(): Record<string, string> {
  return {
    "csrf-token": getCsrfTokenFromCookies(),
    "x-restli-protocol-version": "2.0.0",
    accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: voyagerHeaders(),
    });
    if (!res.ok) {
      dwarn("[conn-sync] fetch failed", res.status, url);
      return null;
    }
    return await res.json();
  } catch (e) {
    dwarn("[conn-sync] fetch error", e);
    return null;
  }
}

// ── LinkedIn fetchers ────────────────────────────────────────────────────────

// Still-pending invitees ("ACoAA…"). null = "not fetched" → backend runs
// ACCEPTED-only (never NOT_ACCEPTED). The sent-invitations endpoint isn't
// located on today's SDUI LinkedIn yet, so this is intentionally null for now.
async function fetchSentInvitationMemberIds(
  _actorId: string | null,
): Promise<string[] | null> {
  return null;
}

interface ConnFetch {
  connections: { targetLinkedinId: string; connectedAt?: number }[];
  coverageFloor: string | null; // epoch-ms string; null = full coverage (reached end)
}

// Recently-added connections, paginated up to a cap. null = first-page failure.
// Parses the dash `included` Connection entities: connectedMember (member id) +
// createdAt (the accept time).
async function fetchRecentConnections(
  actorId: string | null,
  cap: number,
): Promise<ConnFetch | null> {
  const connections: ConnFetch["connections"] = [];
  let start = 0;
  let reachedEnd = false;
  let floor: number | null = null;

  while (connections.length < cap) {
    const data = await getJson(CONNECTIONS_URL(start, CONN_PAGE));
    if (!data) {
      if (start === 0) return null; // couldn't fetch at all
      break; // partial — keep what we have
    }
    const pageSize = (data?.data?.["*elements"] ?? []).length;
    const entities = (data.included ?? []).filter(
      (e: any) => e?.$type === CONNECTION_TYPE,
    );
    if (!pageSize) {
      reachedEnd = true;
      break;
    }
    for (const c of entities) {
      const id = extractMemberIdFrom(
        String(c.connectedMember ?? c.entityUrn ?? ""),
      );
      if (!id || id === actorId) continue;
      const connectedAt =
        typeof c.createdAt === "number" ? c.createdAt : undefined;
      connections.push({
        targetLinkedinId: id,
        ...(connectedAt != null && { connectedAt }),
      });
      if (connectedAt != null)
        floor = floor == null ? connectedAt : Math.min(floor, connectedAt);
    }
    if (pageSize < CONN_PAGE) {
      reachedEnd = true;
      break;
    }
    start += CONN_PAGE;
    await sleep(PAGE_PACING_MS); // pace pagination to protect the account
  }

  // coverageFloor tells the backend how far back this snapshot is trustworthy.
  // Full coverage (reached the end) → null. Otherwise the oldest connectedAt we
  // saw; if timestamps were unreadable, fall back to "now" so the backend marks
  // only very recent sends NOT_ACCEPTED (conservative).
  const coverageFloor = reachedEnd
    ? null
    : String(floor != null ? floor : Date.now());

  dlog(
    "[conn-sync] connections parsed:",
    connections.length,
    "reachedEnd=",
    reachedEnd,
  );
  return { connections, coverageFloor };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function runConnectionsSync(opts?: {
  force?: boolean;
}): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight; // coalesce overlapping runs

  syncInFlight = (async (): Promise<SyncResult> => {
    try {
      if (!extensionAlive()) return { ...ZERO, skipped: true };

      // Need an app auth token to POST the reconcile.
      const store = (await chrome.storage.local.get([
        "user",
        SYNC_TS_KEY,
      ])) as Record<string, any>;
      if (!store.user?.token) return { ...ZERO, skipped: true };

      const force = !!opts?.force;
      const nowTs = Date.now();
      // Hard floor between any runs — the manual "Sync now" button bypasses the
      // 10h throttle but must not be spammable into hammering LinkedIn.
      if (nowTs - lastRunAt < MIN_RUN_INTERVAL_MS) {
        return { ...ZERO, skipped: true };
      }
      if (!force && store[SYNC_TS_KEY] && nowTs - store[SYNC_TS_KEY] < THROTTLE_MS) {
        return { ...ZERO, skipped: true };
      }
      lastRunAt = nowTs;

      dlog("[conn-sync] start force=", force);
      const actor = await fetchLoggedInLinkedInIdentity();
      const actorId = actor?.memberId ?? null;

      const [sentIds, conn] = await Promise.all([
        fetchSentInvitationMemberIds(actorId),
        fetchRecentConnections(actorId, CONN_CAP),
      ]);

      if (sentIds === null && conn === null) {
        return { ...ZERO, error: "fetch_failed" }; // nothing usable; don't touch throttle
      }

      const res = await connectionApi.reconcile({
        stillPendingIds: sentIds ?? [],
        connected: (conn?.connections ?? []).map((c) => ({
          targetLinkedinId: c.targetLinkedinId,
          ...(c.connectedAt != null && { connectedAt: String(c.connectedAt) }),
        })),
        sentInvitationsFetched: sentIds !== null,
        coverageFloor: conn?.coverageFloor ?? null,
        ...(actorId && { actorLinkedinId: actorId }),
      });

      // Only mark synced after a successful reconcile, so failures don't suppress retries.
      await chrome.storage.local.set({ [SYNC_TS_KEY]: Date.now() });
      dlog("[conn-sync] reconciled:", res.data);
      return { ...res.data };
    } catch (e: any) {
      if (extensionAlive()) dwarn("[conn-sync] failed:", e);
      return { ...ZERO, error: String(e?.message || e) };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}
