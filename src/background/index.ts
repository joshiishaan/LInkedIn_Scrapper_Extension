/**
 * Background Service Worker
 * Handles extension lifecycle events and message passing
 */

// Log when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Catch unhandled promise rejections in the service worker context
self.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  console.error("[HubLead Background] Unhandled promise rejection:", event.reason);
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_PROFILE") {
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "openPopup") {
    try {
      chrome.action.openPopup();
      sendResponse({ success: true });
    } catch (err) {
      console.error("[HubLead] openPopup failed:", err);
      sendResponse({ success: false, error: "Failed to open popup" });
    }
    return false;
  }

  // Unknown message type — close the channel immediately
  sendResponse({ success: false, error: "Unknown message type" });
  return false;
});
