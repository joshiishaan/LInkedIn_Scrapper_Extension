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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
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
          background: "white",
          borderRadius: "12px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 1,
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
                color: "#000000e6",
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
                color: "#666",
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
                (e.currentTarget.style.background = "#f3f4f6")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              ×
            </button>
          </div>
          <p style={{ fontSize: "14px", color: "#666", margin: "8px 0 0 0" }}>
            Multiple current positions found. Select one to fetch company
            details.
          </p>
        </div>

        <div style={{ padding: "16px" }}>
          {companies.map((exp, index) => (
            <div
              key={index}
              onClick={() => onSelect(exp)}
              style={{
                padding: "16px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                marginBottom: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
                background: "white",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#667eea";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(102, 126, 234, 0.15)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
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
                      color: "#000000e6",
                      margin: "0 0 4px 0",
                    }}
                  >
                    {exp.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#000000e6",
                      margin: "0 0 4px 0",
                      fontWeight: 500,
                    }}
                  >
                    {exp.company}
                  </p>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#666",
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
                      color: "#666",
                      margin: "4px 0 0 0",
                    }}
                  >
                    {formatDate(exp.startDate)} - Present
                  </p>
                </div>
                <div
                  style={{
                    padding: "6px 12px",
                    background:
                      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  Select
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
