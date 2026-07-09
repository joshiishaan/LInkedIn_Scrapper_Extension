/**
 * Background Service Worker
 * Handles extension lifecycle events and message passing
 */

// LinkedIn URL patterns must mirror the content_scripts matches in the manifest.
const LINKEDIN_MATCHES = [
  "https://linkedin.com/*",
  "https://*.linkedin.com/*",
];

// When the extension is installed/updated, tabs that were ALREADY open do not
// get the content scripts auto-injected by Chrome — so the login wall never
// mounts and the page stays usable. Manually inject the same three pieces a
// fresh page load would run:
//   1. interceptor.js into the MAIN world (the page-context fetch/XHR hook).
//      Normally this is a document_start MAIN-world content script; for an
//      already-open tab we replay it via executeScript(world: "MAIN"). It self-
//      guards, so re-running it is harmless if the page later reloads.
//   2. boot.js (isolated world) — injects antibot.
//   3. content.js (isolated world) — the login wall + tracking hooks.
async function injectIntoExistingLinkedInTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: LINKEDIN_MATCHES });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        // MAIN-world interceptor first, across all frames (LinkedIn's SDUI runs
        // requests from same-origin iframes too), so the hook is present before
        // the isolated-world hooks that consume its events.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          world: "MAIN",
          files: ["assets/interceptor.js"],
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets/boot.js", "content.js"],
        });
      } catch (err) {
        // Discarded/restricted tabs can't be injected — skip them quietly.
        console.warn("[LinkedIn Scrapper] inject into existing tab failed:", err);
      }
    }
  } catch (err) {
    console.warn("[LinkedIn Scrapper] querying LinkedIn tabs failed:", err);
  }
}

// Log when extension is installed or updated, and close the "already-open tab"
// gap by injecting into existing LinkedIn tabs.
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
  void injectIntoExistingLinkedInTabs();
});

// Track whether the action popup is currently open. The popup opens a port
// named "popup" on mount; the port disconnects the instant the popup closes.
// We mirror that into chrome.storage.local so content scripts (the login wall)
// can react. Reset to false on startup in case a prior session left it stale.
chrome.storage.local.set({ popupOpen: false });

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  chrome.storage.local.set({ popupOpen: true });
  port.onDisconnect.addListener(() => {
    chrome.storage.local.set({ popupOpen: false });
  });
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
