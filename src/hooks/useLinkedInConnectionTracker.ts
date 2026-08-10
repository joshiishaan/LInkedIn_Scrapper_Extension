/**
 * useLinkedInConnectionTracker
 *
 * Records LinkedIn connection-request activity to our backend. The page-context
 * interceptor captures the relevant Voyager calls and forwards each one to the
 * content script via `window.postMessage` (the canonical, spec-guaranteed
 * page->content channel); this hook listens for those envelopes and acts:
 *
 *   - invitation "send"     -> POST /connections/track   (status PENDING)
 *   - invitation "withdraw" -> POST /connections/status  (status WITHDRAWN)
 *   - profile view (1st°)   -> POST /connections/status  (status ACCEPTED)
 *
 * The target is keyed by the member URN id (the "ACoAA…" identifier), which is
 * stable across both the invitation body and a profile's entityUrn, so a send
 * and a later profile view reconcile to the same row. Everything is best-effort:
 * a tracking failure must never disturb LinkedIn's page or the other flows.
 */

import { useEffect } from "react";
import { connectionApi } from "../services/connectionApi";
import { fetchLoggedInLinkedInIdentity } from "../utils/linkedinApi";
import { runConnectionsSync } from "../utils/connectionSync";
import { dlog, dwarn } from "../utils/debug";

const BRIDGE_HOST_ID = "__hl_ct_bridge";

// True while this content script still has a live connection to the extension.
// After an extension reload/update the old content script becomes a "zombie":
// its code keeps running in the page but every chrome.* call throws
// "Extension context invalidated". Guarding on this lets us no-op quietly
// instead of spamming errors; the fresh content script (injected on update, or
// loaded on the next navigation) takes over.
function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Extract the LinkedIn member id ("ACoAA…") from an arbitrary value. LinkedIn
// exposes it in several shapes across flows: a profile/connection URN, a
// "profileId"/"profileUrn" field, or a bare ACoAA… string (e.g. the withdraw
// body's "profileUrn":"ACoAA…"). We try them in that order.
function extractMemberId(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (src == null) continue;
    const text = typeof src === "string" ? src : safeStringify(src);
    if (!text) continue;

    // LinkedIn member ids are "ACoAA…"-style (start "AC", long). Match that
    // shape directly — regardless of whether it appears as a full URN, a
    // profileUrn/profileId field, or a bare value — so we never grab a stray
    // token like "urn" from a nested field. In our send/withdraw/enrich bodies
    // exactly one such id appears (the target); the actor is implicit.
    const m = text.match(/\bAC[A-Za-z0-9_-]{16,}\b/);
    if (m) return m[0];
  }
  return null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

// Extract a display name ("First Last") from a request body when present. The
// Voyager send body has no name, but the SDUI connect bodies carry firstName /
// lastName — grab them when available so the row is human-readable.
function extractName(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (src == null) continue;
    const text = typeof src === "string" ? src : safeStringify(src);
    if (!text) continue;
    const first = text.match(/"firstName"\s*:\s*"([^"]*)"/)?.[1] ?? "";
    const last = text.match(/"lastName"\s*:\s*"([^"]*)"/)?.[1] ?? "";
    const name = `${first} ${last}`.trim();
    if (name) return name;
  }
  return null;
}

// Extract the target's full profile URL from a request body when present.
// VERIFIED live (2026-08-07): an SDUI "addaAddConnection" send from a People
// You May Know card (clientContext "ProfilePYMK" — NOT the target's own
// profile page) still carried "profileCanonicalUrl":"https://www.linkedin.com/
// in/…" in its payload. So this is available on at least some off-profile-page
// send surfaces, not just when window.location happens to be the target's
// /in/ page — a strictly better (superset) source than the onProfilePage
// check below, at zero extra network cost since the body is already captured.
function extractProfileUrl(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (src == null) continue;
    const text = typeof src === "string" ? src : safeStringify(src);
    if (!text) continue;
    const url = text.match(/"profileCanonicalUrl"\s*:\s*"([^"]*)"/)?.[1];
    if (url) return url;
  }
  return null;
}

// Best-effort 1st-degree detection from an intercepted dash-profile element.
// LinkedIn's shape varies, so we check the most common signals defensively.
function isFirstDegreeConnection(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;

  const rel = raw.memberRelationship ?? raw.memberRelationshipData;
  const union = rel?.memberRelationship ?? rel?.memberRelationshipUnion ?? rel;
  if (union && typeof union === "object" && "connection" in union) return true;

  const distance =
    raw.distance?.value ?? raw.distance ?? raw.connectionDegree ?? rel?.distance;
  return distance === "DISTANCE_1" || distance === 1 || distance === "1st";
}

// Only attempt backend calls when the extension has a logged-in user, so we
// don't fire needless 401s (which would clear stored auth) while logged out.
async function hasAuth(): Promise<boolean> {
  try {
    const { user } = await chrome.storage.local.get(["user"]);
    return !!(user && (user as { token?: string }).token);
  } catch {
    return false;
  }
}

// The send event (no name) and the post-connect enrich event (has the name)
// arrive close together and race. This short-lived map lets whichever loses the
// race still get the name: enrich stores it, and a send reads it as a fallback.
const pendingTargetNames = new Map<string, string>();

// Handle one intercepted call forwarded from the page interceptor.
async function processDetail(detail: any): Promise<void> {
  if (!detail || !extensionAlive()) return;

  try {
    // --- Invitation sent / withdrawn ---
    if (detail.type === "HL_INTERNAL_LINKEDIN_INVITATION") {
      dlog(
        "[conn-tracker] invitation event:",
        detail.invitationKind,
        "status:",
        detail.statusCode,
        "url:",
        detail.callUrl,
      );
      if (detail.statusCode >= 400) {
        dwarn("[conn-tracker] skip — LinkedIn status", detail.statusCode);
        return;
      }

      const targetLinkedinId = extractMemberId(detail.requestBody, detail.callUrl);
      dlog("[conn-tracker] extracted target:", targetLinkedinId);
      if (!targetLinkedinId) {
        dwarn("[conn-tracker] skip — no target id from body/url");
        return;
      }
      if (!(await hasAuth())) {
        dwarn("[conn-tracker] skip — not logged into the extension");
        return;
      }

      if (detail.invitationKind === "withdraw") {
        await connectionApi.updateStatus({ targetLinkedinId, status: "WITHDRAWN" });
        dlog("[conn-tracker] WITHDRAWN posted →", targetLinkedinId);
        return;
      }

      // Post-connect enrichment: carries the invitee's name — backfill it on the
      // existing row (safe: update-only, never creates a row, never overwrites).
      if (detail.invitationKind === "enrich") {
        const name = extractName(detail.requestBody);
        dlog("[conn-tracker] enrich name:", name);
        if (name) {
          pendingTargetNames.set(targetLinkedinId, name); // if the send arrives later
          // If the row already exists (send ran first), fill it now.
          await connectionApi.backfillName({ targetLinkedinId, targetName: name });
          dlog("[conn-tracker] backfilled name →", targetLinkedinId, name);
        }
        return;
      }

      // A send. Stamp the actor (the LinkedIn account logged into the browser,
      // which may differ from the app user and may vary across sends).
      const actor = await fetchLoggedInLinkedInIdentity();
      // The classic Voyager send body has no name; fall back to a name
      // captured by an enrich event that already fired for this target.
      const targetName =
        extractName(detail.requestBody) ||
        pendingTargetNames.get(targetLinkedinId);
      // Prefer the profile URL LinkedIn's OWN send body already carries
      // (present even off the target's profile page — e.g. a PYMK card send —
      // see extractProfileUrl) over window.location, which only happens to be
      // right when the send genuinely originated from the target's /in/ page.
      const onProfilePage = /\/in\//.test(window.location.pathname);
      const targetProfileUrl =
        extractProfileUrl(detail.requestBody) ||
        (onProfilePage ? window.location.href : null);
      await connectionApi.trackSent({
        targetLinkedinId,
        ...(targetName && { targetName }),
        ...(targetProfileUrl && { targetProfileUrl }),
        ...(actor && {
          actorLinkedinId: actor.memberId,
          ...(actor.name && { actorName: actor.name }),
          ...(actor.publicIdentifier && {
            actorPublicIdentifier: actor.publicIdentifier,
          }),
        }),
      });
      dlog("[conn-tracker] tracked connection request →", targetLinkedinId);
      // Best-effort: reconcile prior pending rows in the background (throttled
      // to 10h inside runConnectionsSync, so bursts of sends won't re-fire).
      void runConnectionsSync({ force: false }).catch(() => {});
      return;
    }

    // --- Profile viewed: reconcile a pending request to ACCEPTED ---
    if (detail.type === "HL_INTERNAL_LINKEDIN_PROFILE") {
      if (detail.statusCode >= 400) return;
      const raw = detail.responseBody?.elements?.[0];
      if (!raw || !isFirstDegreeConnection(raw)) return;

      const targetLinkedinId = extractMemberId(raw.entityUrn, raw);
      if (!targetLinkedinId || !(await hasAuth())) return;

      // No-op on the backend unless a PENDING request exists for this target.
      await connectionApi.updateStatus({ targetLinkedinId, status: "ACCEPTED" });
    }
  } catch (err) {
    // Swallow zombie-context noise; surface anything else for diagnosis.
    if (extensionAlive()) {
      dwarn("[conn-tracker] tracking failed:", err);
    }
  }
}

export function useLinkedInConnectionTracker() {
  useEffect(() => {
    // The interceptor appends payload nodes to the TOP document (LinkedIn issues
    // some connect requests from same-origin iframes; delivering to the top doc
    // lands them where this main-frame content script observes). Ensure the host
    // exists, then observe it for appended nodes.
    let host = document.getElementById(BRIDGE_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BRIDGE_HOST_ID;
      (host as HTMLElement).style.display = "none";
      (document.documentElement || document.body).appendChild(host);
    }
    const bridge = host;

    const drain = (node: Element) => {
      const json = node.getAttribute("data-hl-ct");
      node.remove();
      if (!json) return;
      try {
        void processDetail(JSON.parse(json));
      } catch {
        /* malformed payload — ignore */
      }
    };

    // Process anything queued before we attached, then observe new payloads.
    bridge.querySelectorAll("[data-hl-ct]").forEach(drain);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element && n.hasAttribute("data-hl-ct")) drain(n);
        });
      }
    });
    observer.observe(bridge, { childList: true });
    return () => observer.disconnect();
  }, []);
}
