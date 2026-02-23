import { useTheme } from "../context/ThemeContext";

interface NoteCardProps {
  title?: string;
  content: string;
  timestamp: number;
  onClick?: () => void;
  onDelete?: () => void;
}

export default function NoteCard({
  title,
  content,
  timestamp,
  onClick,
  onDelete,
}: NoteCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#2d3748" : "#ffffff",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    hover: isDark ? "#374151" : "#f9fafb",
    deleteHover: isDark ? "#742a2a" : "#fee2e2",
  };

  // Calculate relative time (e.g., "5m ago", "2h ago", "3d ago")
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Truncate long text with ellipsis for preview
  const truncateContent = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
        boxShadow: isDark
          ? "0 1px 3px rgba(0,0,0,0.3)"
          : "0 1px 3px rgba(0,0,0,0.08)",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = colors.hover;
          e.currentTarget.style.borderColor = isDark ? "#667eea" : "#667eea";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.bg;
        e.currentTarget.style.borderColor = colors.border;
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: colors.textSecondary,
            fontWeight: 500,
          }}
        >
          {formatDate(timestamp)}
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.deleteHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {title && (
        <h4
          style={{
            margin: "0 0 6px 0",
            fontSize: "15px",
            fontWeight: 600,
            color: colors.text,
            lineHeight: "1.4",
          }}
        >
          {title}
        </h4>
      )}

      <p
        style={{
          margin: 0,
          fontSize: "13px",
          color: colors.textSecondary,
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {truncateContent(content)}
      </p>
    </div>
  );
}
