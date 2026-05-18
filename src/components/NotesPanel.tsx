import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { notesApi } from "../services/api";
import { useShadowPortal } from "../hooks/useShadowPortal";
import NoteListPanel from "./NoteListPanel";
import NoteEditorPanel from "./NoteEditorPanel";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface Note {
  id: string;
  noteTitle: string;
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

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

  const shadowRoot = useShadowPortal(isOpen);

  useEffect(() => {
    if (isOpen && hubspotContactId) loadNotes();
  }, [isOpen, hubspotContactId]);

  const loadNotes = async () => {
    if (!hubspotContactId) return;
    setIsLoading(true);
    setNextCursor(null);
    try {
      const response = await notesApi.getNotes(hubspotContactId, undefined, 20);
      const { notes: fetched, hasMore: hm, nextCursor: nc } = response.data;
      setNotes(fetched);
      setHasMore(hm);
      setNextCursor(nc);
      onNotesCountChange?.(fetched.length);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreNotes = async () => {
    if (!hasMore || isLoadingMore || !nextCursor || !hubspotContactId) return;
    setIsLoadingMore(true);
    try {
      const response = await notesApi.getNotes(hubspotContactId, nextCursor, 20);
      const { notes: more, hasMore: hm, nextCursor: nc } = response.data;
      setNotes((prev) => [...prev, ...more]);
      setHasMore(hm);
      setNextCursor(nc);
    } catch (err) {
      console.error("Failed to load more notes:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleCreateNote = () => {
    setEditingNote(null);
    setTitle("");
    setContent("");
    setShowExpandedPanel(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.noteTitle || "");
    setContent(note.notes);
    setShowExpandedPanel(true);
  };

  const handleCloseExpandedPanel = () => {
    setShowExpandedPanel(false);
    setEditingNote(null);
  };

  const hasChanges = () => {
    if (!editingNote) return true;
    return title !== (editingNote.noteTitle || "") || content !== editingNote.notes;
  };

  const handleSaveNote = async () => {
    const trimmed = content.trim();
    if (!trimmed) { setContentError("Note is required."); setShowValidation(true); return; }
    if (isSaving) return;
    setShowValidation(false);
    setContentError("");
    setIsSaving(true);
    const payload = { noteTitle: title || undefined, notes: trimmed };
    try {
      if (editingNote) {
        await notesApi.updateNote(editingNote.id, payload);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id ? { ...n, noteTitle: title, notes: trimmed } : n,
          ),
        );
      } else {
        const response = await notesApi.createNote({ ...payload, contactId: hubspotContactId! });
        const newNote: Note = { id: response.data, noteTitle: title, notes: trimmed, timestamp: new Date().toISOString() };
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

  const deleteNote = (id: string) => { setNoteToDelete(id); setShowDeleteConfirm(true); };

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

  const cancelDelete = () => { setShowDeleteConfirm(false); setNoteToDelete(null); };

  if (!isOpen || !shadowRoot) return null;

  const isFormValid = content.trim() && (!editingNote || hasChanges());

  return createPortal(
    <>
      <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } } *::-webkit-scrollbar { display: none; }`}</style>
      <div
        onClick={onClose}
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", pointerEvents: "auto" }}
      />
      {!showExpandedPanel && (
        <NoteListPanel
          colors={colors} isDark={isDark} notes={notes}
          isLoading={isLoading} isLoadingMore={isLoadingMore} hasMore={hasMore}
          deletingNoteId={deletingNoteId} contactName={contactName}
          onClose={onClose} onCreateNote={handleCreateNote}
          onEditNote={handleEditNote} onDeleteNote={deleteNote}
          onLoadMore={loadMoreNotes}
        />
      )}
      {showExpandedPanel && (
        <NoteEditorPanel
          colors={colors} isDark={isDark} editingNote={editingNote}
          contactName={contactName} companyName={companyName}
          title={title} setTitle={setTitle} content={content}
          setContent={(value) => {
            setContent(value);
            if (showValidation) setContentError(value.trim() ? "" : "Note is required.");
          }}
          showValidation={showValidation} contentError={contentError}
          isSaving={isSaving} isFormValid={!!isFormValid} hasChanges={hasChanges}
          onClose={handleCloseExpandedPanel} onSave={handleSaveNote}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmDialog colors={colors} isDark={isDark} onConfirm={confirmDelete} onCancel={cancelDelete} />
      )}
    </>,
    shadowRoot,
  );
}
