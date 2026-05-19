import { useEffect, useRef, useState, useCallback } from "react";
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
  isLoadingMore?: boolean;
  hasMore?: boolean;
  deletingNoteId: string | null;
  contactName: string;
  headerSlot?: React.ReactNode;
  onClose: () => void;
  onCreateNote: () => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onLoadMore?: () => void;
}

export default function NoteListPanel({
  colors,
  isDark,
  notes,
  isLoading,
  isLoadingMore = false,
  hasMore = false,
  deletingNoteId,
  contactName,
  headerSlot,
  onClose,
  onCreateNote,
  onEditNote,
  onDeleteNote,
  onLoadMore,
}: NoteListPanelProps) {
  // ── Infinite scroll sentinel ──────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoadMore!(); },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  // ── Scroll rail — direct DOM approach (no React re-renders during scroll) ─
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const filledBarRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);
  const itemCountRef = useRef(notes.length);
  useEffect(() => { itemCountRef.current = notes.length; }, [notes.length]);

  const [canScroll, setCanScroll] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [railHovered, setRailHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);

  // Tracking refs — avoid setState when value hasn't changed
  const prevCanScroll = useRef(false);
  const prevIsAtTop = useRef(true);
  const prevIsAtBottom = useRef(false);

  // Update thumb/bar/counter positions directly in the DOM — no React re-render
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
    if (rafRef.current !== null) return; // already scheduled for this frame
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
  }, [updateScroll, notes.length]);

  // Re-apply positions when rail becomes visible (counter mounts on hover)
  useEffect(() => {
    applyRailDom(scrollProgressRef.current);
  }, [railHovered, applyRailDom]);

  const scrollToTop    = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
    if (thumbRef.current) thumbRef.current.style.transition = "none"; // no lag during drag

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

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "420px",
        background: colors.bg,
        boxShadow: isDark ? "-4px 0 24px rgba(0,0,0,0.5)" : "-4px 0 24px rgba(0,0,0,0.15)",
        zIndex: 2147483647, display: "flex", flexDirection: "column", pointerEvents: "auto",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: colors.text }}>Notes</h2>
            {!isLoading && notes.length > 0 && (
              <span style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white", borderRadius: "12px", padding: "2px 8px",
                fontSize: "11px", fontWeight: 700, lineHeight: "18px", letterSpacing: "0.02em",
              }}>
                {notes.length}
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

        {headerSlot ? (
          <div style={{ marginTop: "10px" }}>{headerSlot}</div>
        ) : (
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: colors.textSecondary }}>{contactName}</p>
        )}
      </div>

      {/* ── Create button ───────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${colors.border}` }}>
        <button
          onClick={onCreateNote}
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
          Create New Note
        </button>
      </div>

      {/* ── Scroll area + custom rail ───────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* Scrollable content */}
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
              <p style={{ margin: 0, fontSize: "14px", color: colors.textSecondary }}>Loading notes…</p>
            </div>
          ) : notes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: colors.textSecondary }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                <path d="M8 6h32a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" stroke={colors.textSecondary} strokeWidth="2" fill="none" />
                <line x1="14" y1="16" x2="34" y2="16" stroke={colors.textSecondary} strokeWidth="2" />
                <line x1="14" y1="24" x2="34" y2="24" stroke={colors.textSecondary} strokeWidth="2" />
                <line x1="14" y1="32" x2="26" y2="32" stroke={colors.textSecondary} strokeWidth="2" />
              </svg>
              <p style={{ fontSize: "14px", margin: 0 }}>No notes yet</p>
              <p style={{ fontSize: "13px", margin: "8px 0 0 0" }}>Click "Create New Note" to get started</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
              <div ref={sentinelRef} style={{ height: "1px" }} />
              {isLoadingMore && (
                <div style={{ textAlign: "center", padding: "12px 0", color: colors.textSecondary }}>
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

        {/* ── Custom scroll rail ──────────────────────────────────────────────
            GPU-composited: thumb uses translateY, fill bar uses scaleY.
            Positions updated directly via refs — zero React re-renders on scroll.
        ─────────────────────────────────────────────────────────────────────── */}
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
            {/* Jump to top */}
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

            {/* Track + thumb */}
            <div
              ref={trackRef}
              data-scroll-track
              onClick={handleTrackClick}
              style={{
                flex: 1, width: "100%", position: "relative",
                display: "flex", justifyContent: "center",
                cursor: "pointer", margin: "4px 0",
              }}
            >
              {/* Track line */}
              <div style={{
                position: "absolute", top: 0, bottom: 0,
                width: "2px", borderRadius: "1px",
                background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                left: "50%", transform: "translateX(-50%)",
              }} />

              {/* Filled portion — scaleY from top, GPU composited */}
              <div
                ref={filledBarRef}
                style={{
                  position: "absolute", top: 0, bottom: 0,
                  width: "2px", borderRadius: "1px",
                  background: "linear-gradient(to bottom, #667eea, #764ba2)",
                  left: "50%",
                  transform: "translateX(-50%) scaleY(0)",
                  transformOrigin: "top center",
                  willChange: "transform",
                }}
              />

              {/* Thumb — translateY, GPU composited */}
              <div
                ref={thumbRef}
                onMouseDown={handleThumbMouseDown}
                style={{
                  position: "absolute",
                  top: 0,
                  width: railHovered ? "8px" : "4px",
                  height: "32px",
                  background: "linear-gradient(160deg, #667eea, #764ba2)",
                  borderRadius: "4px",
                  cursor: "grab",
                  willChange: "transform",
                  transition: "width 0.2s, box-shadow 0.15s",
                  boxShadow: railHovered ? "0 2px 8px rgba(102,126,234,0.5)" : "none",
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />

              {/* Position counter — floats left of the thumb on hover */}
              <div
                ref={counterRef}
                style={{
                  display: railHovered ? "block" : "none",
                  position: "absolute",
                  top: 0,
                  right: "16px",
                  transform: "translateY(0)",
                  background: "linear-gradient(135deg, #667eea, #764ba2)",
                  color: "white", borderRadius: "8px", padding: "2px 6px",
                  fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
                  boxShadow: "0 2px 6px rgba(102,126,234,0.4)",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Jump to bottom */}
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
  );
}
