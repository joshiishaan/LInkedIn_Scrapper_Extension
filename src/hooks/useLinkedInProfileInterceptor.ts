import { useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type InterceptedProfile = {
  raw: any;
  capturedAt: number;
  profileId: string;
};

type InterceptedCompany = {
  raw: any;
  capturedAt: number;
  universalName: string;
};

// ─── Module-level in-memory cache ─────────────────────────────────────────────

const profileCache = new Map<string, InterceptedProfile>();
const companyCache = new Map<string, InterceptedCompany>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Exported access helpers ──────────────────────────────────────────────────

export function getInterceptedProfile(profileId: string): InterceptedProfile | null {
  const key = profileId.toLowerCase();
  const entry = profileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.capturedAt > CACHE_TTL_MS) {
    profileCache.delete(key);
    return null;
  }
  return entry;
}

export function getInterceptedCompany(universalName: string): InterceptedCompany | null {
  const key = universalName.toLowerCase();
  const entry = companyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.capturedAt > CACHE_TTL_MS) {
    companyCache.delete(key);
    return null;
  }
  return entry;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLinkedInProfileInterceptor() {
  const handleNetworkCall = useCallback((event: Event) => {
    const e = event as CustomEvent;
    const detail = e.detail;
    if (!detail || detail.statusCode >= 400) return;

    if (detail.type === "HL_INTERNAL_LINKEDIN_PROFILE") {
      try {
        const u = new URL(detail.callUrl);
        const memberIdentity = u.searchParams.get("memberIdentity");
        const ids = u.searchParams.get("ids");
        const profileId = memberIdentity || ids;
        if (!profileId) return;

        const elements = detail.responseBody?.elements;
        const raw = Array.isArray(elements) ? elements[0] : null;
        if (!raw) return;

        profileCache.set(profileId.toLowerCase(), {
          raw,
          capturedAt: Date.now(),
          profileId,
        });
        console.log("[HubLead] Intercepted profile data for:", profileId);
      } catch (err) {
        console.warn("[HubLead] Failed to cache intercepted profile:", err);
      }
    }

    if (detail.type === "HL_INTERNAL_LINKEDIN_COMPANY") {
      try {
        const u = new URL(detail.callUrl);
        const universalName = u.searchParams.get("universalName");
        if (!universalName) return;

        const raw = detail.responseBody;
        if (!raw) return;

        companyCache.set(universalName.toLowerCase(), {
          raw,
          capturedAt: Date.now(),
          universalName,
        });
        console.log("[HubLead] Intercepted company data for:", universalName);
      } catch (err) {
        console.warn("[HubLead] Failed to cache intercepted company:", err);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("HL_NETWORK_CALL", handleNetworkCall as EventListener);
    return () => window.removeEventListener("HL_NETWORK_CALL", handleNetworkCall as EventListener);
  }, [handleNetworkCall]);
}
