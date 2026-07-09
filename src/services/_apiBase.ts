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

// Single-flight refresh: concurrent callers whose access token has expired all
// await the SAME /auth/refresh call. This is critical because refresh tokens
// rotate on the server — if two calls each sent the (same) stored refresh
// token, the second would present an already-revoked token and trip the
// server's reuse-detection, force-logging the user out.
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

  if (!response.ok) {
    await chrome.storage.local.remove(["user", "refreshToken"]);
    throw new Error("Session expired. Please login again.");
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
