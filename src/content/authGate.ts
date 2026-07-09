/**
 * Auth Gate — login wall for LinkedIn pages.
 *
 * While the extension is installed but the user is NOT logged into our app, we
 * cover the LinkedIn page with a full-screen blocking overlay and mark the page
 * body `inert` so no interaction (mouse, keyboard, focus) reaches LinkedIn until
 * the user logs in via the popup.
 *
 * Enforcement scope: this only blocks the tab where our content script runs. A
 * user can still disable/remove the extension or use LinkedIn elsewhere — a
 * browser extension cannot prevent that. Within our surface, though, no action
 * is possible until authenticated.
 *
 * Written in vanilla DOM (no React) so a render error elsewhere can never take
 * the gate down, and appended to <html> (not <body>) so body-level rebuilds and
 * the `inert` flag we set on <body> don't affect the overlay itself.
 */

const GATE_ID = "linkedin-scrapper-auth-gate";
const LOGIN_ID = `${GATE_ID}-login`;
const HINT_ID = `${GATE_ID}-hint`;
const WAITING_ID = `${GATE_ID}-waiting`;
let reassertTimer: ReturnType<typeof setInterval> | null = null;
let installed = false;
// Mirrors chrome.storage.local `popupOpen`: true while the action popup is open.
let popupOpen = false;

// "Logged in" == an app user object exists in storage. Login writes it; logout
// (and a failed token refresh in _apiBase) removes it, which flips the gate.
async function isLoggedIn(): Promise<boolean> {
  try {
    const { user } = await chrome.storage.local.get(["user"]);
    return !!(user && (user as { token?: string }).token);
  } catch {
    // If we can't read auth, fail closed (show the wall) rather than leak access.
    return false;
  }
}

function buildOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = GATE_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647", // max — above LinkedIn's own layers
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, rgba(102,126,234,0.97) 0%, rgba(118,75,162,0.97) 100%)",
    backdropFilter: "blur(4px)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, sans-serif',
  } as CSSStyleDeclaration);

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "360px",
    maxWidth: "90vw",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "32px 28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
    textAlign: "center",
    color: "#1a202c",
  } as CSSStyleDeclaration);

  const title = document.createElement("h1");
  title.textContent = "LinkedIn Scrapper";
  Object.assign(title.style, {
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 12px",
    color: "#1a202c",
  } as CSSStyleDeclaration);

  const body = document.createElement("p");
  body.textContent =
    "Please log in to continue. This extension requires you to sign in before using LinkedIn.";
  Object.assign(body.style, {
    fontSize: "14px",
    lineHeight: "1.55",
    margin: "0 0 22px",
    color: "#4a5568",
  } as CSSStyleDeclaration);

  const button = document.createElement("button");
  button.id = LOGIN_ID;
  button.type = "button";
  button.textContent = "Log in";
  Object.assign(button.style, {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#ffffff",
    cursor: "pointer",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    boxShadow: "0 4px 6px rgba(0,0,0,0.12)",
  } as CSSStyleDeclaration);

  const hint = document.createElement("p");
  hint.id = HINT_ID;
  Object.assign(hint.style, {
    fontSize: "12px",
    margin: "14px 0 0",
    color: "#718096",
  } as CSSStyleDeclaration);
  hint.textContent =
    "If the popup doesn't open, click the extension icon in your toolbar. Prefer not to sign in? Remove the extension.";

  // Shown INSTEAD of the button while the popup is open (button is redundant then).
  const waiting = document.createElement("p");
  waiting.id = WAITING_ID;
  Object.assign(waiting.style, {
    fontSize: "14px",
    fontWeight: "600",
    margin: "4px 0 0",
    color: "#4a5568",
    display: "none",
  } as CSSStyleDeclaration);
  waiting.textContent = "Complete your login in the popup window…";

  button.addEventListener("click", () => {
    // Best-effort: ask the background worker to open the action popup.
    try {
      chrome.runtime.sendMessage({ action: "openPopup" }, () => {
        // Swallow any lastError; the hint text covers the fallback.
        void chrome.runtime.lastError;
      });
    } catch {
      // ignore — hint tells the user to click the toolbar icon
    }
  });

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(button);
  card.appendChild(waiting);
  card.appendChild(hint);
  overlay.appendChild(card);
  return overlay;
}

// Toggle the wall's controls based on whether the popup is currently open:
// popup open  -> hide the (redundant) login button + hint, show a waiting note.
// popup closed -> show the login button + hint, hide the waiting note.
function applyPopupState(): void {
  const login = document.getElementById(LOGIN_ID);
  const hint = document.getElementById(HINT_ID);
  const waiting = document.getElementById(WAITING_ID);
  if (!login || !hint || !waiting) return;
  login.style.display = popupOpen ? "none" : "block";
  hint.style.display = popupOpen ? "none" : "block";
  waiting.style.display = popupOpen ? "block" : "none";
}

// Lock the page: overlay present + body made inert (blocks all interaction).
function lock(): void {
  const root = document.documentElement;
  if (!document.getElementById(GATE_ID)) {
    root.appendChild(buildOverlay());
  }
  if (document.body) {
    document.body.setAttribute("inert", "");
    // Some engines need the property form too.
    (document.body as unknown as { inert: boolean }).inert = true;
    document.body.style.overflow = "hidden";
  }
  applyPopupState();
}

// Unlock the page: remove overlay + restore interaction.
function unlock(): void {
  document.getElementById(GATE_ID)?.remove();
  if (document.body) {
    document.body.removeAttribute("inert");
    (document.body as unknown as { inert: boolean }).inert = false;
    document.body.style.overflow = "";
  }
}

async function evaluate(): Promise<void> {
  // Refresh the cached popup state alongside auth so a rebuilt wall is correct.
  try {
    const { popupOpen: open } = await chrome.storage.local.get(["popupOpen"]);
    popupOpen = !!open;
  } catch {
    popupOpen = false;
  }

  if (await isLoggedIn()) {
    stopReassert();
    unlock();
  } else {
    lock();
    startReassert();
  }
}

// While logged out, re-assert every second so LinkedIn's SPA can't strip the
// overlay or clear the inert flag. Runs only while the wall is up.
function startReassert(): void {
  if (reassertTimer) return;
  reassertTimer = setInterval(() => {
    void isLoggedIn().then((ok) => {
      if (ok) {
        stopReassert();
        unlock();
      } else {
        lock();
      }
    });
  }, 1000);
}

function stopReassert(): void {
  if (reassertTimer) {
    clearInterval(reassertTimer);
    reassertTimer = null;
  }
}

/** Install the auth gate once. Safe to call multiple times. */
export function initAuthGate(): void {
  if (installed) {
    void evaluate();
    return;
  }
  installed = true;

  // React immediately to login/logout happening in the popup or via a failed
  // token refresh (both mutate chrome.storage.local `user`), and to the popup
  // opening/closing (`popupOpen`) so the login button hides while it's open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("user" in changes) {
      void evaluate();
      return;
    }
    if ("popupOpen" in changes) {
      popupOpen = !!changes.popupOpen.newValue;
      applyPopupState();
    }
  });

  void evaluate();
}
