/**
 * useLinkedInMessageActivityTracker
 *
 * Passive, per-conversation messaging-metrics recorder. Listens for the
 * interceptor's messaging events (fired when LinkedIn loads a thread):
 *   - HL_INTERNAL_LINKEDIN_MESSAGES      → the messages (sent/received/…)
 *   - HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS → read watermark (for "read")
 * It merges both per conversation, derives the metrics, and upserts them to our
 * backend — only when something actually changed, so it never spams.
 *
 * Independent of the HubSpot "Sync messages" button.
 */

import { useEffect } from "react";
import { messagesApi } from "../services/messagesApi";
import { fetchLoggedInLinkedInIdentity } from "../utils/linkedinApi";
import {
  deriveActivity,
  extractReadWatermarkDeep,
  extractOtherParticipant,
  extractConversationParticipants,
} from "../utils/messageActivity";
import { extractAllLoadedMessages } from "../utils/messageSyncHelpers";
import { dlog, dwarn } from "../utils/debug";

// Per-conversation working state: the messages + read watermark seen so far, and
// a signature of the last recorded state to avoid redundant upserts.
interface ParticipantHint {
  id?: string | null;
  name?: string | null;
  profileUrl?: string | null;
}
interface ConvState {
  elements?: any[];
  watermark: number;
  sig: string;
  hint?: ParticipantHint; // recipient identity when they never replied
}
const convState = new Map<string, ConvState>();

// A stable per-message id so we can UNION successive fetches instead of
// replacing. LinkedIn re-issues the messages query with partial/incremental
// slices (e.g. just the newest message), and replacing would shrink our counts;
// merging keeps the full set so the metrics only ever grow toward the truth.
//
// We key on deliveredAt + sender FIRST (not entityUrn): the SAME message can
// arrive via the REST fetch and via the realtime channel with differently
// formatted entity urns, and keying on the urn would fail to dedup them → double
// counting. deliveredAt is ms-precise and unique per message from a sender, so
// it collapses the two copies. entityUrn is only a fallback when deliveredAt is
// absent.
function messageId(e: any): string {
  const actor = e?.actor ?? e?.sender;
  const host = actor?.hostIdentityUrn ?? actor?.entityUrn ?? "";
  const at = typeof e?.deliveredAt === "number" ? e.deliveredAt : null;
  if (at) return `${at}:${host}`;
  const urn = e?.entityUrn ?? e?.dashEntityUrn ?? e?.backendUrn;
  return typeof urn === "string" && urn ? urn : `0:${host}`;
}

function mergeMessages(prev: any[] | undefined, next: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of prev ?? []) map.set(messageId(e), e);
  for (const e of next) map.set(messageId(e), e);
  return Array.from(map.values());
}

function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

async function hasAuth(): Promise<boolean> {
  try {
    const { user } = await chrome.storage.local.get(["user"]);
    return !!(user && (user as { token?: string }).token);
  } catch {
    return false;
  }
}

// A stable conversation id shared by both events: the "2-<threadId>" segment of
// the conversationUrn present in either request URL.
function conversationIdFromUrl(url: string): string | null {
  try {
    return decodeURIComponent(url).match(/2-[A-Za-z0-9_=\-]+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

// Record the conversation if we have messages and its derived state changed.
async function recordIfChanged(key: string): Promise<void> {
  const st = convState.get(key);
  if (!st?.elements?.length || !extensionAlive()) {
    console.log("[HL-DBG] recordIfChanged: no elements yet for", key); // [HL-DBG]
    return;
  }
  if (!(await hasAuth())) {
    console.log("[HL-DBG] recordIfChanged: NO AUTH TOKEN — user not logged in"); // [HL-DBG]
    return;
  }

  const actor = await fetchLoggedInLinkedInIdentity();
  const payload = deriveActivity(st.elements, actor?.memberId ?? null, key, st.watermark);

  // Fill the recipient identity for one-sided (no-reply) threads from the
  // authoritative network hint (the conversation's own response / seen-receipt).
  // Never overwrite a value we already derived from a real message. No DOM.
  if (!payload.participantName || !payload.participantProfileUrl || !payload.participantLinkedinId) {
    const hint = st.hint;
    const name = payload.participantName ?? hint?.name ?? undefined;
    const url = payload.participantProfileUrl ?? hint?.profileUrl ?? undefined;
    const id = payload.participantLinkedinId ?? hint?.id ?? undefined;
    if (name) payload.participantName = name;
    if (url) payload.participantProfileUrl = url;
    if (id) payload.participantLinkedinId = id;
  }

  // Include the participant NAME (not just presence) so a later, cleaner name
  // re-records and overwrites an earlier junky one.
  const sig = `${payload.sentCount}:${payload.receivedCount}:${payload.readCount}:${payload.hasReply ? 1 : 0}:${payload.participantName ?? ""}`;
  console.log("[HL-DBG] participant name =", JSON.stringify(payload.participantName ?? null)); // [HL-DBG]
  console.log("[HL-DBG] read: watermark=", st.watermark, "readCount=", payload.readCount, "of sent", payload.sentCount, "for", key); // [HL-DBG]
  // [HL-DBG] show what we derived and whether it's a change.
  console.log(
    "[HL-DBG] derived",
    key,
    "self=",
    actor?.memberId ?? "NULL",
    "sent=",
    payload.sentCount,
    "recv=",
    payload.receivedCount,
    "sig=",
    sig,
    "prevSig=",
    st.sig,
  );
  if (sig === st.sig) return; // nothing new
  st.sig = sig;

  try {
    await messagesApi.recordActivity(payload);
    console.log("[HL-DBG] recordActivity OK ->", key); // [HL-DBG]
  } catch (err) {
    console.error("[HL-DBG] recordActivity FAILED (backend?):", err); // [HL-DBG]
    throw err;
  }
  dlog(
    "[msg-tracker] recorded:",
    key,
    "sent",
    payload.sentCount,
    "read",
    payload.readCount,
    "reply",
    payload.hasReply,
    "followups",
    payload.followUpCount,
  );
}

async function handleEvent(detail: any): Promise<void> {
  try {
    if (!detail || detail.statusCode >= 400 || !extensionAlive()) return;

    // Live message pushed over LinkedIn's realtime channel: keyed directly by
    // conversationKey (no request URL). Merge the single message and re-record.
    if (detail.type === "HL_INTERNAL_LINKEDIN_REALTIME_MSG") {
      const rtKey = detail.conversationKey;
      if (!rtKey || !detail.message) return;
      // Only augment a conversation we've already established via a real fetch.
      // A realtime frame must never CREATE a conversation row — that's how the
      // mis-keyed phantom rows appeared. An open thread is always fetched first,
      // so its key is present; a background thread is caught on next open.
      const rst = convState.get(rtKey);
      if (!rst?.elements?.length) {
        console.log("[HL-DBG] realtime skipped (unknown conversation) ->", rtKey); // [HL-DBG]
        return;
      }
      rst.elements = mergeMessages(rst.elements, [detail.message]);
      convState.set(rtKey, rst);
      console.log("[HL-DBG] realtime merged ->", rtKey); // [HL-DBG]
      await recordIfChanged(rtKey);
      return;
    }

    // Live READ receipt: the recipient just read up to `seenAt`. Advance this
    // conversation's watermark (monotonic) so "read" updates without a refetch.
    if (detail.type === "HL_INTERNAL_LINKEDIN_REALTIME_SEEN") {
      const skey = detail.conversationKey;
      const sst = skey ? convState.get(skey) : undefined;
      if (!sst?.elements?.length || typeof detail.seenAt !== "number") return;
      const selfId = (await fetchLoggedInLinkedInIdentity())?.memberId ?? null;
      if (detail.seerId && detail.seerId === selfId) return; // our own read — ignore
      sst.watermark = Math.max(sst.watermark || 0, detail.seenAt);
      convState.set(skey, sst);
      console.log("[HL-DBG] realtime seen merged -> watermark", sst.watermark, skey); // [HL-DBG]
      await recordIfChanged(skey);
      return;
    }

    // Conversation metadata (single thread OR the inbox list): carries the
    // participant roster for one or MANY conversations, so it isn't keyed by a
    // single URL. Fill each conversation's recipient hint, then re-record the
    // ones we already have messages for.
    if (detail.type === "HL_INTERNAL_LINKEDIN_CONVERSATION") {
      const selfId = (await fetchLoggedInLinkedInIdentity())?.memberId ?? null;
      const participants = extractConversationParticipants(detail.responseBody, selfId);
      console.log("[HL-DBG] conversation participants:", participants.length); // [HL-DBG]
      for (const p of participants) {
        const cst = convState.get(p.conversationKey) ?? { watermark: 0, sig: "" };
        cst.hint = {
          id: p.id ?? cst.hint?.id ?? null,
          name: p.name ?? cst.hint?.name ?? null,
          profileUrl: p.profileUrl ?? cst.hint?.profileUrl ?? null,
        };
        convState.set(p.conversationKey, cst);
        await recordIfChanged(p.conversationKey); // no-ops if no messages yet
      }
      return;
    }

    // [HL-DBG] show every messaging-related event that reaches the content script.
    if (
      detail.type === "HL_INTERNAL_LINKEDIN_MESSAGES" ||
      detail.type === "HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS"
    ) {
      console.log("[HL-DBG] tracker received", detail.type, "status", detail.statusCode);
    }
    const key = conversationIdFromUrl(detail.callUrl || "");
    if (!key) {
      if (
        detail.type === "HL_INTERNAL_LINKEDIN_MESSAGES" ||
        detail.type === "HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS"
      ) {
        console.log("[HL-DBG] no conversation key in URL:", detail.callUrl); // [HL-DBG]
      }
      return;
    }
    const st = convState.get(key) ?? { watermark: 0, sig: "" };

    if (detail.type === "HL_INTERNAL_LINKEDIN_MESSAGES") {
      const elements = extractAllLoadedMessages(detail);
      if (!elements?.length) {
        // A partial/other messenger query with nothing to add — ignore it so it
        // can't wipe the messages we already merged for this conversation.
        console.log("[HL-DBG] MESSAGES event empty — ignored for", key); // [HL-DBG]
        return;
      }
      // UNION with what we already have (don't replace) so an incremental fetch
      // can't shrink the counts.
      st.elements = mergeMessages(st.elements, elements);
      // Authoritative participant from the conversation's OWN response — covers
      // one-sided (no-reply) threads without scraping the DOM.
      const selfId = (await fetchLoggedInLinkedInIdentity())?.memberId ?? null;
      const other = extractOtherParticipant(detail.responseBody, selfId);
      if (other) {
        st.hint = {
          id: other.id ?? st.hint?.id ?? null,
          name: other.name ?? st.hint?.name ?? null,
          profileUrl: other.profileUrl ?? st.hint?.profileUrl ?? null,
        };
      }
    } else if (detail.type === "HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS") {
      const actor = await fetchLoggedInLinkedInIdentity();
      // [HL-DBG] one-shot dump of the real seen-receipts shape.
      if (!(window as any).__hlSeenDump) {
        (window as any).__hlSeenDump = true;
        try {
          const data = detail.responseBody?.data;
          console.log("[HL-DBG] SEEN data keys =", data && Object.keys(data)); // [HL-DBG]
          console.log("[HL-DBG] SEEN raw =", JSON.stringify(data).slice(0, 1500)); // [HL-DBG]
        } catch {
          /* ignore */
        }
      }
      // Shape-tolerant: walk the whole response for the recipient's seenAt.
      const wm = extractReadWatermarkDeep(detail.responseBody, actor?.memberId ?? null);
      // Keep the watermark monotonic — a later receipt can only move it forward.
      st.watermark = Math.max(st.watermark || 0, wm);
      console.log("[HL-DBG] SEEN watermark computed =", wm, "-> st.watermark", st.watermark); // [HL-DBG]
      // The reader IS the recipient — capture them even if they never replied.
      const seenParticipant = extractOtherParticipant(detail.responseBody, actor?.memberId ?? null);
      if (seenParticipant) {
        st.hint = {
          id: seenParticipant.id ?? st.hint?.id ?? null,
          name: seenParticipant.name ?? st.hint?.name ?? null,
          profileUrl: seenParticipant.profileUrl ?? st.hint?.profileUrl ?? null,
        };
      }
    } else {
      return;
    }

    convState.set(key, st);
    await recordIfChanged(key);
  } catch (e) {
    if (extensionAlive()) {
      console.error("[HL-DBG] handleEvent threw:", e); // [HL-DBG]
      dwarn("[msg-tracker] failed:", e);
    }
  }
}

export function useLinkedInMessageActivityTracker() {
  useEffect(() => {
    const onEvent = (e: Event) => {
      void handleEvent((e as CustomEvent).detail);
    };
    window.addEventListener("HL_NETWORK_CALL", onEvent as EventListener);
    return () =>
      window.removeEventListener("HL_NETWORK_CALL", onEvent as EventListener);
  }, []);
}
