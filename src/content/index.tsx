import React from "react";
import ReactDOM from "react-dom/client";
import ProfileCard from "../components/ProfileCard";

(function () {
  let currentUrl = location.href;
  const observers: MutationObserver[] = [];

  function renderCard(container: HTMLElement) {
    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <ProfileCard />
      </React.StrictMode>,
    );
  }

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

  function watchForTarget(selector: string) {
    const observer = new MutationObserver(() => {
      const target = document.querySelector(selector);
      if (target) insertCard(target);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    observers.push(observer);

    const target = document.querySelector(selector);
    if (target) insertCard(target);
  }

  function initInjection() {
    if (!window.location.href.includes("/in/")) return;

    // Disconnect old observers
    observers.forEach((obs) => obs.disconnect());
    observers.length = 0;

    const normalSelector =
      'div[componentkey*="com.linkedin.sdui.profile.card"]';
    const snSelector = "section[data-member-id]";

    watchForTarget(normalSelector);
    watchForTarget(snSelector);
  }

  const urlObserver = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;

      const oldCard = document.getElementById("linkedin-extension-card");
      oldCard?.remove();

      initInjection();
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  initInjection();
})();
