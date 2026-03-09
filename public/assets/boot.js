// public/assets/boot.js
/**
 * Boot Script
 * Injects antibot + interceptor scripts into page context at document_start
 */

if (document.contentType === "text/html") {
  // Anti-bot
  const antibot = document.createElement("script");
  antibot.src = chrome.runtime.getURL("assets/antibot.js");
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
