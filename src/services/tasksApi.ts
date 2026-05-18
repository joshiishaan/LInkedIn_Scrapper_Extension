import { API_BASE_URL, getAuthHeaders } from "./_apiBase";

export const tasksApi = {
  getTasks: async (contactId: string, after?: string, userTimeZone?: string) => {
    let url = `${API_BASE_URL}/hubspot/tasks?contactId=${contactId}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;
    if (userTimeZone) url += `&userTimeZone=${encodeURIComponent(userTimeZone)}`;
    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to fetch tasks");
    }
    return response.json();
  },

  createTask: async (payload: {
    taskName: string;
    dueDate?: string;
    time?: string;
    priority: string;
    status: string;
    assignedTo?: string;
    comment?: string;
    reminder?: string;
    reminderCustomDatetime?: string;
    contactId?: string;
    userTimeZone?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/create-task`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error(error?.message || "Failed to create task");
    }
    return response.json();
  },

  updateTask: async (
    taskId: string,
    payload: {
      taskName: string;
      dueDate?: string;
      time?: string;
      priority: string;
      status: string;
      assignedTo?: string;
      comment?: string;
      reminder?: string;
      reminderCustomDatetime?: string;
      userTimeZone?: string;
    },
  ) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/tasks/${taskId}`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error(error?.message || "Failed to update task");
    }
    return response.json();
  },

  getAllTasks: async (userTimeZone?: string) => {
    let url = `${API_BASE_URL}/hubspot/tasks/all`;
    if (userTimeZone) url += `?userTimeZone=${encodeURIComponent(userTimeZone)}`;
    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) throw new Error("Failed to fetch tasks");
    return response.json();
  },

  deleteTask: async (taskId: string) => {
    const response = await fetch(`${API_BASE_URL}/hubspot/tasks/${taskId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error("Failed to delete task");
    }
    return response.json();
  },
};
