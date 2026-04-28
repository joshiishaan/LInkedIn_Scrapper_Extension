/**
 * Content Script - LinkedIn Injectors
 * - Injects ProfileCard into LinkedIn profile pages (/in/)
 * - Injects MessageSyncButton into LinkedIn messaging page (/messaging)
 * Handles SPA navigation and dynamic DOM updates
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "../context/ThemeContext";
import ProfileCard from "../components/ProfileCard";
import { MessageSyncButton } from "../components/MessageSyncButton";
import Sidebar from "../components/Sidebar";
import { useLinkedInProfileInterceptor } from "../hooks/useLinkedInProfileInterceptor";

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
        <ProfileCard />
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
        <MessageSyncButton />
      </ThemeProvider>,
    );
  }

  function renderSidebar(container: HTMLElement, showFetchProfile: boolean) {
    if (!sidebarRoot) {
      sidebarRoot = ReactDOM.createRoot(container);
    }
    sidebarRoot.render(
      <ThemeProvider>
        <Sidebar showFetchProfile={showFetchProfile} />
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
              } catch {
                // ignore
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
      const target = document.querySelector(selector);
      if (target) insertProfileCard(target);
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
    // Scope to the active conversation thread when possible.
    const threadContainer =
      document.querySelector<HTMLElement>("[id^='message-thread-']") ??
      document.querySelector<HTMLElement>(".msg-convo-wrapper");

    const scope: ParentNode = threadContainer ?? document;

    // Broadened selectors. LinkedIn has rotated class names; accept any
    // composer-shaped element. Order matters — most specific first so we
    // prefer a real composer over an unrelated textarea.
    const candidateSelector = [
      '.msg-form__contenteditable[contenteditable="true"]',
      '.msg-form-v2__contenteditable[contenteditable="true"]',
      '[class*="msg-form"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
    ].join(", ");

    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(candidateSelector),
    );

    if (candidates.length === 0) {
      // One-line DOM probe so each poll tick reports what's actually in
      // the page when no candidate matches. Helps update selectors fast.
      // const msgFormEls = document.querySelectorAll('[class*="msg-form" i]');
      // const editableEls = document.querySelectorAll('[contenteditable="true"]');
      // console.log("[Scrapper Debug] findMessageInputRoot: no candidates", {
      //   threadContainer: threadContainer?.id ?? null,
      //   threadContainerClass: threadContainer?.className ?? null,
      //   msgFormCount: msgFormEls.length,
      //   msgFormSample: Array.from(msgFormEls)
      //     .slice(0, 5)
      //     .map((e) => (e as HTMLElement).className),
      //   editableCount: editableEls.length,
      //   editableSample: Array.from(editableEls)
      //     .slice(0, 5)
      //     .map((e) => (e as HTMLElement).className),
      // });
      return null;
    }

    const visibleEditor =
      candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.width > 0 && rect.height > 0;
      }) ?? candidates[0];

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
    // console.log("[Scrapper Debug] performInjection", {
    //   url: window.location.href,
    //   formFound: !!inputRoot,
    //   hasParent: !!inputRoot?.parentElement,
    // });
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

    console.log("[Scrapper Debug] Injecting overlay", {
      href: window.location.href,
      inputRoot,
      hostParent,
    });

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
    const showFetchProfile = window.location.href.includes("/messaging");
    let container = document.getElementById("linkedin-extension-sidebar");

    if (!container) {
      container = document.createElement("div");
      container.id = "linkedin-extension-sidebar";
      document.body.appendChild(container);
    }
    renderSidebar(container, showFetchProfile);
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

  // Initial run
  initProfileInjection();
  void initMessagingInjection();
  initSidebarInjection();
})();
