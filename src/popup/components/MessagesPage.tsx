/**
 * MessagesPage
 * Dedicated popup page for messaging metrics: stat cards + manual refresh.
 *
 * Loader rule (so it never looks weird): show the spinner in ONE place at a
 * time — the body on the very first load (no data yet), and the Refresh button
 * on subsequent manual refreshes (data already on screen). Never both at once.
 */

import { useState, useEffect } from "react";
import { messagesApi } from "../../services/api";
import type { MessageStats } from "../../services/messagesApi";

interface Props {
  onBack: () => void;
}

export default function MessagesPage({ onBack }: Props) {
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await messagesApi.getStats();
      setStats(res.data.user);
    } catch (err) {
      console.error("Failed to load message stats", err);
    } finally {
      setLoading(false);
    }
  };

  const initialLoading = loading && !stats; // first load → body spinner
  const refreshing = loading && !!stats; //     refresh   → button spinner

  const tiles: Array<[string, number | undefined]> = [
    ["Sent", stats?.sent],
    ["Read", stats?.read],
    ["Replied", stats?.replied],
    ["Follow-ups", stats?.followUps],
    ["Convos", stats?.conversations],
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <button className="back-btn" onClick={onBack} title="Back" aria-label="Back">
          ←
        </button>
        <h2>Messages</h2>
      </div>

      <div className="integration-section">
        {initialLoading ? (
          <div className="status-loading conn-loading">
            <span className="conn-spinner" />
            <span>Loading messages…</span>
          </div>
        ) : stats ? (
          <div className={`stat-list${refreshing ? " stat-list--busy" : ""}`}>
            {tiles.map(([label, value]) => (
              <div className="stat-row" key={label}>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value ?? 0}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-loading">Couldn't load message stats.</div>
        )}

        <button onClick={load} disabled={loading} className="connect-btn">
          {refreshing ? (
            <>
              <span className="conn-spinner" /> Refreshing…
            </>
          ) : (
            "Refresh"
          )}
        </button>
        <div className="sync-msg">
          Message metrics update automatically as you open LinkedIn chats.
        </div>
      </div>
    </div>
  );
}
