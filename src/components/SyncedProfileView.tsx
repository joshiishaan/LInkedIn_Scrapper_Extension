import { useState, useRef, useEffect } from "react";
import { hubspotApi } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { notesApi, tasksApi } from "../services/api";
import TaskDashboardPanel from "./TaskDashboardPanel";
import NotesPanel from "./NotesPanel";
import { createPortal } from "react-dom";
import { useShadowPortal } from "../hooks/useShadowPortal";

interface Props {
  contactName: string;
  companyName: string;
  email: string;
  ownerName?: string;
  lifecycle?: string;
  phone?: string;
  username: string;
  hubspotOwnerId?: string;
  hubspotContactId?: string;
  leadStatus?: string;
  leadSource?: string;
  connectedOnSource?: string;
}

type CrmInitialState = {
  ownerId: string;
  lifecycle: string;
  leadStatus: string;
  leadSource: string;
  connectedOnSource: string;
  email: string;
  mobile: string;
};

export default function SyncedProfileView({
  contactName,
  companyName,
  email,
  ownerName,
  lifecycle,
  phone,
  username,
  hubspotOwnerId,
  hubspotContactId,
  leadStatus,
  leadSource,
  connectedOnSource,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "white",
    bgSecondary: isDark ? "#2d3748" : "#f7f8fa",
    bgHover: isDark ? "#374151" : "#e5e7eb",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    link: isDark ? "#63b3ed" : "#0073b1",
  };

  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [notesCountLoading, setNotesCountLoading] = useState(true);
  const [notesCount, setNotesCount] = useState(0);
  const [editableEmail, setEditableEmail] = useState(email);
  const [editableMobile, setEditableMobile] = useState("");
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const [isEmailHovered, setIsEmailHovered] = useState(false);
  const [isMobileHovered, setIsMobileHovered] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [showLifecycleDropdown, setShowLifecycleDropdown] = useState(false);
  const [showLeadStatusDropdown, setShowLeadStatusDropdown] = useState(false);
  const [showLeadSourceDropdown, setShowLeadSourceDropdown] = useState(false);
  const [showConnectedOnSourceDropdown, setShowConnectedOnSourceDropdown] =
    useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [lifecycleSearch, setLifecycleSearch] = useState("");
  const [leadStatusSearch, setLeadStatusSearch] = useState("");
  const [leadSourceSearch, setLeadSourceSearch] = useState("");
  const [connectedOnSourceSearch, setConnectedOnSourceSearch] = useState("");
  const [showTasksPanel, setShowTasksPanel] = useState(false);
  const [tasksCountLoading, setTasksCountLoading] = useState(true);
  const [tasksCount, setTasksCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const toastShadowRoot = useShadowPortal(toast.show);
  const [ownerOptions, setOwnerOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [lifecycleOptions, setLifecycleOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [leadStatusOptions, setLeadStatusOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [leadSourceOptions, setLeadSourceOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [connectedOnSourceOptions, setConnectedOnSourceOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [selectedOwner, setSelectedOwner] = useState<{
    label: string;
    value: string;
  }>({ label: "", value: "" });
  const [selectedLifecycle, setSelectedLifecycle] = useState<{
    label: string;
    value: string;
  }>({ label: "", value: "" });
  const [selectedLeadStatus, setSelectedLeadStatus] = useState<{
    label: string;
    value: string;
  }>({ label: "", value: "" });
  const [selectedLeadSource, setSelectedLeadSource] = useState<{
    label: string;
    value: string;
  }>({ label: "", value: "" });
  const [selectedConnectedOnSource, setSelectedConnectedOnSource] = useState<{
    label: string;
    value: string;
  }>({ label: "", value: "" });

  const [initialCrmState, setInitialCrmState] =
    useState<CrmInitialState | null>(null);

  const ownerRef = useRef<HTMLDivElement>(null);
  const lifecycleRef = useRef<HTMLDivElement>(null);
  const leadStatusRef = useRef<HTMLDivElement>(null);
  const leadSourceRef = useRef<HTMLDivElement>(null);
  const connectedOnSourceRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadNotesCount = async () => {
      try {
        const result = await chrome.storage.local.get([`notes_${username}`]);
        const notes = (result[`notes_${username}`] as any[]) || [];
        setNotesCount(notes.length);
      } catch (err) {
        console.error("Failed to load notes count:", err);
      }
    };

    loadNotesCount();

    const handleStorageChange = (changes: any) => {
      if (changes[`notes_${username}`]) {
        const notes = (changes[`notes_${username}`].newValue as any[]) || [];
        setNotesCount(notes.length);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [username]);

  useEffect(() => {
    const loadTasksCount = async () => {
      if (!hubspotContactId) {
        // No contact => no tasks, but stop showing spinner
        setTasksCount(0);
        setTasksCountLoading(false);
        return;
      }

      setTasksCountLoading(true);
      try {
        const response = await tasksApi.getTasks(hubspotContactId);
        const tasks = response.data || [];
        setTasksCount(tasks.length);
      } catch (err) {
        console.error("Failed to load tasks count:", err);
        // On error, still stop the spinner and show 0
        setTasksCount(0);
      } finally {
        setTasksCountLoading(false);
      }
    };

    loadTasksCount();
  }, [hubspotContactId]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    const fetchPropertyOptions = async () => {
      try {
        const response = await hubspotApi.getPropertyOptions();
        const owners = response.data.owners || [];
        const lifecycles = response.data.lifecycleStages || [];
        const leadStatuses = response.data.leadStatuses || [];
        const leadSources = response.data.leadSources || [];
        const connectedOnSources = response.data.connectedOnSources || [];

        setOwnerOptions(owners);
        setLifecycleOptions(lifecycles);
        setLeadStatusOptions(leadStatuses);
        setLeadSourceOptions(leadSources);
        setConnectedOnSourceOptions(connectedOnSources);

        const defaultOwner = hubspotOwnerId
          ? owners.find((o: any) => o.value === hubspotOwnerId)
          : owners.find(
              (o: any) => o.label === (ownerName || response.data.owner),
            );

        const defaultLifecycle = lifecycles.find(
          (l: any) => l.label === lifecycle || l.value === lifecycle,
        ) || { label: "Choose one", value: "" };

        const defaultLeadStatus = leadStatuses.find(
          (l: any) => l.label === leadStatus || l.value === leadStatus,
        ) || { label: "Choose one", value: "" };

        const defaultLeadSource = leadSources.find(
          (l: any) => l.label === leadSource || l.value === leadSource,
        ) || { label: "Choose one", value: "" };

        const defaultConnectedOnSource = connectedOnSources.find(
          (c: any) =>
            c.label === connectedOnSource || c.value === connectedOnSource,
        ) || { label: "Choose one", value: "" };

        const initialEmail = response.data.email || email;
        const initialMobile = phone || response.data.mobile || "";

        setSelectedOwner(defaultOwner);
        setLifecycleOptions(lifecycles);
        setLeadStatusOptions(leadStatuses);
        setLeadSourceOptions(leadSources);
        setConnectedOnSourceOptions(connectedOnSources);

        setSelectedLifecycle(defaultLifecycle);
        setSelectedLeadStatus(defaultLeadStatus);
        setSelectedLeadSource(defaultLeadSource);
        setSelectedConnectedOnSource(defaultConnectedOnSource);
        setEditableEmail(initialEmail);
        setEditableMobile(initialMobile);

        setInitialCrmState({
          ownerId: defaultOwner?.value || "",
          lifecycle: defaultLifecycle.value,
          leadStatus: defaultLeadStatus.value,
          leadSource: defaultLeadSource.value,
          connectedOnSource: defaultConnectedOnSource.value,
          email: initialEmail,
          mobile: initialMobile,
        });
      } catch (err) {
        console.error("Failed to fetch property options:", err);
        setOwnerOptions([]);
        setLifecycleOptions([]);
        setLeadStatusOptions([]);
        setLeadSourceOptions([]);
        setConnectedOnSourceOptions([]);
        setSelectedOwner({
          label: ownerName ? ownerName : "Choose one",
          value: "",
        });
        setSelectedLifecycle({
          label: lifecycle ? lifecycle : "Choose one",
          value: "",
        });
        setSelectedLeadStatus({ label: "Choose one", value: "" });
        setSelectedLeadSource({ label: "Choose one", value: "" });
        setSelectedConnectedOnSource({ label: "Choose one", value: "" });
        setEditableMobile(phone || "");
      }
    };

    fetchPropertyOptions();
  }, [
    email,
    ownerName,
    lifecycle,
    phone,
    leadStatus,
    leadSource,
    connectedOnSource,
  ]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        ownerRef.current &&
        !ownerRef.current.contains(event.target as Node)
      ) {
        setShowOwnerDropdown(false);
        setOwnerSearch("");
      }
      if (
        lifecycleRef.current &&
        !lifecycleRef.current.contains(event.target as Node)
      ) {
        setShowLifecycleDropdown(false);
        setLifecycleSearch("");
      }
      if (
        leadStatusRef.current &&
        !leadStatusRef.current.contains(event.target as Node)
      ) {
        setShowLeadStatusDropdown(false);
        setLeadStatusSearch("");
      }
      if (
        leadSourceRef.current &&
        !leadSourceRef.current.contains(event.target as Node)
      ) {
        setShowLeadSourceDropdown(false);
        setLeadSourceSearch("");
      }
      if (
        connectedOnSourceRef.current &&
        !connectedOnSourceRef.current.contains(event.target as Node)
      ) {
        setShowConnectedOnSourceDropdown(false);
        setConnectedOnSourceSearch("");
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const loadNotesCount = async () => {
      if (!hubspotContactId) {
        // No contact => no notes, but stop showing spinner
        setNotesCount(0);
        setNotesCountLoading(false);
        return;
      }

      setNotesCountLoading(true);
      try {
        const response = await notesApi.getNotes(hubspotContactId);
        const notes = response.data || [];
        setNotesCount(notes.length);
      } catch (err) {
        console.error("Failed to load notes count:", err);
        // On error, still stop the spinner and show 0
        setNotesCount(0);
      } finally {
        setNotesCountLoading(false);
      }
    };

    loadNotesCount();
  }, [hubspotContactId]);

  const hasCrmChanges =
    !!initialCrmState &&
    (selectedOwner.value !== initialCrmState.ownerId ||
      selectedLifecycle.value !== initialCrmState.lifecycle ||
      selectedLeadStatus.value !== initialCrmState.leadStatus ||
      selectedLeadSource.value !== initialCrmState.leadSource ||
      selectedConnectedOnSource.value !== initialCrmState.connectedOnSource ||
      editableEmail !== initialCrmState.email ||
      editableMobile !== initialCrmState.mobile);

  const canUpdateCrm = hasCrmChanges && !updating;

  const handleUpdateCRM = async () => {
    if (!hasCrmChanges) {
      setToast({
        show: true,
        message: "Nothing to update.",
        type: "error",
      });
      setTimeout(
        () => setToast({ show: false, message: "", type: "error" }),
        3000,
      );
      return;
    }

    setUpdating(true);
    try {
      const payload = {
        name: contactName,
        email: editableEmail,
        phone: editableMobile,
        owner: selectedOwner.value,
        lifecycle: selectedLifecycle.value,
        leadStatus: selectedLeadStatus.value,
        leadSource: selectedLeadSource.value,
        connectedOnSource: selectedConnectedOnSource.value,
        company: companyName,
      };

      await hubspotApi.updateContact(payload, username);
      setToast({
        show: true,
        message: "CRM updated successfully!",
        type: "success",
      });
      setShowMenu(false);
      setInitialCrmState({
        ownerId: selectedOwner.value,
        lifecycle: selectedLifecycle.value,
        leadStatus: selectedLeadStatus.value,
        leadSource: selectedLeadSource.value,
        connectedOnSource: selectedConnectedOnSource.value,
        email: editableEmail,
        mobile: editableMobile,
      });

      setTimeout(
        () => setToast({ show: false, message: "", type: "success" }),
        3000,
      );
    } catch (err) {
      console.error("Failed to update CRM:", err);
      setToast({
        show: true,
        message: "Failed to update CRM",
        type: "error",
      });
      setTimeout(
        () => setToast({ show: false, message: "", type: "error" }),
        3000,
      );
    } finally {
      setUpdating(false);
    }
  };
  const filteredOwners = ownerOptions.filter((option) =>
    option.label.toLowerCase().includes(ownerSearch.toLowerCase()),
  );

  const filteredLifecycles = lifecycleOptions.filter((option) =>
    option.label.toLowerCase().includes(lifecycleSearch.toLowerCase()),
  );

  const filteredLeadStatuses = leadStatusOptions.filter((option) =>
    option.label.toLowerCase().includes(leadStatusSearch.toLowerCase()),
  );

  const filteredLeadSources = leadSourceOptions.filter((option) =>
    option.label.toLowerCase().includes(leadSourceSearch.toLowerCase()),
  );

  const filteredConnectedOnSources = connectedOnSourceOptions.filter((option) =>
    option.label.toLowerCase().includes(connectedOnSourceSearch.toLowerCase()),
  );

  return (
    <>
      <section
        style={{
          background: colors.bg,
          borderRadius: "8px",
          padding: "20px 24px 100px 24px",
          border: "1px solid rgba(0,0,0,0.15)",
          marginTop: "8px",
          position: "relative",
        }}
      >
        <div
          ref={menuRef}
          style={{ position: "absolute", top: "16px", right: "16px" }}
        >
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: colors.textSecondary,
              padding: "4px 8px",
              borderRadius: "4px",
              transition: "all 0.2s",
              fontWeight: 700,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bgHover;
              e.currentTarget.style.color = colors.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = colors.textSecondary;
            }}
          >
            ⋯
          </button>
          {showMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                boxShadow: isDark
                  ? "0 4px 12px rgba(0,0,0,0.5)"
                  : "0 4px 12px rgba(0,0,0,0.15)",
                minWidth: "180px",
                marginTop: "4px",
                zIndex: 1000,
                overflow: "hidden",
              }}
            >
              <div
                onClick={() => {
                  if (updating) return;
                  // Allow click even when visually disabled so we can show the "Nothing to update" toast
                  handleUpdateCRM();
                }}
                style={{
                  padding: "12px 16px",
                  cursor: canUpdateCrm ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  color: colors.text,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  opacity: canUpdateCrm ? 1 : 0.5,
                  transition: "background 0.15s",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  if (canUpdateCrm) {
                    e.currentTarget.style.background = colors.bgSecondary;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13.5 8.5l-5 5L6 11M2.5 8.5l5-5 2.5 2.5"
                    stroke={colors.link}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{updating ? "Updating..." : "Update CRM"}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: colors.text,
              margin: "0 0 4px 0",
            }}
          >
            {contactName}
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Owner */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill={colors.textSecondary}
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Owner
              </span>
            </div>
            <div ref={ownerRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
                style={{
                  fontSize: "14px",
                  color: colors.link,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                {selectedOwner.label}
              </div>
              {showOwnerDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    boxShadow: isDark
                      ? "0 4px 12px rgba(0,0,0,0.5)"
                      : "0 4px 12px rgba(0,0,0,0.15)",
                    width: "220px",
                    maxHeight: "200px",
                    overflow: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Choose one..."
                    value={ownerSearch}
                    onChange={(e) => setOwnerSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: colors.bg,
                      color: colors.text,
                    }}
                  />
                  {filteredOwners.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setSelectedOwner(option);
                        setShowOwnerDropdown(false);
                        setOwnerSearch("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: colors.text,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.bgSecondary)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedOwner.value
                              ? colors.link
                              : colors.text,
                          fontWeight:
                            option.value === selectedOwner.value ? 500 : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedOwner.value && (
                        <span style={{ color: colors.link, fontSize: "16px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lead Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke={colors.textSecondary}
                  strokeWidth="2"
                  fill="none"
                />
                <circle cx="8" cy="8" r="3" fill={colors.textSecondary} />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Lead Status
              </span>
            </div>
            <div ref={leadStatusRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() =>
                  setShowLeadStatusDropdown(!showLeadStatusDropdown)
                }
                style={{
                  fontSize: "14px",
                  color: colors.link,
                  cursor: "pointer",
                  padding: "4px 0",
                  fontWeight: 500,
                }}
              >
                {selectedLeadStatus.label}
              </div>
              {showLeadStatusDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    boxShadow: isDark
                      ? "0 4px 12px rgba(0,0,0,0.5)"
                      : "0 4px 12px rgba(0,0,0,0.15)",
                    width: "220px",
                    maxHeight: "200px",
                    overflow: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Choose one..."
                    value={leadStatusSearch}
                    onChange={(e) => setLeadStatusSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: colors.bg,
                      color: colors.text,
                    }}
                  />
                  {filteredLeadStatuses.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setSelectedLeadStatus(option);
                        setShowLeadStatusDropdown(false);
                        setLeadStatusSearch("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: colors.text,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.bgSecondary)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedLeadStatus.value
                              ? colors.link
                              : colors.text,
                          fontWeight:
                            option.value === selectedLeadStatus.value
                              ? 500
                              : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedLeadStatus.value && (
                        <span style={{ color: colors.link, fontSize: "16px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lead Source */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M8 2L3 6l5 4 5-4-5-4z" fill={colors.textSecondary} />
                <path
                  d="M3 7v5l5 2 5-2V7"
                  stroke={colors.textSecondary}
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Lead Source
              </span>
            </div>
            <div ref={leadSourceRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() =>
                  setShowLeadSourceDropdown(!showLeadSourceDropdown)
                }
                style={{
                  fontSize: "14px",
                  color: colors.link,
                  cursor: "pointer",
                  padding: "4px 0",
                  fontWeight: 500,
                }}
              >
                {selectedLeadSource.label}
              </div>
              {showLeadSourceDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    boxShadow: isDark
                      ? "0 4px 12px rgba(0,0,0,0.5)"
                      : "0 4px 12px rgba(0,0,0,0.15)",
                    width: "220px",
                    maxHeight: "200px",
                    overflow: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Choose one..."
                    value={leadSourceSearch}
                    onChange={(e) => setLeadSourceSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: colors.bg,
                      color: colors.text,
                    }}
                  />
                  {filteredLeadSources.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setSelectedLeadSource(option);
                        setShowLeadSourceDropdown(false);
                        setLeadSourceSearch("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: colors.text,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.bgSecondary)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedLeadSource.value
                              ? colors.link
                              : colors.text,
                          fontWeight:
                            option.value === selectedLeadSource.value
                              ? 500
                              : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedLeadSource.value && (
                        <span style={{ color: colors.link, fontSize: "16px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Connected On Source */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 8h6M8 5v6"
                  stroke={colors.textSecondary}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke={colors.textSecondary}
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Connected On
              </span>
            </div>
            <div
              ref={connectedOnSourceRef}
              style={{ position: "relative", flex: 1 }}
            >
              <div
                onClick={() =>
                  setShowConnectedOnSourceDropdown(
                    !showConnectedOnSourceDropdown,
                  )
                }
                style={{
                  fontSize: "14px",
                  color: colors.link,
                  cursor: "pointer",
                  padding: "4px 0",
                  fontWeight: 500,
                }}
              >
                {selectedConnectedOnSource.label}
              </div>
              {showConnectedOnSourceDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    boxShadow: isDark
                      ? "0 4px 12px rgba(0,0,0,0.5)"
                      : "0 4px 12px rgba(0,0,0,0.15)",
                    width: "220px",
                    maxHeight: "200px",
                    overflow: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Choose one..."
                    value={connectedOnSourceSearch}
                    onChange={(e) => setConnectedOnSourceSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: colors.bg,
                      color: colors.text,
                    }}
                  />
                  {filteredConnectedOnSources.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setSelectedConnectedOnSource(option);
                        setShowConnectedOnSourceDropdown(false);
                        setConnectedOnSourceSearch("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: colors.text,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.bgSecondary)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedConnectedOnSource.value
                              ? colors.link
                              : colors.text,
                          fontWeight:
                            option.value === selectedConnectedOnSource.value
                              ? 500
                              : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedConnectedOnSource.value && (
                        <span style={{ color: colors.link, fontSize: "16px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lifecycle */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke={colors.textSecondary}
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Lifecycle
              </span>
            </div>
            <div ref={lifecycleRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowLifecycleDropdown(!showLifecycleDropdown)}
                style={{
                  fontSize: "14px",
                  color: colors.link,
                  cursor: "pointer",
                  padding: "4px 0",
                  fontWeight: 500,
                }}
              >
                {selectedLifecycle.label}
              </div>
              {showLifecycleDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    boxShadow: isDark
                      ? "0 4px 12px rgba(0,0,0,0.5)"
                      : "0 4px 12px rgba(0,0,0,0.15)",
                    width: "220px",
                    maxHeight: "200px",
                    overflow: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Choose one..."
                    value={lifecycleSearch}
                    onChange={(e) => setLifecycleSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: colors.bg,
                      color: colors.text,
                    }}
                  />
                  {filteredLifecycles.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setSelectedLifecycle(option);
                        setShowLifecycleDropdown(false);
                        setLifecycleSearch("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: colors.text,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = colors.bgSecondary)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedLifecycle.value
                              ? colors.link
                              : colors.text,
                          fontWeight:
                            option.value === selectedLifecycle.value
                              ? 500
                              : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedLifecycle.value && (
                        <span style={{ color: colors.link, fontSize: "16px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Company */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 4h12v8H2V4zm0-2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z"
                  fill={colors.textSecondary}
                />
                <path d="M4 6h4v4H4V6z" fill={colors.textSecondary} />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Company
              </span>
            </div>
            <span style={{ fontSize: "14px", color: colors.text }}>
              {companyName}
            </span>
          </div>

          {/* Email */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 2l6 4 6-4v-1l-6 4-6-4v1z"
                  fill={colors.textSecondary}
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Email
              </span>
            </div>
            <div
              style={{ position: "relative", display: "inline-block" }}
              onMouseEnter={() => setIsEmailHovered(true)}
              onMouseLeave={() => setIsEmailHovered(false)}
            >
              <input
                type="email"
                value={editableEmail}
                onChange={(e) => setEditableEmail(e.target.value)}
                placeholder="Add email"
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                style={{
                  fontSize: "14px",
                  color: colors.text,
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: isEmailFocused
                    ? `2px solid ${colors.link}`
                    : isEmailHovered
                      ? `1px solid ${colors.textSecondary}`
                      : "1px solid transparent",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  boxShadow: "none",
                  padding: "4px 0",
                  background: "transparent",
                  width: isEmailFocused ? "250px" : "auto",
                  minWidth: "200px",
                  transition: "all 0.2s",
                }}
              />
            </div>
          </div>

          {/* Mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "110px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2zm2 10h6v1H5v-1z"
                  fill={colors.textSecondary}
                />
              </svg>
              <span
                style={{
                  fontSize: "13px",
                  color: colors.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                Mobile
              </span>
            </div>
            <div
              style={{ position: "relative", display: "inline-block" }}
              onMouseEnter={() => setIsMobileHovered(true)}
              onMouseLeave={() => setIsMobileHovered(false)}
            >
              <input
                type="tel"
                value={editableMobile}
                onChange={(e) => setEditableMobile(e.target.value)}
                placeholder="Add mobile number"
                onFocus={() => setIsMobileFocused(true)}
                onBlur={() => setIsMobileFocused(false)}
                style={{
                  fontSize: "14px",
                  color: editableMobile ? colors.text : colors.link,
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: isMobileFocused
                    ? `2px solid ${colors.link}`
                    : isMobileHovered
                      ? `1px solid ${colors.textSecondary}`
                      : "1px solid transparent",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  boxShadow: "none",
                  padding: "4px 0",
                  background: "transparent",
                  width: isMobileFocused ? "250px" : "auto",
                  minWidth: "200px",
                  transition: "all 0.2s",
                }}
              />
            </div>
          </div>
        </div>

        {/* Notes and Tasks Buttons */}
        <div
          style={{
            position: "absolute",
            bottom: "90px",
            right: "90px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "180px",
          }}
        >
          <div
            onClick={() => setShowNotesPanel(true)}
            style={{
              background: isDark ? "#2d3748" : "#f7f8fa",
              borderRadius: "8px",
              padding: "14px 16px",
              border: isDark ? "1px solid #4a5568" : "1px solid #e5e7eb",
              boxShadow: isDark
                ? "0 2px 8px rgba(0,0,0,0.3)"
                : "0 2px 8px rgba(0,0,0,0.08)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = isDark
                ? "0 4px 12px rgba(0,0,0,0.4)"
                : "0 4px 12px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = isDark
                ? "0 2px 8px rgba(0,0,0,0.3)"
                : "0 2px 8px rgba(0,0,0,0.08)";
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                    stroke={colors.textSecondary}
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <line
                    x1="5"
                    y1="5"
                    x2="11"
                    y2="5"
                    stroke={colors.textSecondary}
                    strokeWidth="1.5"
                  />
                  <line
                    x1="5"
                    y1="8"
                    x2="11"
                    y2="8"
                    stroke={colors.textSecondary}
                    strokeWidth="1.5"
                  />
                  <line
                    x1="5"
                    y1="11"
                    x2="9"
                    y2="11"
                    stroke={colors.textSecondary}
                    strokeWidth="1.5"
                  />
                </svg>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: colors.text,
                  }}
                >
                  Notes
                </span>
              </div>
              {notesCountLoading ? (
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    border: `2px solid ${colors.border}`,
                    borderTop: `2px solid ${colors.link}`,
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: "13px",
                    color: colors.textSecondary,
                    fontWeight: 500,
                  }}
                >
                  {notesCount}
                </span>
              )}
            </div>
          </div>
          <div
            onClick={() => setShowTasksPanel(true)}
            style={{
              background: isDark ? "#2d3748" : "#f7f8fa",
              borderRadius: "8px",
              padding: "14px 16px",
              border: isDark ? "1px solid #4a5568" : "1px solid #e5e7eb",
              boxShadow: isDark
                ? "0 2px 8px rgba(0,0,0,0.3)"
                : "0 2px 8px rgba(0,0,0,0.08)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = isDark
                ? "0 4px 12px rgba(0,0,0,0.4)"
                : "0 4px 12px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = isDark
                ? "0 2px 8px rgba(0,0,0,0.3)"
                : "0 2px 8px rgba(0,0,0,0.08)";
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 4h12M2 8h12M2 12h12"
                    stroke={colors.textSecondary}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: colors.text,
                  }}
                >
                  Tasks
                </span>
              </div>
              {tasksCountLoading ? (
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    border: `2px solid ${colors.border}`,
                    borderTop: `2px solid ${colors.link}`,
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: "13px",
                    color: colors.textSecondary,
                    fontWeight: 500,
                  }}
                >
                  {tasksCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <NotesPanel
        isOpen={showNotesPanel}
        onClose={() => setShowNotesPanel(false)}
        contactName={contactName}
        companyName={companyName}
        username={username}
        hubspotContactId={hubspotContactId}
        onNotesCountChange={setNotesCount}
      />

      <TaskDashboardPanel
        isOpen={showTasksPanel}
        onClose={() => setShowTasksPanel(false)}
        contactName={contactName}
        hubspotContactId={hubspotContactId}
        onTasksCountChange={setTasksCount}
        owners={ownerOptions.map((o) => ({ id: o.value, name: o.label }))}
      />

      {toast.show &&
        toastShadowRoot &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              background: toast.type === "success" ? "#10b981" : "#ef4444",
              color: "white",
              padding: "12px 20px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              fontSize: "14px",
              fontWeight: 500,
              zIndex: 2147483647, // above everything
              display: "flex",
              alignItems: "center",
              gap: "8px",
              animation: "slideIn 0.3s ease-out",
              pointerEvents: "auto",
            }}
          >
            {toast.type === "success" ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M16.667 5L7.5 14.167 3.333 10"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M15 5L5 15M5 5l10 10"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {toast.message}
          </div>,
          toastShadowRoot,
        )}

      <style>
        {`
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}
      </style>
    </>
  );
}
