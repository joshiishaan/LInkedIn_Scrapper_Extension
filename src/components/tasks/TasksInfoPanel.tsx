import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useShadowPortal } from "../../hooks/useShadowPortal";
import { useToast } from "../../hooks/useToast";
import { tasksApi, hubspotApi } from "../../services/api";
import TaskListPanel from "./TaskListPanel";
import TaskEditorPanel from "./TaskEditorPanel";
import DeleteConfirmDialog from "../shared/DeleteConfirmDialog";

interface Task {
  id: string;
  taskName: string;
  dueDate: string | null;
  time: string | null;
  priority: string;
  status: string;
  assignedTo: string | null;
  comment: string | null;
  reminder?: string | null;
  reminderCustomDate?: string | null;
  reminderCustomTime?: string | null;
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

interface TasksInfoPanelProps {
  onClose: () => void;
}

export default function TasksInfoPanel({ onClose }: TasksInfoPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const shadowRoot = useShadowPortal(true);
  const { toast, showToast } = useToast();
  const toastShadowRoot = useShadowPortal(toast.show);

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

  // ── Loading & data ──────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState(false);

  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tasksError, setTasksError] = useState(false);

  // ── Contact filter dropdown ─────────────────────────────────────────────
  const [selectedContactId, setSelectedContactId] = useState<string>("ALL");
  const [contactSearch, setContactSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── View state ──────────────────────────────────────────────────────────
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showSelectContactFlash, setShowSelectContactFlash] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────
  const [taskName, setTaskName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("To do");
  const [reminder, setReminder] = useState("none");
  const [reminderCustomDate, setReminderCustomDate] = useState("");
  const [reminderCustomTime, setReminderCustomTime] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    taskName?: string; assignedTo?: string; dueDate?: string; time?: string;
  }>({});

  // Phase 1: load contacts + owners in parallel
  useEffect(() => {
    let cancelled = false;

    setContactsLoading(true);
    setOwnersLoading(true);
    setContactsError(false);

    hubspotApi.getAllContacts()
      .then((res) => { if (!cancelled) setContacts(res.data?.contacts ?? []); })
      .catch(() => { if (!cancelled) setContactsError(true); })
      .finally(() => { if (!cancelled) setContactsLoading(false); });

    hubspotApi.getPropertyOptions()
      .then((res) => {
        if (!cancelled) {
          const raw: Array<{ label: string; value: string }> = res.data?.owners ?? [];
          setOwners(raw.map((o) => ({ id: o.value, name: o.label })));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setOwnersLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const loadTasks = () => {
    setIsLoading(true);
    setTasksError(false);
    let userTimeZone = "UTC";
    try { userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* ignore */ }
    tasksApi.getAllTasks(userTimeZone)
      .then((res) => { setAllTasks(res.data?.tasks ?? []); })
      .catch(() => { setTasksError(true); })
      .finally(() => { setIsLoading(false); });
  };

  // Phase 2: load tasks once contacts are ready
  useEffect(() => {
    if (contactsLoading || contactsError) return;
    let cancelled = false;
    setIsLoading(true);
    setTasksError(false);

    let userTimeZone = "UTC";
    try { userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* ignore */ }

    tasksApi.getAllTasks(userTimeZone)
      .then((res) => { if (!cancelled) setAllTasks(res.data?.tasks ?? []); })
      .catch(() => { if (!cancelled) setTasksError(true); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [contactsLoading, contactsError]);

  // Shadow root outside-click handler for dropdown
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

  // Keep validation errors in sync while form is visible
  useEffect(() => {
    if (!showValidation) return;
    setValidationErrors(getValidationErrors());
  }, [taskName, assignedTo, dueDate, time, showValidation]);

  // ── Derived state ───────────────────────────────────────────────────────
  const tasks = selectedContactId === "ALL"
    ? allTasks
    : allTasks.filter((t) => t.contactId === selectedContactId);

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const isDropdownLoading = contactsLoading || ownersLoading || isLoading;

  const selectedContactLabel = selectedContactId === "ALL"
    ? "All Tasks"
    : (contacts.find((c) => c.id === selectedContactId)?.name ?? "All Tasks");

  const filteredContacts = contacts.filter(
    (c) =>
      !contactSearch ||
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(contactSearch.toLowerCase()),
  );

  // ── Form helpers ────────────────────────────────────────────────────────
  const getValidationErrors = () => {
    const errors: { taskName?: string; assignedTo?: string; dueDate?: string; time?: string } = {};
    if (!taskName.trim()) errors.taskName = "Task name is required.";
    if (!assignedTo) errors.assignedTo = "Assigned to is required.";
    if (!dueDate) errors.dueDate = "Due date is required.";
    if (!time) errors.time = "Time is required.";
    return errors;
  };

  const hasChanges = () => {
    if (!editingTask) return true;
    const owner = owners.find((o) => o.name === editingTask.assignedTo);
    return (
      taskName !== editingTask.taskName ||
      dueDate !== (editingTask.dueDate || "") ||
      time !== (editingTask.time || "") ||
      priority !== editingTask.priority ||
      assignedTo !== (owner?.id || "") ||
      comment !== (editingTask.comment || "")
    );
  };

  const isFormValid = Object.keys(getValidationErrors()).length === 0 && (!editingTask || hasChanges());

  // ── CRUD handlers ───────────────────────────────────────────────────────
  const handleCreateTask = () => {
    if (selectedContactId === "ALL") {
      setShowSelectContactFlash(true);
      setTimeout(() => setShowSelectContactFlash(false), 2500);
      return;
    }
    setEditingTask(null);
    setEditingContact(null);
    setTaskName("");
    setDueDate("");
    setTime("");
    setPriority("Medium");
    setStatus("To do");
    setReminder("none");
    setReminderCustomDate("");
    setReminderCustomTime("");
    setAssignedTo("");
    setComment("");
    setShowValidation(false);
    setValidationErrors({});
    setShowEditor(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    const localContact = contacts.find((c) => c.id === task.contactId);
    setEditingContact(
      task.contactName
        ? { id: task.contactId ?? "", name: task.contactName, company: task.contactCompany }
        : localContact ?? null,
    );
    setTaskName(task.taskName);
    setDueDate(task.dueDate || "");
    setTime(task.time || "");
    setPriority(task.priority);
    setReminder(task.reminder || "none");
    setReminderCustomDate(task.reminderCustomDate || "");
    setReminderCustomTime(task.reminderCustomTime || "");
    const owner = owners.find((o) => o.name === task.assignedTo);
    setAssignedTo(owner?.id || "");
    setComment(task.comment || "");
    setShowValidation(false);
    setValidationErrors({});
    setShowEditor(true);
  };

  const handleSaveTask = async () => {
    const errors = getValidationErrors();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      return;
    }
    if (isSaving) return;
    setShowValidation(false);
    setValidationErrors({});
    setIsSaving(true);

    let userTimeZone = "UTC";
    try { userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* ignore */ }

    const ownerName = owners.find((o) => o.id === assignedTo)?.name || null;
    const reminderCustomDatetime =
      reminder === "custom" && reminderCustomDate && reminderCustomTime
        ? new Date(`${reminderCustomDate}T${reminderCustomTime}:00`).toISOString()
        : undefined;

    try {
      if (editingTask) {
        await tasksApi.updateTask(editingTask.id, {
          taskName,
          dueDate: dueDate || undefined,
          time: time || undefined,
          priority,
          status: editingTask.status === "COMPLETED" ? "To do" : editingTask.status,
          assignedTo: assignedTo || undefined,
          comment: comment || undefined,
          reminder,
          reminderCustomDatetime,
          userTimeZone,
        });
        setAllTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id
              ? { ...t, taskName, dueDate: dueDate || null, time: time || null, priority, assignedTo: ownerName, comment: comment || null }
              : t,
          ),
        );
      } else {
        const response = await tasksApi.createTask({
          taskName,
          dueDate: dueDate || undefined,
          time: time || undefined,
          priority,
          status,
          assignedTo: assignedTo || undefined,
          comment: comment || undefined,
          reminder,
          reminderCustomDatetime,
          contactId: selectedContactId,
          userTimeZone,
        });
        const contact = contacts.find((c) => c.id === selectedContactId);
        const newTask: Task = {
          id: response.data?.id || Date.now().toString(),
          taskName,
          dueDate: dueDate || null,
          time: time || null,
          priority,
          status: status === "Completed" ? "COMPLETED" : "NOT_STARTED",
          assignedTo: ownerName,
          comment: comment || null,
          timestamp: new Date().toISOString(),
          contactId: selectedContactId,
          contactName: contact?.name,
          contactCompany: contact?.company,
        };
        setAllTasks((prev) => [newTask, ...prev]);
      }
      setShowEditor(false);
      setEditingTask(null);
      setEditingContact(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save task", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    const isCompleted = task.status.toUpperCase() === "COMPLETED";
    const newStatus = isCompleted ? "To do" : "COMPLETED";

    // Optimistic update
    setAllTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );

    let userTimeZone = "UTC";
    try { userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* ignore */ }

    const owner = owners.find((o) => o.name === task.assignedTo);
    try {
      await tasksApi.updateTask(task.id, {
        taskName: task.taskName,
        dueDate: task.dueDate || undefined,
        time: task.time || undefined,
        priority: task.priority,
        status: newStatus,
        assignedTo: owner?.id,
        comment: task.comment || undefined,
        userTimeZone,
      });
    } catch (err) {
      // Revert on failure
      setAllTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
      showToast(err instanceof Error ? err.message : "Failed to update task status", "error");
    }
  };

  const deleteTask = (id: string) => { setTaskToDelete(id); setShowDeleteConfirm(true); };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete;
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
    setDeletingTaskId(id);
    try {
      await tasksApi.deleteTask(id);
      setAllTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete task", "error");
    } finally {
      setDeletingTaskId(null);
    }
  };

  const loadContacts = () => {
    setContactsError(false);
    setContactsLoading(true);
    hubspotApi.getAllContacts()
      .then((res) => setContacts(res.data?.contacts ?? []))
      .catch(() => setContactsError(true))
      .finally(() => setContactsLoading(false));
  };

  if (!shadowRoot) return null;

  // ── Contact dropdown ────────────────────────────────────────────────────
  const contactDropdown = (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
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
        {isDropdownLoading
          ? (contactsLoading ? "Loading contacts…" : ownersLoading ? "Loading owners…" : "Loading tasks…")
          : selectedContactLabel}
        <span style={{
          position: "absolute", right: "8px", top: "50%",
          transform: (!isDropdownLoading && dropdownOpen) ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          pointerEvents: "none", fontSize: "10px", color: colors.textSecondary,
          transition: "transform 0.15s", opacity: isDropdownLoading ? 0.35 : 1,
        }}>▼</span>
      </div>

      {!isDropdownLoading && dropdownOpen && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 2147483647,
          background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}>
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
          <div style={{ maxHeight: "180px", overflowY: "auto", scrollbarWidth: "none" }}>
            <div
              onMouseDown={(e) => { e.preventDefault(); setSelectedContactId("ALL"); setShowSelectContactFlash(false); setDropdownOpen(false); setContactSearch(""); }}
              style={{
                padding: "7px 12px", fontSize: "13px", cursor: "pointer",
                color: colors.text,
                background: selectedContactId === "ALL" ? colors.hover : "transparent",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = colors.hover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = selectedContactId === "ALL" ? colors.hover : "transparent"; }}
            >
              All Tasks
            </div>
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); setSelectedContactId(c.id); setShowSelectContactFlash(false); setDropdownOpen(false); setContactSearch(""); }}
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
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", pointerEvents: "auto", animation: "fadeIn 0.18s ease-out" }}
      />

      {contactsError ? (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "420px", background: colors.bg, zIndex: 2147483647, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "auto", gap: "12px" }}>
          <p style={{ color: colors.text, fontSize: "14px" }}>Failed to load contacts</p>
          <button onClick={loadContacts} style={{ padding: "8px 20px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>Retry</button>
        </div>
      ) : tasksError ? (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "420px", background: colors.bg, zIndex: 2147483647, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "auto", gap: "12px" }}>
          <p style={{ color: colors.text, fontSize: "14px" }}>Failed to load tasks</p>
          <button onClick={loadTasks} style={{ padding: "8px 20px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>Retry</button>
        </div>
      ) : !showEditor ? (
        <TaskListPanel
          colors={colors} isDark={isDark} tasks={tasks}
          isLoading={isDropdownLoading}
          deletingTaskId={deletingTaskId}
          headerSlot={
            <>
              {contactDropdown}
              {showSelectContactFlash && (
                <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#e53e3e", fontWeight: 500 }}>
                  Please select a contact before creating a task.
                </p>
              )}
            </>
          }
          onClose={onClose}
          onCreateTask={handleCreateTask}
          onEditTask={handleEditTask}
          onDeleteTask={deleteTask}
          onToggleComplete={handleToggleComplete}
        />
      ) : (
        <TaskEditorPanel
          colors={colors} isDark={isDark}
          editingTask={editingTask}
          contactName={(editingContact ?? selectedContact)?.name ?? ""}
          companyName={(editingContact ?? selectedContact)?.company ?? ""}
          owners={owners}
          taskName={taskName} setTaskName={setTaskName}
          dueDate={dueDate} setDueDate={setDueDate}
          time={time} setTime={setTime}
          priority={priority} setPriority={setPriority}
          status={status} setStatus={setStatus}
          reminder={reminder} setReminder={setReminder}
          reminderCustomDate={reminderCustomDate} setReminderCustomDate={setReminderCustomDate}
          reminderCustomTime={reminderCustomTime} setReminderCustomTime={setReminderCustomTime}
          assignedTo={assignedTo} setAssignedTo={setAssignedTo}
          comment={comment} setComment={setComment}
          showValidation={showValidation}
          validationErrors={validationErrors}
          isSaving={isSaving} isFormValid={isFormValid} hasChanges={hasChanges}
          onClose={() => { setShowEditor(false); setEditingTask(null); setEditingContact(null); }}
          onSave={handleSaveTask}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          colors={colors} isDark={isDark}
          onConfirm={confirmDelete}
          onCancel={() => { setShowDeleteConfirm(false); setTaskToDelete(null); }}
        />
      )}
    </>
  );

  const panelPortal = createPortal(
    <>
      <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } } @keyframes slideInRight { from { transform: translateX(420px); } to { transform: translateX(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } *::-webkit-scrollbar { display: none; }`}</style>
      {panelContent}
    </>,
    shadowRoot,
  );

  const toastPortal = toastShadowRoot && toast.show
    ? createPortal(
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 2147483647,
          background: toast.type === "success" ? "#10b981" : "#ef4444",
          color: "#fff", padding: "10px 14px", borderRadius: "10px",
          boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.55)" : "0 10px 30px rgba(0,0,0,0.18)",
          fontSize: "13px", fontWeight: 600,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          maxWidth: "320px",
        }}>
          {toast.message}
        </div>,
        toastShadowRoot,
      )
    : null;

  return <>{panelPortal}{toastPortal}</>;
}
