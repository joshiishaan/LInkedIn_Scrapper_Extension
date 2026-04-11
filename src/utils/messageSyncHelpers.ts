import { fetchLinkedInProfile } from "./linkedinApi";

// --- Types ---

export type HlNetworkCallDetail = {
  type: string;
  pageUrl: string;
  callUrl: string;
  method?: string;
  requestBody?: any;
  responseBody?: any;
  statusCode: number;
  timestamp?: number;
  requestHeaders?: Record<string, string>;
};

export type Party = {
  urn: string | null;
  name: string;
  profileUrl: string | null;
  distance?: string | null;
};

export type HlNetworkCallEvent = CustomEvent<HlNetworkCallDetail>;

export type RawMessage = any;

// --- Pure helpers ---

export function extractMemberInfo(participant: any): {
  name: string;
  profileUrl: string | null;
} {
  const member = participant?.participantType?.member;
  if (!member) return { name: "Unknown", profileUrl: null };

  const first = member.firstName?.text ?? "";
  const last = member.lastName?.text ?? "";
  return {
    name: `${first} ${last}`.trim() || "Unknown",
    profileUrl: member.profileUrl ?? null,
  };
}

export function getProfileSegmentFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "https://www.linkedin.com");
    const match = u.pathname.match(/\/in\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    const match = `${url}`.match(/linkedin\.com\/in\/([^/?#]+)/);
    return match ? match[1] : null;
  }
}

export async function normalizePartyProfileUrl(
  party: Party | null,
): Promise<Party | null> {
  if (!party || !party.profileUrl) return party;

  const segment = getProfileSegmentFromUrl(party.profileUrl);
  if (!segment) return party;

  try {
    const profile = await fetchLinkedInProfile(segment);
    const vanity = profile.basicInfo.publicIdentifier;
    if (!vanity) return party;

    const fullName = [profile.basicInfo.firstName, profile.basicInfo.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ...party,
      profileUrl: `https://www.linkedin.com/in/${vanity}/`,
      name:
        party.name && party.name !== "Unknown"
          ? party.name
          : fullName || "Unknown",
    };
  } catch {
    return party;
  }
}

export function simplifyMessage(msg: RawMessage) {
  const { name: senderName, profileUrl: senderProfileUrl } = extractMemberInfo(
    msg.sender || msg.actor,
  );
  const conversationUrn =
    msg.conversation?.entityUrn ?? msg.backendConversationUrn ?? null;

  return {
    text: msg.body?.text ?? "",
    senderName,
    senderProfileUrl,
    conversationUrn,
    sentAt: msg.deliveredAt ? new Date(msg.deliveredAt).toISOString() : null,
  };
}

export function deriveConversationParties(messages: RawMessage[]): {
  sender: Party | null;
  recipient: Party | null;
} {
  if (!messages.length) return { sender: null, recipient: null };

  const selfMsg = messages.find(
    (m) => m.sender?.participantType?.member?.distance === "SELF",
  );
  const otherMsg = messages.find(
    (m) => m.sender?.participantType?.member?.distance !== "SELF",
  );

  const buildParty = (sender: any): Party | null => {
    if (!sender) return null;
    const member = sender.participantType?.member;
    const first = member?.firstName?.text ?? "";
    const last = member?.lastName?.text ?? "";
    return {
      urn: sender.hostIdentityUrn ?? null,
      name: `${first} ${last}`.trim() || "Unknown",
      profileUrl: member?.profileUrl ?? null,
      distance: member?.distance ?? null,
    };
  };

  return {
    sender: buildParty(selfMsg?.sender),
    recipient: buildParty(otherMsg?.sender),
  };
}

export async function fallbackIdentifyRecipientFromDom(): Promise<Party | null> {
  try {
    const headerLink =
      document.querySelector<HTMLAnchorElement>(
        'a[href*="/in/"]:not([data-control-name*="actor"])',
      ) ||
      document.querySelector<HTMLAnchorElement>(
        '[data-control-name="view_profile"], a.msg-thread__person-card__link',
      );

    let href = headerLink?.getAttribute("href") ?? null;
    if (!href) return null;

    if (href.startsWith("/")) href = `https://www.linkedin.com${href}`;

    return { urn: null, name: "Unknown", profileUrl: href, distance: null };
  } catch {
    return null;
  }
}

export function nonEmpty(
  value: string | null | undefined,
  fallback: string,
): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

export function parseProfileUrnAndThreadIdFromConversationKey(
  conversationKey: string,
): { profileUrnNumeric: string; threadId: string } | null {
  const [part1, part2] = conversationKey.split("|");
  if (!part1 || !part2) return null;

  const match = part1.match(/fsd_profile:(\d+)/);
  const profileUrnNumeric = match?.[1];
  const threadId = part2;

  if (!profileUrnNumeric || !threadId) return null;
  return { profileUrnNumeric, threadId };
}

export function parseConversationKeyFromUrl(callUrl: string): string | null {
  try {
    const url = new URL(callUrl);
    const rawVariables = url.searchParams.get("variables") || "";
    const variables = rawVariables.split(",count:")[0];

    const split = variables.split(",2-");
    if (split.length < 2) return null;

    const part1 = split[0];
    const part2 = split[1].replace(/[()]/g, "");
    return `${part1}|${part2}`;
  } catch {
    return null;
  }
}

export function extractLoadedMessages(detail: HlNetworkCallDetail): any[] {
  const elements =
    detail.responseBody?.data?.messengerMessagesBySyncToken?.elements ?? [];
  return (elements as any[]).filter((el) => !!el);
}
