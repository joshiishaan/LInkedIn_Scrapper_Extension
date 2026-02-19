import { useState } from "react";
import {
  fetchLinkedInProfile,
  fetchLinkedInCompany,
  getProfileIdFromUrl,
  getCompanyIdFromUrl,
} from "../utils/linkedinApi";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const handleFetchProfile = async () => {
    const profileId = getProfileIdFromUrl();
    if (!profileId) {
      alert("Not on a profile page");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchLinkedInProfile(profileId);
      setData(result);
      // console.log("Profile data:", result);
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchCompany = async () => {
    const companyId = getCompanyIdFromUrl();
    if (!companyId) {
      alert("Not on a company page");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchLinkedInCompany(companyId);
      setData(result);
      // console.log("Company data:", result);
    } catch (err) {
      console.error("Error:", err);
      alert("Failed to fetch company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        background: "white",
        padding: "20px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      }}
    >
      <h3>LinkedIn Extension</h3>
      <button onClick={handleFetchProfile} disabled={loading}>
        {loading ? "Fetching..." : "Fetch Profile"}
      </button>
      <button
        onClick={handleFetchCompany}
        disabled={loading}
        style={{ marginLeft: "10px" }}
      >
        {loading ? "Fetching..." : "Fetch Company"}
      </button>
      {data && <p>✓ Data fetched</p>}
    </div>
  );
}
