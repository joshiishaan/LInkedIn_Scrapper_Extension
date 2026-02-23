import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import NoteCard from "./NoteCard";
import { notesApi } from "../services/api";

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
    bgSecondary: isDark ? "#2d3748" : "#f7f8fa",
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
  const [isClosing, setIsClosing] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [content, setContent] = useState("");

  // Load notes from backend when panel opens
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

  // Create isolated portal container to prevent style conflicts
  useEffect(() => {
    if (!isOpen) return;

    // Create isolated container
    const container = document.createElement("div");
    container.id = "amazon-q-notes-panel-root";
    container.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647 !important;";
    document.body.appendChild(container);
    setPortalRoot(container);

    // Disable body scroll
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      container.remove();
      setPortalRoot(null);
    };
  }, [isOpen]);

  // Reset expanded panel state when main panel closes
  useEffect(() => {
    if (!isOpen && showExpandedPanel) {
      setShowExpandedPanel(false);
      setIsClosing(false);
    }
  }, [isOpen, showExpandedPanel]);

  const handleCreateNote = () => {
    setEditingNote(null);
    setTitle("");
    setDealValue("");
    setNextStep("");
    setContent("");
    setShowExpandedPanel(true);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 10);
  };

  // Toggle or open note editor panel
  const handleEditNote = (note: Note) => {
    // If clicking the same note that's already open, close the panel
    if (editingNote?.id === note.id && showExpandedPanel) {
      handleCloseExpandedPanel();
      return;
    }

    // If panel is already open with a different note, just update the content without animation
    if (showExpandedPanel) {
      setEditingNote(note);
      setTitle(note.noteTitle || "");
      setDealValue(note.dealValue || "");
      setNextStep(note.nextStep || "");
      setContent(note.notes);
    } else {
      // Opening panel for the first time
      setEditingNote(note);
      setTitle(note.noteTitle || "");
      setDealValue(note.dealValue || "");
      setNextStep(note.nextStep || "");
      setContent(note.notes);
      setShowExpandedPanel(true);
      setIsClosing(true);
      setTimeout(() => setIsClosing(false), 10);
    }
  };

  // Animate panel close with delay
  const handleCloseExpandedPanel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowExpandedPanel(false);
      setIsClosing(false);
    }, 300);
  };

  // Check if note has unsaved changes
  const hasChanges = () => {
    if (!editingNote) return true;
    return (
      (title || "") !== (editingNote.noteTitle || "") ||
      (dealValue || "") !== (editingNote.dealValue || "") ||
      (nextStep || "") !== (editingNote.nextStep || "") ||
      content !== editingNote.notes
    );
  };

  const handleSaveNote = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      const payload = {
        noteTitle: title || undefined,
        dealValue: dealValue || undefined,
        nextStep: nextStep || undefined,
        notes: content,
      };

      if (editingNote) {
        // Update existing note
        await notesApi.updateNote(editingNote.id, payload);

        // Update local state without refetching
        setNotes((prevNotes) =>
          prevNotes.map((note) =>
            note.id === editingNote.id
              ? {
                  ...note,
                  noteTitle: title,
                  dealValue: dealValue || null,
                  nextStep: nextStep || null,
                  notes: content,
                }
              : note,
          ),
        );
      } else {
        await notesApi.createNote({
          ...payload,
          contactId: hubspotContactId,
        });
        await loadNotes();
      }

      setShowExpandedPanel(false);
    } catch (err) {
      console.error("Failed to save note:", err);
      alert("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await notesApi.deleteNote(id);
      // Reload notes after deletion
      await loadNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
      alert("Failed to delete note");
    }
  };

  if (!isOpen || !portalRoot) return null;

  const panelContent = (
    <>
      {/* Backdrop */}
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

      {/* Main Side Panel */}
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
          animation: "expandFromRight 0.3s ease-out",
          pointerEvents: "auto",
        }}
      >
        {/* Header */}
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

        {/* Create Note Button */}
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

        {/* Notes List */}
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
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  title={note.noteTitle || "Untitled Note"}
                  content={note.notes || "No content"}
                  timestamp={new Date(note.timestamp).getTime()}
                  onClick={() => handleEditNote(note)}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Panel for Creating/Editing Notes */}
      {(showExpandedPanel || isClosing) && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: showExpandedPanel && !isClosing ? "calc(90vw - 420px)" : "0",
            marginRight: "420px",
            background: colors.bg,
            zIndex: 2147483647,
            display: "flex",
            flexDirection: "column",
            transition: "width 0.3s ease-out",
            overflowY: "auto",
            overflowX: "hidden",
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={handleCloseExpandedPanel}
            title="Close panel"
            style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s",
              zIndex: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18l6-6-6-6"
                stroke={colors.text}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div style={{ padding: "32px 40px 32px 64px" }}>
            {/* Header */}
            <div style={{ marginBottom: "32px" }}>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  color: colors.text,
                  margin: "0 0 8px 0",
                }}
              >
                {editingNote ? "Edit Note" : "New Note"}
              </h2>
              <p
                style={{
                  fontSize: "14px",
                  color: colors.textSecondary,
                  margin: 0,
                }}
              >
                {contactName} • {companyName}
              </p>
            </div>

            {/* Form */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              {/* Title */}
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
                    padding: "12px 16px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: colors.text,
                    background: colors.bgSecondary,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = colors.link)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = colors.border)
                  }
                />
              </div>

              {/* Deal Value */}
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
                    padding: "12px 16px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: colors.text,
                    background: colors.bgSecondary,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = colors.link)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = colors.border)
                  }
                />
              </div>

              {/* Next Step */}
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
                    padding: "12px 16px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: colors.text,
                    background: colors.bgSecondary,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = colors.link)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = colors.border)
                  }
                />
              </div>

              {/* Notes Content */}
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
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Add detailed notes about the conversation, key points discussed, pain points, objections, etc."
                  style={{
                    width: "100%",
                    minHeight: "200px",
                    padding: "12px 16px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: colors.text,
                    background: colors.bgSecondary,
                    resize: "vertical",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                    lineHeight: "1.6",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = colors.link)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = colors.border)
                  }
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px", paddingTop: "16px" }}>
                <button
                  onClick={handleCloseExpandedPanel}
                  style={{
                    flex: 1,
                    padding: "12px 24px",
                    background: colors.bgSecondary,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.hover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.bgSecondary;
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={
                    !content.trim() ||
                    isSaving ||
                    (editingNote ? !hasChanges() : false)
                  }
                  title={
                    !content.trim()
                      ? "Please add notes before saving"
                      : editingNote && !hasChanges()
                        ? "No changes to update"
                        : ""
                  }
                  style={{
                    flex: 1,
                    padding: "12px 24px",
                    background:
                      content.trim() && (!editingNote || hasChanges())
                        ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                        : colors.border,
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor:
                      content.trim() && (!editingNote || hasChanges())
                        ? "pointer"
                        : "not-allowed",
                    fontSize: "14px",
                    fontWeight: 600,
                    transition: "all 0.2s",
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
          </div>
        </div>
      )}

      <style>
        {`
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}
      </style>
    </>
  );

  return createPortal(panelContent, portalRoot);
}
