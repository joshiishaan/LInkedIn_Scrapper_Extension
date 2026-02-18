import { useState, useEffect } from "react";
import { hubspotApi } from "../../services/api";

interface Props {
  user: any;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: Props) {
  const [hubspotConnected, setHubspotConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkHubspotConnection();
  }, []);

  const checkHubspotConnection = async () => {
    try {
      const response = await hubspotApi.checkStatus();
      setHubspotConnected(response.data.connected);
    } catch (err) {
      console.error("Failed to check HubSpot status", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectHubspot = async () => {
    setConnecting(true);
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
      setConnecting(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>LinkedIn Scraper</h2>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <div className="user-info">
        <div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div>
        <div>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="integration-section">
        <h3>HubSpot Integration</h3>
        {loading ? (
          <div className="status-loading">Checking connection...</div>
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
          </div>
        )}
      </div>
    </div>
  );
}
