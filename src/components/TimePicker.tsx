import { useState, useEffect, useRef } from "react";

interface TimePickerColors {
  bg: string;
  bgSecondary: string;
  border: string;
  text: string;
  textSecondary: string;
  inputBg: string;
}

interface TimePickerProps {
  value: string; // "HH:MM" 24h or ""
  onChange: (v: string) => void;
  disabled?: boolean;
  isDark: boolean;
  colors: TimePickerColors;
  placeholder?: string;
}

function parseTimeValue(v: string): { hour12: number; minute: number; ampm: "AM" | "PM" } {
  if (!v) return { hour12: 12, minute: 0, ampm: "AM" };
  const [hStr, mStr] = v.split(":");
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h24) || isNaN(m)) return { hour12: 12, minute: 0, ampm: "AM" };
  const ampm: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: Math.min(59, Math.max(0, m)), ampm };
}

function toValue(hour12: number, minute: number, ampm: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (ampm === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toDisplayText(v: string): string {
  if (!v) return "";
  const { hour12, minute, ampm } = parseTimeValue(v);
  return `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

// Parse typed time → "HH:MM" 24h or null
function parseTypedTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, "");
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm|a|p)$/);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2]);
    const isPM = m12[3].startsWith("p");
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    let h24 = h % 12;
    if (isPM) h24 += 12;
    return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]);
    const m = parseInt(m24[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ITEM_H = 34;

export default function TimePicker({
  value,
  onChange,
  disabled = false,
  isDark,
  colors,
  placeholder = "HH:MM AM/PM",
}: TimePickerProps) {
  const { hour12, minute, ampm } = parseTimeValue(value);

  const [isOpen, setIsOpen] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, width: rect.width });
    }
    setIsOpen(true);
  };

  const togglePicker = () => {
    if (isOpen) setIsOpen(false);
    else openPicker();
  };

  // Auto-scroll columns to selected item when dropdown opens (DOM only, no setState)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (hourColRef.current) {
        const idx = HOURS.indexOf(hour12);
        const center = hourColRef.current.clientHeight / 2 - ITEM_H / 2;
        hourColRef.current.scrollTop = Math.max(0, idx * ITEM_H - center);
      }
      if (minColRef.current) {
        const center = minColRef.current.clientHeight / 2 - ITEM_H / 2;
        minColRef.current.scrollTop = Math.max(0, minute * ITEM_H - center);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, hour12, minute]);

  // Close on outside click — composedPath handles Shadow DOM retargeting
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      if (
        dropdownRef.current && !path.includes(dropdownRef.current as EventTarget) &&
        containerRef.current && !path.includes(containerRef.current as EventTarget)
      ) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const selectHour = (h: number) => onChange(toValue(h, minute, ampm));
  const selectMinute = (m: number) => onChange(toValue(hour12, m, ampm));
  const selectAmpm = (ap: "AM" | "PM") => onChange(toValue(hour12, minute, ap));

  const handleInputFocus = () => {
    if (!disabled) {
      setDraftText(toDisplayText(value));
      openPicker();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraftText(text);
    const parsed = parseTypedTime(text);
    if (parsed) onChange(parsed);
  };

  const handleInputBlur = () => {
    setDraftText(null);
  };

  const displayText = draftText !== null ? draftText : toDisplayText(value);
  const focused = isOpen || draftText !== null;
  const accent = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

  const colStyle: React.CSSProperties = {
    flex: 1,
    height: "200px",
    overflowY: "auto",
    scrollbarWidth: "none" as const,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "0 4px",
  };

  const itemStyle = (active: boolean): React.CSSProperties => ({
    height: `${ITEM_H}px`,
    minHeight: `${ITEM_H}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: active ? 700 : 400,
    color: active ? "#fff" : colors.text,
    background: active ? accent : "transparent",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.1s",
    flexShrink: 0,
    letterSpacing: active ? "0.01em" : "normal",
  });

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Input row */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${focused && !disabled ? "#667eea" : colors.border}`,
          borderRadius: "6px",
          background: disabled ? colors.bgSecondary : colors.inputBg,
          boxShadow: focused && !disabled ? "0 0 0 3px rgba(102,126,234,0.15)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          opacity: disabled ? 0.6 : 1,
          overflow: "hidden",
          cursor: disabled ? "not-allowed" : "default",
        }}
      >
        {/* Clock icon */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { if (!disabled) togglePicker(); }}
          style={{
            background: "transparent", border: "none",
            padding: "0 0 0 12px", cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center",
            color: colors.textSecondary, flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7.5 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          style={{
            flex: 1, border: "none", outline: "none",
            background: "transparent", padding: "10px 8px",
            fontSize: "14px", color: value ? colors.text : colors.textSecondary,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            minWidth: 0, cursor: disabled ? "not-allowed" : "text",
          }}
        />

        {/* Chevron */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { if (!disabled) togglePicker(); }}
          style={{
            background: "transparent", border: "none",
            padding: "0 10px 0 4px", cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center",
            color: colors.textSecondary, flexShrink: 0,
          }}
        >
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: Math.max(dropdownPos.width, 240),
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.14)",
            zIndex: 2147483647,
            padding: "12px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            userSelect: "none",
          }}
        >
          {/* Scrollbar hider */}
          <style>{`.hl-tc::-webkit-scrollbar{display:none}`}</style>

          {/* Large time preview */}
          <div
            style={{
              textAlign: "center",
              fontSize: "22px",
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "0.04em",
              marginBottom: "10px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hour12}
            <span style={{ opacity: 0.4, margin: "0 2px" }}>:</span>
            {String(minute).padStart(2, "0")}
            <span style={{ fontSize: "14px", fontWeight: 600, marginLeft: "6px", opacity: 0.7 }}>{ampm}</span>
          </div>

          {/* AM / PM toggle */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: "12px",
              background: colors.bgSecondary,
              borderRadius: "8px",
              padding: "3px",
            }}
          >
            {(["AM", "PM"] as const).map(ap => (
              <button
                key={ap}
                type="button"
                onClick={() => selectAmpm(ap)}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: ampm === ap ? accent : "transparent",
                  color: ampm === ap ? "#fff" : colors.textSecondary,
                  transition: "background 0.15s, color 0.15s",
                  letterSpacing: "0.04em",
                }}
              >
                {ap}
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "4px", padding: "0 4px" }}>
            <div style={{ flex: 1, textAlign: "center", fontSize: "10px", fontWeight: 700, color: colors.textSecondary, letterSpacing: "0.06em" }}>HOUR</div>
            <div style={{ flex: 1, textAlign: "center", fontSize: "10px", fontWeight: 700, color: colors.textSecondary, letterSpacing: "0.06em" }}>MINUTE</div>
          </div>

          {/* Divider line in center of columns for visual "selection zone" */}
          <div style={{ display: "flex", gap: "8px", position: "relative" }}>
            {/* Hour column */}
            <div ref={hourColRef} className="hl-tc" style={colStyle}>
              {/* Padding spacer top */}
              <div style={{ height: "83px", flexShrink: 0 }} />
              {HOURS.map(h => (
                <div
                  key={h}
                  onClick={() => selectHour(h)}
                  style={itemStyle(hour12 === h)}
                  onMouseEnter={e => {
                    if (hour12 !== h) (e.currentTarget as HTMLDivElement).style.background = colors.bgSecondary;
                  }}
                  onMouseLeave={e => {
                    if (hour12 !== h) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {h}
                </div>
              ))}
              {/* Padding spacer bottom */}
              <div style={{ height: "83px", flexShrink: 0 }} />
            </div>

            {/* Divider */}
            <div style={{ width: "1px", background: colors.border, flexShrink: 0, borderRadius: "1px" }} />

            {/* Minute column */}
            <div ref={minColRef} className="hl-tc" style={colStyle}>
              <div style={{ height: "83px", flexShrink: 0 }} />
              {MINUTES.map(m => (
                <div
                  key={m}
                  onClick={() => selectMinute(m)}
                  style={itemStyle(minute === m)}
                  onMouseEnter={e => {
                    if (minute !== m) (e.currentTarget as HTMLDivElement).style.background = colors.bgSecondary;
                  }}
                  onMouseLeave={e => {
                    if (minute !== m) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {String(m).padStart(2, "0")}
                </div>
              ))}
              <div style={{ height: "83px", flexShrink: 0 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
