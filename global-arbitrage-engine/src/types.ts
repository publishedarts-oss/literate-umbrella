export type Sector =
  | "RealEstate"
  | "Airlines"
  | "Perishables"
  | "Experiences"
  | "Collectibles"
  | "Crypto"
  | "Hotels"
  | string;

export type AbGroup = "control_40pct" | "aggressive_55pct";

export type HoldBalances = {
  FLIP: number;
  WFC: number;
  QC: number;
};

export type InventoryItem = {
  id: string;
  sector: Sector;
  title: string;
  wholesalePrice: number;
  meta: {
    retailEstimate?: number;
    [key: string]: unknown;
  };
  expiresAt?: string | null;
};

export type ExternalFeedItem = {
  uuid?: string;
  displayTitle: string;
  costBasis: number;
  attributes?: Record<string, unknown>;
  deadline?: string | null;
};

export type Bundle = {
  id: string;
  slug: string;
  title: string;
  retailValue: number;
  bundlePrice: number;
  abGroup: AbGroup;
  tierApplied: string;
  components: string[];
  matchScore: number;
  matchReason: string;
  fees: FeeBreakdown;
  shareUrl: string;
  delightCopy: string;
  badges: AchievementBadge[];
};

export type FeeBreakdown = {
  subtotal: number;
  txFeeRate: number;
  txFeeAmount: number;
  aumAnnualRate: number;
  aumDailyProRata: number;
  totalDueToday: number;
  labels: {
    tx: string;
    aum: string;
  };
};

export type AchievementBadge = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  unlockedAt: string;
};

export type LoyaltyProfile = {
  sessionId: string;
  userId?: string;
  visitStreak: number;
  lastVisitDay: string;
  sharesCount: number;
  purchasesCount: number;
  badges: AchievementBadge[];
  holdBalances: HoldBalances;
};

export type TreasuryAsset = "BTC" | "USDC" | "OPS_STABLE";

export type TreasuryPosition = {
  asset: TreasuryAsset;
  amountUsd: number;
  share: number;
};

export type TreasurySnapshot = {
  totalUsd: number;
  positions: TreasuryPosition[];
  suggestions: string[];
  healthy: boolean;
};

export type FeeLedgerEntry = {
  id: string;
  kind: "tx" | "aum";
  amountUsd: number;
  bundleId?: string;
  sessionId?: string;
  note: string;
  createdAt: string;
};

export type FeedSource =
  | "empty-leg-broker"
  | "perishable-clearing"
  | "land-lot-auction"
  | "experience-drop";

export type SocialCard = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  twitterCard: "summary_large_image";
  shareText: string;
};

export type EmailReceipt = {
  subject: string;
  text: string;
  html: string;
};
