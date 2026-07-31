/**
 * Build-time debug logging.
 *
 * The extension is always built with `vite build` (never `vite dev`), so we gate
 * logs on an explicit env flag rather than import.meta.env.DEV. Set
 * `VITE_DEBUG=true` in .env while developing; leave it unset for production
 * releases.
 *
 * WHAT ACTUALLY HAPPENS WHEN DEBUG IS FALSE (verified against a built bundle):
 * `dlog` minifies to an empty function — `const gt=(...r)=>{}`. Nothing is ever
 * printed, so no data leaks to a user's console. But the CALL SITES remain, and
 * their arguments are still evaluated before the no-op call. So this:
 *
 *     dlog("dump", JSON.stringify(big).slice(0, 1500));
 *
 * still runs JSON.stringify on every invocation and throws the result away.
 * For anything expensive, guard the work itself instead:
 *
 *     if (DEBUG) dlog("dump", JSON.stringify(big).slice(0, 1500));
 *
 * Plain variable references and short template strings are cheap enough to pass
 * directly; reserve the `if (DEBUG)` wrapper for serialization, deep walks, and
 * anything allocating.
 */
export const DEBUG =
  import.meta.env.VITE_DEBUG === "true" || import.meta.env.DEV === true;

export const dlog = (...args: unknown[]): void => {
  if (DEBUG) console.log(...args);
};

export const dwarn = (...args: unknown[]): void => {
  if (DEBUG) console.warn(...args);
};

export const derror = (...args: unknown[]): void => {
  if (DEBUG) console.error(...args);
};
