/**
 * Derive per-conversation messaging metrics from LinkedIn's messenger data.
 *
 * Each `messengerMessages` element carries `actor.hostIdentityUrn`
 * (urn:li:fsd_profile:ACoAA… = sender), `deliveredAt` (epoch ms), and the
 * sender's name under `actor.participantType.member`. Direction is decided by
 * comparing the sender's ACoAA id to the logged-in user's own id.
 *
 * Metrics:
 *   - sentCount      : messages from the user
 *   - receivedCount  : messages from the other party
 *   - followUpCount  : user messages sent right after another user message with
 *                      no reply in between (a re-ping)
 *   - hasReply       : the other party sent a message after one of the user's
 *   - isConversation : >2 messages total and both sides participated
 *   - readCount      : filled separately from seen-receipts (0 here)
 */

import type { MessageActivityPayload, MessageEventEntry } from "../services/messagesApi";

function extractAco(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.match(/ACoAA[A-Za-z0-9_-]+/)?.[0] ?? null;
}

function memberName(member: any): string | null {
  const first = member?.firstName?.text ?? "";
  const last = member?.lastName?.text ?? "";
  const name = `${first} ${last}`.trim();
  return name || null;
}

// LinkedIn's messenger member carries a `profileUrl`. Normalize it to the
// canonical /in/<vanity>/ form when we can, otherwise keep it as-is.
function memberProfileUrl(member: any): string | null {
  const raw = member?.profileUrl;
  if (typeof raw !== "string" || !raw) return null;
  const seg = raw.match(/\/in\/([^/?#]+)/)?.[1];
  return seg ? `https://www.linkedin.com/in/${seg}/` : raw;
}

// From a messengerSeenReceipts response, the latest timestamp the OTHER party
// (not us) has read up to. Our messages delivered at/before this are "read".
export function extractReadWatermark(
  seenElements: any[],
  selfId: string | null,
): number {
  let max = 0;
  for (const r of Array.isArray(seenElements) ? seenElements : []) {
    const seer = extractAco(r?.seenByParticipant?.hostIdentityUrn ?? "");
    if (seer && seer !== selfId) {
      const at = typeof r?.seenAt === "number" ? r.seenAt : 0;
      if (at > max) max = at;
    }
  }
  return max;
}

// The recipient's identity taken from seen-receipts. Works even when they never
// REPLIED, as long as they've READ a message: `seenByParticipant` is the other
// party. Name/URL are included when LinkedIn embeds the member; otherwise null.
export function extractSeenParticipant(
  seenElements: any[],
  selfId: string | null,
): { id: string | null; name: string | null; profileUrl: string | null } | null {
  for (const r of Array.isArray(seenElements) ? seenElements : []) {
    const p = r?.seenByParticipant;
    const id = extractAco(p?.hostIdentityUrn ?? "");
    if (id && id !== selfId) {
      const member = p?.participantType?.member;
      return {
        id,
        name: memberName(member),
        profileUrl: memberProfileUrl(member),
      };
    }
  }
  return null;
}

// Authoritative participant identity mined from the conversation's OWN messenger
// response. Messenger queries are scoped to one conversation, so any non-self
// `participantType.member` in the payload is the other party — available even in
// a one-sided (no-reply) thread, and clean (real name fields, no DOM scraping).
export function extractOtherParticipant(
  responseBody: any,
  selfId: string | null,
): { id: string | null; name: string | null; profileUrl: string | null } | null {
  let found: { id: string | null; name: string | null; profileUrl: string | null } | null = null;
  let visited = 0;
  const walk = (node: any): void => {
    if (!node || typeof node !== "object" || found || visited > 10000) return;
    visited++;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const member = node.participantType?.member;
    const host = node.hostIdentityUrn;
    if (member && typeof host === "string") {
      const id = extractAco(host);
      if (id && id !== selfId) {
        found = { id, name: memberName(member), profileUrl: memberProfileUrl(member) };
        return;
      }
    }
    for (const k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
    }
  };
  walk(responseBody);
  return found;
}

// Participants for EACH conversation in a conversations response (single thread
// or the whole inbox list). Finds every conversation node by its "2-…" urn and
// pulls the non-self member from within that node. Keyed so the tracker can fill
// each thread's recipient — the reliable, DOM-free source for cold threads.
export function extractConversationParticipants(
  responseBody: any,
  selfId: string | null,
): Array<{ conversationKey: string; id: string | null; name: string | null; profileUrl: string | null }> {
  const byKey = new Map<
    string,
    { conversationKey: string; id: string | null; name: string | null; profileUrl: string | null }
  >();

  const keyFromUrn = (v: any): string | null => {
    if (typeof v !== "string") return null;
    if (v.indexOf("msg_conversation") < 0 && v.indexOf("2-") < 0) return null;
    return v.match(/2-[A-Za-z0-9_=\-]{5,}/)?.[0] ?? null;
  };

  // The other party within a single conversation node's subtree.
  const otherMemberIn = (
    node: any,
  ): { id: string | null; name: string | null; profileUrl: string | null } | null => {
    let found: { id: string | null; name: string | null; profileUrl: string | null } | null = null;
    let n = 0;
    const w = (x: any): void => {
      if (!x || typeof x !== "object" || found || n > 4000) return;
      n++;
      if (Array.isArray(x)) {
        for (const y of x) w(y);
        return;
      }
      const member = x.participantType?.member;
      const host = x.hostIdentityUrn;
      if (member && typeof host === "string") {
        const id = extractAco(host);
        if (id && id !== selfId) {
          found = { id, name: memberName(member), profileUrl: memberProfileUrl(member) };
          return;
        }
      }
      for (const k in x) if (Object.prototype.hasOwnProperty.call(x, k)) w(x[k]);
    };
    w(node);
    return found;
  };

  let visited = 0;
  const walk = (node: any): void => {
    if (!node || typeof node !== "object" || visited > 20000) return;
    visited++;
    if (Array.isArray(node)) {
      for (const y of node) walk(y);
      return;
    }
    const key =
      keyFromUrn(node.entityUrn) ??
      keyFromUrn(node.conversationUrn) ??
      keyFromUrn(node.backendUrn) ??
      keyFromUrn(node.dashEntityUrn);
    if (key && !byKey.has(key)) {
      const other = otherMemberIn(node);
      if (other) byKey.set(key, { conversationKey: key, ...other });
    }
    for (const k in node) if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
  };
  walk(responseBody);
  return Array.from(byKey.values());
}

// Shape-tolerant read watermark: walk the ENTIRE seen-receipts response for any
// node with a numeric `seenAt` whose reader is NOT us, and take the latest. This
// survives LinkedIn moving/renaming the top-level key (which broke the old
// fixed `messengerSeenReceiptsByConversation.elements` path).
export function extractReadWatermarkDeep(
  responseBody: any,
  selfId: string | null,
): number {
  let max = 0;
  let visited = 0;
  const walk = (node: any): void => {
    if (!node || typeof node !== "object" || visited > 15000) return;
    visited++;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node.seenAt === "number") {
      const p = node.seenByParticipant ?? node.participant ?? node.actor ?? node.reader;
      const seer = extractAco(p?.hostIdentityUrn ?? p?.entityUrn ?? "");
      // Count a receipt if it's clearly not us; if there's no resolvable reader
      // id at all (1:1 seen receipts sometimes omit it), still trust seenAt —
      // in a 1:1 thread the only other reader is the recipient.
      if ((!seer || seer !== selfId) && node.seenAt > max) max = node.seenAt;
    }
    for (const k in node) if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
  };
  walk(responseBody);
  return max;
}

export function deriveActivity(
  elements: any[],
  selfId: string | null,
  conversationKey: string,
  readWatermark = 0, // recipient's latest seenAt; our messages ≤ this are "read"
): MessageActivityPayload {
  const msgs = (Array.isArray(elements) ? elements : [])
    .map((e) => {
      const actor = e?.actor ?? e?.sender;
      const member = actor?.participantType?.member;
      return {
        senderAco: extractAco(actor?.hostIdentityUrn ?? actor?.entityUrn ?? ""),
        at: typeof e?.deliveredAt === "number" ? e.deliveredAt : 0,
        member,
        // LinkedIn tags the logged-in user's own messages with distance "SELF";
        // use it as a fallback when we couldn't resolve the user's ACoAA id.
        isSelfActor: member?.distance === "SELF",
      };
    })
    .filter((m) => m.at > 0)
    .sort((a, b) => a.at - b.at);

  let sentCount = 0;
  let receivedCount = 0;
  let followUpCount = 0;
  let readCount = 0;
  let hasReply = false;
  let prevSelf = false;
  let sawSelf = false; // true once the first SENT message has been walked
  let sawReceived = false; // true once the first RECEIVED message has been walked
  const events: MessageEventEntry[] = [];

  // Both identities: participant (receiver) and the app user's own (sender).
  let participantLinkedinId: string | null = null;
  let participantName: string | null = null;
  let participantProfileUrl: string | null = null;
  let selfLinkedinId: string | null = selfId; // baseline from identity fetch
  let selfName: string | null = null;
  let selfProfileUrl: string | null = null;

  for (const m of msgs) {
    const isSelf = (!!selfId && m.senderAco === selfId) || m.isSelfActor;
    const messageId = `${m.at}:${m.senderAco ?? ""}`;
    if (isSelf) {
      sentCount += 1;
      const isFollowUp = prevSelf; // consecutive self message = re-ping
      if (isFollowUp) followUpCount += 1;
      const isFirstTouch = !sawSelf; // the very first message WE ever sent here
      sawSelf = true;
      if (readWatermark > 0 && m.at <= readWatermark) readCount += 1; // seen by recipient
      prevSelf = true;
      if (!selfName) {
        selfLinkedinId = m.senderAco ?? selfLinkedinId;
        selfName = memberName(m.member);
        selfProfileUrl = memberProfileUrl(m.member);
      }
      events.push({
        messageId,
        type: "SENT",
        occurredAt: String(m.at),
        isFirstTouch,
        isFollowUp,
      });
    } else {
      receivedCount += 1;
      // The first reply from them, and only once we'd actually sent something.
      const isFirstReply = !sawReceived && sentCount > 0;
      if (sentCount > 0) hasReply = true; // they answered after we sent
      sawReceived = true;
      prevSelf = false;
      if (!participantLinkedinId) {
        participantLinkedinId = m.senderAco;
        participantName = memberName(m.member);
        participantProfileUrl = memberProfileUrl(m.member);
      }
      events.push({
        messageId,
        type: "RECEIVED",
        occurredAt: String(m.at),
        isFirstReply,
      });
    }
  }

  const total = msgs.length;
  const isConversation = total > 2 && sentCount > 0 && receivedCount > 0;

  return {
    conversationKey,
    ...(participantLinkedinId && { participantLinkedinId }),
    ...(participantName && { participantName }),
    ...(participantProfileUrl && { participantProfileUrl }),
    ...(selfLinkedinId && { selfLinkedinId }),
    ...(selfName && { selfName }),
    ...(selfProfileUrl && { selfProfileUrl }),
    sentCount,
    receivedCount,
    followUpCount,
    readCount,
    hasReply,
    isConversation,
    ...(msgs.length && { firstMessageAt: String(msgs[0].at) }),
    ...(msgs.length && { lastMessageAt: String(msgs[msgs.length - 1].at) }),
    events,
  };
}
