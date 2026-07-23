import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const scans = sqliteTable("scans", {
  id: text("id").primaryKey(),
  scannedAt: text("scanned_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  opportunitiesFound: integer("opportunities_found").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(), // 'stripe' | 'paypal' | 'phantom'
  referenceId: text("reference_id").unique().notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
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
