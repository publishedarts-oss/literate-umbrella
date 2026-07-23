import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const scans = sqliteTable("scans", {
  id: text("id").primaryKey(),
  scannedAt: text("scanned_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  opportunitiesFound: integer("opportunities_found").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(), // 'stripe' | 'paypal' | 'solana'
  referenceId: text("reference_id").unique().notNull(), // Tx hash or Session ID
  fiatAmount: real("fiat_amount").default(0.0),
  status: text("status").notNull(), // 'pending' | 'completed' | 'failed'
  createdAt: text("created_at").notNull(),
});

export const tokenBalances = sqliteTable("token_balances", {
  walletAddress: text("wallet_address").primaryKey(),
  flipcoinBalance: real("flipcoin_balance").default(0.0), // Solana Asset
  worldfortecoinBalance: real("worldfortecoin_balance").default(0.0), // Arweave Asset
  quancoinBalance: real("quancoin_balance").default(0.0), // Solana Asset
  tierLevel: text("tier_level").default("standard"), // ecosystem multiplier
});

export const inventory = sqliteTable("inventory", {
  id: text("id").primaryKey(),
  sector: text("sector").notNull(), // 'RealEstate' | 'Airlines' | 'Perishables'
  title: text("title").notNull(),
  wholesalePrice: real("wholesale_price").notNull(),
  meta: text("meta", { mode: "json" }).notNull(),
  expiresAt: text("expires_at"),
});

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  bundleId: text("bundle_id").notNull(),
  eventType: text("event_type").notNull(), // 'impression' | 'pdf_download' | 'conversion'
  abGroup: text("ab_group").notNull(), // 'control_40pct' | 'aggressive_55pct'
  walletConnected: integer("wallet_connected", { mode: "boolean" }).default(
    false
  ),
  timestamp: text("timestamp").notNull(),
});

export const feeLedger = sqliteTable("fee_ledger", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // 'tx' | 'aum'
  amountUsd: real("amount_usd").notNull(),
  bundleId: text("bundle_id"),
  sessionId: text("session_id"),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
});

export const treasuryBalances = sqliteTable("treasury_balances", {
  asset: text("asset").primaryKey(), // BTC | USDC | OPS_STABLE
  amountUsd: real("amount_usd").notNull(),
});

export const treasuryLedger = sqliteTable("treasury_ledger", {
  id: text("id").primaryKey(),
  feesCollected: real("fees_collected").default(0),
  dailySlice: real("daily_slice").default(0),
  assetType: text("asset_type").default("usdc"),
  transactionCount: integer("transaction_count").default(0),
  timestamp: text("timestamp").notNull(),
});

export const loyaltySessions = sqliteTable("loyalty_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: text("user_id"),
  visitStreak: integer("visit_streak").default(1),
  lastVisitDay: text("last_visit_day").notNull(),
  sharesCount: integer("shares_count").default(0),
  purchasesCount: integer("purchases_count").default(0),
  badgesJson: text("badges_json").default("[]"),
  holdFlip: real("hold_flip").default(0),
  holdWfc: real("hold_wfc").default(0),
  holdQc: real("hold_qc").default(0),
  updatedAt: text("updated_at").notNull(),
});

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  retailValue: real("retail_value").notNull(),
  bundlePrice: real("bundle_price").notNull(),
  components: text("components", { mode: "json" }).notNull(),
  status: text("status").default("active"), // active | sold
});
