/**
 * ConnectionsPage
 * Dedicated popup page for connection-request metrics: stat cards + manual sync.
 */

import { useState, useEffect } from "react";
import { connectionApi } from "../../services/api";
import type { ConnectionStats } from "../../services/connectionApi";

interface Props {
  onBack: () => void;
}

// Ask the content script on a LinkedIn tab to run the sync. Resolves to the
// content script's response, or a synthetic error (no content script / timeout).
function requestSync(tabId: number): Promise<any> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ success: false, error: "timeout" });
      }
    }, 20000);
    chrome.tabs.sendMessage(tabId, { type: "HL_RUN_CONNECTIONS_SYNC" }, (resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // lastError => the content script isn't loaded on that tab.
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: "no_content" });
        return;
      }
      resolve(resp);
    });
  });
}

export default function ConnectionsPage({ onBack }: Props) {
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    loadConnectionStats();
  }, []);

  const loadConnectionStats = async () => {
    setStatsLoading(true);
    try {
      const res = await connectionApi.getStats();
      setStats(res.data.user);
    } catch (err) {
      console.error("Failed to load connection stats", err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Manual "Sync now": run the reconcile via a LinkedIn tab's content script.
  const handleSyncConnections = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const tabs = await chrome.tabs.query({ url: ["https://*.linkedin.com/*"] });
      const tab = tabs.find((t) => t.active) ?? tabs[0];
      if (!tab?.id) {
        setSyncMsg("Open a LinkedIn tab to sync.");
        return;
      }
      const resp = await requestSync(tab.id);
      if (!resp?.success) {
        setSyncMsg(
          resp?.error === "no_content"
            ? "Reload the LinkedIn tab and retry."
            : "Sync failed — try again.",
        );
        return;
      }
      const r = resp.result;
      if (r?.skipped) {
        setSyncMsg("Already up to date.");
      } else if (r?.error) {
        setSyncMsg("Couldn't reach LinkedIn — are you logged in?");
      } else {
        // `newlyAbsent` are invitations that vanished from LinkedIn's Sent list
        // for the first time. They are deliberately NOT resolved yet — a second
        // confirming walk is required — so they're surfaced as "pending
        // confirmation" rather than counted as expired.
        const pendingConfirm = r.newlyAbsent
          ? ` · ${r.newlyAbsent} awaiting confirmation`
          : "";
        setSyncMsg(
          `Accepted +${r.accepted ?? 0} · Expired +${r.expired ?? 0}${pendingConfirm}`,
        );
      }
      await loadConnectionStats();
    } catch {
      setSyncMsg("Reload the LinkedIn tab and retry.");
    } finally {
      setSyncing(false);
    }
  };

  const tiles: Array<[string, number | undefined]> = [
    ["Sent", stats?.sent],
    ["Pending", stats?.pending],
    ["Accepted", stats?.accepted],
    ["Expired", stats?.expired],
    ["Withdrawn", stats?.withdrawn],
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <button className="back-btn" onClick={onBack} title="Back" aria-label="Back">
          ←
        </button>
        <h2>Connections</h2>
      </div>

      <div className="integration-section">
        {statsLoading ? (
          <div className="status-loading conn-loading">
            <span className="conn-spinner" />
            <span>Loading connections…</span>
          </div>
        ) : stats ? (
          <div className={`stat-list${syncing ? " stat-list--busy" : ""}`}>
            {tiles.map(([label, value]) => (
              <div className="stat-row" key={label}>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value ?? 0}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-loading">Couldn't load connection stats.</div>
        )}

        <button onClick={handleSyncConnections} disabled={syncing} className="connect-btn">
          {syncing ? (
            <>
              <span className="conn-spinner" /> Syncing…
            </>
          ) : (
            "Sync now"
          )}
        </button>
        {syncMsg && <div className="sync-msg">{syncMsg}</div>}
      </div>
    </div>
  );
}
