import { useState, useEffect } from "react";
import { useTheme } from "../../context/ThemeContext";
import { tasksApi } from "../../services/api";
import { useShadowPortal } from "../../hooks/useShadowPortal";
import { useToast } from "../../hooks/useToast";
import { createPortal } from "react-dom";
import DatePicker from "../shared/DatePicker";
import TimePicker from "../shared/TimePicker";

const REMINDER_OPTIONS = [
  { key: "none",    label: "None" },
  { key: "at_time", label: "At time of task" },
  { key: "15min",   label: "15 minutes before" },
  { key: "30min",   label: "30 minutes before" },
  { key: "1hour",   label: "1 hour before" },
  { key: "2hours",  label: "2 hours before" },
  { key: "1day",    label: "1 day before" },
  { key: "1week",   label: "1 week before" },
  { key: "custom",  label: "Custom date & time…" },
];

const REMINDER_OFFSETS: Record<string, number> = {
  at_time: 0, "15min": 900000, "30min": 1800000,
  "1hour": 3600000, "2hours": 7200000, "1day": 86400000, "1week": 604800000,
};

function isReminderDisabled(key: string, dueDate: string, time: string): boolean {
  if (!dueDate || !time) return true;
  const dueMs = new Date(`${dueDate}T${time}:00`).getTime();
  return (dueMs - (REMINDER_OFFSETS[key] ?? 0)) < Date.now();
}

interface Task {
  id: string;
  taskName: string;
  dueDate: string | null;
  time: string | null;
  priority: "None" | "Low" | "Medium" | "High";
  status: string;
  assignedTo: string | null;
  comment: string | null;
  timestamp: string;
}

interface TaskFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  hubspotContactId?: string;
  editingTask: Task | null;
  onTaskSaved: (newTask?: Task, updatedTask?: Task) => void;
  owners?: Array<{ id: string; name: string }>;
}

export default function TaskFormPanel({
  isOpen,
  onClose,
  contactName,
  hubspotContactId,
  editingTask,
  onTaskSaved,
  owners = [],
}: TaskFormPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    bgSecondary: isDark ? "#2d3748" : "#f9fafb",
    border: isDark ? "#4a5568" : "#d1d5db",
    text: isDark ? "#f7fafc" : "#1f2937",
    textSecondary: isDark ? "#a0aec0" : "#6b7280",
    link: isDark ? "#63b3ed" : "#667eea",
    inputBg: isDark ? "#2d3748" : "#ffffff",
    hover: isDark ? "#374151" : "#e5e7eb",
  };

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
    taskName?: string;
    assignedTo?: string;
    dueDate?: string;
    time?: string;
  }>({});

  // Creating Shadow DOM portal to render the form outside of LinkedIn's React tree and avoid CSS conflicts
  const shadowRoot = useShadowPortal(isOpen);
  const { toast, showToast } = useToast();
  const toastShadowRoot = useShadowPortal(toast.show);

  useEffect(() => {
    if (editingTask) {
      setTaskName(editingTask.taskName);
      setDueDate(editingTask.dueDate || "");
      setTime(editingTask.time || "");
      setPriority(editingTask.priority);
      setStatus(editingTask.status);
      setReminder((editingTask as any).reminder || "none");
      setReminderCustomDate((editingTask as any).reminderCustomDate || "");
      setReminderCustomTime((editingTask as any).reminderCustomTime || "");
      const owner = owners.find((o) => o.name === editingTask.assignedTo);
      setAssignedTo(owner ? owner.id : "");
      setComment(editingTask.comment || "");
    } else {
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
    }
  }, [editingTask, owners]);

  // Auto-reset reminder if due date/time change makes it invalid
  useEffect(() => {
    if (reminder === "none" || reminder === "custom") return;
    if (!dueDate || !time) { setReminder("none"); return; }
    if (isReminderDisabled(reminder, dueDate, time)) setReminder("none");
  }, [dueDate, time]);

  // Clear custom reminder date/time when due date changes (constraint may shift)
  useEffect(() => {
    setReminderCustomDate("");
    setReminderCustomTime("");
  }, [dueDate]);

  // Clear custom reminder date/time when reminder type changes away from "custom"
  useEffect(() => {
    if (reminder !== "custom") {
      setReminderCustomDate("");
      setReminderCustomTime("");
    }
  }, [reminder]);

  useEffect(() => {
    if (!showValidation) return;
    setValidationErrors(getValidationErrors());
  }, [taskName, assignedTo, dueDate, time, showValidation]);

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

  const handleSave = async () => {
    // user clicked primary button; now we show errors if any
    const errors = getValidationErrors();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      return;
    }

    setShowValidation(false);
    setValidationErrors({});

    if (isSaving) return;

    setIsSaving(true);

    let userTimeZone = "UTC";
    try {
      userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      userTimeZone = "UTC";
    }

    const reminderCustomDatetime =
      reminder === "custom" && reminderCustomDate && reminderCustomTime
        ? new Date(`${reminderCustomDate}T${reminderCustomTime}:00`).toISOString()
        : undefined;

    const payload = {
      taskName,
      dueDate: dueDate || undefined,
      time: time || undefined,
      priority,
      status: editingTask
        ? editingTask.status === "COMPLETED"
          ? "To do"
          : editingTask.status
        : status,
      assignedTo: assignedTo || undefined,
      comment: comment || undefined,
      reminder,
      reminderCustomDatetime,
      userTimeZone,
    };

    try {
      if (editingTask) {
        await tasksApi.updateTask(editingTask.id, payload);
        const ownerName = owners.find((o) => o.id === assignedTo)?.name || null;
        onTaskSaved(undefined, {
          ...editingTask,
          taskName,
          dueDate: dueDate || null,
          time: time || null,
          priority: priority as "Low" | "Medium" | "High",
          status: payload.status,
          assignedTo: ownerName,
          comment: comment || null,
        });
      } else {
        const response = await tasksApi.createTask({
          ...payload,
          contactId: hubspotContactId,
        });
        const ownerName = owners.find((o) => o.id === assignedTo)?.name || null;
        onTaskSaved(
          {
            id: response.data?.id || Date.now().toString(),
            taskName,
            dueDate: dueDate || null,
            time: time || null,
            priority: priority as "Low" | "Medium" | "High",
            status,
            assignedTo: ownerName,
            comment: comment || null,
            timestamp: new Date().toISOString(),
          },
          undefined,
        );
      }
    } catch (err) {
      console.error("Failed to save task:", err);
      showToast(err instanceof Error ? err.message : "Failed to save task", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const getValidationErrors = () => {
    const errors: {
      taskName?: string;
      assignedTo?: string;
      dueDate?: string;
      time?: string;
    } = {};

    if (!taskName.trim()) {
      errors.taskName = "Task name is required.";
    }

    if (!assignedTo) {
      errors.assignedTo = "Assigned to is required.";
    }

    // If you want date & time to be mandatory:
    if (!dueDate) {
      errors.dueDate = "Due date is required.";
    }
    if (!time) {
      errors.time = "Time is required.";
    }

    return errors;
  };

  const isFormValid =
    Object.keys(getValidationErrors()).length === 0 &&
    (!editingTask || hasChanges());

  if (!isOpen || !shadowRoot) return null;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const isEnabled = isFormValid && !isSaving;

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    fontSize: "14px",
    color: colors.text,
    background: colors.inputBg,
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6l4 4 4-4' stroke='${isDark ? "%23a0aec0" : "%236b7280"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: "40px",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: colors.text,
    marginBottom: "6px",
  };

  const panelPortal = createPortal(
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
          background: colors.bg,
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
            color: colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12 5L7 10l5 5"
              stroke="currentColor"
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
          {editingTask ? "Edit Task" : "Create new Task"}
        </h2>
      </div>

      <div style={{ padding: "24px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={labelStyle}>Task name</label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Task title"
              style={inputStyle}
            />
            {showValidation && validationErrors.taskName && (
              <div
                style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}
              >
                {validationErrors.taskName}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Contact name</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                background: colors.bgSecondary,
                fontSize: "14px",
                color: colors.text,
              }}
            >
              <span>{contactName}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>Due date</label>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                isDark={isDark}
                colors={colors}
                minDate={todayStr}
                placeholder="Select date"
              />
              {showValidation && validationErrors.dueDate && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  {validationErrors.dueDate}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>Time</label>
              <TimePicker
                value={time}
                onChange={setTime}
                disabled={!dueDate}
                isDark={isDark}
                colors={colors}
                minTime={dueDate === todayStr ? currentTimeStr : undefined}
                placeholder="Select time"
              />
              {showValidation && validationErrors.time && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  {validationErrors.time}
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
              <option value="None">None</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          {!editingTask && (
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                <option value="To do">To do</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Reminder</label>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              style={selectStyle}
            >
              {REMINDER_OPTIONS.map((opt) => {
                const noDueDateOrTime = opt.key !== "none" && (!dueDate || !time);
                const pastTime = opt.key !== "none" && opt.key !== "custom" && !noDueDateOrTime
                  && isReminderDisabled(opt.key, dueDate, time);
                const disabled = noDueDateOrTime || pastTime;
                const title = noDueDateOrTime
                  ? "Set a due date and time first"
                  : pastTime
                  ? "This time has already passed"
                  : "";
                return (
                  <option key={opt.key} value={opt.key} disabled={disabled} title={title}>
                    {opt.label}
                  </option>
                );
              })}
            </select>
            {reminder === "custom" && (
              <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={labelStyle}>Reminder date</label>
                  <DatePicker
                    value={reminderCustomDate}
                    onChange={setReminderCustomDate}
                    isDark={isDark}
                    colors={colors}
                    minDate={todayStr}
                    maxDate={dueDate || undefined}
                    placeholder="Select date"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={labelStyle}>Reminder time</label>
                  <TimePicker
                    value={reminderCustomTime}
                    onChange={setReminderCustomTime}
                    disabled={!reminderCustomDate}
                    isDark={isDark}
                    colors={colors}
                    minTime={reminderCustomDate === todayStr ? currentTimeStr : undefined}
                    placeholder="Select time"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Assigned to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={selectStyle}>
              <option value="">Select owner</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
            {showValidation && validationErrors.assignedTo && (
              <div
                style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}
              >
                {validationErrors.assignedTo}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment"
              style={{
                ...inputStyle,
                minHeight: "100px",
                resize: "vertical" as const,
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          gap: "12px",
          background: colors.bg,
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
          onClick={handleSave}
          disabled={!isEnabled}
          style={{
            flex: 1,
            padding: "10px 20px",
            background: isEnabled
              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              : colors.border,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: isEnabled ? "pointer" : "not-allowed",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all 0.2s",
            opacity: isEnabled ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (isEnabled) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {isSaving ? "Saving..." : editingTask ? "Save Task" : "Create Task"}
        </button>
      </div>
      <style>{`* { box-sizing: border-box; }`}</style>
    </div>,
    shadowRoot,
  );

  return (
    <>
      {panelPortal}
      {toast.show &&
        toastShadowRoot &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              background: toast.type === "success" ? "#10b981" : "#ef4444",
              color: "white",
              padding: "12px 20px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              fontSize: "14px",
              fontWeight: 500,
              zIndex: 2147483647,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              pointerEvents: "auto",
            }}
          >
            {toast.message}
          </div>,
          toastShadowRoot,
        )}
    </>
  );
}
