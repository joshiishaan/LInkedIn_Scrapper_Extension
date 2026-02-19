import { useState, useRef, useEffect } from "react";
import { hubspotApi } from "../services/api";

interface Props {
  contactName: string;
  companyName: string;
  email: string;
  ownerName?: string;
  lifecycle?: string;
  phone?: string;
  username: string;
}

export default function SyncedProfileView({
  contactName,
  companyName,
  email,
  ownerName,
  lifecycle,
  phone,
  username,
}: Props) {
  const [editableEmail, setEditableEmail] = useState(email);
  const [editableMobile, setEditableMobile] = useState("");
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isMobileFocused, setIsMobileFocused] = useState(false);
  const [isEmailHovered, setIsEmailHovered] = useState(false);
  const [isMobileHovered, setIsMobileHovered] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [showLifecycleDropdown, setShowLifecycleDropdown] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [lifecycleSearch, setLifecycleSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [lifecycleOptions, setLifecycleOptions] = useState<
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
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const ownerRef = useRef<HTMLDivElement>(null);
  const lifecycleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

        setOwnerOptions(owners);
        setLifecycleOptions(lifecycles);

        const defaultOwner = owners.find(
          (o: any) => o.label === (ownerName || response.data.owner),
        ) || { label: "Choose one", value: "" };
        const defaultLifecycle = lifecycles.find(
          (l: any) => l.label === (lifecycle || response.data.lifecycle),
        ) || { label: "Choose one", value: "" };

        setSelectedOwner(defaultOwner);
        setSelectedLifecycle(defaultLifecycle);
        setEditableEmail(response.data.email || email);
        setEditableMobile(phone || response.data.mobile || "");
      } catch (err) {
        console.error("Failed to fetch property options:", err);
        setOwnerOptions([]);
        setLifecycleOptions([]);
        setSelectedOwner({
          label: ownerName ? ownerName : "Choose one",
          value: "",
        });
        setSelectedLifecycle({
          label: lifecycle ? lifecycle : "Choose one",
          value: "",
        });
        setEditableMobile(phone || "");
      }
    };

    fetchPropertyOptions();
  }, [email, ownerName, lifecycle, phone]);

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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleUpdateCRM = async () => {
    setUpdating(true);
    try {
      const payload = {
        name: contactName,
        email: editableEmail,
        phone: editableMobile,
        owner: selectedOwner.value,
        lifecycle: selectedLifecycle.value,
        company: companyName,
      };

      await hubspotApi.updateContact(payload, username);
      setToast({
        show: true,
        message: "CRM updated successfully!",
        type: "success",
      });
      setShowMenu(false);
      setTimeout(
        () => setToast({ show: false, message: "", type: "success" }),
        3000,
      );
    } catch (err) {
      console.error("Failed to update CRM:", err);
      setToast({ show: true, message: "Failed to update CRM", type: "error" });
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

  return (
    <>
      <section
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "20px 24px",
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
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "#666",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            ⋯
          </button>
          {showMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                minWidth: "160px",
                marginTop: "4px",
                zIndex: 1000,
              }}
            >
              <div
                onClick={handleUpdateCRM}
                style={{
                  padding: "10px 16px",
                  cursor: updating ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  color: "#000000e6",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  opacity: updating ? 0.5 : 1,
                }}
                onMouseEnter={(e) =>
                  !updating && (e.currentTarget.style.background = "#f3f4f6")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "white")
                }
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
                    stroke="#666"
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
              color: "#000000e6",
              margin: "0 0 4px 0",
            }}
          >
            {contactName}
          </h2>
          <p style={{ fontSize: "13px", color: "#666", margin: 0 }}>
            Last CRM activity just now
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "80px",
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
                  fill="#666"
                />
              </svg>
              <span style={{ fontSize: "13px", color: "#666" }}>Owner</span>
            </div>
            <div ref={ownerRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
                style={{
                  fontSize: "14px",
                  color: "#0073b1",
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
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "4px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    width: "200px",
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
                      padding: "8px",
                      border: "none",
                      borderBottom: "1px solid #e5e7eb",
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
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
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "#000000e6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f3f4f6")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "white")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedOwner.value
                              ? "#0073b1"
                              : "#000000e6",
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedOwner.value && (
                        <span style={{ color: "#0073b1" }}>✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "80px",
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
                  stroke="#666"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
              <span style={{ fontSize: "13px", color: "#666" }}>Lifecycle</span>
            </div>
            <div ref={lifecycleRef} style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowLifecycleDropdown(!showLifecycleDropdown)}
                style={{
                  fontSize: "14px",
                  color: "#0073b1",
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
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "4px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    width: "200px",
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
                      padding: "8px",
                      border: "none",
                      borderBottom: "1px solid #e5e7eb",
                      outline: "none",
                      fontSize: "14px",
                      boxSizing: "border-box",
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
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "#000000e6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f3f4f6")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "white")
                      }
                    >
                      <span
                        style={{
                          color:
                            option.value === selectedLifecycle.value
                              ? "#0073b1"
                              : "#000000e6",
                        }}
                      >
                        {option.label}
                      </span>
                      {option.value === selectedLifecycle.value && (
                        <span style={{ color: "#0073b1" }}>✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "80px",
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
                  fill="#666"
                />
                <path d="M4 6h4v4H4V6z" fill="#666" />
              </svg>
              <span style={{ fontSize: "13px", color: "#666" }}>Company</span>
            </div>
            <span style={{ fontSize: "14px", color: "#000000e6" }}>
              {companyName}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "80px",
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
                  fill="#666"
                />
              </svg>
              <span style={{ fontSize: "13px", color: "#666" }}>Email</span>
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
                  color: "#000000e6",

                  // Reset ALL borders
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",

                  // Only control bottom border
                  borderBottom: isEmailFocused
                    ? "2px solid #0073b1"
                    : isEmailHovered
                      ? "1px solid #999"
                      : "1px solid transparent",

                  outline: "none",

                  // Remove browser default styling
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

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "80px",
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
                  fill="#666"
                />
              </svg>
              <span style={{ fontSize: "13px", color: "#666" }}>Mobile</span>
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
                  color: editableMobile ? "#000000e6" : "#0073b1",

                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",

                  borderBottom: isMobileFocused
                    ? "2px solid #0073b1"
                    : isMobileHovered
                      ? "1px solid #999"
                      : "1px solid transparent",

                  outline: "none",

                  // Remove browser default appearance
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

        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <span
              style={{ fontSize: "14px", fontWeight: 600, color: "#000000e6" }}
            >
              Notes
            </span>
            <span style={{ fontSize: "13px", color: "#666" }}>2</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <span
              style={{ fontSize: "14px", fontWeight: 600, color: "#000000e6" }}
            >
              Tasks
            </span>
            <span style={{ fontSize: "13px", color: "#666" }}>3</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10b981",
              }}
            />
            <span style={{ fontSize: "13px", color: "#666" }}>
              No tasks due
            </span>
          </div>
        </div>
      </section>

      {toast.show && (
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
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "slideIn 0.3s ease-out",
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
        </div>
      )}
    </>
  );
}
