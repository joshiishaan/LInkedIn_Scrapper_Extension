import { API_BASE_URL, getAuthHeaders } from "./_apiBase";

export const notesApi = {
  getNotes: async (contactId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/hubspot/notes?contactId=${contactId}`,
      { headers: await getAuthHeaders() },
    );
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to fetch notes");
    }
    return response.json();
  },

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
    return response.json();
  },

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
