import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useShadowPortal } from "../hooks/useShadowPortal";
import { notesApi, hubspotApi } from "../services/api";
import NoteListPanel from "./NoteListPanel";
import NoteEditorPanel from "./NoteEditorPanel";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface Note {
  id: string;
  noteTitle: string;
  notes: string;
  timestamp: string;
  contactId?: string;
  contactName?: string;
  contactCompany?: string;
}

interface Contact {
  id: string;
  name: string;
  company?: string;
}

interface NotesInfoPanelProps {
  onClose: () => void;
}

export default function NotesInfoPanel({ onClose }: NotesInfoPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const shadowRoot = useShadowPortal(true);

  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    bgSecondary: isDark ? "#2d3748" : "#f9fafb",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    link: isDark ? "#63b3ed" : "#0073b1",
    hover: isDark ? "#374151" : "#e5e7eb",
    inputBg: isDark ? "#2d3748" : "#ffffff",
  };

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("ALL");
  const [contactSearch, setContactSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notesError, setNotesError] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showSelectContactFlash, setShowSelectContactFlash] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [contentError, setContentError] = useState("");

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setContactsLoading(true);
    setContactsError(false);
    try {
      const res = await hubspotApi.getAllContacts();
      setContacts(res.data?.contacts ?? []);
    } catch {
      setContactsError(true);
    } finally {
      setContactsLoading(false);
    }
  };

  // Load all notes once contacts are ready.
  useEffect(() => {
    if (contactsLoading || contactsError) return;
    const load = async () => {
      setIsLoading(true);
      setNotesError(false);
      try {
        const res = await notesApi.getAllNotes();
        setAllNotes(res.data?.notes ?? []);
      } catch {
        setNotesError(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [contactsLoading, contactsError]);

  useEffect(() => {
    if (!shadowRoot) return;
    const handler = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setContactSearch("");
      }
    };
    shadowRoot.addEventListener("mousedown", handler);
    return () => shadowRoot.removeEventListener("mousedown", handler);
  }, [shadowRoot]);

  // Derive the visible note list from the master list based on selected contact.
  const notes = selectedContactId === "ALL"
    ? allNotes
    : allNotes.filter((n) => n.contactId === selectedContactId);

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    setShowSelectContactFlash(false);
  };

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const canCreate = selectedContactId !== "ALL";

  const handleCreateNote = () => {
    if (!canCreate) {
      setShowSelectContactFlash(true);
      setTimeout(() => setShowSelectContactFlash(false), 2500);
      return;
    }
    setEditingNote(null);
    setEditingContact(null);
    setTitle("");
    setContent("");
    setShowEditor(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    // Prefer name/company embedded in the note (works even when contact is not
    // in the dropdown). Fall back to local contacts lookup for the specific-contact view.
    const localContact = contacts.find((c) => c.id === note.contactId);
    setEditingContact(
      note.contactName
        ? { id: note.contactId ?? "", name: note.contactName, company: note.contactCompany }
        : localContact ?? null,
    );
    setTitle(note.noteTitle || "");
    setContent(note.notes);
    setShowEditor(true);
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
        setAllNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id ? { ...n, noteTitle: title, notes: trimmed } : n,
          ),
        );
      } else {
        const response = await notesApi.createNote({ ...payload, contactId: selectedContactId });
        const contact = contacts.find((c) => c.id === selectedContactId);
        const newNote: Note = {
          id: response.data, noteTitle: title, notes: trimmed,
          timestamp: new Date().toISOString(),
          contactId: selectedContactId,
          contactName: contact?.name,
          contactCompany: contact?.company,
        };
        setAllNotes((prev) => [newNote, ...prev]);
      }
      setShowEditor(false);
      setEditingNote(null);
    } catch {
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
      setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      alert("Failed to delete note");
    } finally {
      setDeletingNoteId(null);
    }
  };

  if (!shadowRoot) return null;

  const isFormValid = content.trim() && (!editingNote || hasChanges());

  const selectedContactLabel = selectedContactId === "ALL"
    ? "All Notes"
    : (contacts.find((c) => c.id === selectedContactId)?.name ?? "All Notes");

  const filteredContacts = contacts.filter(
    (c) =>
      !contactSearch ||
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(contactSearch.toLowerCase()),
  );

  const isDropdownLoading = contactsLoading || isLoading;

  const contactDropdown = (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger button */}
      <div
        onClick={() => { if (!isDropdownLoading) setDropdownOpen((prev) => !prev); }}
        style={{
          width: "100%", padding: "6px 28px 6px 10px",
          border: `1px solid ${colors.border}`,
          borderRadius: "6px", fontSize: "13px",
          color: colors.text, background: colors.inputBg,
          cursor: isDropdownLoading ? "wait" : "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxSizing: "border-box",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          userSelect: "none", position: "relative",
        }}
      >
        {isDropdownLoading ? (contactsLoading ? "Loading contacts…" : "Loading notes…") : selectedContactLabel}
        {/* chevron */}
        <span style={{
          position: "absolute", right: "8px", top: "50%", transform: (!isDropdownLoading && dropdownOpen) ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          pointerEvents: "none", fontSize: "10px", color: colors.textSecondary, transition: "transform 0.15s",
          opacity: isDropdownLoading ? 0.35 : 1,
        }}>▼</span>
      </div>

      {/* Dropdown list */}
      {!isDropdownLoading && dropdownOpen && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 2147483647,
          background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}>
          {/* Search input pinned at top */}
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${colors.border}` }}>
            <input
              autoFocus
              type="text"
              placeholder="Search contacts…"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", padding: "5px 8px",
                border: `1px solid ${colors.border}`,
                borderRadius: "5px", fontSize: "12px",
                color: colors.text, background: colors.inputBg,
                outline: "none", boxSizing: "border-box",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
            />
          </div>

          {/* Scrollable list */}
          <div style={{ maxHeight: "180px", overflowY: "auto", scrollbarWidth: "none" }}>
            {/* Always-present "All Notes" item */}
            <div
              onMouseDown={(e) => { e.preventDefault(); handleContactChange("ALL"); setDropdownOpen(false); setContactSearch(""); }}
              style={{
                padding: "7px 12px", fontSize: "13px", cursor: "pointer",
                color: colors.text,
                background: selectedContactId === "ALL" ? colors.hover : "transparent",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = colors.hover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = selectedContactId === "ALL" ? colors.hover : "transparent"; }}
            >
              All Notes
            </div>

            {filteredContacts.map((c) => (
              <div
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); handleContactChange(c.id); setDropdownOpen(false); setContactSearch(""); }}
                style={{
                  padding: "7px 12px", fontSize: "13px", cursor: "pointer",
                  color: colors.text,
                  background: selectedContactId === c.id ? colors.hover : "transparent",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = colors.hover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = selectedContactId === c.id ? colors.hover : "transparent"; }}
              >
                {c.name}{c.company?.trim() ? ` · ${c.company.trim()}` : ""}
              </div>
            ))}

            {filteredContacts.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: "12px", color: colors.textSecondary, textAlign: "center" }}>
                No contacts found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const panelContent = (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", pointerEvents: "auto" }}
      />

      {contactsError ? (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "420px", background: colors.bg, zIndex: 2147483647, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "auto", gap: "12px" }}>
          <p style={{ color: colors.text, fontSize: "14px" }}>Failed to load contacts</p>
          <button onClick={loadContacts} style={{ padding: "8px 20px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>Retry</button>
        </div>
      ) : !showEditor ? (
        <NoteListPanel
          colors={colors} isDark={isDark} notes={notes}
          isLoading={contactsLoading || isLoading}
          deletingNoteId={deletingNoteId} contactName=""
          headerSlot={
            <>
              {contactDropdown}
              {showSelectContactFlash && (
                <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#e53e3e", fontWeight: 500 }}>
                  Please select a contact before creating a note.
                </p>
              )}
            </>
          }
          onClose={onClose}
          onCreateNote={handleCreateNote}
          onEditNote={handleEditNote}
          onDeleteNote={deleteNote}
        />
      ) : (
        <NoteEditorPanel
          colors={colors} isDark={isDark} editingNote={editingNote}
          contactName={(editingContact ?? selectedContact)?.name ?? ""}
          companyName={(editingContact ?? selectedContact)?.company ?? ""}
          title={title} setTitle={setTitle} content={content}
          setContent={(value) => {
            setContent(value);
            if (showValidation) setContentError(value.trim() ? "" : "Note is required.");
          }}
          showValidation={showValidation} contentError={contentError}
          isSaving={isSaving} isFormValid={!!isFormValid} hasChanges={hasChanges}
          onClose={() => { setShowEditor(false); setEditingNote(null); setEditingContact(null); }}
          onSave={handleSaveNote}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog colors={colors} isDark={isDark} onConfirm={confirmDelete} onCancel={() => { setShowDeleteConfirm(false); setNoteToDelete(null); }} />
      )}
    </>
  );

  return createPortal(
    <>
      <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } } *::-webkit-scrollbar { display: none; }`}</style>
      {panelContent}
    </>,
    shadowRoot,
  );
}
