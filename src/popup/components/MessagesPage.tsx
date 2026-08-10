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
import type { MessageStatsToday } from "../../services/messagesApi";
import { todayLocalUtcWindow } from "../../utils/dateWindow";

interface Props {
  onBack: () => void;
}

export default function MessagesPage({ onBack }: Props) {
  const [stats, setStats] = useState<MessageStatsToday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  // Recomputed fresh on every load (including manual Refresh) — so reopening
  // the popup after local midnight naturally starts counting from the new
  // day, with no separate reset logic needed.
  const load = async () => {
    setLoading(true);
    try {
      const res = await messagesApi.getStatsToday(todayLocalUtcWindow());
      setStats(res.data);
    } catch (err) {
      console.error("Failed to load message stats", err);
    } finally {
      setLoading(false);
    }
  };

  const initialLoading = loading && !stats; // first load → body spinner
  const refreshing = loading && !!stats; //     refresh   → button spinner

  // Matches the Messages report's own metrics exactly — no "Read" (no daily
  // data exists anywhere, only a lifetime aggregate) or "Convos" tile;
  // historical/lifetime views live in the web dashboards now.
  const tiles: Array<[string, number | undefined]> = [
    ["Sent", stats?.sent],
    ["Received", stats?.received],
    ["Fresh", stats?.fresh],
    ["Follow-ups", stats?.followups],
    ["Replied", stats?.replied],
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <button className="back-btn" onClick={onBack} title="Back" aria-label="Back">
          ←
        </button>
        <h2>Messages · Today</h2>
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
