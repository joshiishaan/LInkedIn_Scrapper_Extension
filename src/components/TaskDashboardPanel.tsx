import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import TaskCard from "./TaskCard";
import TaskFormPanel from "./TaskFormPanel";
import { tasksApi } from "../services/api";

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

interface TaskDashboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  hubspotContactId?: string;
  onTasksCountChange?: (count: number) => void;
  owners?: Array<{ id: string; name: string }>;
}

export default function TaskDashboardPanel({
  isOpen,
  onClose,
  contactName,
  hubspotContactId,
  onTasksCountChange,
  owners = [], // Add this
}: TaskDashboardPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    bgSecondary: isDark ? "#2d3748" : "#f9fafb",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    hover: isDark ? "#374151" : "#e5e7eb",
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && hubspotContactId) {
      loadTasks();
    }
  }, [isOpen, hubspotContactId]);

  useEffect(() => {
    if (!isOpen) return;
    const container = document.createElement("div");
    container.id = "amazon-q-tasks-panel-root";
    container.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647 !important;";
    document.body.appendChild(container);
    setPortalRoot(container);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      container.remove();
      setPortalRoot(null);
    };
  }, [isOpen]);

  const loadTasks = async () => {
    if (!hubspotContactId) return;
    setIsLoading(true);
    try {
      const response = await tasksApi.getTasks(hubspotContactId);
      const fetchedTasks = response.data || [];
      setTasks(fetchedTasks);
      onTasksCountChange?.(fetchedTasks.length);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTaskComplete = async (task: Task) => {
    const newStatus = task.status === "COMPLETED" ? "To do" : "COMPLETED";
    const owner = owners.find((o) => o.name === task.assignedTo);

    setTasks(
      tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );

    try {
      await tasksApi.updateTask(task.id, {
        taskName: task.taskName,
        dueDate: task.dueDate || undefined,
        time: task.time || undefined,
        priority: task.priority,
        status: newStatus,
        assignedTo: owner ? owner.id : undefined,
        comment: task.comment || undefined,
      });
    } catch (err) {
      console.error("Failed to toggle task:", err);
      setTasks(
        tasks.map((t) =>
          t.id === task.id ? { ...t, status: task.status } : t,
        ),
      );
      alert("Failed to update task");
    }
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setShowFormPanel(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowFormPanel(true);
  };

  const handleCloseFormPanel = () => {
    setShowFormPanel(false);
    setEditingTask(null);
  };

  const handleTaskSaved = (newTask?: Task, updatedTask?: Task) => {
    if (newTask) {
      setTasks([newTask, ...tasks]);
      onTasksCountChange?.(tasks.length + 1);
    } else if (updatedTask) {
      setTasks(tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    }
    handleCloseFormPanel();
  };

  const deleteTask = (id: string) => {
    setTaskToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;

    const taskId = taskToDelete;
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
    setDeletingTaskId(taskId);

    try {
      await tasksApi.deleteTask(taskId);
      // Update local state instead of refetching
      setTasks(tasks.filter((t) => t.id !== taskId));
      onTasksCountChange?.(tasks.length - 1);
    } catch (err) {
      console.error("Failed to delete task:", err);
      alert("Failed to delete task");
    } finally {
      setDeletingTaskId(null);
    }
  };
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
  };

  if (!isOpen || !portalRoot) return null;

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

      {!showFormPanel && (
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
          {/* Rest of dashboard panel content stays the same */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 600,
                color: colors.text,
              }}
            >
              Tasks
            </h2>
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
              onClick={handleCreateTask}
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
              Create new Task
            </button>
          </div>

          <div
            style={{
              padding: "20px 24px",
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <select
              value={contactName}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                fontSize: "14px",
                color: colors.text,
                cursor: "pointer",
                outline: "none",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6l4 4 4-4' stroke='${isDark ? "%23a0aec0" : "%23666"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "40px",
              }}
            >
              <option value={contactName}>{contactName}</option>
            </select>
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
                    borderTop: `3px solid #0a4d4d`,
                    borderRadius: "50%",
                    margin: "0 auto 16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
                Loading tasks...
              </div>
            ) : tasks.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: colors.textSecondary,
                }}
              >
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 120 120"
                  style={{ margin: "0 auto 16px" }}
                >
                  <rect
                    x="20"
                    y="30"
                    width="40"
                    height="50"
                    fill="#e0b3ff"
                    rx="4"
                  />
                  <line
                    x1="30"
                    y1="45"
                    x2="50"
                    y2="45"
                    stroke="#000"
                    strokeWidth="2"
                  />
                  <line
                    x1="30"
                    y1="55"
                    x2="50"
                    y2="55"
                    stroke="#000"
                    strokeWidth="2"
                  />
                  <line
                    x1="30"
                    y1="65"
                    x2="45"
                    y2="65"
                    stroke="#000"
                    strokeWidth="2"
                  />
                  <ellipse cx="80" cy="40" rx="15" ry="20" fill="#ffb3d9" />
                  <circle cx="75" cy="35" r="3" fill="#000" />
                  <circle cx="85" cy="35" r="3" fill="#000" />
                  <path d="M75 45 Q80 48 85 45" stroke="#000" strokeWidth="2" />
                  <ellipse cx="80" cy="70" rx="20" ry="10" fill="#ffb3d9" />
                  <rect x="70" y="70" width="8" height="25" fill="#0a4d4d" />
                  <rect x="82" y="70" width="8" height="25" fill="#0a4d4d" />
                  <path d="M65 80 L75 95" stroke="#0a4d4d" strokeWidth="6" />
                  <path d="M95 80 L85 95" stroke="#0a4d4d" strokeWidth="6" />
                </svg>
                <p style={{ fontSize: "16px", margin: "0 0 8px 0" }}>
                  Free your mind - create a to-do list
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
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    title={task.taskName}
                    dueDate={task.dueDate || undefined}
                    priority={task.priority}
                    status={task.status}
                    onClick={() => handleEditTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    onToggleComplete={() => toggleTaskComplete(task)}
                    isDeleting={deletingTaskId === task.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showFormPanel && (
        <TaskFormPanel
          isOpen={showFormPanel}
          onClose={handleCloseFormPanel}
          contactName={contactName}
          hubspotContactId={hubspotContactId}
          editingTask={editingTask}
          onTaskSaved={handleTaskSaved}
          owners={owners}
        />
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
              Delete Task
            </h3>
            <p
              style={{
                margin: "0 0 24px 0",
                fontSize: "14px",
                color: colors.textSecondary,
                lineHeight: "1.5",
              }}
            >
              Are you sure you want to delete this task? This action cannot be
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

  return createPortal(panelContent, portalRoot);
}
