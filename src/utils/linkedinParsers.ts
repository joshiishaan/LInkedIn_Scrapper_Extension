// Pure data-transformation functions — no fetch, no DOM, no side effects.

export function parseProfileData(response: any) {
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

export function parseCompanyData(response: any) {
  const companyUrn = response.data?.["*elements"]?.[0];
  const company = response.included?.find(
    (item: any) =>
      item.entityUrn === companyUrn &&
      item.$type === "com.linkedin.voyager.organization.Company",
  );

  if (!company) {
    throw new Error("No company data found");
  }

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
