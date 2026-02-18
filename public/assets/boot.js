/**
 * Boot Script
 * Injects antibot script into page context at document_start
 * Must run before LinkedIn's scripts load
 */

if (document.contentType === "text/html") {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("assets/antibot.js");
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}
