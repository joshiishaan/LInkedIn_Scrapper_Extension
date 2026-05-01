/**
 * Anti-bot Script
 * Bypasses LinkedIn's bot detection by intercepting fetch requests
 * Injected into page context before LinkedIn scripts load
 */

// Capture the extension's index.js URL while document.currentScript is still
// available (it becomes null after the script finishes executing). The URL is
// stamped onto the <script> element by boot.js because this file runs in page
// context and has no access to chrome.runtime.
const _extIndexUrl =
  document.currentScript && document.currentScript.dataset.indexUrl
    ? document.currentScript.dataset.indexUrl
    : null;

function getCookie(name) {
  const cookies = `; ${document.cookie}`.split(`; ${name}=`);
  if (cookies.length === 2) return cookies.pop().split(";").shift();
}

// Set Ember debug mode (LinkedIn uses Ember.js)
window.EmberENV = { _DEBUG_RENDER_TREE: true };

// Install the fetch proxy unconditionally so bot-detection requests are
// intercepted regardless of whether the li-protect cookie has been set yet.
// The proxy only rewrites URLs that match the known bot-detection pattern.
if (!window.fetchReplaced) {
  window.fetchReplaced = true;

  // Proxy fetch to intercept bot detection requests
  window.fetch = new Proxy(window.fetch, {
    apply: function (target, thisArg, args) {
      if (
        args.length > 0 &&
        typeof args[0] === "string" &&
        args[0].includes("lnokhhhekhiapce")
      ) {
        // Only rewrite when the li-protect cookie confirms we're in a protected
        // session AND we have a valid extension URL to redirect to.
        if (getCookie("li-protect") === "true" && _extIndexUrl) {
          args[0] = _extIndexUrl;
        }
      }
      return target.apply(thisArg, args);
    }
  });
}
