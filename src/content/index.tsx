/**
 * Content Script - LinkedIn Injectors
 * - Injects ProfileCard into LinkedIn profile pages (/in/)
 * - Injects MessageSyncButton into LinkedIn messaging page (/messaging)
 * Handles SPA navigation and dynamic DOM updates
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "../context/ThemeContext";
import ProfileCard from "../components/profile-card/ProfileCard";
import { MessageSyncButton } from "../components/messaging/MessageSyncButton";
import Sidebar from "../components/sidebar/Sidebar";
import { useLinkedInProfileInterceptor } from "../hooks/useLinkedInProfileInterceptor";
import { ErrorBoundary } from "../components/shared/ErrorBoundary";

// eslint-disable-next-line react-refresh/only-export-components
function HubLeadRoot() {
  useLinkedInProfileInterceptor();
  return null;
}

(function () {
  let currentUrl = location.href;
  const observers: MutationObserver[] = [];
  let messageRoot: ReactDOM.Root | null = null;
  let containerWatcher: MutationObserver | null = null;
  let composerArrivalObserver: MutationObserver | null = null;
  let injectionPollTimer: ReturnType<typeof setInterval> | null = null;
  let isInjecting = false;
  let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
  let sidebarRoot: ReactDOM.Root | null = null;

  // --- Shared React root renderers ---

  function renderProfileCard(container: HTMLElement) {
    ReactDOM.createRoot(container).render(
      <ThemeProvider>
        <ErrorBoundary>
          <ProfileCard />
        </ErrorBoundary>
      </ThemeProvider>,
    );
  }

  function renderMessageButton(container: HTMLElement) {
    // Reuse existing root if we ever call this twice for the same overlay
    if (!messageRoot) {
      messageRoot = ReactDOM.createRoot(container);
    }

    messageRoot.render(
      <ThemeProvider>
        <ErrorBoundary>
          <MessageSyncButton />
        </ErrorBoundary>
      </ThemeProvider>,
    );
  }

  function renderSidebar(container: HTMLElement) {
    if (!sidebarRoot) {
      sidebarRoot = ReactDOM.createRoot(container);
    }
    sidebarRoot.render(
      <ThemeProvider>
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>
      </ThemeProvider>,
    );
  }

  // Watch for our injected container being removed from the DOM.
  // This fires when LinkedIn rebuilds the composer/form on conversation switch
  // without a URL change (or due to a race after a URL change).
  function watchContainerRemoval(container: HTMLElement) {
    console.log("[Scrapper Debug] Container removal detected; reinjecting");

    if (containerWatcher) {
      containerWatcher.disconnect();
      containerWatcher = null;
    }

    containerWatcher = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.removedNodes)) {
          if (
            node === container ||
            (node instanceof Element && node.contains(container))
          ) {
            containerWatcher!.disconnect();
            containerWatcher = null;
            if (messageRoot) {
              try {
                messageRoot.unmount();
              } catch (e) {
                console.warn("[HubLead] unmount error:", e);
              }
              messageRoot = null;
            }
            isInjecting = false; // Allow the new call to proceed
            if (window.location.href.includes("/messaging")) {
              void initMessagingInjection();
            }
            return;
          }
        }
      }
    });

    containerWatcher.observe(document, {
      childList: true,
      subtree: true,
    });
  }

  // --- Profile page injection (/in/) ---

  function insertProfileCard(targetDiv: Element) {
    let container = document.getElementById(
      "linkedin-extension-card",
    ) as HTMLElement | null;

    if (!container) {
      container = document.createElement("div");
      container.id = "linkedin-extension-card";
      container.style.marginBottom = "8px";
      targetDiv.parentNode?.insertBefore(container, targetDiv.nextSibling);
      renderProfileCard(container);
    }
  }

  // Watch for target element to appear in DOM
  function watchForProfileTarget(selector: string) {
    const observer = new MutationObserver(() => {
      try {
        const target = document.querySelector(selector);
        if (target) insertProfileCard(target);
      } catch (err) {
        console.error("[HubLead] MutationObserver error (profile target):", err);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    observers.push(observer);

    const target = document.querySelector(selector);
    if (target) insertProfileCard(target);
  }

  // Initialize card injection on profile pages
  function initProfileInjection() {
    if (!window.location.href.includes("/in/")) return;

    // Clean up old observers
    observers.forEach((obs) => obs.disconnect());
    observers.length = 0;

    const normalSelector =
      'div[componentkey*="com.linkedin.sdui.profile.card"]';
    const snSelector = "section[data-member-id]";

    watchForProfileTarget(normalSelector);
    watchForProfileTarget(snSelector);
  }

  // --- Messaging page injection (/messaging) ---

  // --- Messaging page injection (/messaging) ---

  function findMessageInputRoot(): HTMLElement | null {
    const isOnThreadUrl = /\/messaging(\/thread\/|\/)\S/.test(window.location.pathname);

    // Try a broad list of thread-container selectors covering old and new
    // LinkedIn messenger layouts.
    const threadContainer =
      document.querySelector<HTMLElement>("[id^='message-thread-']") ??
      document.querySelector<HTMLElement>(".msg-convo-wrapper") ??
      document.querySelector<HTMLElement>("[class*='msg-thread']") ??
      document.querySelector<HTMLElement>("[class*='thread-detail']") ??
      document.querySelector<HTMLElement>(".scaffold-layout__main");

    // LinkedIn has used contenteditable="true", contenteditable="",
    // and contenteditable="plaintext-only" across UI versions.
    // Match any non-false value using the attribute-presence form [contenteditable].
    const candidateSelector = [
      ".msg-form__contenteditable[contenteditable]",
      ".msg-form-v2__contenteditable[contenteditable]",
      '[class*="msg-form"][contenteditable]',
      '[contenteditable][role="textbox"]',
      '[role="textbox"]',
      "textarea",
    ].join(", ");

    // Scope to thread container when available; fall back to full document
    // only on confirmed thread URLs (the URL itself rules out left-panel hits).
    const scope: ParentNode =
      threadContainer ?? (isOnThreadUrl ? document : null!);
    if (!scope) return null;

    const allCandidates = Array.from(
      scope.querySelectorAll<HTMLElement>(candidateSelector),
    );

    if (allCandidates.length === 0) return null;

    // When scoped to the full document, exclude elements that live inside
    // the left-panel conversation list / search area.
    const LEFT_PANEL_EXCLUSIONS = [
      '[aria-label*="Search"]',
      '[class*="msg-conversations-container"]',
      '[class*="messaging-sidebar"]',
      '[class*="conversation-list"]',
      "[data-control-name='compose_message']",
    ].join(", ");

    const candidates = allCandidates.filter(
      (el) => !el.closest(LEFT_PANEL_EXCLUSIONS),
    );

    const pool = candidates.length > 0 ? candidates : allCandidates;

    const visibleEditor =
      pool.find((el) => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.width > 0 && rect.height > 0;
      }) ?? pool[0];

    const form = visibleEditor.closest("form") as HTMLElement | null;
    return (
      form ??
      (visibleEditor.closest(
        '.msg-form, [class*="msg-form"]',
      ) as HTMLElement | null) ??
      visibleEditor
    );
  }

  // Try to inject right now. Returns true when the overlay is present
  // (either freshly injected or already there); returns false when the
  // composer isn't in the DOM yet so the caller can keep waiting.
  function performInjection(): boolean {
    if (!window.location.href.includes("/messaging")) return true;

    if (document.getElementById("linkedin-extension-message-sync-overlay")) {
      return true;
    }

    const inputRoot = findMessageInputRoot();
    if (!inputRoot || !inputRoot.parentElement) return false;

    const hostParent = inputRoot.parentElement;
    const container = document.createElement("div");
    container.id = "linkedin-extension-message-sync-overlay";
    container.style.width = "100%";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.marginBottom = "8px";
    container.style.pointerEvents = "auto";

    hostParent.insertBefore(container, inputRoot);
    renderMessageButton(container);
    watchContainerRemoval(container);
    return true;
  }

  // Always-armed observer for the entire /messaging visit. Each fire calls
  // performInjection (idempotent: short-circuits when overlay is already
  // present). Stays armed even after first success so any later loss of the
  // overlay (form rebuild that containerWatcher misses) is auto-corrected.
  // Disconnects only when the user leaves /messaging.
  function armComposerObserver() {
    if (composerArrivalObserver) return;

    // console.log("[Scrapper Debug] composer observer armed");

    composerArrivalObserver = new MutationObserver(() => {
      try {
        // console.log(
        //   "[Scrapper Debug] composer observer callback invoked",
        // );
        if (!window.location.href.includes("/messaging")) {
          disarmComposerObserver();
          return;
        }
        const overlayPresent = !!document.getElementById(
          "linkedin-extension-message-sync-overlay",
        );
        if (overlayPresent) return;
        // const formFound = !!findMessageInputRoot();
        // console.log("[Scrapper Debug] composer observer fired", {
        //   formFound,
        //   overlayPresent,
        // });
        performInjection();
      } catch (err) {
        console.error("[HubLead] MutationObserver error (composer):", err);
      }
    });

    composerArrivalObserver.observe(document, {
      childList: true,
      subtree: true,
    });
  }

  function disarmComposerObserver() {
    if (composerArrivalObserver) {
      composerArrivalObserver.disconnect();
      composerArrivalObserver = null;
    }
  }

  // Belt-and-suspenders fallback. Runs only while on /messaging and
  // stops the moment the overlay is in the DOM. Catches any case where
  // the MutationObserver path silently fails (e.g., observer attached
  // to a node not on LinkedIn's mutation path).
  function startInjectionPoll() {
    if (injectionPollTimer) return;
    // console.log("[Scrapper Debug] injection poll started");
    injectionPollTimer = setInterval(() => {
      if (!window.location.href.includes("/messaging")) {
        stopInjectionPoll();
        return;
      }
      if (document.getElementById("linkedin-extension-message-sync-overlay")) {
        return;
      }
      // console.log("[Scrapper Debug] injection poll tick");
      performInjection();
    }, 1000);
  }

  function stopInjectionPoll() {
    if (injectionPollTimer) {
      clearInterval(injectionPollTimer);
      injectionPollTimer = null;
      // console.log("[Scrapper Debug] injection poll stopped");
    }
  }

  function initMessagingInjection() {
    if (!window.location.href.includes("/messaging")) {
      disarmComposerObserver();
      stopInjectionPoll();
      return;
    }
    if (isInjecting) return; // guard against re-entry
    isInjecting = true;

    try {
      document
        .getElementById("linkedin-extension-message-sync-overlay")
        ?.remove();

      performInjection();
      // Arm the persistent observer unconditionally for the duration of
      // the /messaging visit — handles late composer mount AND any later
      // loss of the overlay. Idempotent.
      armComposerObserver();
      // Start a 1 s polling backstop in case the observer is silent for
      // any reason (e.g., bound to a node not on LinkedIn's mutation
      // path). Self-stops once the overlay is in the DOM.
      startInjectionPoll();
    } finally {
      isInjecting = false;
    }
  }

  function initSidebarInjection() {
    let container = document.getElementById("linkedin-extension-sidebar");

    if (!container) {
      container = document.createElement("div");
      container.id = "linkedin-extension-sidebar";
      document.body.appendChild(container);
    }
    renderSidebar(container);
  }

  // --- SPA URL change handling ---
  // Idempotent: callable from any source (popstate, interval, body
  // mutation). Returns immediately if the URL hasn't actually changed.

  function handleUrlChange() {
    const newUrl = location.href;
    if (newUrl === currentUrl) return;

    // console.log(
    //   "[Scrapper Debug] url change detected:",
    //   currentUrl,
    //   "→",
    //   newUrl,
    // );
    currentUrl = newUrl;

    // Cancel any pending health-check and reset injection guard
    if (healthCheckTimer) {
      clearTimeout(healthCheckTimer);
      healthCheckTimer = null;
    }
    isInjecting = false;

    // Remove old injected UIs
    const oldCard = document.getElementById("linkedin-extension-card");
    oldCard?.remove();

    // Stop the container watcher BEFORE removing the container so it doesn't
    // trigger a spurious re-injection during intentional URL navigation.
    if (containerWatcher) {
      containerWatcher.disconnect();
      containerWatcher = null;
    }

    // Disarm any composer-arrival observer left over from the previous
    // route; the new route will re-arm if needed.
    disarmComposerObserver();
    stopInjectionPoll();

    const oldMessageSync = document.getElementById(
      "linkedin-extension-message-sync-overlay",
    );

    if (messageRoot) {
      try {
        messageRoot.unmount();
      } catch {
        // ignore
      }
      messageRoot = null;
    }

    oldMessageSync?.remove();

    initProfileInjection();
    initMessagingInjection();
    initSidebarInjection();
  }

  // --- URL change triggers ---
  // 1. popstate — browser back/forward.
  // 2. setInterval — backstop that catches any pushState/replaceState
  //    LinkedIn does without an immediate DOM mutation. 500 ms is below
  //    perceptible UI lag.
  // 3. urlObserver (below) — kept as DOM-driven safety net AND host for
  //    the existing "container is missing while on /messaging" 500 ms
  //    health check.

  window.addEventListener("popstate", handleUrlChange);

  setInterval(() => {
    if (location.href !== currentUrl) handleUrlChange();
  }, 500);

  const urlObserver = new MutationObserver(() => {
    try {
      if (location.href !== currentUrl) {
        handleUrlChange();
        return;
      }
      if (window.location.href.includes("/messaging")) {
        if (healthCheckTimer) clearTimeout(healthCheckTimer);
        healthCheckTimer = setTimeout(() => {
          healthCheckTimer = null;
          if (
            !document.getElementById("linkedin-extension-message-sync-overlay") &&
            !isInjecting
          ) {
            if (messageRoot) {
              try {
                messageRoot.unmount();
              } catch {
                // ignore
              }
              messageRoot = null;
            }
            initMessagingInjection();
          }
        }, 500);
      }
    } catch (err) {
      console.error("[HubLead] MutationObserver error (url observer):", err);
    }
  });

  urlObserver.observe(document, {
    childList: true,
    subtree: true,
  });

  // Mount always-on interceptor listener (singleton, never removed)
  (function mountHubLeadRoot() {
    let container = document.getElementById("linkedin-extension-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "linkedin-extension-root";
      document.body.appendChild(container);
      ReactDOM.createRoot(container).render(<HubLeadRoot />);
    }
  })();

  // Catch any unhandled promise rejections in the content script context
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[HubLead] Unhandled promise rejection:", event.reason);
    event.preventDefault();
  });

  // Initial run
  initProfileInjection();
  void initMessagingInjection();
  initSidebarInjection();
})();
