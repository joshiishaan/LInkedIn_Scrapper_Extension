// Get CSRF token (CORRECT way)
function getCsrfToken(): string {
  const match = document.cookie.match(/JSESSIONID="([^"]+)"/);
  return match ? match[1] : "";
}

function parseProfileData(response: any) {
  const profile = response.elements?.[0];

  if (!profile) {
    throw new Error("No profile data found");
  }

  return {
    basicInfo: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      headline: profile.headline,
      summary: profile.summary,
      publicIdentifier: profile.publicIdentifier,
      location: profile.geoLocation?.geo?.defaultLocalizedName,
      industry: profile.industry?.name,
      profilePicture:
        profile.profilePicture?.displayImageReference?.vectorImage?.rootUrl +
        profile.profilePicture?.displayImageReference?.vectorImage
          ?.artifacts?.[2]?.fileIdentifyingUrlPathSegment,
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

  return {
    basicInfo: {
      name: company.name,
      tagline: company.tagline,
      description: company.description,
      website: company.companyPageUrl,
      industry: company["*companyIndustries"]?.[0],
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

  const data = await response.json();
  return parseCompanyData(data);
}

// Extract profile ID from URL
export function getProfileIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : null;
}

// Extract company ID from URL
export function getCompanyIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/linkedin\.com\/company\/([^\/\?]+)/);
  return match ? match[1] : null;
}
