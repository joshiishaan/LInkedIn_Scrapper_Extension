// public/assets/boot.js
/**
 * Boot Script
 * Injects antibot + interceptor scripts into page context at document_start
 */

if (document.contentType === "text/html") {
  // Anti-bot
  const antibot = document.createElement("script");
  antibot.src = chrome.runtime.getURL("assets/antibot.js");
  // Pass the extension's index.js URL so antibot.js can redirect bot-detection
  // fetches to it. antibot.js runs in page context and has no access to
  // chrome.runtime, so we smuggle the URL via a data attribute read via
  // document.currentScript before the element is removed.
  antibot.dataset.indexUrl = chrome.runtime.getURL("index.js");
  antibot.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(antibot);

  // Messaging interceptor
  const interceptor = document.createElement("script");
  interceptor.src = chrome.runtime.getURL("assets/interceptor.js");
  interceptor.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(interceptor);
}
