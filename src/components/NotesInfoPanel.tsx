import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { useShadowPortal } from "../hooks/useShadowPortal";

interface NotesInfoPanelProps {
  onClose: () => void;
}

export default function NotesInfoPanel({ onClose }: NotesInfoPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const shadowRoot = useShadowPortal(true);

  if (!shadowRoot) return null;

  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    hover: isDark ? "#374151" : "#e5e7eb",
  };

  const panelContent = (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(2px)",
          pointerEvents: "auto",
        }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "420px",
          background: colors.bg,
          boxShadow: isDark
            ? "-4px 0 24px rgba(0, 0, 0, 0.5)"
            : "-4px 0 24px rgba(0, 0, 0, 0.15)",
          zIndex: 2147483647,
          display: "flex",
          flexDirection: "column",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 600,
              color: colors.text,
            }}
          >
            Notes
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = colors.hover)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke={colors.text}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "40px 20px",
            textAlign: "center",
            color: colors.textSecondary,
          }}
        >
          <p style={{ margin: 0, fontSize: "14px" }}>Notes</p>
        </div>
      </div>

      <style>{`* { box-sizing: border-box; }`}</style>
    </>
  );

  return createPortal(panelContent, shadowRoot);
}
