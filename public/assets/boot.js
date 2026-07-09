// public/assets/boot.js
/**
 * Boot Script
 * Injects the antibot script into page context at document_start.
 *
 * NOTE: the network interceptor is NO LONGER injected here. It is registered as
 * a dedicated MAIN-world content script (see manifest.json) so Chrome installs
 * the fetch/XHR hook *before any page script runs* at document_start. Appending
 * it as an external <script src> (the old approach) loaded asynchronously and
 * raced LinkedIn's app bundle — on a cold load the bundle could capture
 * window.fetch first, so tracking only worked after a soft refresh (once the
 * script was disk-cached and won the race). The MAIN-world content script has
 * no such gap. antibot.js stays here because it needs a chrome.runtime URL that
 * a MAIN-world content script cannot read.
 *
 * Guarded so it only injects once per page (isolated-world flag). This matters
 * because the background worker can re-inject boot.js into an already-open tab;
 * without the guard we'd append the page-context script twice. antibot.js is
 * itself idempotent too, so a double-injection during the guard-flag transition
 * still can't crash the page.
 */

if (!window.__hlBootInstalled && document.contentType === "text/html") {
  window.__hlBootInstalled = true;

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
}
