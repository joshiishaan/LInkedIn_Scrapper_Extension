/**
 * ProfileCard Component
 * Main UI component injected into LinkedIn profile pages
 * Handles authentication, HubSpot connection, and profile data fetching
 */

import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  fetchLinkedInProfile,
  fetchLinkedInCompany,
  parseProfileData,
  parseCompanyData,
  getProfileIdFromUrl,
  extractCompanyIdFromUrl,
  fetchLinkedInContactInfo,
} from "../../utils/linkedinApi";
import {
  getInterceptedProfile,
  getInterceptedCompany,
} from "../../hooks/useLinkedInProfileInterceptor";
import { linkedinApi, hubspotApi } from "../../services/api";
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

  // UI states
  const [showModal, setShowModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHubspotConnected, setIsHubspotConnected] = useState(false);
  // const [isSynced, setIsSynced] = useState(false);
  const [syncedData, setSyncedData] = useState<SyncedData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    chrome.runtime.sendMessage({ action: "openPopup" }).catch((err: unknown) => {
      console.error("[HubLead] sendMessage failed:", err);
    });
  };

  // Refs to hold polling handles so they can be cleared on unmount
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any active OAuth polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // Initiate HubSpot OAuth connection
  const handleConnectHubspot = async () => {
    try {
      const response = await hubspotApi.getConnectUrl();
      window.open(response.data.authUrl, "_blank", "width=600,height=700");

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await hubspotApi.checkStatus();
          if (status.data.connected) {
            setIsHubspotConnected(true);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          }
        } catch (err) {
          console.error("Status check failed:", err);
        }
      }, 2000);

      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      }, 60000);
    } catch (err) {
      console.error("HubSpot connection failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to connect HubSpot");
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
          result = await fetchLinkedInProfile(profileId);
        }
      } else {
        console.log("[HubLead] No intercepted data — falling back to direct Voyager call");
        result = await fetchLinkedInProfile(profileId);
      }

      setProfileData(result);

      // LinkedIn sometimes returns endDate as an empty object {} or { year: null, month: null }
      // for current positions instead of null. Treat those as "no end date".
      const isCurrentPosition = (exp: Experience): boolean => {
        if (!exp.endDate) return true;
        if (typeof exp.endDate === "object" && exp.endDate !== null) {
          const d = exp.endDate as any;
          return !d.year && !d.month;
        }
        return false;
      };

      // ALL current positions, regardless of whether they have a linkable
      // LinkedIn company page — a position without one (private/unlisted
      // company, or just a plain-text employer with no LinkedIn presence)
      // still needs to be a selectable option, not silently dropped before
      // the user even sees it. fetchCompanyData handles the no-companyUrl
      // case: syncs the company by NAME ONLY (that's all we have for it),
      // instead of throwing or skipping the company entirely.
      const current = result.experience.filter(isCurrentPosition);

      if (current.length === 1) {
        await fetchCompanyData(current[0], result);
      } else if (current.length > 1) {
        // Multiple current positions — show selection modal (some may have
        // no LinkedIn company page; CompanySelectionModal doesn't need one
        // to render an option, it only shows title/company name/dates).
        setCurrentCompanies(current);
        setShowModal(true);
      } else {
        // No current position at all — sync the contact on its own rather
        // than blocking the fetch entirely.
        await fetchCompanyData(null, result);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to fetch profile data");
    } finally {
      setLoading(false);
    }
  };

  // Fetch company data (if any current position was resolved) and save the
  // contact — and company, when there is one — to HubSpot. `experience` is
  // null when the profile has no current position with a linkable LinkedIn
  // company page; the contact is still synced on its own in that case.
  const fetchCompanyData = async (experience: Experience | null, profile: any) => {
    setFetchingCompany(true);
    try {
      let companyId: string | null = null;
      let companyData: any = null;

      if (experience?.companyUrl) {
        companyId = extractCompanyIdFromUrl(experience.companyUrl);

        // A companyUrl that doesn't resolve to a LinkedIn company id (rare,
        // but possible) falls through to the name-only company below —
        // same handling as no companyUrl at all, rather than failing the
        // whole sync over one field we can't resolve.
        if (companyId) {
          // ── Try intercepted company data ────────────────────────────────────
          const interceptedCompany = getInterceptedCompany(companyId);

          if (interceptedCompany) {
            console.log("[HubLead] Using intercepted company data for:", companyId);
            try {
              companyData = parseCompanyData(interceptedCompany.raw);
            } catch {
              console.log("[HubLead] Intercepted company data parse failed — falling back to Voyager call");
              companyData = await fetchLinkedInCompany(companyId);
            }
          } else {
            console.log("[HubLead] No intercepted company data — falling back to Voyager call");
            companyData = await fetchLinkedInCompany(companyId);
          }
        }
      }

      // Contact info: always direct API (not reliably interceptable).
      // Fetched for the *viewed* profile, so these websites belong to the lead.
      const contactInfo = await fetchLinkedInContactInfo(profile.basicInfo.publicIdentifier);

      // Build payload for backend
      const finalPayload = {
        contact: {
          name: `${profile.basicInfo.firstName} ${profile.basicInfo.lastName}`,
          profileUrl: window.location.href,
          publicProfileUrl: `https://linkedin.com/in/${profile.basicInfo.publicIdentifier}`,
          headline: profile.basicInfo.headline || "",
          selectedRole: experience?.title || "",
          selectedCompany: experience?.company || "",
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
        company: companyData
          ? {
              name: companyData.basicInfo.name || "",
              companyUrl: experience?.companyUrl || "",
              linkedinCompanyId: companyId || "",
              website: companyData.basicInfo.website || "",
              locationCity: companyData.basicInfo.headquarters?.city || "",
              locationState:
                companyData.basicInfo.headquarters?.geographicArea || "",
              locationCountry: companyData.basicInfo.headquarters?.country || "",
              employeeCount: companyData.basicInfo.companySize?.start || 0,
              industry: companyData.basicInfo.industry || "",
            }
          : experience?.company
            ? {
                // This position's company has no linkable LinkedIn company
                // page — all we know about it is the plain-text name
                // LinkedIn itself shows on the profile. Sync that name
                // alone rather than dropping the company entirely; every
                // other field is genuinely unknown, not just unfetched.
                name: experience.company,
                companyUrl: "",
                linkedinCompanyId: "",
                website: "",
                locationCity: "",
                locationState: "",
                locationCountry: "",
                employeeCount: 0,
                industry: "",
              }
            : {
                name: "",
                companyUrl: "",
                linkedinCompanyId: "",
                website: "",
                locationCity: "",
                locationState: "",
                locationCountry: "",
                employeeCount: 0,
                industry: "",
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
      setErrorMessage(err instanceof Error ? err.message : "Failed to save data");
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
        {errorMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 14px",
              background: "#fff5f5",
              border: "1px solid #feb2b2",
              borderRadius: "6px",
              color: "#e53e3e",
              fontSize: "13px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#e53e3e",
                fontSize: "16px",
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
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
    </>
  );
}
