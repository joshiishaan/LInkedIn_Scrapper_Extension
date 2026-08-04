export const API_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL;

interface User {
  token: string;
  name: string;
  email: string;
  [key: string]: unknown;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Single-flight refresh: concurrent callers WITHIN THIS SAME CONTEXT whose
// access token has expired all await the SAME /auth/refresh call, instead of
// each presenting the same (soon-to-rotate) refresh token independently.
//
// This does NOT cover races ACROSS contexts: this extension runs a separate
// content-script instance per open LinkedIn tab (manifest.json has no
// all_frames coordination), plus the background service worker and the
// popup — each has its own copy of this module and this refreshPromise, so
// two tabs can each pass this guard and both call /auth/refresh with the
// same stored token within milliseconds of each other. The backend's
// tokenService.rotateRefreshToken has a short grace period specifically to
// treat that cross-context race as benign rather than token theft — this
// local guard just cuts down how often that grace period gets exercised.
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const { refreshToken, user } = await chrome.storage.local.get([
    "refreshToken",
    "user",
  ]);

  if (!refreshToken) {
    await chrome.storage.local.remove(["user", "refreshToken"]);
    throw new Error("Session expired. Please login again.");
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (response.status === 401) {
    // The refresh token itself was rejected (invalid/expired/genuinely
    // revoked) — this is the one case that actually means "log out".
    await chrome.storage.local.remove(["user", "refreshToken"]);
    throw new Error("Session expired. Please login again.");
  }
  if (!response.ok) {
    // Anything else (500, 429, a network blip surfaced as a bad response) is
    // transient — the refresh token itself may still be perfectly valid.
    // Don't wipe the session over it; let the caller fail this one request
    // and try again later, same as any other API call would.
    throw new Error(`Token refresh failed (${response.status}) — will retry later`);
  }

  const body = await response.json();
  const newToken: string = body.data.token;
  const newRefreshToken: string = body.data.refreshToken;

  await chrome.storage.local.set({
    user: { ...(user || {}), token: newToken },
    refreshToken: newRefreshToken,
  });

  return newToken;
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const result = await chrome.storage.local.get(["user"]);
  const user = result.user as User | undefined;
  let token = user?.token;

  // Access token is short-lived (15m); silently refresh it when expired so the
  // user isn't logged out mid-session. Falls through to login if refresh fails.
  if (token && isTokenExpired(token)) {
    token = await refreshAccessToken();
  }

  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

export async function throwApiError(
  response: Response,
  fallback: string,
): Promise<never> {
  if (response.status === 401) {
    await chrome.storage.local.remove(["user", "refreshToken"]);
    throw new Error("Session expired. Please login again.");
  }
  const body = await response.json().catch(() => ({}));
  throw new Error((body as any).message || fallback);
}
