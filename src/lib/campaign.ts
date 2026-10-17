export type Campaign = {
  startsAt: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
};
export type CampaignState =
  { kind: "unannounced" | "elapsed" } | { kind: "upcoming"; remaining: number };

/** A timer is informational only: expiry never enables official registration. */
export function getCampaignState(
  campaign: Campaign,
  now: number,
): CampaignState {
  if (!campaign.startsAt || !campaign.sourceUrl || !campaign.verifiedAt)
    return { kind: "unannounced" };
  try {
    const source = new URL(campaign.sourceUrl);
    const date = Date.parse(campaign.startsAt);
    const verified = Date.parse(campaign.verifiedAt);
    if (
      source.protocol !== "https:" ||
      Boolean(source.username || source.password || source.port) ||
      !["travel.state.gov", "dvprogram.state.gov"].includes(source.hostname) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        campaign.startsAt,
      ) ||
      !Number.isFinite(date) ||
      !Number.isFinite(verified) ||
      verified > now
    )
      return { kind: "unannounced" };
    return date > now
      ? { kind: "upcoming", remaining: date - now }
      : { kind: "elapsed" };
  } catch {
    return { kind: "unannounced" };
  }
}
