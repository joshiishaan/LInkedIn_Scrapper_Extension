import { useState } from "react";
import { useTheme } from "../context/ThemeContext";

interface Experience {
  title: string;
  company: string;
  companyUrl?: string;
  location: string;
  startDate: any;
  endDate: any;
  employmentType: string;
}

interface Props {
  companies: Experience[];
  onSelect: (company: Experience) => void;
  onClose: () => void;
}

export default function CompanySelectionModal({
  companies,
  onSelect,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const [selectedCompany, setSelectedCompany] = useState<Experience | null>(
    null,
  );

  const isDark = theme === "dark";

  const colors = {
    overlay: isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.6)",
    bg: isDark ? "#1a202c" : "white",
    border: isDark ? "#4a5568" : "#e5e7eb",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
    hover: isDark ? "#2d3748" : "#f3f4f6",
    selected: isDark ? "#2d3748" : "#f0f4ff",
    selectedBorder: isDark ? "#4c51bf" : "#667eea",
  };

  const formatDate = (date: any) => {
    if (!date) return "";
    const { month, year } = date;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[month - 1] || ""} ${year || ""}`.trim();
  };

  const handleConfirm = () => {
    if (selectedCompany) {
      onSelect(selectedCompany);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: colors.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          borderRadius: "12px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          transition: "background 0.3s",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: colors.text,
                margin: 0,
              }}
            >
              Select Current Company
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: colors.textSecondary,
                padding: "0",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = colors.hover)
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              ×
            </button>
          </div>
          <p
            style={{
              fontSize: "14px",
              color: colors.textSecondary,
              margin: "8px 0 0 0",
            }}
          >
            Multiple current positions found. Select one to fetch company
            details.
          </p>
        </div>

        <div style={{ padding: "16px", overflow: "auto", flex: 1 }}>
          {companies.map((exp, index) => (
            <div
              key={index}
              onClick={() => setSelectedCompany(exp)}
              style={{
                padding: "16px",
                border:
                  selectedCompany === exp
                    ? `2px solid ${colors.selectedBorder}`
                    : `1px solid ${colors.border}`,
                borderRadius: "8px",
                marginBottom: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
                background:
                  selectedCompany === exp ? colors.selected : colors.bg,
              }}
              onMouseEnter={(e) => {
                if (selectedCompany !== exp) {
                  e.currentTarget.style.borderColor = colors.selectedBorder;
                  e.currentTarget.style.boxShadow =
                    "0 4px 12px rgba(102, 126, 234, 0.15)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCompany !== exp) {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: colors.text,
                      margin: "0 0 4px 0",
                    }}
                  >
                    {exp.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "14px",
                      color: colors.text,
                      margin: "0 0 4px 0",
                      fontWeight: 500,
                    }}
                  >
                    {exp.company}
                  </p>
                  <div
                    style={{
                      fontSize: "13px",
                      color: colors.textSecondary,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px 8px",
                    }}
                  >
                    {exp.employmentType && <span>{exp.employmentType}</span>}
                    {exp.location && (
                      <>
                        {exp.employmentType && <span>•</span>}
                        <span>{exp.location}</span>
                      </>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: "13px",
                      color: colors.textSecondary,
                      margin: "4px 0 0 0",
                    }}
                  >
                    {formatDate(exp.startDate)} - Present
                  </p>
                </div>
                {selectedCompany === exp && (
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: colors.selectedBorder,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M13.333 4L6 11.333 2.667 8"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: colors.bg,
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: "16px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.bg;
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedCompany}
            style={{
              padding: "10px 20px",
              background: selectedCompany
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "#cbd5e0",
              color: "white",
              border: "none",
              borderRadius: "16px",
              cursor: selectedCompany ? "pointer" : "not-allowed",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (selectedCompany) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 8px rgba(102, 126, 234, 0.3)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
