/**
 * API Service Layer
 * Handles all backend API calls for authentication, HubSpot integration, and LinkedIn data sync
 */

const API_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL;

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

// Get authorization headers with user token from storage
const getAuthHeaders = async () => {
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

// Authentication API endpoints
export const authApi = {
  // User login
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error("Login failed");
    return response.json();
  },

  // User registration
  signup: async (name: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) throw new Error("Signup failed");
    return response.json();
  },

  // Password reset request
  resetPassword: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new Error("Reset failed");
    return response.json();
  },
};

// HubSpot integration API endpoints
export const hubspotApi = {
  // Check if HubSpot is connected
  checkStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/status`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to check status");
    return response.json();
  },

  // Get HubSpot OAuth connection URL
  getConnectUrl: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/connect`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to get connect URL");
    return response.json();
  },

  // Get property options for dropdowns (Owner, Lifecycle)
  getPropertyOptions: async () => {
    const response = await fetch(`${API_BASE_URL}/hubspot/property-options`, {
      headers: await getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to get property options");
    return response.json();
  },

  // Update CRM contact fields
  updateContact: async (payload: any, username: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/update-contact?username=${username}`,
      {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error("Failed to update contact");
    return response.json();
  },
};

// LinkedIn data sync API endpoints
export const linkedinApi = {
  // Check if profile is already synced to HubSpot
  checkSyncStatus: async (profileId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/check-profile?username=${profileId}`,
      {
        headers: await getAuthHeaders(),
      },
    );
    if (!response.ok) throw new Error("Failed to check sync status");
    return response.json();
  },

  // Save contact and company data to HubSpot
  saveContactAndCompany: async (payload: any) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/sync-lead`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Failed to save data");
    return response.json();
  },
};

// Notes API endpoints
export const notesApi = {
  // Get notes for a contact
  getNotes: async (contactId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/notes?contactId=${contactId}`,
      {
        headers: await getAuthHeaders(),
      },
    );
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to fetch notes");
    }
    const data = await response.json();
    return data;
  },

  // Create a new note
  createNote: async (payload: {
    noteTitle?: string;
    dealValue?: string;
    nextStep?: string;
    notes: string;
    contactId?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/create-note`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to create note");
    }

    const data = await response.json();
    console.log("Response:", data);

    return data;
  },

  // Update a note
  updateNote: async (
    noteId: string,
    payload: {
      noteTitle?: string;
      dealValue?: string;
      nextStep?: string;
      notes: string;
    },
  ) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/notes/${noteId}`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to update note");
    }

    return response.json();
  },

  // Delete a note
  deleteNote: async (noteId: string) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/notes/${noteId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to delete note");
    }

    return response.json();
  },
};
