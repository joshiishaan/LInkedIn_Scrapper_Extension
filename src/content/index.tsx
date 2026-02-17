import { createRoot } from "react-dom/client";
import App from "../components/App";
import {
  fetchLinkedInProfile,
  fetchLinkedInCompany,
  getProfileIdFromUrl,
  getCompanyIdFromUrl,
} from "../utils/linkedinApi";

// Create UI container
const rootDiv = document.createElement("div");
rootDiv.id = "linkedin-extension-root";
document.body.appendChild(rootDiv);

const root = createRoot(rootDiv);
root.render(<App />);

// Fetch data when on profile page
if (window.location.href.includes("/in/")) {
  const profileId = getProfileIdFromUrl();
  if (profileId) {
    fetchLinkedInProfile(profileId)
      .then((data) => {
        console.log("Profile data:", data);
        // Send to your backend or process locally
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }
}

// Fetch data when on company page
if (window.location.href.includes("/company/")) {
  const companyId = getCompanyIdFromUrl();
  if (companyId) {
    fetchLinkedInCompany(companyId)
      .then((data) => {
        console.log("Company data:", data);
        // Send to your backend or process locally
      })
      .catch((err) => console.error("Error fetching company:", err));
  }
}
