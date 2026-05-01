export const API_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL;

interface User {
  token: string;
  name: string;
  email: string;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const result = await chrome.storage.local.get(["user"]);
  const user = result.user as User | undefined;

  if (user?.token && isTokenExpired(user.token)) {
    await chrome.storage.local.remove("user");
    throw new Error("Session expired. Please login again.");
  }

  return {
    "Content-Type": "application/json",
    ...(user?.token && { Authorization: `Bearer ${user.token}` }),
  };
};
