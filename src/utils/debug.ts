/**
 * Build-time debug logging.
 *
 * The extension is always built with `vite build` (never `vite dev`), so we gate
 * logs on an explicit env flag rather than import.meta.env.DEV. Set
 * `VITE_DEBUG=true` in .env while developing; leave it unset for production
 * releases. When DEBUG is false, `if (DEBUG)` folds to `if (false)` and Vite
 * tree-shakes these calls out of the bundle entirely.
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
