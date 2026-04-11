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

    containerWatcher.observe(document.body, { childList: true, subtree: true });
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
    // 1. Try to scope to the active conversation thread container
    //    (matches HubLead's layout selectors: [id^="message-thread-"], .msg-convo-wrapper)
    const threadContainer =
      document.querySelector<HTMLElement>("[id^='message-thread-']") ??
      document.querySelector<HTMLElement>(".msg-convo-wrapper");

    const scope: ParentNode = threadContainer ?? document;

    // 2. Within that scope, collect all candidate editors
    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(
        '.msg-form__contenteditable[contenteditable="true"], textarea',
      ),
    );

    if (candidates.length === 0) {
      return null;
    }

    // 3. Prefer a *visible* editor (attached and non-zero size)
    const visibleEditor =
      candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.width > 0 && rect.height > 0;
      }) ?? candidates[0];

    // 4. Return the closest form/msg-form wrapper as the "input root"
    const form = visibleEditor.closest("form") as HTMLElement | null;
    return (
      form ??
      (visibleEditor.closest(".msg-form") as HTMLElement | null) ??
      visibleEditor
    );
  }

  function waitForMessageInputRoot(
    timeoutMs = 8000,
    pollMs = 250,
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const start = Date.now();

      const tick = () => {
        const root = findMessageInputRoot();
        if (root) return resolve(root);

        if (Date.now() - start >= timeoutMs) return resolve(null);

        setTimeout(tick, pollMs);
      };

      tick();
    });
  }

  async function initMessagingInjection() {
    if (!window.location.href.includes("/messaging")) return;
    if (isInjecting) return; // prevent concurrent calls
    isInjecting = true;

    try {
      document
        .getElementById("linkedin-extension-message-sync-overlay")
        ?.remove();

      const inputRoot = await waitForMessageInputRoot();
      // Validate element is still attached after the async wait
      if (!inputRoot || !inputRoot.parentElement) return;

      // Another concurrent call may have already injected
      if (document.getElementById("linkedin-extension-message-sync-overlay"))
        return;

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

  // --- SPA URL watcher ---

  const urlObserver = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;

      // Cancel any pending health-check and reset injection guard
      if (healthCheckTimer) {
        clearTimeout(healthCheckTimer);
        healthCheckTimer = null;
      }
      isInjecting = false; // force reset so the new navigation's call can proceed

      // Remove old injected UIs
      const oldCard = document.getElementById("linkedin-extension-card");
      oldCard?.remove();

      // Stop the container watcher BEFORE removing the container so it doesn't
      // trigger a spurious re-injection during intentional URL navigation.
      if (containerWatcher) {
        containerWatcher.disconnect();
        containerWatcher = null;
      }

      const oldMessageSync = document.getElementById(
        "linkedin-extension-message-sync-overlay",
      );

      // Unmount React tree for the old overlay (if any), then clear the root ref
      if (messageRoot) {
        try {
          messageRoot.unmount();
        } catch {
          // ignore
        }
        messageRoot = null;
      }

      oldMessageSync?.remove();

      // Re-run injections for the new page
      initProfileInjection();
      void initMessagingInjection();
      initSidebarInjection();
    } else if (window.location.href.includes("/messaging")) {
      // Fallback: 500ms after DOM settles, re-inject if container is missing
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
          void initMessagingInjection();
        }
      }, 500);
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

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
