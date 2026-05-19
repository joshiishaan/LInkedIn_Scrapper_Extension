import { useState, useEffect } from "react";
import { ThemeProvider } from "../context/ThemeContext";
import { useTheme } from "../context/ThemeContext";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./components/Dashboard";

type View = "login" | "signup" | "dashboard";

function PopupContent() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<any>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    chrome.storage.local.get(["user"], (result) => {
      if (result.user) {
        setUser(result.user);
        setView("dashboard");
      }
    });
  }, []);

  const handleAuth = (userData: any) => {
    setUser(userData);
    chrome.storage.local.set({ user: userData });
    setView("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    chrome.storage.local.remove("user");
    setView("login");
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
        />
      )}
      {view === "signup" && (
        <Signup onAuth={handleAuth} onLogin={() => setView("login")} />
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
