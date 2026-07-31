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
// Sent invitations: LinkedIn's My Network moved to SDUI, so this is NOT a
// Voyager JSON endpoint — it's the React-server-component pager behind the
// "Sent" tab, which answers a plain JSON POST body and returns an RSC flight
// payload (~73 KB/page, 10 invitations per page, offset paginated).
//
// Verified live: offsets are stable, a full walk of 796 invitations produced
// exactly 796 unique ids with no duplicates or gaps, and the list is sorted
// newest-first. End of list is a tiny (~200 byte) response carrying no ids.
const SENT_INVITES_URL =
  "/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.invitationsList";
const SENT_PAGE = 10; // LinkedIn's fixed page size for this pager
const SENT_PAGE_PACING_MS = 1100; // unattended + sequential: stay unobtrusive
const SENT_MAX_PAGES = 400; // hard stop (~4000 invitations)
// A real end-of-list page is tiny. Anything substantially larger that yields no
// ids means our extraction broke, NOT that the list ended — see the walker.
const SENT_EMPTY_MAX_BYTES = 2000;

// The pager's request body. Mirrors what LinkedIn's own UI sends; only
// startIndex varies between pages.
const sentInvitesBody = (startIndex: number) => ({
  pagerId: "com.linkedin.sdui.pagers.mynetwork.invitationsList",
  clientArguments: {
    $type: "proto.sdui.actions.requests.RequestedArguments",
    requestedStateKeys: [],
    payload: {
      startIndex,
      invitationTypeEnum: ["GenericInvitationType_CONNECTION"],
      invitationClassificationTypes: [],
      filterCriteriaEnum: "FilterCriteria_UNKNOWN",
      invitationDirectionEnum: "PendingInvitationDirection_SENT",
    },
    requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
    states: [],
    screenId:
      "com.linkedin.sdui.flagshipnav.mynetwork.invitations.InvitationSentWithType",
  },
  paginationRequest: {
    $type: "proto.sdui.actions.requests.PaginationRequest",
    pagerId: "com.linkedin.sdui.pagers.mynetwork.invitationsList",
    trigger: {
      $case: "itemDistanceTrigger",
      itemDistanceTrigger: {
        $type: "proto.sdui.actions.requests.ItemDistanceTrigger",
        preloadDistance: 3,
        preloadLength: 250,
      },
    },
    retryCount: 2,
    requestedArguments: {
      $type: "proto.sdui.actions.requests.RequestedArguments",
      requestedStateKeys: [],
      payload: {
        startIndex,
        invitationTypeEnum: ["GenericInvitationType_CONNECTION"],
        invitationClassificationTypes: [],
        filterCriteriaEnum: "FilterCriteria_UNKNOWN",
        invitationDirectionEnum: "PendingInvitationDirection_SENT",
      },
      requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
    },
  },
});

export interface SyncResult {
  accepted: number;
  /** Resolved as expired — also covers declines, which LinkedIn never reveals. */
  expired: number;
  /** Missing for the first time; a second confirming walk is required. */
  newlyAbsent: number;
  /** Missing before, present again — a paging artefact, nothing resolved. */
  reappeared: number;
  stillPending: number;
  skipped?: boolean;
  error?: string;
}

let syncInFlight: Promise<SyncResult> | null = null;

const ZERO: SyncResult = {
  accepted: 0,
  expired: 0,
  newlyAbsent: 0,
  reappeared: 0,
  stillPending: 0,
};

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

export interface SentInvitesFetch {
  /** Member ids ("ACoAA…") still outstanding in LinkedIn's Sent list. */
  ids: string[];
  /**
   * True ONLY when the walk reached a genuine end-of-list page.
   *
   * This is the single most safety-critical flag in the sync. An incomplete
   * walk is indistinguishable from "every invitation disappeared", so the
   * backend refuses to resolve anything to EXPIRED unless this is true. It is
   * false on: a page cap hit, any HTTP/network failure mid-walk, or a suspected
   * extraction break.
   */
  complete: boolean;
}

/**
 * Walk LinkedIn's Sent-invitations list and collect every outstanding invitee.
 *
 * Returns null when even the first page fails — the caller then runs
 * ACCEPTED-only, exactly as before, and nothing can be expired.
 */
async function fetchSentInvitationMemberIds(
  _actorId: string | null,
): Promise<SentInvitesFetch | null> {
  const ids = new Set<string>();
  const csrf = getCsrfTokenFromCookies();
  let startIndex = 0;

  for (let page = 0; page < SENT_MAX_PAGES; page++) {
    let text: string;
    try {
      const res = await fetch(SENT_INVITES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "csrf-token": csrf },
        body: JSON.stringify(sentInvitesBody(startIndex)),
      });
      if (!res.ok) {
        dwarn("[conn-sync] sent-invites page failed", res.status, startIndex);
        // First page failing means we have nothing at all.
        if (page === 0) return null;
        // Mid-walk failure: keep what we have, but the walk is NOT complete.
        return { ids: Array.from(ids), complete: false };
      }
      text = await res.text();
    } catch (e) {
      dwarn("[conn-sync] sent-invites fetch error", e);
      if (page === 0) return null;
      return { ids: Array.from(ids), complete: false };
    }

    // The response is an RSC flight payload, not JSON. Member ids appear
    // verbatim, so extract them directly rather than trying to parse a format
    // LinkedIn can reshape at will.
    const found = text.match(/ACoAA[A-Za-z0-9_-]+/g) || [];

    if (found.length === 0) {
      // CRITICAL DISTINCTION. A genuine end-of-list page is tiny. A full-size
      // page yielding nothing means LinkedIn changed the payload and our
      // extraction broke — treating that as "the list ended" would report every
      // outstanding invitation as gone and expire the entire pending set.
      if (text.length <= SENT_EMPTY_MAX_BYTES) {
        dlog("[conn-sync] sent-invites walk complete at", startIndex);
        return { ids: Array.from(ids), complete: true };
      }
      dwarn(
        "[conn-sync] sent-invites: no ids in a full-size page — extraction likely broken; treating walk as INCOMPLETE",
        { startIndex, bytes: text.length },
      );
      return { ids: Array.from(ids), complete: false };
    }

    found.forEach((id) => ids.add(id));
    startIndex += SENT_PAGE;
    await sleep(SENT_PAGE_PACING_MS);
  }

  dwarn("[conn-sync] sent-invites hit page cap — walk INCOMPLETE", {
    cap: SENT_MAX_PAGES,
    collected: ids.size,
  });
  return { ids: Array.from(ids), complete: false };
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

      // Sequential, not parallel: the sent-invitations walk is ~80 requests for
      // a large account, and firing the connections pagination alongside it
      // doubles the concurrent load on LinkedIn for no real time saving.
      const sent = await fetchSentInvitationMemberIds(actorId);
      const conn = await fetchRecentConnections(actorId, CONN_CAP);

      if (sent === null && conn === null) {
        return { ...ZERO, error: "fetch_failed" }; // nothing usable; don't touch throttle
      }

      dlog(
        "[conn-sync] sent-invites:",
        sent?.ids.length ?? "none",
        "complete=",
        sent?.complete ?? false,
      );

      const res = await connectionApi.reconcile({
        stillPendingIds: sent?.ids ?? [],
        connected: (conn?.connections ?? []).map((c) => ({
          targetLinkedinId: c.targetLinkedinId,
          ...(c.connectedAt != null && { connectedAt: String(c.connectedAt) }),
        })),
        sentInvitationsFetched: sent !== null,
        // Gate on a COMPLETE walk. A partial list looks exactly like mass
        // disappearance, so the backend must not resolve anything from it.
        sentListComplete: sent?.complete === true,
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
