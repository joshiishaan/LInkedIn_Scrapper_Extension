import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMessengerConversationMessages,
  fetchMessengerConversationMessagesWithVariables,
} from "../utils/linkedinApi";
import { linkedinApi } from "../services/api";
import {
  type HlNetworkCallDetail,
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

export function useLinkedInMessageSync() {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const lastVariablesRef = useRef<string | null>(null);
  const lastHeadersRef = useRef<Record<string, string> | null>(null);
  const lastLoggedCountRef = useRef(0);
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
        console.error("Active Voyager messaging fetch failed (with variables):", err);
        return;
      }
    }

    const parsed = parseProfileUrnAndThreadIdFromConversationKey(conversationKey);
    if (!parsed) return;

    try {
      const fresh = await fetchMessengerConversationMessages(
        parsed.profileUrnNumeric,
        parsed.threadId,
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
        console.warn("[Scrapper Debug] Cannot sync: missing sender or recipient.", { sender, recipient });
        return false;
      }

      if (!sender.profileUrl || !recipient.profileUrl) {
        console.warn("[Scrapper Debug] Cannot sync: missing profileUrl.", { sender, recipient });
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
            distance: nonEmpty(msgSender.distance ?? undefined, isSelf ? "SELF" : "UNKNOWN"),
          },
          receiver: {
            name: nonEmpty(msgReceiver.name, "Unknown"),
            profileUrl: msgReceiver.profileUrl as string,
            distance: nonEmpty(msgReceiver.distance ?? undefined, isSelf ? "UNKNOWN" : "SELF"),
          },
        };
      });

      const body = { conversationKey, messages: payloadMessages };
      console.log("[Scrapper Debug] Syncing messages to backend:", body);

      try {
        await linkedinApi.upsertMessages(body);
        console.log("[Scrapper Debug] upsert-messages succeeded.");

        const maxTs = messages.reduce(
          (max: number, msg) =>
            typeof msg.deliveredAt === "number" && !Number.isNaN(msg.deliveredAt)
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

    console.group(`[HubLead-style] Loaded LinkedIn messages for conversation ${conversationKey}`);
    console.log("Participants (approx):", { sender, recipient });
    console.table(
      newMessages.map((msg) => ({
        ...simplifyMessage(msg),
        senderDistance: msg.sender?.participantType?.member?.distance ?? null,
        receiverName: recipient?.name ?? null,
        receiverProfileUrl: recipient?.profileUrl ?? null,
      })),
    );
    console.groupEnd();

    lastLoggedCountRef.current = messages.length;
    setIsButtonDisabled(true);
  }, [conversationKey, messages]);

  useEffect(() => {
    const handler = (e: Event) => handleNetworkCall(e);
    window.addEventListener("HL_NETWORK_CALL", handler as EventListener);
    return () => window.removeEventListener("HL_NETWORK_CALL", handler as EventListener);
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
    logNewMessagesToConsole,
    activeFetchCurrentConversation,
    syncMessagesToServer,
  };
}
