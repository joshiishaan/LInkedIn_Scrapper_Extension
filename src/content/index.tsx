/**
 * Content Script - LinkedIn Profile Card Injector
 * Injects ProfileCard component into LinkedIn profile pages
 * Handles SPA navigation and dynamic DOM updates
 */

import React from "react";
import ReactDOM from "react-dom/client";
import ProfileCard from "../components/ProfileCard";

(function () {
  let currentUrl = location.href;
  const observers: MutationObserver[] = [];

  // Render React component into container
  function renderCard(container: HTMLElement) {
    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <ProfileCard />
      </React.StrictMode>,
    );
  }

  // Insert card after target element on page
  function insertCard(targetDiv: Element) {
    let container = document.getElementById(
      "linkedin-extension-card",
    ) as HTMLElement;

    if (!container) {
      container = document.createElement("div");
      container.id = "linkedin-extension-card";
      container.style.marginBottom = "8px";
      targetDiv.parentNode?.insertBefore(container, targetDiv.nextSibling);
      renderCard(container);
    }
  }

  // Watch for target element to appear in DOM
  function watchForTarget(selector: string) {
    const observer = new MutationObserver(() => {
      const target = document.querySelector(selector);
      if (target) insertCard(target);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    observers.push(observer);

    // Check if target already exists
    const target = document.querySelector(selector);
    if (target) insertCard(target);
  }

  // Initialize card injection on profile pages
  function initInjection() {
    if (!window.location.href.includes("/in/")) return;

    // Clean up old observers
    observers.forEach((obs) => obs.disconnect());
    observers.length = 0;

    // LinkedIn profile page selectors
    const normalSelector =
      'div[componentkey*="com.linkedin.sdui.profile.card"]';
    const snSelector = "section[data-member-id]";

    watchForTarget(normalSelector);
    watchForTarget(snSelector);
  }

  // Detect URL changes in SPA
  const urlObserver = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;

      // Remove old card
      const oldCard = document.getElementById("linkedin-extension-card");
      oldCard?.remove();

      initInjection();
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Start injection
  initInjection();
})();
