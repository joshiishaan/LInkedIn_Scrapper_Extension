/**
 * ProfileCard Component
 * Main UI component injected into LinkedIn profile pages
 * Handles authentication, HubSpot connection, and profile data fetching
 */

import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  fetchLinkedInProfile,
  fetchLinkedInCompany,
  parseProfileData,
  parseCompanyData,
  getProfileIdFromUrl,
  extractCompanyIdFromUrl,
  fetchLinkedInContactInfo,
} from "../utils/linkedinApi";
import {
  getInterceptedProfile,
  getInterceptedCompany,
} from "../hooks/useLinkedInProfileInterceptor";
import { linkedinApi, hubspotApi } from "../services/api";
import CompanySelectionModal from "./CompanySelectionModal";
import SyncedProfileView from "./SyncedProfileView";

interface Experience {
  title: string;
  company: string;
  companyUrl?: string;
  location: string;
  startDate: any;
  endDate: any;
  employmentType: string;
}

interface User {
  token: string;
  name: string;
  email: string;
}

interface SyncedData {
  contactName: string;
  companyName: string;
  email: string;
  ownerName?: string;
  lifecycle?: string;
  phone?: string;
  hubspotOwnerId?: string;
  hubspotContactId?: string;
  leadStatus?: string;
  leadSource?: string;
  connectedOnSource?: string;
}

export default function ProfileCard() {
  // Theme detection and styles
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#1a202c" : "white",
    border: isDark ? "#4a5568" : "rgba(0,0,0,0.15)",
    text: isDark ? "#f7fafc" : "#000000e6",
    textSecondary: isDark ? "#a0aec0" : "#666",
  };

  // Loading states
  const [loading, setLoading] = useState(false);
  const [fetchingCompany, setFetchingCompany] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkingSync, setCheckingSync] = useState(true);

  // Data states
  const [currentCompanies, setCurrentCompanies] = useState<Experience[]>([]);
  const [profileData, setProfileData] = useState<any>(null);

  // Debug toasts — stacked list so multiple can show without overlapping
  const [debugToasts, setDebugToasts] = useState<{ id: number; message: string }[]>([]);
  const showDebugToast = (message: string) => {
    const id = Date.now();
    setDebugToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setDebugToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // UI states
  const [showModal, setShowModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHubspotConnected, setIsHubspotConnected] = useState(false);
  // const [isSynced, setIsSynced] = useState(false);
  const [syncedData, setSyncedData] = useState<SyncedData | null>(null);

  // Check sync status when URL changes or auth state changes
  useEffect(() => {
    if (isLoggedIn && isHubspotConnected) {
      checkSyncStatus();
    }
  }, [isLoggedIn, isHubspotConnected]);

  // Check authentication status on mount and storage changes
  useEffect(() => {
    checkAuthStatus();

    const handleStorageChange = (changes: any) => {
      if (changes.user) {
        checkAuthStatus();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Verify user authentication and HubSpot connection
  const checkAuthStatus = async () => {
    setChecking(true);
    try {
      const result = await chrome.storage.local.get(["user"]);
      const user = result.user as User | undefined;
      if (user?.token) {
        setIsLoggedIn(true);
        const status = await hubspotApi.checkStatus();
        setIsHubspotConnected(status.data.connected);
      } else {
        setIsLoggedIn(false);
        setIsHubspotConnected(false);
        setCheckingSync(false);
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      setIsLoggedIn(false);
      setIsHubspotConnected(false);
      setCheckingSync(false);
    } finally {
      setChecking(false);
    }
  };

  // Open extension popup for login
  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: "openPopup" });
  };

  // Initiate HubSpot OAuth connection
  const handleConnectHubspot = async () => {
    try {
      const response = await hubspotApi.getConnectUrl();
      window.open(response.data.authUrl, "_blank", "width=600,height=700");

      const intervalRef = { current: 0 };
      const timeoutRef = { current: 0 };

      intervalRef.current = setInterval(async () => {
        try {
          const status = await hubspotApi.checkStatus();
          if (status.data.connected) {
            setIsHubspotConnected(true);
            clearInterval(intervalRef.current);
            clearTimeout(timeoutRef.current);
          }
        } catch (err) {
          console.error("Status check failed:", err);
        }
      }, 2000);

      timeoutRef.current = setTimeout(() => {
        clearInterval(intervalRef.current);
      }, 60000);

      // Cleanup on unmount
      return () => {
        clearInterval(intervalRef.current);
        clearTimeout(timeoutRef.current);
      };
    } catch (err) {
      console.error("HubSpot connection failed:", err);
      alert("Failed to connect HubSpot");
    }
  };

  // Check if profile is already synced to HubSpot
  const checkSyncStatus = async () => {
    const profileId = getProfileIdFromUrl();
    if (!profileId) return;

    setCheckingSync(true);
    try {
      const response = await linkedinApi.checkSyncStatus(profileId);
      if (response.data.synced && response.data.exists) {
        setSyncedData({
          contactName: response.data.name || "",
          companyName: response.data.company || "",
          email: response.data.email || "",
          ownerName: response.data.owner || "",
          lifecycle: response.data.lifecycleStage || "",
          phone: response.data.phone || "",
          hubspotContactId: response.data.contactId,
          leadStatus: response.data.leadStatus || "",
          leadSource: response.data.leadSource || "",
          connectedOnSource: response.data.connectedOnSource || "",
        });
      } else {
        setSyncedData(null);
      }
    } catch (err) {
      console.error("Sync check failed:", err);
      setSyncedData(null);
    } finally {
      setCheckingSync(false);
    }
  };

  // Format date range for experience display
  const formatDateRange = (start: any, end: any) => {
    const startYear = start?.year || "";
    const endYear = end?.year || "Present";
    return `${startYear} - ${endYear}`;
  };

  // Fetch LinkedIn profile and handle current companies
  const handleFetchProfile = async () => {
    const profileId = getProfileIdFromUrl();
    if (!profileId) {
      console.error("No profile ID found");
      return;
    }

    setLoading(true);
    try {
      // ── 1. Try intercepted profile data ──────────────────────────────────
      let result: any;
      const intercepted = getInterceptedProfile(profileId);

      if (intercepted) {
        console.log("[HubLead] Using intercepted profile data (no Voyager call needed)");
        result = parseProfileData({ elements: [intercepted.raw] });
        if (!result?.basicInfo?.firstName) {
          console.log("[HubLead] Intercepted profile data incomplete — falling back to direct Voyager call");
          showDebugToast("⚠️ Profile: interceptor cache hit but data incomplete → fallback to API");
          result = await fetchLinkedInProfile(profileId);
        } else {
          showDebugToast("✅ Profile: loaded from interceptor cache (no API call)");
        }
      } else {
        console.log("[HubLead] No intercepted data — falling back to direct Voyager call");
        showDebugToast("🌐 Profile: no interceptor cache → direct Voyager API call");
        result = await fetchLinkedInProfile(profileId);
      }

      setProfileData(result);

      // Filter for current positions (no end date)
      const current = result.experience.filter(
        (exp: Experience) => !exp.endDate,
      );

      if (current.length === 0) {
        alert("No current companies found");
      } else if (current.length === 1) {
        await fetchCompanyData(current[0], result);
      } else {
        // Multiple current companies - show selection modal
        setCurrentCompanies(current);
        setShowModal(true);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      alert("Failed to fetch profile data");
    } finally {
      setLoading(false);
    }
  };

  // Fetch company data and save to HubSpot
  const fetchCompanyData = async (experience: Experience, profile: any) => {
    if (!experience.companyUrl) {
      alert("Company URL not available");
      return;
    }

    setFetchingCompany(true);
    try {
      const companyId = extractCompanyIdFromUrl(experience.companyUrl);
      if (!companyId) {
        throw new Error("Could not extract company ID");
      }

      // ── Try intercepted company data ──────────────────────────────────────
      let companyData: any;
      const interceptedCompany = getInterceptedCompany(companyId);

      if (interceptedCompany) {
        console.log("[HubLead] Using intercepted company data for:", companyId);
        try {
          companyData = parseCompanyData(interceptedCompany.raw);
          showDebugToast(`✅ Company (${companyId}): loaded from interceptor cache (no API call)`);
        } catch {
          console.log("[HubLead] Intercepted company data parse failed — falling back to Voyager call");
          showDebugToast(`⚠️ Company (${companyId}): interceptor cache hit but parse failed → fallback to API`);
          companyData = await fetchLinkedInCompany(companyId);
        }
      } else {
        console.log("[HubLead] No intercepted company data — falling back to Voyager call");
        showDebugToast(`🌐 Company (${companyId}): no interceptor cache → direct Voyager API call`);
        companyData = await fetchLinkedInCompany(companyId);
      }

      // Contact info: always direct API (not reliably interceptable)
      const contactInfo = await fetchLinkedInContactInfo(profile.basicInfo.publicIdentifier);

      // Build payload for backend
      const finalPayload = {
        contact: {
          name: `${profile.basicInfo.firstName} ${profile.basicInfo.lastName}`,
          profileUrl: window.location.href,
          publicProfileUrl: `https://linkedin.com/in/${profile.basicInfo.publicIdentifier}`,
          headline: profile.basicInfo.headline || "",
          selectedRole: experience.title || "",
          selectedCompany: experience.company || "",
          email: contactInfo.email,
          phone: contactInfo.phone,
          website: contactInfo.websites?.[0] || "",
          birthDay: contactInfo.birthDate,
          locationCity: profile.basicInfo.location?.split(",")[0]?.trim() || "",
          locationState:
            profile.basicInfo.location?.split(",")[1]?.trim() || "",
          locationCountry:
            profile.basicInfo.location?.split(",")[2]?.trim() || "",
          hubspotLeadStatus: "New",
          hubspotConnectedOnSource: "LinkedIn",
          hubspotLeadSource: "Outbound",
          experiences: profile.experience.map((exp: any) => ({
            role: exp.title || "",
            companyLine: exp.company || "",
            dates: formatDateRange(exp.startDate, exp.endDate),
            location: exp.location || "",
          })),
        },
        company: {
          name: companyData.basicInfo.name || "",
          companyUrl: experience.companyUrl || "",
          linkedinCompanyId: companyId || "",
          website: companyData.basicInfo.website || "",
          locationCity: companyData.basicInfo.headquarters?.city || "",
          locationState:
            companyData.basicInfo.headquarters?.geographicArea || "",
          locationCountry: companyData.basicInfo.headquarters?.country || "",
          employeeCount: companyData.basicInfo.companySize?.start || 0,
          industry: companyData.basicInfo.industry || "",
        },
      };

      const response = await linkedinApi.saveContactAndCompany(finalPayload);

      setSyncedData({
        contactName: finalPayload.contact.name,
        companyName: finalPayload.company.name,
        email: finalPayload.contact.email,
        phone: finalPayload.contact.phone,
        hubspotOwnerId: response.data.hubspotOwnerId,
        hubspotContactId: response.data.contactId,
      });
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to save data");
    } finally {
      setFetchingCompany(false);
      setShowModal(false);
    }
  };

  // Handle company selection from modal
  const handleCompanySelect = (experience: Experience) => {
    fetchCompanyData(experience, profileData);
  };

  // Loading state UI
  if (checking || checkingSync) {
    return (
      <section
        style={{
          background: colors.bg,
          borderRadius: "8px",
          padding: "20px 24px",
          border: `1px solid ${colors.border}`,
          marginTop: "8px",
        }}
      >
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: "14px" }}>
          Loading...
        </p>
      </section>
    );
  }

  // Login required UI
  if (!isLoggedIn) {
    return (
      <section
        style={{
          background: colors.bg,
          borderRadius: "8px",
          padding: "20px 24px",
          border: `1px solid ${colors.border}`,
          marginTop: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: colors.text,
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            Please login to use LinkedIn Scraper
          </h3>
          <button
            onClick={handleLogin}
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "16px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Login
          </button>
        </div>
      </section>
    );
  }

  // HubSpot connection required UI
  if (!isHubspotConnected) {
    return (
      <section
        style={{
          background: colors.bg,
          borderRadius: "8px",
          padding: "20px 24px",
          border: `1px solid ${colors.border}`,
          marginTop: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: colors.text,
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            Connect HubSpot to save contacts
          </h3>
          <button
            onClick={handleConnectHubspot}
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "16px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Connect HubSpot
          </button>
        </div>
      </section>
    );
  }

  if (syncedData) {
    const username = getProfileIdFromUrl() || "";
    return <SyncedProfileView {...syncedData} username={username} />;
  }

  // Main UI - Fetch profile button with sync status
  return (
    <>
      <section
        style={{
          background: colors.bg,
          borderRadius: "8px",
          padding: "20px 24px",
          border: `1px solid ${colors.border}`,
          marginTop: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: colors.text,
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            LinkedIn Scraper
          </h3>
          <button
            onClick={handleFetchProfile}
            disabled={loading || fetchingCompany}
            style={{
              padding: "10px 20px",
              background:
                loading || fetchingCompany
                  ? "#cbd5e0"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "16px",
              cursor: loading || fetchingCompany ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.2s",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              if (!loading && !fetchingCompany) {
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
            {loading
              ? "Fetching..."
              : fetchingCompany
                ? "Loading Company..."
                : "Fetch Profile"}
          </button>
        </div>
      </section>

      {/* Company selection modal for multiple current positions */}
      {showModal && (
        <CompanySelectionModal
          companies={currentCompanies}
          onSelect={handleCompanySelect}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Debug toasts — stacked, bottom-right, oldest at bottom */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 2147483647,
          display: "flex",
          flexDirection: "column-reverse",
          gap: "8px",
          pointerEvents: "none",
        }}
      >
        {debugToasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "#1e40af",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: "10px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              fontSize: "12px",
              fontWeight: 600,
              maxWidth: "340px",
              lineHeight: "1.4",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            [HubLead debug] {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
