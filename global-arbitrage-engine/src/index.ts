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

// 2. NATIVE BUGBOT ENGINE (zero-overhead, fire-and-forget)
const Bugbot = {
  async capture(error: Error, ContextInfo: string) {
    const errorPayload = {
      bot: "BUGBOT-v1",
      timestamp: new Date().toISOString(),
      location: ContextInfo,
      message: error.message,
      name: error.name,
      stack: error.stack?.split("\n").slice(0, 3).join(" | "),
      pid: process.pid,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };

    // Low-density high-utility log out
    console.error(`🚨 [BUGBOT ALERT] ${JSON.stringify(errorPayload)}`);

    // Optional webhook channel — never blocks the request path
    const webhook = process.env.BUGBOT_DISCORD_WEBHOOK;
    if (webhook) {
      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `⚠️ **System Fault:** ${error.message}\n\`\`\`${errorPayload.stack ?? "no-stack"}\`\`\``,
        }),
      }).catch(() => {});
    }

    // Self-Healing Hook Placeholder
    if (error.message.includes("Database locked")) {
      console.warn("🔄 Bugbot triggering automatic connection reset...");
    }
  },
};

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

// Global process boundaries — non-blocking capture only
process.on("uncaughtException", (error) => {
  void Bugbot.capture(error, "uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  void Bugbot.capture(toError(reason), "unhandledRejection");
});

// 3. ENGINE CONTROLLER
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
      void Bugbot.capture(toError(error), "Engine.executeScan");
      return { success: false, error: String(error) };
    } finally {
      this.isScanning = false;
    }
  },
};

// 4. API ROUTER (HONO + BUN NATIVE)
const app = new Hono();
app.use(
  "*",
  cors({ origin: "*", allowHeaders: ["X-API-Key", "Content-Type"] })
);

// Global app error boundary — instant 500 to client, Bugbot async in background
app.onError((err, c) => {
  void Bugbot.capture(err, `${c.req.method} ${c.req.path}`);

  return c.json(
    {
      success: false,
      error: "Engine Transaction Fault",
      code: "ERR_CIRCUIT_BROKEN",
    },
    500
  );
});

// Guard Layer
app.use("/api/*", async (c, next) => {
  // Public syndication feeds + fault probe stay open
  if (
    c.req.path.startsWith("/api/feeds/") ||
    c.req.path === "/api/test-fault"
  ) {
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
  } catch (err) {
    void Bugbot.capture(toError(err), "POST /api/tx/one-tap");
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

// Force-Error Test Endpoint (verify Bugbot boundary)
app.get("/api/test-fault", () => {
  throw new Error("Simulated high-velocity database race condition failure.");
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
