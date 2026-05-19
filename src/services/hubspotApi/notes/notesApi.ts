import { API_BASE_URL, getAuthHeaders, throwApiError } from "../../_apiBase";

export const notesApi = {
  getNotes: async (contactId: string, after?: string, limit = 20) => {
    const params = new URLSearchParams({ contactId, limit: String(limit) });
    if (after) params.set("after", after);
    const response = await fetch(
      `${API_BASE_URL}/hubspot/notes?${params}`,
      { headers: await getAuthHeaders() },
    );
    if (!response.ok) await throwApiError(response, "Failed to fetch notes");
    return response.json();
  },

  getAllNotes: async () => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/notes/all`,
      { headers: await getAuthHeaders() },
    );
    if (!response.ok) await throwApiError(response, "Failed to fetch notes");
    return response.json();
  },

  createNote: async (payload: {
    noteTitle?: string;
    notes: string;
    contactId?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/create-note`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) await throwApiError(response, "Failed to create note");
    return response.json();
  },

  updateNote: async (
    noteId: string,
    payload: { noteTitle?: string; notes: string },
  ) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/notes/${noteId}`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) await throwApiError(response, "Failed to update note");
    return response.json();
  },

  deleteNote: async (noteId: string) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/notes/${noteId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) await throwApiError(response, "Failed to delete note");
    return response.json();
  },
};
