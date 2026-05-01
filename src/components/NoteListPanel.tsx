import NoteCard from "./NoteCard";

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
  link: string;
  hover: string;
}

interface NoteListPanelProps {
  colors: Colors;
  isDark: boolean;
  notes: Note[];
  isLoading: boolean;
  deletingNoteId: string | null;
  contactName: string;
  onClose: () => void;
  onCreateNote: () => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
}

export default function NoteListPanel({
  colors,
  isDark,
  notes,
  isLoading,
  deletingNoteId,
  contactName,
  onClose,
  onCreateNote,
  onEditNote,
  onDeleteNote,
}: NoteListPanelProps) {
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
        <div>
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
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "13px",
              color: colors.textSecondary,
            }}
          >
            {contactName}
          </p>
        </div>
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
          padding: "20px 24px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={onCreateNote}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(102, 126, 234, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Create New Note
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {isLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: colors.textSecondary,
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                border: `3px solid ${colors.border}`,
                borderTop: `3px solid ${colors.link}`,
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 1s linear infinite",
              }}
            />
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: colors.textSecondary,
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              style={{ margin: "0 auto 16px" }}
            >
              <path
                d="M8 6h32a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
                stroke={colors.textSecondary}
                strokeWidth="2"
                fill="none"
              />
              <line
                x1="14"
                y1="16"
                x2="34"
                y2="16"
                stroke={colors.textSecondary}
                strokeWidth="2"
              />
              <line
                x1="14"
                y1="24"
                x2="34"
                y2="24"
                stroke={colors.textSecondary}
                strokeWidth="2"
              />
              <line
                x1="14"
                y1="32"
                x2="26"
                y2="32"
                stroke={colors.textSecondary}
                strokeWidth="2"
              />
            </svg>
            <p style={{ fontSize: "14px", margin: 0 }}>No notes yet</p>
            <p style={{ fontSize: "13px", margin: "8px 0 0 0" }}>
              Click "Create New Note" to get started
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                title={note.noteTitle || "Untitled Note"}
                content={note.notes || "No content"}
                timestamp={new Date(note.timestamp).getTime()}
                onClick={() => onEditNote(note)}
                onDelete={() => onDeleteNote(note.id)}
                isDeleting={deletingNoteId === note.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
