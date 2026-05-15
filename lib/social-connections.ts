export const REQUIRED_SOCIAL_PLATFORMS = ["instagram", "facebook"] as const;

export type SocialPlatform = (typeof REQUIRED_SOCIAL_PLATFORMS)[number];

export type SocialConnection = {
  platform: SocialPlatform;
  connected: boolean;
  account_label: string | null;
  connected_at: string | null;
  updated_at: string;
};

const PROVIDER_FOR_PLATFORM: Record<SocialPlatform, string> = {
  instagram: "instagram",
  facebook: "facebook",
};

export function normalizeConnections(rows: Array<{
  platform: string;
  connected: boolean;
  account_label?: string | null;
  connected_at?: string | null;
  updated_at?: string | null;
}>): SocialConnection[] {
  const byPlatform = new Map(rows.map((row) => [row.platform.toLowerCase(), row]));
  return REQUIRED_SOCIAL_PLATFORMS.map((platform) => {
    const row = byPlatform.get(platform);
    return {
      platform,
      connected: row?.connected ?? false,
      account_label: row?.account_label ?? null,
      connected_at: row?.connected_at ?? null,
      updated_at: row?.updated_at ?? new Date(0).toISOString(),
    };
  });
}

export function connectionsFromProviders(
  providers: string[],
  metadataByProvider?: Record<string, { connected_at?: string | null; updated_at?: string | null }>
): SocialConnection[] {
  const set = new Set(providers.map((provider) => provider.toLowerCase()));
  return REQUIRED_SOCIAL_PLATFORMS.map((platform) => {
    const provider = PROVIDER_FOR_PLATFORM[platform];
    const metadata = metadataByProvider?.[provider];
    return {
      platform,
      connected: set.has(provider),
      account_label: null,
      connected_at: metadata?.connected_at ?? null,
      updated_at: metadata?.updated_at ?? new Date(0).toISOString(),
    };
  });
}

export function missingPlatforms(connections: SocialConnection[]): SocialPlatform[] {
  return connections.filter((connection) => !connection.connected).map((connection) => connection.platform);
}
