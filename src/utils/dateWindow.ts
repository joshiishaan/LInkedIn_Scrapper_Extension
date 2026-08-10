// "Today" as the popup's own live counters mean it: the viewer's REAL local
// calendar day, from actual local midnight up to right now — not the report
// dashboard's UTC-day convention (ReportDashboardPage's toUtcStartOfDayIso/
// toUtcEndOfDayIso deliberately re-stamps a local calendar day onto UTC
// midnight for chart-bucketing purposes, which is a different problem: it
// keeps a multi-rep, multi-timezone dashboard's date labels consistent, at
// the cost of not being the viewer's actual local midnight). This popup is
// single-user/single-timezone, so it uses the real thing: `new Date(y,m,d)`
// with plain (non-UTC) components is interpreted in the SYSTEM's local
// timezone by JS, giving the correct absolute instant for local midnight —
// `to` is "now", not local end-of-day, since this backs a live counter that
// should include everything up to this exact moment.
export function todayLocalUtcWindow(): { from: string; to: string } {
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  return { from: localMidnight.toISOString(), to: now.toISOString() };
}
