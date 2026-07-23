/**
 * HyperBundle platform configuration
 * Transparent fees: 3.333% per transaction + 1.666% annual AUM
 * Treasury bias: BTC / USDC heavy for low-risk durability
 */

export const FEES = {
  /** Transaction fee applied at checkout (transparent) */
  TX_RATE: 0.03333, // 3.333%
  /** Annual assets-under-management fee */
  AUM_ANNUAL_RATE: 0.01666, // 1.666%
  /** Human-readable labels for UX copy */
  TX_LABEL: "3.333% platform fee",
  AUM_LABEL: "1.666% annual AUM (pro-rated daily)",
} as const;

export const TREASURY_TARGETS = {
  BTC: 0.6,
  USDC: 0.3,
  OPS_STABLE: 0.1, // runway / payout float
  /** Rebalance when any sleeve drifts beyond this absolute share */
  DRIFT_TOLERANCE: 0.05,
} as const;

export const LOYALTY = {
  STREAK_BONUS_PER_DAY: 0.005, // +0.5% off stack per consecutive day, capped
  STREAK_BONUS_CAP: 0.03, // max +3%
  SHARE_STREAK_THRESHOLD: 3,
} as const;

export const RATE_LIMITS = {
  DEFAULT_WINDOW_MS: 60_000,
  DEFAULT_MAX: 120,
  INGEST_MAX: 30,
  BUY_MAX: 20,
} as const;

export const APP = {
  NAME: "HyperBundle",
  TAGLINE: "Bundle the delightful. Keep the treasury boring.",
  DEFAULT_DOMAIN: "http://localhost:3000",
  VERSION: "0.4.0",
} as const;

export const COMPLEMENTARY_SECTORS: Record<string, string[]> = {
  RealEstate: ["Perishables", "Airlines", "Experiences"],
  Perishables: ["RealEstate", "Experiences", "Collectibles"],
  Airlines: ["RealEstate", "Experiences", "Hotels"],
  Experiences: ["RealEstate", "Perishables", "Airlines"],
  Collectibles: ["Crypto", "Perishables", "Experiences"],
  Crypto: ["Collectibles", "Experiences", "RealEstate"],
  Hotels: ["Airlines", "Experiences", "Perishables"],
};
