import { useState, useEffect } from "react";
import { ThemeProvider } from "../context/ThemeContext";
import { useTheme } from "../context/ThemeContext";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./components/Dashboard";
import ForgotPassword from "./components/ForgotPassword";
import { API_BASE_URL } from "../services/_apiBase";

type View = "login" | "signup" | "dashboard" | "forgot";

function PopupContent() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<any>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    chrome.storage.local.get(["user", "passwordResetFlow"], (r) => {
      const result = r as Record<string, any>;
      if (result.user) {
        setUser(result.user);
        setView("dashboard");
      } else if (result.passwordResetFlow?.step === "code") {
        // A password reset is mid-flow (popup was closed after the code was
        // sent) — resume it instead of dropping back to login.
        setView("forgot");
      }
    });
  }, []);

  const handleAuth = (userData: any) => {
    setUser(userData);
    chrome.storage.local.set({ user: userData });
    setView("dashboard");
  };

  const handleLogout = async () => {
    setUser(null);
    setView("login");
    // Best-effort server-side revocation of the refresh token, then clear it.
    try {
      const { refreshToken } = await chrome.storage.local.get(["refreshToken"]);
      if (refreshToken) {
        void fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
      }
    } finally {
      chrome.storage.local.remove(["user", "refreshToken"]);
    }
  };

  return (
    <div className="popup-container">
      {view !== "dashboard" && (
        <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 10 }}>
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            title="Toggle theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      )}
      {view === "login" && (
        <Login
          onAuth={handleAuth}
          onSignup={() => setView("signup")}
          onForgotPassword={() => setView("forgot")}
        />
      )}
      {view === "signup" && (
        <Signup onAuth={handleAuth} onLogin={() => setView("login")} />
      )}
      {view === "forgot" && (
        <ForgotPassword
          onBack={() => setView("login")}
          onDone={() => setView("login")}
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
