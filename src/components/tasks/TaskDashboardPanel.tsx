import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../../context/ThemeContext";
import TaskCard from "./TaskCard";
import TaskFormPanel from "./TaskFormPanel";
import DeleteConfirmDialog from "../shared/DeleteConfirmDialog";
import { tasksApi } from "../../services/api";
import { useShadowPortal } from "../../hooks/useShadowPortal";
import { useToast } from "../../hooks/useToast";

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
  owners = [],
}: TaskDashboardPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "#ffffff",
    bgSecondary: isDark ? "#2d3748" : "#f9fafb",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    link: isDark ? "#63b3ed" : "#667eea",
    hover: isDark ? "#374151" : "#e5e7eb",
  };

  // ── Task state ────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  // ── Scroll rail — direct DOM (no React re-renders during scroll) ──────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const filledBarRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);
  const itemCountRef = useRef(tasks.length);
  itemCountRef.current = tasks.length;

  const [canScroll, setCanScroll] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [railHovered, setRailHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);

  const prevCanScroll = useRef(false);
  const prevIsAtTop = useRef(true);
  const prevIsAtBottom = useRef(false);

  const applyRailDom = useCallback((progress: number) => {
    const trackH = trackRef.current?.clientHeight ?? 0;
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateX(-50%) translateY(${progress * trackH - 16}px)`;
    }
    if (filledBarRef.current) {
      filledBarRef.current.style.transform = `translateX(-50%) scaleY(${progress})`;
    }
    if (counterRef.current) {
      const count = itemCountRef.current;
      counterRef.current.textContent = `${Math.max(1, Math.round(progress * count))} / ${count}`;
      counterRef.current.style.transform = `translateY(${progress * trackH - 10}px)`;
    }
  }, []);

  const updateScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const scrollable = max > 4;

      if (scrollable !== prevCanScroll.current) {
        prevCanScroll.current = scrollable;
        setCanScroll(scrollable);
      }

      if (!scrollable) {
        scrollProgressRef.current = 0;
        if (prevIsAtTop.current !== true) { prevIsAtTop.current = true; setIsAtTop(true); }
        if (prevIsAtBottom.current !== true) { prevIsAtBottom.current = true; setIsAtBottom(true); }
        applyRailDom(0);
        return;
      }

      const progress = el.scrollTop / max;
      scrollProgressRef.current = progress;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= max - 1;
      if (atTop !== prevIsAtTop.current) { prevIsAtTop.current = atTop; setIsAtTop(atTop); }
      if (atBottom !== prevIsAtBottom.current) { prevIsAtBottom.current = atBottom; setIsAtBottom(atBottom); }
      applyRailDom(progress);
    });
  }, [applyRailDom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();
    return () => {
      el.removeEventListener("scroll", updateScroll);
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [updateScroll, tasks.length]);

  useEffect(() => {
    applyRailDom(scrollProgressRef.current);
  }, [railHovered, applyRailDom]);

  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" });

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    el.scrollTo({ top: progress * (el.scrollHeight - el.clientHeight), behavior: "smooth" });
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartScroll.current = scrollRef.current?.scrollTop ?? 0;
    if (thumbRef.current) thumbRef.current.style.transition = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !scrollRef.current || !trackRef.current) return;
      const trackHeight = trackRef.current.getBoundingClientRect().height;
      const delta = ev.clientY - dragStartY.current;
      const max = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
      scrollRef.current.scrollTop = dragStartScroll.current + (delta / trackHeight) * max;
    };
    const onUp = () => {
      isDragging.current = false;
      if (thumbRef.current) thumbRef.current.style.transition = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Shadow portal ─────────────────────────────────────────────────────────
  const shadowRoot = useShadowPortal(isOpen);
  const { toast, showToast } = useToast();
  const toastShadowRoot = useShadowPortal(toast.show);

  useEffect(() => {
    if (isOpen && hubspotContactId) loadTasks();
  }, [isOpen, hubspotContactId]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadTasks = async () => {
    if (!hubspotContactId) return;
    setIsLoading(true);
    setNextCursor(null);
    setLoadError(null);
    try {
      let tz = "UTC";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { tz = "UTC"; }
      const response = await tasksApi.getTasks(hubspotContactId, undefined, tz);
      const { tasks: fetched, hasMore: hm, nextCursor: nc } = response.data;
      setTasks(fetched);
      setHasMore(hm);
      setNextCursor(nc);
      onTasksCountChange?.(fetched.length);
    } catch (err: any) {
      console.error("Failed to load tasks:", err);
      setLoadError(err?.message || "Failed to load tasks. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreTasks = useCallback(async () => {
    if (!hasMore || isLoadingMore || !nextCursor || !hubspotContactId) return;
    setIsLoadingMore(true);
    try {
      let tz = "UTC";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { tz = "UTC"; }
      const response = await tasksApi.getTasks(hubspotContactId, nextCursor, tz);
      const { tasks: more, hasMore: hm, nextCursor: nc } = response.data;
      setTasks((prev) => [...prev, ...more]);
      setHasMore(hm);
      setNextCursor(nc);
    } catch (err: any) {
      console.error("Failed to load more tasks:", err);
      setLoadError(err?.message || "Failed to load more tasks.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextCursor, hubspotContactId]);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreTasks(); },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMoreTasks, hasMore, isLoadingMore]);

  // ── Task actions ──────────────────────────────────────────────────────────
  const toggleTaskComplete = async (task: Task) => {
    const isCompleted = task.status.toUpperCase() === "COMPLETED";
    const newStatus = isCompleted ? "To do" : "COMPLETED";
    const owner = owners.find((o) => o.name === task.assignedTo);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
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
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      showToast(err instanceof Error ? err.message : "Failed to update task", "error");
    }
  };

  const handleCreateTask = () => { setEditingTask(null); setShowFormPanel(true); };
  const handleEditTask = (task: Task) => { setEditingTask(task); setShowFormPanel(true); };
  const handleCloseFormPanel = () => { setShowFormPanel(false); setEditingTask(null); };

  const handleTaskSaved = (newTask?: Task, updatedTask?: Task) => {
    if (newTask) {
      setTasks((prev) => { const next = [newTask, ...prev]; onTasksCountChange?.(next.length); return next; });
    } else if (updatedTask) {
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    }
    handleCloseFormPanel();
  };

  const deleteTask = (id: string) => { setTaskToDelete(id); setShowDeleteConfirm(true); };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const taskId = taskToDelete;
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
    setDeletingTaskId(taskId);
    try {
      await tasksApi.deleteTask(taskId);
      setTasks((prev) => { const next = prev.filter((t) => t.id !== taskId); onTasksCountChange?.(next.length); return next; });
    } catch (err) {
      console.error("Failed to delete task:", err);
      showToast(err instanceof Error ? err.message : "Failed to delete task", "error");
    } finally {
      setDeletingTaskId(null);
    }
  };

  if (!isOpen || !shadowRoot) return null;

  const panelContent = (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", pointerEvents: "auto" }}
      />

      {!showFormPanel && (
        <div
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: "420px",
            background: colors.bg,
            boxShadow: isDark ? "-4px 0 24px rgba(0,0,0,0.5)" : "-4px 0 24px rgba(0,0,0,0.15)",
            zIndex: 2147483647, display: "flex", flexDirection: "column", pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: colors.text }}>Tasks</h2>
                {!isLoading && tasks.length > 0 && (
                  <span style={{
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white", borderRadius: "12px", padding: "2px 8px",
                    fontSize: "11px", fontWeight: 700, lineHeight: "18px", letterSpacing: "0.02em",
                  }}>
                    {tasks.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "4px", borderRadius: "6px", flexShrink: 0, marginLeft: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke={colors.text} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: colors.textSecondary }}>{contactName}</p>
          </div>

          {/* Create button */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${colors.border}` }}>
            <button
              onClick={handleCreateTask}
              style={{
                width: "100%", padding: "12px 20px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white", border: "none", borderRadius: "8px",
                cursor: "pointer", fontSize: "14px", fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "8px", transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(102,126,234,0.4)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Create new Task
            </button>
          </div>

          {/* Scroll area + custom rail */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div
              ref={scrollRef}
              style={{
                height: "100%", overflowY: "auto", overflowX: "hidden",
                padding: "20px 32px 20px 24px",
                scrollbarWidth: "none",
              } as React.CSSProperties}
            >
              {isLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{
                    width: "40px", height: "40px",
                    border: `3px solid ${colors.border}`,
                    borderTop: `3px solid ${colors.link}`,
                    borderRadius: "50%", margin: "0 auto 16px",
                    animation: "spin 1s linear infinite",
                  }} />
                  <p style={{ margin: 0, fontSize: "14px", color: colors.textSecondary }}>Loading tasks…</p>
                </div>
              ) : loadError ? (
                <div style={{ textAlign: "center", padding: "24px 20px", color: "#e53e3e" }}>
                  <p style={{ fontSize: "14px", margin: "0 0 8px 0" }}>⚠ {loadError}</p>
                  <button onClick={loadTasks} style={{ fontSize: 12, padding: "4px 12px", cursor: "pointer" }}>Retry</button>
                </div>
              ) : tasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: colors.textSecondary }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                    <rect x="6" y="6" width="36" height="36" rx="3" stroke={colors.textSecondary} strokeWidth="2" fill="none" />
                    <path d="M14 18l4.5 4.5 9-9" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="14" y1="30" x2="34" y2="30" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" />
                    <line x1="14" y1="36" x2="34" y2="36" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p style={{ fontSize: "14px", margin: 0 }}>No tasks yet</p>
                  <p style={{ fontSize: "13px", margin: "8px 0 0 0" }}>Click "Create new Task" to get started</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
                  <div ref={sentinelRef} style={{ height: "1px" }} />
                  {isLoadingMore && (
                    <div style={{ textAlign: "center", padding: "12px 0" }}>
                      <div style={{
                        width: "24px", height: "24px",
                        border: `2px solid ${colors.border}`,
                        borderTop: `2px solid ${colors.link}`,
                        borderRadius: "50%", margin: "0 auto",
                        animation: "spin 1s linear infinite",
                      }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom scroll rail */}
            {canScroll && !isLoading && (
              <div
                onMouseEnter={() => setRailHovered(true)}
                onMouseLeave={() => setRailHovered(false)}
                style={{
                  position: "absolute", top: 0, right: 0, bottom: 0,
                  width: railHovered ? "28px" : "8px",
                  transition: "width 0.2s ease",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "space-between", paddingTop: "8px", paddingBottom: "8px",
                  zIndex: 10,
                }}
              >
                <button
                  onClick={scrollToTop}
                  title="Scroll to top"
                  style={{
                    background: isAtTop ? "transparent" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                    border: "none", borderRadius: "50%", cursor: isAtTop ? "default" : "pointer",
                    width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, opacity: isAtTop ? 0.2 : (railHovered ? 1 : 0),
                    transition: "opacity 0.2s, background 0.15s",
                    pointerEvents: isAtTop ? "none" : "auto",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 7L5 3L9 7" stroke={colors.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div
                  ref={trackRef}
                  onClick={handleTrackClick}
                  style={{ flex: 1, width: "100%", position: "relative", display: "flex", justifyContent: "center", cursor: "pointer", margin: "4px 0" }}
                >
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, width: "2px", borderRadius: "1px",
                    background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                    left: "50%", transform: "translateX(-50%)",
                  }} />
                  <div
                    ref={filledBarRef}
                    style={{
                      position: "absolute", top: 0, bottom: 0, width: "2px", borderRadius: "1px",
                      background: "linear-gradient(to bottom, #667eea, #764ba2)",
                      left: "50%", transform: "translateX(-50%) scaleY(0)",
                      transformOrigin: "top center", willChange: "transform",
                    }}
                  />
                  <div
                    ref={thumbRef}
                    onMouseDown={handleThumbMouseDown}
                    style={{
                      position: "absolute", top: 0,
                      width: railHovered ? "8px" : "4px", height: "32px",
                      background: "linear-gradient(160deg, #667eea, #764ba2)",
                      borderRadius: "4px", cursor: "grab", willChange: "transform",
                      transition: "width 0.2s, box-shadow 0.15s",
                      boxShadow: railHovered ? "0 2px 8px rgba(102,126,234,0.5)" : "none",
                      left: "50%", transform: "translateX(-50%)",
                    }}
                  />
                  <div
                    ref={counterRef}
                    style={{
                      display: railHovered ? "block" : "none",
                      position: "absolute", top: 0, right: "16px", transform: "translateY(0)",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      color: "white", borderRadius: "8px", padding: "2px 6px",
                      fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
                      boxShadow: "0 2px 6px rgba(102,126,234,0.4)", pointerEvents: "none",
                    }}
                  />
                </div>

                <button
                  onClick={scrollToBottom}
                  title="Scroll to bottom"
                  style={{
                    background: isAtBottom ? "transparent" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                    border: "none", borderRadius: "50%", cursor: isAtBottom ? "default" : "pointer",
                    width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, opacity: isAtBottom ? 0.2 : (railHovered ? 1 : 0),
                    transition: "opacity 0.2s, background 0.15s",
                    pointerEvents: isAtBottom ? "none" : "auto",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 3L5 7L9 3" stroke={colors.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
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
        <DeleteConfirmDialog
          colors={colors}
          isDark={isDark}
          onConfirm={confirmDelete}
          onCancel={() => { setShowDeleteConfirm(false); setTaskToDelete(null); }}
        />
      )}
    </>
  );

  return (
    <>
      {createPortal(
        <>
          <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } } *::-webkit-scrollbar { display: none; }`}</style>
          {panelContent}
        </>,
        shadowRoot,
      )}
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
