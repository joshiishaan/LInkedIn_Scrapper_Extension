// src/hooks/useLinkedInMessageSync.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMessengerConversationMessages,
  fetchMessengerConversationMessagesWithVariables,
} from "../utils/linkedinApi";
import { linkedinApi } from "../services/api";
import { fetchLinkedInProfile } from "../utils/linkedinApi";

type HlNetworkCallDetail = {
  type: string;
  pageUrl: string;
  callUrl: string;
  method?: string;
  requestBody?: any;
  responseBody?: any;
  statusCode: number;
  timestamp?: number;
  requestHeaders?: Record<string, string>;
};

type Party = {
  urn: string | null;
  name: string;
  profileUrl: string | null;
  distance?: string | null;
};

type HlNetworkCallEvent = CustomEvent<HlNetworkCallDetail>;

type RawMessage = any;

function extractMemberInfo(participant: any) {
  const member = participant?.participantType?.member;
  if (!member) {
    return {
      name: "Unknown",
      profileUrl: null as string | null,
    };
  }

  const first = member.firstName?.text ?? "";
  const last = member.lastName?.text ?? "";
  return {
    name: `${first} ${last}`.trim() || "Unknown",
    profileUrl: member.profileUrl ?? null,
  };
}

// Extract the bit after "/in/" from a LinkedIn profile URL
function getProfileSegmentFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;

  // Try via URL parsing first
  try {
    const u = new URL(url, "https://www.linkedin.com");
    const match = u.pathname.match(/\/in\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    // Fallback regex on the raw string
    const match = `${url}`.match(/linkedin\.com\/in\/([^/?#]+)/);
    return match ? match[1] : null;
  }
}

// Use LinkedIn profile API to convert internal /in/ACoA... URLs to vanity /in/<publicIdentifier>/
async function normalizePartyProfileUrl(
  party: Party | null,
): Promise<Party | null> {
  if (!party || !party.profileUrl) return party;

  const segment = getProfileSegmentFromUrl(party.profileUrl);
  if (!segment) return party;

  try {
    const profile = await fetchLinkedInProfile(segment);
    const vanity = profile.basicInfo.publicIdentifier;

    if (!vanity) {
      return party;
    }

    const canonicalUrl = `https://www.linkedin.com/in/${vanity}/`;

    const fullName = [profile.basicInfo.firstName, profile.basicInfo.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ...party,
      profileUrl: canonicalUrl,
      // If we previously had "Unknown", upgrade to real name; otherwise keep existing name.
      name:
        party.name && party.name !== "Unknown"
          ? party.name
          : fullName || "Unknown",
    };
  } catch {
    // If LinkedIn API fails (rate limit, network, etc), just keep the original party
    return party;
  }
}

/**
 * Simplify a raw LinkedIn message object to just the main fields.
 *
 * For “receiver”, we approximate it as “the other side of the conversation”;
 * in practice you’ll often just care about sender + text + timestamp.
 */
function simplifyMessage(msg: RawMessage) {
  const { name: senderName, profileUrl: senderProfileUrl } = extractMemberInfo(
    msg.sender || msg.actor,
  );

  // These fields may require extra context (participants list); for now, we
  // expose the conversation URN as a receiver identifier.
  const conversationUrn =
    msg.conversation?.entityUrn ?? msg.backendConversationUrn ?? null;

  return {
    text: msg.body?.text ?? "",
    senderName,
    senderProfileUrl,
    // You can treat conversationUrn as receiver/conversation id
    conversationUrn,
    sentAt: msg.deliveredAt ? new Date(msg.deliveredAt).toISOString() : null,
  };
}

function deriveConversationParties(messages: RawMessage[]): {
  sender: Party | null;
  recipient: Party | null;
} {
  if (!messages.length) return { sender: null, recipient: null };

  // Find any message where LinkedIn marks the sender as SELF
  const selfMsg = messages.find(
    (m) => m.sender?.participantType?.member?.distance === "SELF",
  );
  const otherMsg = messages.find(
    (m) => m.sender?.participantType?.member?.distance !== "SELF",
  );

  const buildParty = (sender: any): Party | null => {
    if (!sender) return null;
    const member = sender.participantType?.member;
    const first = member?.firstName?.text ?? "";
    const last = member?.lastName?.text ?? "";
    return {
      urn: sender.hostIdentityUrn ?? null,
      name: `${first} ${last}`.trim() || "Unknown",
      profileUrl: member?.profileUrl ?? null,
      distance: member?.distance ?? null,
    };
  };

  const sender = buildParty(selfMsg?.sender);
  const recipient = buildParty(otherMsg?.sender);

  return { sender, recipient };
}

// New helper: approximate receiver from the LinkedIn messaging UI DOM
async function fallbackIdentifyRecipientFromDom(): Promise<Party | null> {
  try {
    // 1. Try a visible profile link in the thread header (1:1 chat)
    // Adjust selectors based on what you see in the DOM inspector.
    const headerLink =
      document.querySelector<HTMLAnchorElement>(
        'a[href*="/in/"]:not([data-control-name*="actor"])',
      ) ||
      document.querySelector<HTMLAnchorElement>(
        '[data-control-name="view_profile"], a.msg-thread__person-card__link',
      );

    let href = headerLink?.getAttribute("href") ?? null;
    if (!href) return null;

    // Normalize to absolute LinkedIn URL
    if (href.startsWith("/")) {
      href = `https://www.linkedin.com${href}`;
    }

    return {
      urn: null, // You can parse URN if you later add a helper
      name: "Unknown", // You could also read nearby name elements from DOM
      profileUrl: href,
      distance: null,
    };
  } catch {
    return null;
  }
}

// Ensure we always send a non-empty string (backend validators require .notEmpty())
function nonEmpty(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

// Inside useLinkedInMessageSync.ts (or a shared util)
function parseProfileUrnAndThreadIdFromConversationKey(
  conversationKey: string,
): {
  profileUrnNumeric: string;
  threadId: string;
} | null {
  const [part1, part2] = conversationKey.split("|");
  if (!part1 || !part2) return null;

  // part1 looks like:
  // (conversationUrn:urn:li:msg_conversation:(urn:li:fsd_profile:<profileUrn>,2-
  const match = part1.match(/fsd_profile:(\d+)/);
  const profileUrnNumeric = match?.[1];
  const threadId = part2;

  if (!profileUrnNumeric || !threadId) return null;

  return { profileUrnNumeric, threadId };
}

// Parse conversation key exactly like HubLead does for HL_INTERNAL_LINKEDIN_MESSAGES
function parseConversationKeyFromUrl(callUrl: string): string | null {
  try {
    const url = new URL(callUrl);

    const rawVariables = url.searchParams.get("variables") || "";
    const variables = rawVariables.split(",count:")[0];

    // Expected pattern:
    // (conversationUrn:urn:li:msg_conversation:(urn:li:fsd_profile:<profileUrn>,2-<threadId>))
    // Split on ",2-" into [part1, part2]
    const split = variables.split(",2-");
    if (split.length < 2) return null;

    const part1 = split[0]; // includes the profile URN portion
    // Remove any trailing ')' and other parentheses from the trailing part
    const part2 = split[1].replace(/[()]/g, "");

    return `${part1}|${part2}`; // single string key; you can also return a tuple if you prefer
  } catch {
    return null;
  }
}

// "Loaded" messages = elements that are truthy and have some content;
// you can tighten this filter if you know the exact LinkedIn shape.
function extractLoadedMessages(detail: HlNetworkCallDetail): any[] {
  const elements =
    detail.responseBody?.data?.messengerMessagesBySyncToken?.elements ?? [];

  return (elements as any[]).filter((el) => !!el);
}

export function useLinkedInMessageSync() {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const lastVariablesRef = useRef<string | null>(null);
  const lastHeadersRef = useRef<Record<string, string> | null>(null);

  // How many messages we already logged to console for the current conversation
  const lastLoggedCountRef = useRef(0);

  // Tracks the max deliveredAt (ms) of messages at the time of last successful sync.
  // When non-null we are in "synced" state and watch for newer incoming messages.
  const lastSyncedMaxTimestampRef = useRef<number | null>(null);

  const activeFetchCurrentConversation = useCallback(async () => {
    if (!conversationKey) return;

    const variablesString = lastVariablesRef.current;
    if (variablesString) {
      try {
        const fresh = await fetchMessengerConversationMessagesWithVariables(
          variablesString,
          lastHeadersRef.current,
        );
        setMessages(fresh);
        lastLoggedCountRef.current = 0;
        setIsButtonDisabled(false);
        return;
      } catch (err) {
        console.error(
          "Active Voyager messaging fetch failed (with variables):",
          err,
        );
        return;
      }
    }

    // Fallback to old profileUrn/threadId path if needed...
    const parsed =
      parseProfileUrnAndThreadIdFromConversationKey(conversationKey);
    if (!parsed) return;

    const { profileUrnNumeric, threadId } = parsed;

    try {
      const fresh = await fetchMessengerConversationMessages(
        profileUrnNumeric,
        threadId,
      );
      setMessages(fresh);
      lastLoggedCountRef.current = 0;
      setIsButtonDisabled(false);
    } catch (err) {
      console.error("Active Voyager messaging fetch failed:", err);
    }
  }, [conversationKey]);

  const handleNetworkCall = useCallback(
    (event: Event) => {
      const e = event as HlNetworkCallEvent;
      const detail = e.detail;
      if (!detail || detail.statusCode >= 400) return;

      if (detail.type !== "HL_INTERNAL_LINKEDIN_MESSAGES") return;

      lastHeadersRef.current = detail.requestHeaders ?? null;

      const key = parseConversationKeyFromUrl(detail.callUrl);
      if (!key) return;

      console.log("[HubLead Debug] Interceptor key", {
        key,
        callUrl: detail.callUrl,
        variables: new URL(detail.callUrl).searchParams.get("variables"),
      });

      try {
        const url = new URL(detail.callUrl);
        const raw = url.searchParams.get("variables") || "";
        lastVariablesRef.current = raw || null;
      } catch {
        lastVariablesRef.current = null;
      }

      const loadedMessages = extractLoadedMessages(detail);

      if (!loadedMessages || loadedMessages.length === 0) {
        return;
      }

      // If conversation changed, reset state and allow button again
      if (conversationKey !== key) {
        setConversationKey(key);
        setMessages(loadedMessages);
        lastLoggedCountRef.current = 0;
        lastSyncedMaxTimestampRef.current = null;

        // New conversation → there are "unloaded" messages relative to our state,
        // so enable the button so user can log them.
        setIsButtonDisabled(false);
        return;
      }

      // Same conversation; detect new messages and enable the button.
      setMessages((prev) => {
        const prevCount = prev.length;
        const nextCount = loadedMessages.length;

        if (nextCount > prevCount) {
          // LinkedIn returned more messages than we had → clear sync state
          setIsButtonDisabled(false);
          lastSyncedMaxTimestampRef.current = null;
          return loadedMessages;
        }

        // After a sync, LinkedIn polls using a sync-token and returns ONLY new
        // messages (small count). Detect new messages by comparing timestamps
        // against the snapshot we took at sync time.
        if (lastSyncedMaxTimestampRef.current !== null) {
          const hasNewer = loadedMessages.some(
            (msg) =>
              typeof msg.deliveredAt === "number" &&
              !Number.isNaN(msg.deliveredAt) &&
              msg.deliveredAt > lastSyncedMaxTimestampRef.current!,
          );

          if (hasNewer) {
            // Merge genuinely new messages into the existing list so that
            // syncMessagesToServer can still derive parties from the full context.
            const prevTimestamps = new Set(
              prev.map((m) => m.deliveredAt),
            );
            const genuinelyNew = loadedMessages.filter(
              (m) => !prevTimestamps.has(m.deliveredAt),
            );
            setIsButtonDisabled(false);
            lastSyncedMaxTimestampRef.current = null;
            return genuinelyNew.length > 0 ? [...prev, ...genuinelyNew] : prev;
          }
        }

        return prev;
      });
    },
    [conversationKey],
  );

  const syncMessagesToServer = useCallback(
    async (options?: { latestMessageTimestamp?: string }): Promise<boolean> => {
      if (!conversationKey || messages.length === 0) {
        console.warn("[Scrapper Debug] No conversation/messages to sync.");
        return false;
      }

      // 1) Resolve conversation-level parties (me vs other)
      const parties = deriveConversationParties(messages);
      let { sender, recipient } = parties;

      // 2) If recipient is still null (only SELF messages), try DOM fallback first
      if (!recipient) {
        const domRecipient = await fallbackIdentifyRecipientFromDom();
        if (domRecipient) {
          recipient = domRecipient;
        }
      }

      // 3) Normalize both parties' profileUrl to canonical vanity URL via LinkedIn API
      const [normalizedSender, normalizedRecipient] = await Promise.all([
        normalizePartyProfileUrl(sender),
        normalizePartyProfileUrl(recipient),
      ]);

      sender = normalizedSender;
      recipient = normalizedRecipient;

      if (!sender || !recipient) {
        console.warn(
          "[Scrapper Debug] Cannot sync: missing sender or recipient party.",
          { sender, recipient },
        );
        return false;
      }

      if (!sender.profileUrl || !recipient.profileUrl) {
        console.warn(
          "[Scrapper Debug] Cannot sync: missing profileUrl for sender/recipient.",
          { sender, recipient },
        );
        return false;
      }

      // 4) Only keep messages that have text and a valid deliveredAt
      let validMessages = messages.filter((msg) => {
        const text = msg.body?.text ?? "";
        return (
          text.trim().length > 0 &&
          typeof msg.deliveredAt === "number" &&
          !Number.isNaN(msg.deliveredAt)
        );
      });

      // If latestMessageTimestamp provided, only send messages after that
      if (options?.latestMessageTimestamp) {
        const cutoffMs = Date.parse(options.latestMessageTimestamp);
        if (!Number.isNaN(cutoffMs)) {
          validMessages = validMessages.filter(
            (msg) =>
              typeof msg.deliveredAt === "number" &&
              !Number.isNaN(msg.deliveredAt) &&
              msg.deliveredAt > cutoffMs,
          );
        }
      }

      if (validMessages.length === 0) {
        console.warn(
          "[Scrapper Debug] No valid messages to sync (empty text / missing sentAt / all before cutoff).",
        );
        return false;
      }

      // 5) Build payload respecting backend validators (names & distances non-empty)
      const payloadMessages = validMessages.map((msg) => {
        const isSelf = msg.sender?.participantType?.member?.distance === "SELF";

        const msgSender = isSelf ? sender! : recipient!;
        const msgReceiver = isSelf ? recipient! : sender!;

        const sentAtIso = new Date(msg.deliveredAt).toISOString();
        const text = (msg.body?.text ?? "").trim();

        return {
          text,
          sentAt: sentAtIso,
          sender: {
            name: nonEmpty(msgSender.name, "Unknown"),
            profileUrl: msgSender.profileUrl as string,
            distance: nonEmpty(
              msgSender.distance ?? undefined,
              isSelf ? "SELF" : "UNKNOWN",
            ),
          },
          receiver: {
            name: nonEmpty(msgReceiver.name, "Unknown"),
            profileUrl: msgReceiver.profileUrl as string,
            distance: nonEmpty(
              msgReceiver.distance ?? undefined,
              isSelf ? "UNKNOWN" : "SELF",
            ),
          },
        };
      });

      const body = {
        conversationKey: conversationKey,
        messages: payloadMessages,
      };

      console.log("[Scrapper Debug] Syncing messages to backend:", body);

      try {
        await linkedinApi.upsertMessages(body);
        console.log("[Scrapper Debug] upsert-messages succeeded.");

        // Snapshot the max deliveredAt so we can re-enable the button the
        // moment LinkedIn polls and delivers a message newer than this.
        const maxTs = messages.reduce(
          (max: number, msg) =>
            typeof msg.deliveredAt === "number" && !Number.isNaN(msg.deliveredAt)
              ? Math.max(max, msg.deliveredAt)
              : max,
          -Infinity,
        );
        if (Number.isFinite(maxTs)) {
          lastSyncedMaxTimestampRef.current = maxTs;
        }

        setIsButtonDisabled(true);
        return true;
      } catch (err) {
        console.error("[Scrapper Debug] upsert-messages failed:", err);
        throw err;
      }
    },
    [conversationKey, messages],
  );

  // const checkCurrentConversationMessageSync =
  //   useCallback(async (): Promise<MessageSyncStatus | null> => {
  //     if (!conversationKey || messages.length === 0) {
  //       console.warn(
  //         "[Scrapper Debug] No conversation/messages to check sync status for.",
  //       );
  //       return null;
  //     }

  //     // 1) Resolve conversation‑level parties (same as syncMessagesToServer)
  //     const parties = deriveConversationParties(messages);
  //     let { recipient } = parties;

  //     // 2) Fallback to DOM if we don't see a non‑SELF sender
  //     if (!recipient) {
  //       const domRecipient = await fallbackIdentifyRecipientFromDom();
  //       if (domRecipient) {
  //         recipient = domRecipient;
  //       }
  //     }

  //     if (!recipient) {
  //       console.warn(
  //         "[Scrapper Debug] Cannot check message sync: missing recipient party.",
  //       );
  //       return null;
  //     }

  //     // 3) Normalize recipient profile URL to canonical vanity URL
  //     const normalizedRecipient = await normalizePartyProfileUrl(recipient);
  //     if (!normalizedRecipient?.profileUrl) {
  //       console.warn(
  //         "[Scrapper Debug] Cannot check message sync: missing recipient profileUrl.",
  //       );
  //       return null;
  //     }

  //     // 4) Call backend to check sync status
  //     const res = await linkedinApi.checkMessages(
  //       normalizedRecipient.profileUrl,
  //     );

  //     return res.data;
  //   }, [conversationKey, messages]);

  // Public API: log only "newly loaded" messages (not yet logged) for current conversation
  const logNewMessagesToConsole = useCallback(async () => {
    if (!conversationKey || messages.length === 0) return;

    const start = lastLoggedCountRef.current;
    if (start >= messages.length) {
      setIsButtonDisabled(true);
      return;
    }

    const newMessages = messages.slice(start);

    // 1) Try to resolve parties from messages (HubLead primary path)
    const parties = deriveConversationParties(messages);
    const { sender } = parties;
    let { recipient } = parties; // you can reassign this later

    // 2) If recipient is still null (only SELF messages), try DOM fallback
    if (!recipient) {
      const domRecipient = await fallbackIdentifyRecipientFromDom();
      if (domRecipient) {
        recipient = domRecipient;
      }
    }

    console.group(
      `[HubLead-style] Loaded LinkedIn messages for conversation ${conversationKey}`,
    );

    console.log("Participants (approx):", { sender, recipient });

    const simplified = newMessages.map((msg) => ({
      ...simplifyMessage(msg),
      senderDistance: msg.sender?.participantType?.member?.distance ?? null,
      receiverName: recipient?.name ?? null,
      receiverProfileUrl: recipient?.profileUrl ?? null,
    }));
    console.table(simplified);

    console.groupEnd();

    lastLoggedCountRef.current = messages.length;
    setIsButtonDisabled(true);
  }, [conversationKey, messages]);

  useEffect(() => {
    // Listen to HL_NETWORK_CALL events dispatched by interceptor.js
    const handler = (e: Event) => handleNetworkCall(e);
    window.addEventListener("HL_NETWORK_CALL", handler as EventListener);

    return () => {
      window.removeEventListener("HL_NETWORK_CALL", handler as EventListener);
    };
  }, [handleNetworkCall]);

  // Watch the active message thread DOM for new messages.
  // LinkedIn delivers real-time messages (sent and received) via WebSocket and
  // updates the DOM directly — no fetch request is made, so the interceptor never
  // fires. We observe DOM mutations instead.
  //
  // We use a COUNT-based check rather than "any <time> added":
  // LinkedIn re-renders existing message timestamps (e.g. "2 min ago" → "5 min ago")
  // on tab focus, which removes and re-adds <time> elements for old messages.
  // Comparing the count against a snapshot taken right after sync avoids that
  // false positive — only a genuinely new message increases the count.
  useEffect(() => {
    if (!isButtonDisabled || !conversationKey) return;

    const container =
      document.querySelector("[id^='message-thread-']") ??
      document.querySelector(".msg-convo-wrapper");

    if (!container) return;

    // Snapshot: how many <time> elements exist right now (all from already-synced messages).
    const timeCountAtSync = container.querySelectorAll("time").length;

    const observer = new MutationObserver(() => {
      // Only re-enable when a NEW message adds another <time> element.
      // Re-renders of existing timestamps leave the count unchanged.
      if (container.querySelectorAll("time").length > timeCountAtSync) {
        setIsButtonDisabled(false);
        lastSyncedMaxTimestampRef.current = null;
        observer.disconnect();
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isButtonDisabled, conversationKey]);

  return {
    conversationKey,
    messages,
    isButtonDisabled,
    logNewMessagesToConsole,
    activeFetchCurrentConversation,
    syncMessagesToServer,
    // checkCurrentConversationMessageSync,
  };
}
