import { useState, useEffect, useRef } from "react";

interface DatePickerColors {
  bg: string;
  bgSecondary: string;
  border: string;
  text: string;
  textSecondary: string;
  inputBg: string;
}

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  isDark: boolean;
  colors: DatePickerColors;
  placeholder?: string;
  minDate?: string; // "YYYY-MM-DD" — days before this are unclickable
  maxDate?: string; // "YYYY-MM-DD" — days after this are unclickable
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

type CalView = "day" | "month" | "year";

function parseDateValue(v: string): { year: number; month: number; day: number } | null {
  if (!v) return null;
  const parts = v.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

function toInputText(v: string): string {
  const p = parseDateValue(v);
  if (!p) return "";
  return `${String(p.month + 1).padStart(2,"0")}/${String(p.day).padStart(2,"0")}/${p.year}`;
}

function parseTypedDate(text: string): string | null {
  const t = text.trim();
  const m1 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const mo = parseInt(m1[1]), d = parseInt(m1[2]), y = parseInt(m1[3]);
    if (mo < 1 || mo > 12 || d < 1 || y < 1900 || y > 2100) return null;
    const check = new Date(y, mo - 1, d);
    if (check.getMonth() !== mo - 1) return null;
    return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const y = parseInt(m2[1]), mo = parseInt(m2[2]), d = parseInt(m2[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const check = new Date(y, mo - 1, d);
    if (check.getMonth() !== mo - 1) return null;
    return t;
  }
  return null;
}

function buildCalendarDays(year: number, month: number): Array<{ date: Date; isCurrentMonth: boolean }> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }
  return cells;
}

function yearPageFor(y: number) {
  return y - (y % 12);
}

export default function DatePicker({
  value,
  onChange,
  isDark,
  colors,
  placeholder = "MM/DD/YYYY",
  minDate,
  maxDate,
}: DatePickerProps) {
  const today = new Date();
  const parsed = parseDateValue(value);

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [calView, setCalView] = useState<CalView>("day");
  const [yearPageStart, setYearPageStart] = useState(() => yearPageFor(parsed?.year ?? today.getFullYear()));
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    const p = parseDateValue(value);
    const y = p?.year ?? today.getFullYear();
    setViewYear(y);
    setViewMonth(p?.month ?? today.getMonth());
    setYearPageStart(yearPageFor(y));
    setCalView("day");
    setIsOpen(true);
  };

  const closePicker = () => {
    setIsOpen(false);
    setHoveredDay(null);
  };

  const togglePicker = () => {
    if (isOpen) closePicker();
    else openPicker();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      if (
        dropdownRef.current && !path.includes(dropdownRef.current as EventTarget) &&
        containerRef.current && !path.includes(containerRef.current as EventTarget)
      ) {
        closePicker();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closePicker(); inputRef.current?.blur(); }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const openYearView = () => {
    setYearPageStart(yearPageFor(viewYear));
    setCalView("year");
  };

  const minD = minDate ? new Date(minDate + "T00:00:00") : null;
  const maxD = maxDate ? new Date(maxDate + "T23:59:59") : null;

  const isDayDisabled = (date: Date) =>
    (minD !== null && date < minD) || (maxD !== null && date > maxD);

  const selectDay = (date: Date, isCurrentMonth: boolean) => {
    if (isDayDisabled(date)) return;
    if (!isCurrentMonth) {
      setViewYear(date.getFullYear());
      setViewMonth(date.getMonth());
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setDraftText(null);
    closePicker();
  };

  const handleInputFocus = () => {
    setDraftText(toInputText(value));
    openPicker();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraftText(text);
    const p = parseTypedDate(text);
    if (p) {
      onChange(p);
      const pv = parseDateValue(p);
      if (pv) { setViewYear(pv.year); setViewMonth(pv.month); }
    }
  };

  const handleInputBlur = () => { setDraftText(null); };

  const displayText = draftText !== null ? draftText : toInputText(value);
  const cells = buildCalendarDays(viewYear, viewMonth);

  const isSelected = (date: Date) =>
    parsed &&
    date.getFullYear() === parsed.year &&
    date.getMonth() === parsed.month &&
    date.getDate() === parsed.day;

  const isToday = (date: Date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const focused = isOpen || draftText !== null;
  const accent = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

  const navBtnStyle: React.CSSProperties = {
    width: "28px", height: "28px", background: "transparent", border: "none",
    cursor: "pointer", color: colors.textSecondary, borderRadius: "6px",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
    transition: "background 0.12s", flexShrink: 0,
  };

  const headerClickBtnStyle: React.CSSProperties = {
    background: "transparent", border: "none", cursor: "pointer",
    padding: "4px 6px", borderRadius: "6px",
    fontSize: "14px", fontWeight: 700, color: colors.text,
    letterSpacing: "0.01em", transition: "background 0.12s",
    display: "flex", alignItems: "center", gap: "3px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const gridItemStyle = (isActive: boolean, isCurrent: boolean): React.CSSProperties => ({
    height: "36px",
    background: isActive ? accent : "transparent",
    border: isCurrent && !isActive ? "1.5px solid #667eea" : "1.5px solid transparent",
    borderRadius: "8px",
    color: isActive ? "#fff" : colors.text,
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: isActive || isCurrent ? 700 : 400,
    transition: "background 0.12s",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  });

  // Header left/right nav actions per view
  const onPrev = calView === "year"
    ? () => setYearPageStart(s => s - 12)
    : calView === "month"
    ? () => setViewYear(y => y - 1)
    : prevMonth;

  const onNext = calView === "year"
    ? () => setYearPageStart(s => s + 12)
    : calView === "month"
    ? () => setViewYear(y => y + 1)
    : nextMonth;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Input row */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${focused ? "#667eea" : colors.border}`,
          borderRadius: "6px",
          background: colors.inputBg,
          boxShadow: focused ? "0 0 0 3px rgba(102,126,234,0.15)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={togglePicker}
          style={{
            background: "transparent", border: "none", padding: "0 0 0 12px",
            cursor: "pointer", display: "flex", alignItems: "center",
            color: colors.textSecondary, flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 5.5h13" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 1v3M10 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="3.5" y="7.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" opacity="0.7" />
            <rect x="6.75" y="7.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" opacity="0.7" />
            <rect x="10" y="7.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" opacity="0.7" />
            <rect x="3.5" y="10" width="1.5" height="1.5" rx="0.3" fill="currentColor" opacity="0.7" />
            <rect x="6.75" y="10" width="1.5" height="1.5" rx="0.3" fill="currentColor" opacity="0.7" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          value={displayText}
          placeholder={placeholder}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            padding: "10px 8px", fontSize: "14px",
            color: value ? colors.text : colors.textSecondary,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            minWidth: 0,
          }}
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={togglePicker}
          style={{
            background: "transparent", border: "none", padding: "0 10px 0 4px",
            cursor: "pointer", display: "flex", alignItems: "center",
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

      {/* Calendar dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 272),
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.14)",
            zIndex: 2147483647,
            padding: "14px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            userSelect: "none",
          }}
        >
          {/* Header: nav arrows + clickable month/year labels */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={onPrev}
              title={calView === "month" ? "Previous year" : calView === "year" ? "Previous 12 years" : "Previous month"}
              style={navBtnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ‹
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {calView === "year" && (
                <span style={{ fontSize: "14px", fontWeight: 700, color: colors.text, letterSpacing: "0.01em", padding: "4px 6px" }}>
                  {yearPageStart} – {yearPageStart + 11}
                </span>
              )}
              {calView === "month" && (
                <button
                  type="button"
                  onClick={openYearView}
                  title="Click to select year"
                  style={{
                    ...headerClickBtnStyle,
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    padding: "4px 10px",
                    gap: "4px",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  {viewYear}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {calView === "day" && (
                <button
                  type="button"
                  onClick={() => setCalView("month")}
                  style={headerClickBtnStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  title="Select month and year"
                >
                  {MONTHS[viewMonth]} {viewYear}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}>
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onNext}
              title={calView === "month" ? "Next year" : calView === "year" ? "Next 12 years" : "Next month"}
              style={navBtnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ›
            </button>
          </div>

          {/* Month picker grid */}
          {calView === "month" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", padding: "4px 0", minHeight: "148px" }}>
              {MONTH_ABBR.map((name, idx) => {
                const isActive = parsed?.month === idx && parsed?.year === viewYear;
                const isCurrent = idx === viewMonth;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setViewMonth(idx); setCalView("day"); }}
                    style={gridItemStyle(isActive, isCurrent)}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = colors.bgSecondary; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Year picker grid */}
          {calView === "year" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", padding: "4px 0", minHeight: "148px" }}>
              {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map(year => {
                const isActive = parsed?.year === year;
                const isCurrent = year === viewYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => { setViewYear(year); setYearPageStart(yearPageFor(year)); setCalView("month"); }}
                    style={gridItemStyle(isActive, isCurrent)}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = colors.bgSecondary; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}

          {/* Day picker */}
          {calView === "day" && (
            <>
              {/* Weekday headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "6px" }}>
                {WEEKDAYS.map(d => (
                  <div
                    key={d}
                    style={{
                      textAlign: "center", fontSize: "11px", fontWeight: 700,
                      color: colors.textSecondary, padding: "3px 0", letterSpacing: "0.04em",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                {cells.map(({ date, isCurrentMonth }) => {
                  const key = dayKey(date);
                  const selected = !!isSelected(date);
                  const todayMark = isToday(date);
                  const disabled = isDayDisabled(date);
                  const hovered = hoveredDay === key && !selected && !disabled;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectDay(date, isCurrentMonth)}
                      onMouseEnter={() => { if (!disabled) setHoveredDay(key); }}
                      onMouseLeave={() => setHoveredDay(null)}
                      style={{
                        height: "32px",
                        background: selected ? accent : hovered ? colors.bgSecondary : "transparent",
                        border: todayMark && !selected && !disabled ? "1.5px solid #667eea" : "1.5px solid transparent",
                        borderRadius: "7px",
                        color: selected ? "#fff" : isCurrentMonth ? colors.text : colors.textSecondary,
                        cursor: disabled ? "not-allowed" : "pointer",
                        fontSize: "13px",
                        fontWeight: selected ? 700 : todayMark ? 600 : 400,
                        opacity: disabled ? 0.25 : isCurrentMonth ? 1 : 0.3,
                        transition: "background 0.12s",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Selected date label */}
              {value && (
                <div
                  style={{
                    marginTop: "12px", paddingTop: "10px",
                    borderTop: `1px solid ${colors.border}`,
                    textAlign: "center", fontSize: "12px", fontWeight: 600,
                    color: colors.textSecondary,
                  }}
                >
                  {new Date(parsed!.year, parsed!.month, parsed!.day).toLocaleDateString("en-US", {
                    weekday: "short", month: "long", day: "numeric", year: "numeric",
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
