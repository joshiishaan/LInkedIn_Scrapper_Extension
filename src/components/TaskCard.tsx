import { useTheme } from "../context/ThemeContext";

interface TaskCardProps {
  title: string;
  dueDate?: string;
  priority: "None" | "Low" | "Medium" | "High";
  status: string;
  onClick?: () => void;
  onDelete?: () => void;
  onToggleComplete?: () => void;
  isDeleting?: boolean;
}

export default function TaskCard({
  title,
  dueDate,
  priority,
  status,
  onClick,
  onDelete,
  onToggleComplete,
  isDeleting = false,
}: TaskCardProps) {
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

  const priorityColors = {
    None: "#9ca3af",
    Low: "#10b981",
    Medium: "#f59e0b",
    High: "#ef4444",
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isCompleted = status === "COMPLETED" || status === "Completed";

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
        opacity: isCompleted ? 0.7 : 1,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = colors.hover;
          e.currentTarget.style.borderColor = "#667eea";
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete?.();
            }}
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "4px",
              border: `2px solid ${isCompleted ? "#10b981" : colors.border}`,
              background: isCompleted ? "#10b981" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {isCompleted && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-6"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: priorityColors[priority],
            }}
          />
          <span
            style={{
              fontSize: "12px",
              color: colors.textSecondary,
              fontWeight: 500,
            }}
          >
            {priority}
          </span>
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isDeleting) onDelete();
            }}
            disabled={isDeleting}
            style={{
              background: "transparent",
              border: "none",
              cursor: isDeleting ? "not-allowed" : "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              opacity: isDeleting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.background = colors.deleteHover;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {isDeleting ? (
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid #ef4444",
                  borderTop: "2px solid transparent",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}
      </div>

      <h4
        style={{
          margin: "0 0 6px 0",
          fontSize: "15px",
          fontWeight: 600,
          color: colors.text,
          lineHeight: "1.4",
          textDecoration: isCompleted ? "line-through" : "none",
        }}
      >
        {title}
      </h4>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: colors.textSecondary,
            background: isDark ? "#374151" : "#f3f4f6",
            padding: "4px 8px",
            borderRadius: "4px",
          }}
        >
          {status}
        </span>
        {dueDate && (
          <span style={{ fontSize: "12px", color: colors.textSecondary }}>
            {formatDate(dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}
