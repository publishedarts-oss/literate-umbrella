import { Hono } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { transactions } from "./db/schema";
import { HyperBundleEngine } from "./bundleEngine";

// 1. DATABASE
const queryClient = new Database("arbitrage.db");
queryClient.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    reference_id TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    scanned_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    opportunities_found INTEGER NOT NULL
  );
`);
const db = drizzle(queryClient);

// 2. ENGINE CONTROLLER
const Engine = {
  isScanning: false,
  async executeScan() {
    if (this.isScanning) {
      return { warning: "Scan skipped. Previous operation still active." };
    }
    this.isScanning = true;
    const start = performance.now();
    try {
      // High-speed arbitrage aggregation logic hooks go here
      const duration = Math.round(performance.now() - start);
      return { success: true, durationMs: duration, found: 0 };
    } catch (error) {
      console.error("Engine Fault Caught:", error);
      return { success: false, error: String(error) };
    } finally {
      this.isScanning = false;
    }
  },
};

// 3. API ROUTER (HONO + BUN NATIVE)
const app = new Hono();
app.use(
  "*",
  cors({ origin: "*", allowHeaders: ["X-API-Key", "Content-Type"] })
);

// Guard Layer
app.use("/api/*", async (c, next) => {
  // Public syndication feeds stay open for partner channels
  if (c.req.path.startsWith("/api/feeds/")) {
    await next();
    return;
  }
  if (c.req.header("X-API-Key") !== process.env.ENGINE_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Optimization Routes
app.post("/api/scan", async (c) => c.json(await Engine.executeScan()));

app.post("/api/tx/one-tap", async (c) => {
  const { provider, referenceId, amount } = await c.req.json();
  try {
    const result = await db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        provider,
        referenceId,
        amount,
        status: "completed",
        createdAt: new Date().toISOString(),
      })
      .returning();
    return c.json({ success: true, tx: result[0] });
  } catch {
    return c.json(
      { success: false, error: "Duplicate or invalid transaction block" },
      400
    );
  }
});

// Instant Feed for Syndication Channels (Flipstream, AuctionHouse, or Whitelabel partners)
app.get("/api/feeds/:channel", async (c) => {
  const channel = c.req.param("channel");

  const sampleItemA = {
    id: "inv_1",
    sector: "RealEstate",
    title: "Montana Mountain View Lot",
    wholesalePrice: 1200,
    meta: { retailEstimate: 3500 },
  };
  const sampleItemB = {
    id: "inv_2",
    sector: "Perishables",
    title: "Wagyu A5 Grilling Overstock Crate",
    wholesalePrice: 150,
    meta: { retailEstimate: 600 },
  };

  const compiledBundle = HyperBundleEngine.createIrresistibleBundle(
    sampleItemA,
    sampleItemB
  );

  return c.json({
    syndicationTarget: channel,
    timestamp: new Date().toISOString(),
    distributionFormat: "marketplace-native",
    payload: {
      origin_engine: "HBE-v1",
      listing_id: compiledBundle.id,
      slug: compiledBundle.slug,
      display_title: compiledBundle.title,
      pricing: {
        msrp: compiledBundle.retailValue,
        offer_price: compiledBundle.bundlePrice,
        currency: "USD",
      },
      distribution_allowed: true,
      raw_components: compiledBundle.components,
    },
  });
});

// Dynamic PSEO Endpoint serving pre-optimized edge layouts instantly
app.get("/deals/:slug", async (c) => {
  const slug = c.req.param("slug");

  const mockBundle = {
    title: "Premium Tiny-Home Plot & Off-Grid Energy Package",
    retailValue: 8500,
    bundlePrice: 2900,
    slug,
  };

  const seoPage = HyperBundleEngine.generatePSEO(mockBundle);

  Object.entries(seoPage.headers).forEach(([key, val]) => c.header(key, val));
  return c.html(seoPage.html);
});

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
