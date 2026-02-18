/**
 * Background Service Worker
 * Handles extension lifecycle events and message passing
 */

// Log when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle profile fetch request
  if (message.type === "FETCH_PROFILE") {
    sendResponse({ success: true });
  }

  // Open extension popup programmatically
  if (message.action === "openPopup") {
    chrome.action.openPopup();
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});
