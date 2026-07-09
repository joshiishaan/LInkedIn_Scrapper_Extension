import React from "react";
import ReactDOM from "react-dom/client";
import Popup from "./Popup";
import "./popup.css";

// Announce that the popup is open via a long-lived port. The background worker
// flips a `popupOpen` flag while this port is connected and clears it the moment
// the popup closes (port disconnect), so the on-page login wall can hide its
// redundant "Log in" button while the popup is showing.
try {
  chrome.runtime.connect({ name: "popup" });
} catch {
  // Non-extension context (e.g. dev preview) — safe to ignore.
}

ReactDOM.createRoot(document.getElementById("popup-root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
