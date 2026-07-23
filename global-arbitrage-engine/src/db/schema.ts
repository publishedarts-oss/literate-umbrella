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
  sector: text("sector").notNull(),
  title: text("title").notNull(),
  wholesalePrice: real("wholesale_price").notNull(),
  meta: text("meta", { mode: "json" }).notNull(),
  expiresAt: text("expires_at"),
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
