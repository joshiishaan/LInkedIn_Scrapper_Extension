import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import NoteCard from "./NoteCard";
import { notesApi } from "../services/api";
import { useShadowPortal } from "../hooks/useShadowPortal";

interface Note {
  id: string;
  noteTitle: string;
  dealValue: string | null;
  nextStep: string | null;
  notes: string;
  timestamp: string;
}

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  companyName: string;
  username: string;
  hubspotContactId?: string;
  onNotesCountChange?: (count: number) => void;
}

export default function NotesPanel({
  isOpen,
  onClose,
  contactName,
  companyName,
  hubspotContactId,
  onNotesCountChange,
}: NotesPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    bgSecondary: isDark ? "#2d3748" : "#f9fafb",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    link: isDark ? "#63b3ed" : "#0073b1",
    hover: isDark ? "#374151" : "#e5e7eb",
  };

  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showExpandedPanel, setShowExpandedPanel] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [contentError, setContentError] = useState("");

  const [title, setTitle] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [nextStep, setNextStep] = useState("");

  const shadowRoot = useShadowPortal(isOpen);

  // Load notes on panel open
  useEffect(() => {
    if (isOpen && hubspotContactId) {
      loadNotes();
    }
  }, [isOpen, hubspotContactId]);

  const loadNotes = async () => {
    if (!hubspotContactId) return;
    setIsLoading(true);
    try {
      const response = await notesApi.getNotes(hubspotContactId);
      const fetchedNotes = response.data || [];
      setNotes(fetchedNotes);
      onNotesCountChange?.(fetchedNotes.length);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNote = () => {
    setEditingNote(null);
    setTitle("");
    setDealValue("");
    setNextStep("");
    setContent("");
    setShowExpandedPanel(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.noteTitle || "");
    setDealValue(note.dealValue || "");
    setNextStep(note.nextStep || "");
    setContent(note.notes);
    setShowExpandedPanel(true);
  };

  const handleCloseExpandedPanel = () => {
    setShowExpandedPanel(false);
    setEditingNote(null);
  };

  const hasChanges = () => {
    if (!editingNote) return true;
    return (
      title !== (editingNote.noteTitle || "") ||
      dealValue !== (editingNote.dealValue || "") ||
      nextStep !== (editingNote.nextStep || "") ||
      content !== editingNote.notes
    );
  };

  const handleSaveNote = async () => {
    const trimmed = content.trim();

    // Validate only when user clicks the button
    if (!trimmed) {
      setContentError("Note is required.");
      setShowValidation(true);
      return;
    }

    if (isSaving) return;

    setShowValidation(false);
    setContentError("");
    setIsSaving(true);

    const payload = {
      noteTitle: title || undefined,
      dealValue: dealValue || undefined,
      nextStep: nextStep || undefined,
      notes: trimmed,
    };

    try {
      if (editingNote) {
        await notesApi.updateNote(editingNote.id, payload);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id
              ? {
                  ...n,
                  noteTitle: title,
                  dealValue: dealValue || null,
                  nextStep: nextStep || null,
                  notes: trimmed,
                }
              : n,
          ),
        );
      } else {
        const response = await notesApi.createNote({
          ...payload,
          contactId: hubspotContactId,
        });
        const newNote: Note = {
          id: response.data,
          noteTitle: title,
          dealValue: dealValue || null,
          nextStep: nextStep || null,
          notes: trimmed,
          timestamp: new Date().toISOString(),
        };
        setNotes((prev) => [newNote, ...prev]);
        onNotesCountChange?.(notes.length + 1);
      }
      handleCloseExpandedPanel();
    } catch (err) {
      console.error("Failed to save note:", err);
      alert("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = (id: string) => {
    setNoteToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;

    const noteId = noteToDelete;
    setShowDeleteConfirm(false);
    setNoteToDelete(null);
    setDeletingNoteId(noteId);

    try {
      await notesApi.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      onNotesCountChange?.(notes.length - 1);
    } catch (err) {
      console.error("Failed to delete note:", err);
      alert("Failed to delete note");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setNoteToDelete(null);
  };

  if (!isOpen || !shadowRoot) return null;

  const isFormValid = content.trim() && (!editingNote || hasChanges());

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

      {!showExpandedPanel && (
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
              onClick={handleCreateNote}
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
                    onClick={() => handleEditNote(note)}
                    onDelete={() => deleteNote(note.id)}
                    isDeleting={deletingNoteId === note.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showExpandedPanel && (
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
          <line
            x1="14"
            y1="32"
            x2="26"
            y2="32"
            stroke={colors.textSecondary}
            strokeWidth="2"
          />
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
              onClick={handleCloseExpandedPanel}
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
                  Deal Value
                </label>
                <input
                  type="text"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="e.g., $50,000"
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
                  Next Step
                </label>
                <input
                  type="text"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="e.g., Schedule demo for next week"
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

                    if (showValidation) {
                      setContentError(value.trim() ? "" : "Note is required.");
                    }
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
                handleCloseExpandedPanel();
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
              onClick={handleSaveNote}
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
      )}

      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2147483649,
            pointerEvents: "auto",
          }}
          onClick={cancelDelete}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.bg,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: isDark
                ? "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
                : "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px 0",
                fontSize: "18px",
                fontWeight: 600,
                color: colors.text,
              }}
            >
              Delete Note
            </h3>
            <p
              style={{
                margin: "0 0 24px 0",
                fontSize: "14px",
                color: colors.textSecondary,
                lineHeight: "1.5",
              }}
            >
              Are you sure you want to delete this note? This action cannot be
              undone.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={cancelDelete}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.bgSecondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: "10px 20px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );

  return createPortal(
    <>
      <style>{`* { box-sizing: border-box; }`}</style>
      {panelContent}
    </>,
    shadowRoot,
  );
}
