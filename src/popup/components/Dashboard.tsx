/**
 * Dashboard (home)
 * Shows user info + HubSpot status, and navigates to the Connections and
 * Messages sub-pages (each with its own stat cards).
 */

import { useState, useEffect } from "react";
import { hubspotApi } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import ConnectionsPage from "./ConnectionsPage";
import MessagesPage from "./MessagesPage";

interface Props {
  user: any;
  onLogout: () => void;
}

type SubView = "home" | "connections" | "messages";

export default function Dashboard({ user, onLogout }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<SubView>("home");
  const [hubspotConnected, setHubspotConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    checkHubspotConnection();
  }, []);

  // Verify HubSpot connection status
  const checkHubspotConnection = async () => {
    try {
      const response = await hubspotApi.checkStatus();
      setHubspotConnected(response.data.connected);
      setStatusError(false);
    } catch (err) {
      console.error("Failed to check HubSpot status", err);
      setStatusError(true);
    } finally {
      setLoading(false);
    }
  };

  // Initiate HubSpot OAuth flow
  const handleConnectHubspot = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const response = await hubspotApi.getConnectUrl();
      const authWindow = window.open(
        response.data.authUrl,
        "_blank",
        "width=600,height=700",
      );

      const checkInterval = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkInterval);
          checkHubspotConnection();
          setConnecting(false);
        }
      }, 1000);
    } catch (err) {
      console.error("Failed to connect HubSpot", err);
      // Previously silent — the button would just stop spinning with no
      // explanation, leaving the user unsure whether anything happened.
      setConnectError(
        err instanceof Error
          ? err.message
          : "Couldn't start connecting to HubSpot. Please try again.",
      );
      setConnecting(false);
    }
  };

  if (view === "connections")
    return <ConnectionsPage onBack={() => setView("home")} />;
  if (view === "messages")
    return <MessagesPage onBack={() => setView("home")} />;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>LinkedIn Scraper</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            title="Toggle theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="user-info">
        <div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div>
        <div>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="integration-section">
        <h3>Analytics</h3>
        <div className="nav-grid">
          <button className="nav-card" onClick={() => setView("connections")}>
            <svg
              className="nav-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="6" cy="7" r="2.4" />
              <circle cx="18" cy="7" r="2.4" />
              <circle cx="12" cy="17.5" r="2.4" />
              <line x1="8.4" y1="7" x2="15.6" y2="7" />
              <line x1="7.7" y1="8.8" x2="10.3" y2="15.7" />
              <line x1="16.3" y1="8.8" x2="13.7" y2="15.7" />
            </svg>
            <span className="nav-label">Connections</span>
            <span className="nav-sub">Sent · accepted · pending</span>
          </button>
          <button className="nav-card" onClick={() => setView("messages")}>
            <svg
              className="nav-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 11.5a7.5 7.5 0 0 1-10.6 6.8L4 20l1.7-5.4A7.5 7.5 0 1 1 20 11.5Z" />
            </svg>
            <span className="nav-label">Messages</span>
            <span className="nav-sub">Sent · read · replies</span>
          </button>
        </div>
      </div>

      <div className="integration-section">
        <h3>HubSpot Integration</h3>
        {loading ? (
          <div className="status-loading">Checking connection...</div>
        ) : statusError ? (
          <div className="status-error">
            <span className="status-icon">⚠</span>
            <span>Could not check HubSpot status — please try again.</span>
            <button onClick={checkHubspotConnection} className="connect-btn">
              Retry
            </button>
          </div>
        ) : hubspotConnected ? (
          <div className="status-connected">
            <span className="status-icon">✓</span>
            <span>Connected to HubSpot</span>
          </div>
        ) : (
          <div className="status-disconnected">
            <span className="status-icon">⚠</span>
            <span>Not connected to HubSpot</span>
            <button
              onClick={handleConnectHubspot}
              disabled={connecting}
              className="connect-btn"
            >
              {connecting ? "Connecting..." : "Connect HubSpot"}
            </button>
            {connectError && (
              <span style={{ color: "#e53e3e", fontSize: "12px" }}>{connectError}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
