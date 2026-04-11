/**
 * Popup Root Component
 * Manages authentication flow and dashboard views with theme support.
 *
 * View states:
 *  login        — email/password login form
 *  signup       — account creation form
 *  reset        — step 1: request a reset email (and step 2: confirm token + new password)
 *  confirmReset — step 2 only, pre-filled with the token extracted from the reset link URL
 *  dashboard    — authenticated main view
 */

import { useState, useEffect } from "react";
import { ThemeProvider } from "../context/ThemeContext";
import Login from "./components/Login";
import Signup from "./components/Signup";
import ResetPassword from "./components/ResetPassword";
import Dashboard from "./components/Dashboard";

type View = "login" | "signup" | "reset" | "confirmReset" | "dashboard";

function PopupContent() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<any>(null);
  // Token pre-populated from the reset link clicked in the browser
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Check for a stored session
    chrome.storage.local.get(["user"], (result) => {
      if (result.user) {
        setUser(result.user);
        setView("dashboard");
        return;
      }

      // When the extension popup opens, inspect the active tab URL for a
      // `?reset_token=…` query param injected by the password-reset email link.
      // The email link points to APP_URL (e.g. the hosted page or localhost) but
      // users on a device with the extension installed may have it open in Chrome;
      // we catch it here so the flow is seamless.
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const url = tabs?.[0]?.url;
          if (!url) return;
          const params = new URL(url).searchParams;
          const token = params.get("reset_token");
          if (token) {
            setResetToken(token);
            setView("confirmReset");
          }
        });
      } catch {
        // Non-critical — tabs API may be unavailable in some contexts
      }
    });
  }, []);

  // Handle successful authentication
  const handleAuth = (userData: any) => {
    setUser(userData);
    chrome.storage.local.set({ user: userData });
    setView("dashboard");
  };

  // Handle user logout
  const handleLogout = () => {
    setUser(null);
    chrome.storage.local.remove("user");
    setView("login");
  };

  return (
    <div className="popup-container">
      {view === "login" && (
        <Login
          onAuth={handleAuth}
          onSignup={() => setView("signup")}
          onReset={() => setView("reset")}
        />
      )}
      {view === "signup" && (
        <Signup onAuth={handleAuth} onLogin={() => setView("login")} />
      )}
      {view === "reset" && (
        <ResetPassword onBack={() => setView("login")} />
      )}
      {view === "confirmReset" && (
        // Pre-fill the token so the user only needs to type the new password
        <ResetPassword
          onBack={() => { setResetToken(undefined); setView("login"); }}
          initialToken={resetToken}
        />
      )}
      {view === "dashboard" && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default function Popup() {
  return (
    <ThemeProvider>
      <PopupContent />
    </ThemeProvider>
  );
}
