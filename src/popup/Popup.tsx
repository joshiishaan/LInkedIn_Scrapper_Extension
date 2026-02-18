import { useState, useEffect } from "react";
import Login from "./components/Login";
import Signup from "./components/Signup";
import ResetPassword from "./components/ResetPassword";
import Dashboard from "./components/Dashboard";

type View = "login" | "signup" | "reset" | "dashboard";

export default function Popup() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<any>(null);

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
      {view === "reset" && <ResetPassword onBack={() => setView("login")} />}
      {view === "dashboard" && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}
