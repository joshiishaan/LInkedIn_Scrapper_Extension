/**
 * LinkedIn API Utilities
 * Handles fetching profile and company data from LinkedIn's internal API
 */

// Extract CSRF token from cookies for authenticated requests
function getCsrfToken(): string {
  const match = document.cookie.match(/JSESSIONID="([^"]+)"/);
  return match ? match[1] : "";
}

// Parse LinkedIn profile API response into structured data
function parseProfileData(response: any) {
  const profile = response.elements?.[0];

  if (!profile) {
    throw new Error("No profile data found");
  }
  const vectorImage =
    profile.profilePicture?.displayImageReference?.vectorImage;
  const artifacts = vectorImage?.artifacts;
  const artifact = artifacts?.[2] || artifacts?.[0];

  const profilePicture =
    vectorImage?.rootUrl && artifact?.fileIdentifyingUrlPathSegment
      ? vectorImage.rootUrl + artifact.fileIdentifyingUrlPathSegment
      : null;

  return {
    basicInfo: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      headline: profile.headline,
      summary: profile.summary,
      publicIdentifier: profile.publicIdentifier,
      location: profile.geoLocation?.geo?.defaultLocalizedName,
      industry: profile.industry?.name,
      profilePicture,
    },

    experience:
      profile.profilePositionGroups?.elements?.flatMap((group: any) =>
        group.profilePositionInPositionGroup?.elements?.map((pos: any) => ({
          title: pos.title,
          company: pos.companyName,
          companyUrl: pos.company?.url,
          location: pos.locationName,
          startDate: pos.dateRange?.start,
          endDate: pos.dateRange?.end,
          employmentType: pos.employmentType?.name,
        })),
      ) || [],

    education:
      profile.profileEducations?.elements?.map((edu: any) => ({
        school: edu.schoolName,
        degree: edu.degreeName,
        fieldOfStudy: edu.fieldOfStudy,
        startDate: edu.dateRange?.start,
        endDate: edu.dateRange?.end,
        description: edu.description,
      })) || [],

    skills:
      profile.profileSkills?.elements?.map((skill: any) => skill.name) || [],

    certifications:
      profile.profileCertifications?.elements?.map((cert: any) => ({
        name: cert.name,
        authority: cert.authority,
        date: cert.dateRange?.start,
      })) || [],

    languages:
      profile.profileLanguages?.elements?.map((lang: any) => ({
        name: lang.name,
        proficiency: lang.proficiency,
      })) || [],
  };
}

// Parse LinkedIn company API response into structured data
function parseCompanyData(response: any) {
  const companyUrn = response.data?.["*elements"]?.[0];
  const company = response.included?.find(
    (item: any) =>
      item.entityUrn === companyUrn &&
      item.$type === "com.linkedin.voyager.organization.Company",
  );

  if (!company) {
    throw new Error("No company data found");
  }

  // Resolve industry URN
  const industryUrn = company["*companyIndustries"]?.[0];
  const industryObj = response.included?.find(
    (item: any) => item.entityUrn === industryUrn,
  );

  return {
    basicInfo: {
      name: company.name,
      tagline: company.tagline,
      description: company.description,
      website: company.companyPageUrl,
      industry: industryObj?.localizedName || null,
      companySize: company.staffCountRange,
      headquarters: company.headquarter,
      foundedYear: company.foundedOn?.year,
      companyType: company.companyType?.localizedName,
      phone: company.phone?.number,
      specialties: company.specialities || [],
      logo:
        company.logo?.image?.rootUrl +
        company.logo?.image?.artifacts?.[2]?.fileIdentifyingUrlPathSegment,
    },
    locations:
      company.confirmedLocations?.map((loc: any) => ({
        city: loc.city,
        country: loc.country,
        address: `${loc.line1}${loc.line2 ? ", " + loc.line2 : ""}`,
        postalCode: loc.postalCode,
        isHeadquarter: loc.headquarter,
      })) || [],
    followerCount: response.included?.find(
      (item: any) => item.entityUrn === `urn:li:fs_followingInfo:${companyUrn}`,
    )?.followerCount,
  };
}

// Fetch LinkedIn profile data using internal API
export async function fetchLinkedInProfile(profileId: string) {
  const response = await fetch(
    `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileId}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-109`,
    {
      headers: {
        "csrf-token": getCsrfToken(),
        "x-restli-protocol-version": "2.0.0",
      },
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return parseProfileData(data);
}

// Fetch LinkedIn profile contact info using GraphQL API
export async function fetchLinkedInContactInfo(profileId: string) {
  const csrf =
    (document.cookie.match(/JSESSIONID="([^"]+)"/) ||
      document.cookie.match(/JSESSIONID=([^;]+)/))?.[1] || "";

  const response = await fetch(
    `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:${profileId})&queryId=voyagerIdentityDashProfiles.c7452e58fa37646d09dae4920fc5b4b9`,
    {
      credentials: "include",
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrf,
        "x-restli-protocol-version": "2.0.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const profile = data.included?.find(
    (e: any) =>
      e.$type === "com.linkedin.voyager.dash.identity.profile.Profile",
  );

  return {
    email: profile?.emailAddress?.emailAddress || "",
    phone: profile?.phoneNumbers?.[0]?.phoneNumber?.number || "",
    websites: profile?.websites?.map((e: any) => e.url) || [],
    birthDate: profile?.birthDateOn || null,
  };
}

// Fetch LinkedIn company data using internal API
export async function fetchLinkedInCompany(companyId: string) {
  const response = await fetch(
    `https://www.linkedin.com/voyager/api/organization/companies?decorationId=com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12&q=universalName&universalName=${companyId}`,
    {
      method: "GET",
      headers: {
        "csrf-token": getCsrfToken(),
        "x-restli-protocol-version": "2.0.0",
        accept: "application/vnd.linkedin.normalized+json+2.1",
      },
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return parseCompanyData(data);
}

// Extract profile ID from current LinkedIn URL
export function getProfileIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : null;
}

// Extract company ID from current LinkedIn URL
export function getCompanyIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/linkedin\.com\/company\/([^\/\?]+)/);
  return match ? match[1] : null;
}

// Extract company ID from any LinkedIn company URL
export function extractCompanyIdFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/company\/([^\/\?]+)/);
  return match ? match[1] : null;
}
