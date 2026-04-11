interface Note {
  id: string;
  noteTitle: string;
  notes: string;
  timestamp: string;
}

interface Colors {
  bg: string;
  bgSecondary: string;
  border: string;
  text: string;
  textSecondary: string;
  hover: string;
}

interface NoteEditorPanelProps {
  colors: Colors;
  isDark: boolean;
  editingNote: Note | null;
  contactName: string;
  companyName: string;
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  showValidation: boolean;
  contentError: string;
  isSaving: boolean;
  isFormValid: boolean | "" | 0;
  hasChanges: () => boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function NoteEditorPanel({
  colors,
  isDark,
  editingNote,
  contactName,
  companyName,
  title,
  setTitle,
  content,
  setContent,
  showValidation,
  contentError,
  isSaving,
  isFormValid,
  hasChanges,
  onClose,
  onSave,
}: NoteEditorPanelProps) {
  return (
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
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12 5L7 10l5 5"
              stroke={colors.text}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h2
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
            color: colors.text,
          }}
        >
          {editingNote ? "Edit Note" : "New Note"}
        </h2>
      </div>

      <div style={{ padding: "24px", flex: 1 }}>
        <div
          style={{
            marginBottom: "24px",
            padding: "12px 16px",
            background: colors.bgSecondary,
            borderRadius: "8px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: colors.text,
              fontWeight: 500,
            }}
          >
            {contactName} • {companyName}
          </p>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "20px" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "8px",
              }}
            >
              Note Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Initial Discovery Call"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                fontSize: "14px",
                color: colors.text,
                background: colors.bg,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "8px",
              }}
            >
              Notes
            </label>
            <textarea
              value={content}
              onChange={(e) => {
                const value = e.target.value;
                setContent(value);
              }}
              placeholder="Add detailed notes..."
              style={{
                width: "100%",
                minHeight: "200px",
                padding: "10px 14px",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                fontSize: "14px",
                color: colors.text,
                background: colors.bg,
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                lineHeight: "1.6",
              }}
            />
            {showValidation && contentError && (
              <div
                style={{
                  color: "#ef4444",
                  fontSize: "12px",
                  marginTop: "4px",
                }}
              >
                {contentError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          gap: "12px",
        }}
      >
        <button
          onClick={(e) => {
            if (isSaving) {
              e.preventDefault();
              return;
            }
            onClose();
          }}
          disabled={isSaving}
          style={{
            flex: 1,
            padding: "12px 24px",
            background: isSaving ? colors.border : colors.bgSecondary,
            color: isSaving ? colors.textSecondary : colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all 0.2s",
            opacity: isSaving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSaving) {
              e.currentTarget.style.background = colors.hover;
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.bgSecondary;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isSaving || !!(editingNote && !hasChanges())}
          style={{
            flex: 1,
            padding: "10px 20px",
            background:
              isFormValid && !isSaving
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : colors.border,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: isFormValid && !isSaving ? "pointer" : "not-allowed",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all 0.2s",
            opacity: isFormValid && !isSaving ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (isFormValid && !isSaving) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(102, 126, 234, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {isSaving
            ? "Saving..."
            : editingNote
              ? "Update Note"
              : "Create Note"}
        </button>
      </div>
    </div>
  );
}
