import { createPortal } from "react-dom";
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useShadowPortal } from "../../hooks/useShadowPortal";
import ProfilePanel from "./ProfilePanel";
import NotesInfoPanel from "../notes/NotesInfoPanel";
import TasksInfoPanel from "../tasks/TasksInfoPanel";

export default function Sidebar() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const shadowRoot = useShadowPortal(true);

  // Keep the sidebar expanded when a panel is open so moving the mouse away
  // doesn't collapse it while the user is working in the panel.
  const isExpanded = isHovered || activePanel !== null;

  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    border: isDark ? "#4a5568" : "#e2e8f0",
    text: isDark ? "#f7fafc" : "#1f2937",
    textSecondary: isDark ? "#a0aec0" : "#6b7280",
    hover: isDark ? "#2d3748" : "#f3f4f6",
    active: isDark ? "#4c51bf" : "#667eea",
  };

  if (!shadowRoot) return null;

  const buttons = [
    {
      id: "profile",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="10"
            cy="7"
            r="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4 18c0-3.314 2.686-6 6-6s6 2.686 6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      label: "Profile",
      onClick: () => setActivePanel("profile"),
    },
    {
      id: "notes",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 4h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M7 8h6M7 11h6M7 14h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      label: "Notes",
      onClick: () => setActivePanel("notes"),
      show: true,
    },
    {
      id: "tasks",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M6 10l2 2 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="3"
            y="3"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      ),
      label: "Tasks",
      onClick: () => setActivePanel("tasks"),
      show: true,
    },
  ];

  const sidebarContent = (
    <>
      {/*
       * Outer wrapper spans [pull-tab (20px) + sidebar (56px)] = 76px total.
       * When collapsed: translateX(56px) pushes the sidebar off-screen, leaving
       *   only the 20px pull-tab visible at the right edge.
       * When expanded: translateX(0) brings the full sidebar into view.
       */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          zIndex: 2147483647,
          pointerEvents: "auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          transform: `translateY(-50%) translateX(${isExpanded ? "0px" : "56px"})`,
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Pull-tab — always visible, acts as the hover trigger when collapsed */}
        <div
          style={{
            width: "20px",
            height: "72px",
            background: "linear-gradient(180deg, #667eea 0%, #764ba2 100%)",
            borderTopLeftRadius: "10px",
            borderBottomLeftRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            boxShadow: "-3px 0 12px rgba(102, 126, 234, 0.45)",
          }}
        >
          {/* Chevron flips direction to hint at collapse/expand */}
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path
              d={isExpanded ? "M6 1L1 7L6 13" : "M2 1L7 7L2 13"}
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Main sidebar panel */}
        <div
          style={{
            width: "56px",
            background: colors.bg,
            borderLeft: `1px solid ${colors.border}`,
            borderTopLeftRadius: "16px",
            borderBottomLeftRadius: "16px",
            boxShadow: isDark
              ? "-4px 0 20px rgba(0, 0, 0, 0.4)"
              : "-4px 0 20px rgba(0, 0, 0, 0.08)",
            padding: "16px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <img
            src={chrome.runtime.getURL("images/icon.png")}
            alt="Logo"
            style={{ width: "40px", height: "40px", marginBottom: "4px" }}
          />

          <div
            style={{
              width: "32px",
              height: "1px",
              background: colors.border,
              marginBottom: "8px",
            }}
          />

          {buttons.map((btn) => (
            <div key={btn.id} style={{ position: "relative" }}>
                <button
                  onClick={btn.onClick}
                  onMouseEnter={() => setHoveredBtn(btn.id)}
                  onMouseLeave={() => setHoveredBtn(null)}
                  style={{
                    width: "40px",
                    height: "40px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: colors.textSecondary,
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform:
                      hoveredBtn === btn.id ? "scale(1.1)" : "scale(1)",
                    ...(hoveredBtn === btn.id && {
                      background: colors.hover,
                      color: colors.active,
                    }),
                  }}
                >
                  {btn.icon}
                </button>

                {hoveredBtn === btn.id && (
                  <div
                    style={{
                      position: "absolute",
                      right: "60px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: isDark ? "#2d3748" : "#1f2937",
                      color: "white",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                      pointerEvents: "none",
                      animation: "tooltipSlide 0.2s ease-out",
                    }}
                  >
                    {btn.label}
                    <div
                      style={{
                        position: "absolute",
                        right: "-4px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 0,
                        height: 0,
                        borderTop: "4px solid transparent",
                        borderBottom: "4px solid transparent",
                        borderLeft: `4px solid ${isDark ? "#2d3748" : "#1f2937"}`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {activePanel === "profile" && (
        <ProfilePanel onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "notes" && (
        <NotesInfoPanel onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "tasks" && (
        <TasksInfoPanel onClose={() => setActivePanel(null)} />
      )}

      <style>
        {`
          * { box-sizing: border-box; }
          @keyframes tooltipSlide {
            from {
              opacity: 0;
              transform: translateY(-50%) translateX(8px);
            }
            to {
              opacity: 1;
              transform: translateY(-50%) translateX(0);
            }
          }
        `}
      </style>
    </>
  );

  return createPortal(sidebarContent, shadowRoot);
}
