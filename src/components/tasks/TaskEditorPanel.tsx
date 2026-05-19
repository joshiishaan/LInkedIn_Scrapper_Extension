import { useEffect } from "react";
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
  if (key === "custom") return false;
  const dueMs = new Date(`${dueDate}T${time}:00`).getTime();
  return (dueMs - (REMINDER_OFFSETS[key] ?? 0)) < Date.now();
}

interface Task {
  id: string;
  taskName: string;
  dueDate: string | null;
  time: string | null;
  priority: string;
  status: string;
  assignedTo: string | null;
  comment: string | null;
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
  inputBg: string;
}

interface TaskEditorPanelProps {
  colors: Colors;
  isDark: boolean;
  editingTask: Task | null;
  contactName: string;
  companyName: string;
  owners: Array<{ id: string; name: string }>;
  taskName: string;
  setTaskName: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  reminder: string;
  setReminder: (v: string) => void;
  reminderCustomDate: string;
  setReminderCustomDate: (v: string) => void;
  reminderCustomTime: string;
  setReminderCustomTime: (v: string) => void;
  assignedTo: string;
  setAssignedTo: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  showValidation: boolean;
  validationErrors: { taskName?: string; assignedTo?: string; dueDate?: string; time?: string };
  isSaving: boolean;
  isFormValid: boolean;
  hasChanges: () => boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function TaskEditorPanel({
  colors,
  isDark,
  editingTask,
  contactName,
  companyName,
  owners,
  taskName,
  setTaskName,
  dueDate,
  setDueDate,
  time,
  setTime,
  priority,
  setPriority,
  status,
  setStatus,
  reminder,
  setReminder,
  reminderCustomDate,
  setReminderCustomDate,
  reminderCustomTime,
  setReminderCustomTime,
  assignedTo,
  setAssignedTo,
  comment,
  setComment,
  showValidation,
  validationErrors,
  isSaving,
  isFormValid,
  hasChanges,
  onClose,
  onSave,
}: TaskEditorPanelProps) {
  useEffect(() => {
    if (reminder === "none" || reminder === "custom") return;
    if (!dueDate || !time) { setReminder("none"); return; }
    if (isReminderDisabled(reminder, dueDate, time)) setReminder("none");
  }, [dueDate, time]);

  useEffect(() => {
    setReminderCustomDate("");
    setReminderCustomTime("");
  }, [dueDate]);

  useEffect(() => {
    if (reminder !== "custom") {
      setReminderCustomDate("");
      setReminderCustomTime("");
    }
  }, [reminder]);

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
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: colors.text,
    marginBottom: "6px",
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

  const nowDate = new Date();
  const todayStr = nowDate.toISOString().split("T")[0];
  const currentTimeStr = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`;
  const isEnabled = isFormValid && !isSaving && (!editingTask || hasChanges());

  return (
    <div
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0, width: "420px",
        background: colors.bg,
        boxShadow: isDark ? "-4px 0 24px rgba(0,0,0,0.5)" : "-4px 0 24px rgba(0,0,0,0.15)",
        zIndex: 2147483647,
        display: "flex", flexDirection: "column",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${colors.border}`,
          display: "flex", alignItems: "center", gap: "12px",
          background: colors.bg,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: "4px", display: "flex", alignItems: "center", justifyContent: "center",
            color: colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5L7 10l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: colors.text }}>
          {editingTask ? "Edit Task" : "New Task"}
        </h2>
      </div>

      <div style={{ padding: "24px", flex: 1 }}>
        {/* Contact pill */}
        <div
          style={{
            marginBottom: "24px", padding: "12px 16px",
            background: colors.bgSecondary, borderRadius: "8px",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", color: colors.text, fontWeight: 500 }}>
            {contactName}{companyName ? ` • ${companyName}` : ""}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Task name */}
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
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {validationErrors.taskName}
              </div>
            )}
          </div>

          {/* Due date + Time */}
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
                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
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
                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                  {validationErrors.time}
                </div>
              )}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
              <option value="None">None</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          {/* Status — only shown when creating */}
          {!editingTask && (
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                <option value="To do">To do</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          )}

          {/* Reminder */}
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

          {/* Assigned to */}
          <div>
            <label style={labelStyle}>Assigned to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={selectStyle}>
              <option value="">Select owner</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {showValidation && validationErrors.assignedTo && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {validationErrors.assignedTo}
              </div>
            )}
          </div>

          {/* Comment */}
          <div>
            <label style={labelStyle}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment"
              style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: `1px solid ${colors.border}`,
          display: "flex", gap: "12px",
          background: colors.bg,
        }}
      >
        <button
          onClick={(e) => { if (isSaving) { e.preventDefault(); return; } onClose(); }}
          disabled={isSaving}
          style={{
            flex: 1, padding: "12px 24px",
            background: isSaving ? colors.border : colors.bgSecondary,
            color: isSaving ? colors.textSecondary : colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontSize: "14px", fontWeight: 600,
            transition: "all 0.2s",
            opacity: isSaving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!isSaving) { e.currentTarget.style.background = colors.hover; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgSecondary; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!isEnabled}
          style={{
            flex: 1, padding: "10px 20px",
            background: isEnabled
              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              : colors.border,
            color: "white", border: "none", borderRadius: "6px",
            cursor: isEnabled ? "pointer" : "not-allowed",
            fontSize: "14px", fontWeight: 600,
            transition: "all 0.2s",
            opacity: isEnabled ? 1 : 0.6,
          }}
          onMouseEnter={(e) => { if (isEnabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(102,126,234,0.4)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          {isSaving ? "Saving..." : editingTask ? "Update Task" : "Create Task"}
        </button>
      </div>
    </div>
  );
}
