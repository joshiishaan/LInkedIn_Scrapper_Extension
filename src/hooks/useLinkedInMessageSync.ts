import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMessengerConversationMessages,
  fetchMessengerConversationMessagesWithVariables,
} from "../utils/linkedinApi";
import { linkedinApi } from "../services/api";
import { DEBUG, dlog } from "../utils/debug";
import {
  type HlNetworkCallEvent,
  type Party,
  deriveConversationParties,
  extractLoadedMessages,
  fallbackIdentifyRecipientFromDom,
  nonEmpty,
  normalizePartyProfileUrl,
  parseConversationKeyFromUrl,
  parseProfileUrnAndThreadIdFromConversationKey,
  simplifyMessage,
} from "../utils/messageSyncHelpers";

// ---------------------------------------------------------------------------
// Module-level cache — captures HL_NETWORK_CALL events the moment this module
// is evaluated (i.e. when the content script loads), BEFORE any component has
// mounted and registered its own listener.
//
// Problem solved: on SPA navigation LinkedIn fires its message-fetch network
// call before MessageSyncButton is injected into the DOM. The component-level
// listener misses the event, conversationKey stays null, and the button shows
// a spinner forever. The module-level listener below catches those early events
// so the component can seed its state from the cache on mount.
// ---------------------------------------------------------------------------
let _cachedKey: string | null = null;
let _cachedMessages: any[] = [];
let _cachedVariables: string | null = null;
let _cachedHeaders: Record<string, string> | null = null;

function _cacheNetworkCall(event: Event) {
  const e = event as HlNetworkCallEvent;
  const detail = e.detail;
  if (!detail || detail.statusCode >= 400) return;
  if (detail.type !== "HL_INTERNAL_LINKEDIN_MESSAGES") return;

  const key = parseConversationKeyFromUrl(detail.callUrl);
  if (!key) return;

  const loadedMessages = extractLoadedMessages(detail);
  if (!loadedMessages || loadedMessages.length === 0) return;

  _cachedKey = key;
  _cachedMessages = loadedMessages;
  try {
    const raw = new URL(detail.callUrl).searchParams.get("variables") || "";
    _cachedVariables = raw || null;
  } catch {
    _cachedVariables = null;
  }
  _cachedHeaders = detail.requestHeaders ?? null;
}

window.addEventListener("HL_NETWORK_CALL", _cacheNetworkCall as EventListener);

export function useLinkedInMessageSync() {
  // Seed from the module-level cache during INITIALISATION rather than in a
  // mount effect. The interceptor caches the last messenger response before
  // this hook mounts, so the previous code set that state inside useEffect —
  // which renders once with empty state, then immediately re-renders with the
  // real values (a cascading render React now warns about). Lazy initialisers
  // run exactly once, at the same point the effect would have, and land the
  // values in the FIRST render instead.
  const hasCache = _cachedKey !== null && _cachedMessages.length > 0;

  const [conversationKey, setConversationKey] = useState<string | null>(() =>
    hasCache ? _cachedKey : null,
  );
  const [messages, setMessages] = useState<any[]>(() =>
    hasCache ? _cachedMessages : [],
  );
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // useRef only honours its argument on the first render, so these seed once —
  // matching the old effect, which also guarded on hasCache before assigning.
  const lastVariablesRef = useRef<string | null>(
    hasCache ? _cachedVariables : null,
  );
  const lastHeadersRef = useRef<Record<string, string> | null>(
    hasCache ? _cachedHeaders : null,
  );
  const lastLoggedCountRef = useRef(0);
  const lastSyncedMaxTimestampRef = useRef<number | null>(null);

  const activeFetchCurrentConversation = useCallback(async () => {
    if (!conversationKey) return;

    setFetchError(null);
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
      } catch (err: any) {
        console.error("Active Voyager messaging fetch failed (with variables):", err);
        setFetchError(err?.message || "Failed to refresh messages. Please reload the page.");
        setIsButtonDisabled(false);
        return;
      }
    }

    const parsed =
      parseProfileUrnAndThreadIdFromConversationKey(conversationKey);
    if (!parsed) return;

    try {
      const fresh = await fetchMessengerConversationMessages(
        parsed.profileUrnNumeric,
        parsed.threadId,
      );
      setMessages(fresh);
      lastLoggedCountRef.current = 0;
      setIsButtonDisabled(false);
    } catch (err: any) {
      console.error("Active Voyager messaging fetch failed:", err);
      setFetchError(err?.message || "Failed to refresh messages. Please reload the page.");
      setIsButtonDisabled(false);
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

      try {
        const raw = new URL(detail.callUrl).searchParams.get("variables") || "";
        lastVariablesRef.current = raw || null;
      } catch {
        lastVariablesRef.current = null;
      }

      const loadedMessages = extractLoadedMessages(detail);
      if (!loadedMessages || loadedMessages.length === 0) return;

      if (conversationKey !== key) {
        setConversationKey(key);
        setMessages(loadedMessages);
        lastLoggedCountRef.current = 0;
        lastSyncedMaxTimestampRef.current = null;
        setIsButtonDisabled(false);
        return;
      }

      setMessages((prev) => {
        const prevCount = prev.length;
        const nextCount = loadedMessages.length;

        if (nextCount > prevCount) {
          setIsButtonDisabled(false);
          lastSyncedMaxTimestampRef.current = null;
          return loadedMessages;
        }

        if (lastSyncedMaxTimestampRef.current !== null) {
          const hasNewer = loadedMessages.some(
            (msg) =>
              typeof msg.deliveredAt === "number" &&
              !Number.isNaN(msg.deliveredAt) &&
              msg.deliveredAt > lastSyncedMaxTimestampRef.current!,
          );

          if (hasNewer) {
            const prevTimestamps = new Set(prev.map((m) => m.deliveredAt));
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

      const parties = deriveConversationParties(messages);
      let { sender, recipient } = parties;

      if (!recipient) {
        const domRecipient = await fallbackIdentifyRecipientFromDom();
        if (domRecipient) recipient = domRecipient;
      }

      const [normalizedSender, normalizedRecipient] = await Promise.all([
        normalizePartyProfileUrl(sender),
        normalizePartyProfileUrl(recipient),
      ]);

      sender = normalizedSender;
      recipient = normalizedRecipient;

      if (!sender || !recipient) {
        console.warn(
          "[Scrapper Debug] Cannot sync: missing sender or recipient.",
          { sender, recipient },
        );
        return false;
      }

      if (!sender.profileUrl || !recipient.profileUrl) {
        console.warn("[Scrapper Debug] Cannot sync: missing profileUrl.", {
          sender,
          recipient,
        });
        return false;
      }

      let validMessages = messages.filter((msg) => {
        const text = msg.body?.text ?? "";
        return (
          text.trim().length > 0 &&
          typeof msg.deliveredAt === "number" &&
          !Number.isNaN(msg.deliveredAt)
        );
      });

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
        console.warn("[Scrapper Debug] No valid messages to sync.");
        return false;
      }

      const payloadMessages = validMessages.map((msg) => {
        const isSelf = msg.sender?.participantType?.member?.distance === "SELF";
        const msgSender = isSelf ? sender! : recipient!;
        const msgReceiver = isSelf ? recipient! : sender!;

        return {
          text: (msg.body?.text ?? "").trim(),
          sentAt: new Date(msg.deliveredAt).toISOString(),
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

      let userTimeZone = "UTC";
      try {
        userTimeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        userTimeZone = "UTC";
      }

      const body = { conversationKey, messages: payloadMessages, userTimeZone };
      // `body` carries full message text — debug-gated so it never reaches a
      // user's console in a release build.
      dlog("[Scrapper Debug] Syncing messages to backend:", body);

      try {
        await linkedinApi.upsertMessages(body);
        dlog("[Scrapper Debug] upsert-messages succeeded.");

        const maxTs = messages.reduce(
          (max: number, msg) =>
            typeof msg.deliveredAt === "number" &&
            !Number.isNaN(msg.deliveredAt)
              ? Math.max(max, msg.deliveredAt)
              : max,
          -Infinity,
        );
        if (Number.isFinite(maxTs)) lastSyncedMaxTimestampRef.current = maxTs;

        setIsButtonDisabled(true);
        return true;
      } catch (err) {
        console.error("[Scrapper Debug] upsert-messages failed:", err);
        throw err;
      }
    },
    [conversationKey, messages],
  );

  // const checkCurrentConversationMessageSync = ...  (commented out — endpoint not yet implemented)

  const logNewMessagesToConsole = useCallback(async () => {
    if (!conversationKey || messages.length === 0) return;

    const start = lastLoggedCountRef.current;
    if (start >= messages.length) {
      setIsButtonDisabled(true);
      return;
    }

    const newMessages = messages.slice(start);
    const parties = deriveConversationParties(messages);
    const { sender } = parties;
    let { recipient }: { recipient: Party | null } = parties;

    if (!recipient) {
      const domRecipient = await fallbackIdentifyRecipientFromDom();
      if (domRecipient) recipient = domRecipient;
    }

    // Debug-only. This prints message bodies, participant names and profile
    // URLs — private DM content — so it must never run in a release build. The
    // whole block is guarded (not just switched to dlog) because the .map()
    // below allocates a full copy of every loaded message.
    if (DEBUG) {
      console.group(
        `[HubLead-style] Loaded LinkedIn messages for conversation ${conversationKey}`,
      );
      dlog("Participants (approx):", { sender, recipient });
      console.table(
        newMessages.map((msg) => ({
          ...simplifyMessage(msg),
          senderDistance: msg.sender?.participantType?.member?.distance ?? null,
          receiverName: recipient?.name ?? null,
          receiverProfileUrl: recipient?.profileUrl ?? null,
        })),
      );
      console.groupEnd();
    }

    lastLoggedCountRef.current = messages.length;
    setIsButtonDisabled(true);
  }, [conversationKey, messages]);

  // (Cache seeding now happens in the state initialisers above.)

  useEffect(() => {
    const handler = (e: Event) => handleNetworkCall(e);
    window.addEventListener("HL_NETWORK_CALL", handler as EventListener);
    return () =>
      window.removeEventListener("HL_NETWORK_CALL", handler as EventListener);
  }, [handleNetworkCall]);

  // DOM observer: detects real-time messages delivered via WebSocket (not interceptable).
  // Uses count-based check to avoid false positives from LinkedIn re-rendering timestamps.
  useEffect(() => {
    if (!isButtonDisabled || !conversationKey) return;

    const container =
      document.querySelector("[id^='message-thread-']") ??
      document.querySelector(".msg-convo-wrapper");
    if (!container) return;

    const timeCountAtSync = container.querySelectorAll("time").length;

    const observer = new MutationObserver(() => {
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
    fetchError,
    logNewMessagesToConsole,
    activeFetchCurrentConversation,
    syncMessagesToServer,
  };
}
