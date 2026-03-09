import React, { useEffect, useState } from "react";
import { useLinkedInMessageSync } from "../hooks/useLinkedInMessageSync";
import { useTheme } from "../context/ThemeContext";

const TOAST_DURATION_MS = 3000;

// type MessageSyncStatus = {
//   contactExists: boolean;
//   contactId?: string;
//   hasSyncedMessages: boolean;
//   latestMessageTimestamp?: string;
//   totalMessages: number;
// };

export function MessageSyncButton() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const {
    conversationKey,
    // messages,
    syncMessagesToServer,
    // checkCurrentConversationMessageSync,
    isButtonDisabled,
  } = useLinkedInMessageSync();

  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // const [status, setStatus] = useState<MessageSyncStatus | null>(null);
  // const [checkingStatus, setCheckingStatus] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({ show: false, message: "", type: "success" });

  // The conversationKey for which `status` is currently valid
  // const statusKeyRef = useRef<string | null>(null);

  const checkAuthStatus = async () => {
    setCheckingAuth(true);
    try {
      const result = await chrome.storage.local.get(["user"]);
      const user = result.user as { token?: string } | undefined;
      setIsLoggedIn(!!user?.token);
    } catch (err) {
      console.error("[Scrapper Debug] Auth check failed:", err);
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();

    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.user) {
        checkAuthStatus();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleLoginClick = () => {
    chrome.runtime.sendMessage({ action: "openPopup" });
  };

  // Reset synced state when new messages are detected (isButtonDisabled flips back to false)
  useEffect(() => {
    if (!isButtonDisabled && synced) {
      setSynced(false);
    }
  }, [isButtonDisabled, synced]);

  // Fetch message-sync status ONCE per conversationKey per component instance.
  // Also ensure that *until* we have a status for the current key,
  // we treat the UI as "loading" (loader instead of button).
  // useLayoutEffect(() => {
  //   let cancelled = false;

  //   const run = async () => {
  //     if (!conversationKey) {
  //       statusKeyRef.current = null;
  //       setStatus(null);
  //       setCheckingStatus(false);
  //       return;
  //     }

  //     if (!isLoggedIn) {
  //       // Not logged in: don't call /check-messages, clear status for this key
  //       statusKeyRef.current = null;
  //       setStatus(null);
  //       setCheckingStatus(false);
  //       return;
  //     }

  //     // If we already have status for this key, and we're not currently checking, do nothing
  //     if (statusKeyRef.current === conversationKey && !checkingStatus) {
  //       return;
  //     }

  //     setCheckingStatus(true);

  //     try {
  //       const nextStatus = await checkCurrentConversationMessageSync();
  //       if (cancelled) return;

  //       statusKeyRef.current = conversationKey;
  //       setStatus(nextStatus);
  //       console.log("[Scrapper Debug] Message sync status:", nextStatus);
  //     } catch (err) {
  //       if (!cancelled) {
  //         console.error("[Scrapper Debug] Failed to check message sync:", err);
  //         statusKeyRef.current = conversationKey;
  //         setStatus(null);
  //       }
  //     } finally {
  //       if (!cancelled) {
  //         setCheckingStatus(false);
  //       }
  //     }
  //   };

  //   void run();
  //   return () => {
  //     cancelled = true;
  //   };
  // }, [conversationKey, checkCurrentConversationMessageSync, isLoggedIn]);

  // Case 3: if there are no newer messages than latestMessageTimestamp,
  // auto-mark the UI as "Synced".
  // useEffect(() => {
  //   if (
  //     !status ||
  //     !status.contactExists ||
  //     !status.hasSyncedMessages ||
  //     !status.latestMessageTimestamp
  //   ) {
  //     return;
  //   }

  //   const cutoffMs = Date.parse(status.latestMessageTimestamp);
  //   if (Number.isNaN(cutoffMs)) {
  //     return;
  //   }

  //   const hasNewerMessage = messages.some(
  //     (msg) =>
  //       typeof msg.deliveredAt === "number" &&
  //       !Number.isNaN(msg.deliveredAt) &&
  //       msg.deliveredAt > cutoffMs,
  //   );

  //   if (!hasNewerMessage) {
  //     setSynced(true);
  //   }
  // }, [status, messages]);

  // auto-dismiss toast
  useEffect(() => {
    if (!toast.show) return;
    const t = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [toast.show]);

  const label = syncing ? "Syncing…" : synced ? "Synced" : "Sync messages";
  const showLoader = conversationKey === null;

  const disabled = showLoader || syncing || isButtonDisabled;

  const onClick = async () => {
    if (disabled) return;

    setSyncing(true);
    try {
      const didSync = await syncMessagesToServer();
      setSynced(true);
      setToast({
        show: true,
        message: didSync
          ? "Messages synced successfully!"
          : "Already synced — no new messages",
        type: "success",
      });
    } catch {
      setToast({
        show: true,
        message: "Failed to sync messages",
        type: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <style>
        {`
          * { box-sizing: border-box; }

          @keyframes hl-toast-slide {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes hl-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* This should be mounted in a container that is inserted above the message <form>. */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          marginBottom: "8px",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {checkingAuth ? (
          // Global auth check in progress
          <div
            style={{
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid rgba(148,163,184,0.6)",
                borderTop: "2px solid rgba(148,163,184,1)",
                animation: "hl-spin 0.7s linear infinite",
              }}
            />
          </div>
        ) : !isLoggedIn ? (
          // Not logged in: show Login button, do not call /check-messages
          <button
            type="button"
            onClick={handleLoginClick}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "16px",
              border: "none",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.2s",
              whiteSpace: "nowrap",
              cursor: "pointer",
              userSelect: "none",
              lineHeight: 1.1,
              boxShadow: isDark
                ? "0 2px 10px rgba(0,0,0,0.35)"
                : "0 2px 10px rgba(0,0,0,0.10)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 4px 8px rgba(102, 126, 234, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Login to sync messages
          </button>
        ) : showLoader ? (
          // Logged in but status for this conversation is still loading
          <div
            style={{
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid rgba(148,163,184,0.6)",
                borderTop: "2px solid rgba(148,163,184,1)",
                animation: "hl-spin 0.7s linear infinite",
              }}
            />
          </div>
        ) : (
          // Logged in + status ready: normal sync button
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "16px",
              border: "none",
              background: disabled
                ? "#cbd5e0"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.2s",
              whiteSpace: "nowrap",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.75 : 1,
              userSelect: "none",
              lineHeight: 1.1,
              boxShadow: isDark
                ? "0 2px 10px rgba(0,0,0,0.35)"
                : "0 2px 10px rgba(0,0,0,0.10)",
            }}
            onMouseEnter={(e) => {
              if (disabled) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 4px 8px rgba(102, 126, 234, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {syncing && (
              <span
                aria-hidden="true"
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.6)",
                  borderTop: "2px solid rgba(255,255,255,1)",
                  animation: "hl-spin 0.7s linear infinite",
                }}
              />
            )}
            {label}
          </button>
        )}
      </div>

      {toast.show && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 2147483647,
            background: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: "10px",
            boxShadow: isDark
              ? "0 10px 30px rgba(0,0,0,0.55)"
              : "0 10px 30px rgba(0,0,0,0.18)",
            fontSize: "13px",
            fontWeight: 600,
            animation: "hl-toast-slide 0.25s ease-out",
            pointerEvents: "auto",
            maxWidth: "320px",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
