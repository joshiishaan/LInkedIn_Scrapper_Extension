// refactored: parseProfileData and parseCompanyData moved to linkedinParsers.ts.
// Re-exported here so all existing imports from this file continue to work unchanged.
export { parseProfileData, parseCompanyData } from "./linkedinParsers";

// --- CSRF helpers ---

// Handles both quoted and unquoted JSESSIONID
export function getCsrfTokenFromCookies(): string {
  const cookie = document.cookie || "";
  const quoted = cookie.match(/JSESSIONID="([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  const unquoted = cookie.match(/JSESSIONID=([^;]+)/);
  return unquoted?.[1] || "";
}

// Extract a LinkedIn member id ("ACoAA…") from arbitrary text. Shared so the
// connection tracker and the connections-sync module key targets identically —
// both must produce the same id as the stored `targetLinkedinId`.
export function extractMemberIdFrom(text: string): string | null {
  if (!text) return null;
  const urn = text.match(/urn:li:fs[d]?_(?:miniProfile|profile):([A-Za-z0-9_-]+)/);
  if (urn) return urn[1];
  const pid = text.match(/"profileId"\s*:\s*"([A-Za-z0-9_-]+)"/);
  return pid ? pid[1] : null;
}

// --- Logged-in LinkedIn identity (actor B) ---

export interface LinkedInIdentity {
  memberId: string; // stable "ACoAA…" member id (from the miniProfile URN)
  name: string | null; // display name
  publicIdentifier: string | null; // vanity slug (…/in/<publicIdentifier>)
}

// The account logged into the browser doesn't change within a page session, so
// cache it after the first successful lookup.
let cachedIdentity: LinkedInIdentity | null = null;

// Fetch the LinkedIn account currently logged into the browser via the Voyager
// `me` endpoint. Returns null on any failure (not logged in, network, shape
// change) — callers treat the actor as simply unknown in that case.
export async function fetchLoggedInLinkedInIdentity(): Promise<LinkedInIdentity | null> {
  if (cachedIdentity) return cachedIdentity;

  try {
    // Default accept returns the simple direct shape: { plainId, miniProfile }.
    const response = await fetch("https://www.linkedin.com/voyager/api/me", {
      credentials: "include",
      headers: {
        "csrf-token": getCsrfTokenFromCookies(),
        "x-restli-protocol-version": "2.0.0",
      },
    });
    if (!response.ok) return null;

    const data = await response.json();

    // Direct shape: data.miniProfile. Normalized shape (if a caller ever sets
    // the normalized accept header): the profile entity lives in data.included.
    const mini =
      data?.miniProfile ??
      (Array.isArray(data?.included)
        ? data.included.find(
            (e: any) =>
              /MiniProfile/i.test(e?.$type || "") || e?.publicIdentifier,
          )
        : null);
    if (!mini) return null;

    // Use the fsd_profile URN so the actor id matches the "ACoAA…" format we
    // store for targets. entityUrn (fs_miniProfile) carries the same id.
    const urn: string = mini.dashEntityUrn || mini.entityUrn || "";
    const memberId = urn.match(
      /urn:li:fs[d]?_(?:miniProfile|profile):([A-Za-z0-9_-]+)/,
    )?.[1];
    if (!memberId) return null;

    const name =
      [mini.firstName, mini.lastName].filter(Boolean).join(" ").trim() || null;

    cachedIdentity = {
      memberId,
      name,
      publicIdentifier: mini.publicIdentifier ?? null,
    };
    return cachedIdentity;
  } catch {
    return null;
  }
}

// --- URL helpers ---

export function getProfileIdFromUrl(): string | null {
  const match = window.location.href.match(/linkedin\.com\/in\/([^/?]+)/);
  return match ? match[1] : null;
}

export function getCompanyIdFromUrl(): string | null {
  const match = window.location.href.match(/linkedin\.com\/company\/([^/?]+)/);
  return match ? match[1] : null;
}

export function extractCompanyIdFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/company\/([^/?]+)/);
  return match ? match[1] : null;
}

// --- LinkedIn Voyager fetch helpers ---

export async function fetchLinkedInProfile(profileId: string) {
  const response = await fetch(
    `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileId}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-109`,
    {
      headers: {
        "csrf-token": getCsrfTokenFromCookies(),
        "x-restli-protocol-version": "2.0.0",
      },
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const { parseProfileData } = await import("./linkedinParsers");
  return parseProfileData(await response.json());
}

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

export async function fetchLinkedInCompany(companyId: string) {
  const response = await fetch(
    `https://www.linkedin.com/voyager/api/organization/companies?decorationId=com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12&q=universalName&universalName=${companyId}`,
    {
      headers: {
        "csrf-token": getCsrfTokenFromCookies(),
        "x-restli-protocol-version": "2.0.0",
        accept: "application/vnd.linkedin.normalized+json+2.1",
      },
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const { parseCompanyData } = await import("./linkedinParsers");
  return parseCompanyData(await response.json());
}

// --- Active Voyager messaging fetch ---

export type MessengerMessage = any;

const MESSENGER_QUERY_IDS = [
  "messengerMessages.5846eeb71c981f11e0134cb6626cc314",
  "messengerMessages.8d15783c080e392b337ba57fc576ad21",
  "messengerMessages.da3e025fbcdc19337264a6881f13c22a",
];

async function fetchVoyagerMessaging(
  url: string,
  accept: string = "application/graphql",
  extraHeaders?: Record<string, string> | null,
): Promise<any> {
  const csrf = getCsrfTokenFromCookies();
  if (!csrf) {
    throw new Error(
      "Missing CSRF token (JSESSIONID); user must be logged in to LinkedIn.",
    );
  }

  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "include",
    headers: {
      ...(extraHeaders || {}),
      accept,
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "csrf-token": csrf,
      pragma: "no-cache",
      "x-li-lang": extraHeaders?.["x-li-lang"] || "en_US",
      "x-restli-protocol-version": "2.0.0",
    },
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error(`${url} too many requests`);
    const text = await response.text();
    throw new Error(
      `Voyager messaging request failed (${response.status}): ${text}`,
    );
  }

  return response.json();
}

export async function fetchMessengerConversationMessages(
  profileUrnNumeric: string,
  threadId: string,
): Promise<MessengerMessage[]> {
  console.log("[Scrapper Debug] fetchMessengerConversationMessages", {
    profileUrnNumeric,
    threadId,
  });

  const baseApi = "https://www.linkedin.com/voyager/api";
  const variables =
    `conversationUrn:urn` +
    encodeURIComponent(
      `:li:msg_conversation:(urn:li:fsd_profile:${profileUrnNumeric},2-${threadId})`,
    )
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");

  let lastError: unknown = null;

  for (const queryId of MESSENGER_QUERY_IDS) {
    const url = `${baseApi}/voyagerMessagingGraphQL/graphql?queryId=${encodeURIComponent(queryId)}&variables=(${variables})`;
    try {
      const data = await fetchVoyagerMessaging(url);
      const elements: MessengerMessage[] =
        data?.data?.messengerMessagesBySyncToken?.elements ?? [];
      if (elements.length > 0) return elements;
    } catch (err: any) {
      lastError = err;
      if (err instanceof Error && err.message.includes("403")) {
        console.warn(`[Scrapper Debug] 403 for queryId ${queryId}, trying next`);
        continue;
      }
      console.error(`[Scrapper Debug] Error with queryId ${queryId}:`, err);
      throw new Error(`Failed to fetch messages: ${err?.message || err}`);
    }
  }

  throw lastError ?? new Error("All messengerMessages queryIds failed.");
}

export async function fetchMessengerConversationMessagesWithVariables(
  variablesString: string,
  baseHeaders?: Record<string, string> | null,
): Promise<MessengerMessage[]> {
  console.log(
    "[Scrapper Debug] fetchMessengerConversationMessagesWithVariables",
    { variablesString, hasBaseHeaders: !!baseHeaders },
  );

  const baseApi = "https://www.linkedin.com/voyager/api";
  const encodedVariables = encodeURIComponent(variablesString.trim());

  let lastError: unknown = null;

  for (const queryId of MESSENGER_QUERY_IDS) {
    const url = `${baseApi}/voyagerMessagingGraphQL/graphql?queryId=${encodeURIComponent(queryId)}&variables=${encodedVariables}`;
    try {
      const data = await fetchVoyagerMessaging(url, "application/graphql", baseHeaders);
      const elements: MessengerMessage[] =
        data?.data?.messengerMessagesBySyncToken?.elements ?? [];
      if (elements.length > 0) return elements;
    } catch (err: any) {
      lastError = err;
      if (err instanceof Error && err.message.includes("403")) {
        console.warn(`[Scrapper Debug] 403 for queryId ${queryId}, trying next`);
        continue;
      }
      console.error(`[Scrapper Debug] Error with queryId ${queryId}:`, err);
      throw new Error(`Failed to fetch messages: ${err?.message || err}`);
    }
  }

  throw lastError ?? new Error("All messengerMessages queryIds failed.");
}
