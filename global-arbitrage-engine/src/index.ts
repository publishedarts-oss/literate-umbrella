import { Hono } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { APP, RATE_LIMITS } from "./config";
import { transactions } from "./db/schema";
import { HyperBundleEngine } from "./hyperbundle-engine";
import { checkRateLimit } from "./lib/rateLimit";
import { applySecurityHeaders } from "./lib/securityHeaders";
import { sanitizeText } from "./lib/sanitize";
import { PaymentEngine } from "./paymentEngine";
import { CatalogGenerator } from "./pdfGenerator";
import { MicroMarginSweeper } from "./microMarginSweeper";
import { TokenTransactionHook } from "./tokenTransactionHook";
import dashboard from "./dashboard";
import { Treasury } from "./treasury";
import type { InventoryItem } from "./types";

// 1. DATABASE
const queryClient = new Database("arbitrage.db");
queryClient.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    reference_id TEXT UNIQUE NOT NULL,
    fiat_amount REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS token_balances (
    wallet_address TEXT PRIMARY KEY,
    flipcoin_balance REAL DEFAULT 0.0,
    worldfortecoin_balance REAL DEFAULT 0.0,
    quancoin_balance REAL DEFAULT 0.0,
    tier_level TEXT DEFAULT 'standard'
  );
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    scanned_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    opportunities_found INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    sector TEXT NOT NULL,
    title TEXT NOT NULL,
    wholesale_price REAL NOT NULL,
    meta TEXT NOT NULL,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    ab_group TEXT NOT NULL DEFAULT 'control_40pct',
    wallet_connected INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL
  );
`);
const db = drizzle(queryClient);

try {
  queryClient.run(
    `ALTER TABLE analytics_events ADD COLUMN ab_group TEXT NOT NULL DEFAULT 'control_40pct'`
  );
} catch {
  // column already exists
}

// Seed one expired perishable so the janitor has work on first sweep
queryClient.run(`
  INSERT OR IGNORE INTO inventory (id, sector, title, wholesale_price, meta, expires_at)
  VALUES (
    'inv_expired_demo',
    'Perishables',
    'Expired Demo Overstock Crate',
    50,
    '{"retailEstimate":120}',
    '2020-01-01T00:00:00.000Z'
  );
`);


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

    console.error(`🚨 [BUGBOT ALERT] ${JSON.stringify(errorPayload)}`);

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

    if (error.message.includes("Database locked")) {
      console.warn("🔄 Bugbot triggering automatic connection reset...");
    }
  },
};

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

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
  cors({
    origin: "*",
    allowHeaders: [
      "X-API-Key",
      "Content-Type",
      "X-User-FLIP",
      "X-User-WFC",
      "X-User-QC",
      "X-Wallet-Active",
      "X-AB-Group",
      "X-Session-Id",
    ],
  })
);

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

app.use("*", async (c, next) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  await next();
});

app.use("*", async (c, next) => {
  const key = `${c.req.method}:${c.req.path}:${c.req.header("x-forwarded-for") || "local"}`;
  const max = c.req.path.includes("/buy")
    ? RATE_LIMITS.BUY_MAX
    : c.req.path.includes("/ingest")
      ? RATE_LIMITS.INGEST_MAX
      : RATE_LIMITS.DEFAULT_MAX;
  const limit = checkRateLimit(key, max);
  c.header("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.allowed) {
    return c.json(
      {
        error: "Slow down, collector — too many taps.",
        retryAfterMs: limit.retryAfterMs,
      },
      429
    );
  }
  await next();
});

app.get("/", (c) =>
  c.json({
    name: APP.NAME,
    tagline: APP.TAGLINE,
    version: APP.VERSION,
    fees: {
      tx: "3.333%",
      aumAnnual: "1.666%",
    },
    links: {
      liveDashboard: "/dashboard",
      treasuryDashboard: "/dashboard/treasury",
    },
  })
);

app.route("/dashboard", dashboard);

app.get("/api/treasury", (c) => c.json(Treasury.getTreasurySnapshot()));

app.get("/api/loyalty/:sessionId", (c) => {
  const profile = HyperBundleEngine.loyalty.touchLoyaltySession(
    sanitizeText(c.req.param("sessionId"), 80)
  );
  return c.json(profile);
});

app.get("/api/bundles/smart-pairs", (c) => {
  const inventory = HyperBundleEngine.listInventory();
  const seeded: InventoryItem[] =
    inventory.length >= 2
      ? inventory
      : [
          {
            id: "inv_re_1",
            sector: "RealEstate",
            title: "Wilderness Plot",
            wholesalePrice: 1000,
            meta: { retailEstimate: 3000 },
          },
          {
            id: "inv_pe_1",
            sector: "Perishables",
            title: "Prime Wagyu Cut Box",
            wholesalePrice: 100,
            meta: { retailEstimate: 400 },
          },
          {
            id: "inv_air_1",
            sector: "Airlines",
            title: "Empty Leg Miami NYC",
            wholesalePrice: 950,
            meta: { retailEstimate: 4500 },
          },
        ];
  return c.json({
    pairs: HyperBundleEngine.suggestSmartPairs(seeded),
  });
});

app.post("/api/pipeline/ingest-all", async (c) => {
  const results = await HyperBundleEngine.ingestAllSources();
  return c.json({ success: true, results });
});

app.post("/api/treasury/micro-sweep", async (c) => {
  const body = await c.req.json();
  const transactions = body.transactions as Array<{ amount: number }>;
  const assetType = (body.assetType as "usdc" | "btc" | "points") || "usdc";
  const totalToTreasury = await MicroMarginSweeper.sweepGlobalVolume(
    transactions,
    assetType
  );
  return c.json({
    success: true,
    totalToTreasury,
    treasury: Treasury.getTreasurySnapshot(),
    recent: MicroMarginSweeper.recentSweeps(5),
  });
});

app.get("/api/treasury/micro-sweep/recent", (c) =>
  c.json({ sweeps: MicroMarginSweeper.recentSweeps(20) })
);

/**
 * WEB3 TRANSACTION HOOK CALLBACK
 * Called from Phantom Wallet / frontend after user transaction.
 * Fire-and-forget so the client gets an instant "queued" response.
 */
app.post("/api/hooks/solana-tx", async (c) => {
  let body: { signature?: string; tokenMint?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  const { signature, tokenMint } = body;

  if (!signature || !tokenMint) {
    return c.json({ error: "Missing signature or tokenMint" }, 400);
  }

  // Bun has no Cloudflare waitUntil — queue the promise for non-blocking UX
  void TokenTransactionHook.verifyAndSweepTokenTx(signature, tokenMint)
    .then((result) => {
      if (result.success) {
        console.log(
          `📈 [SOLANA SWEEP] Success — Added $${result.treasuryContribution?.toFixed(6)} to treasury`
        );
      } else {
        console.warn(`⚠️ [SOLANA SWEEP] Partial failure:`, result.error);
      }
    })
    .catch((err) => console.error("Hook background error:", err));

  return c.json({
    status: "queued",
    message:
      "Transaction signature received. Micro-margin processing started in background.",
  });
});

// DYNAMIC PSEO XML SITEMAP PATH
app.get("/sitemap.xml", (c) => {
  const activeSlugs = [
    "montana-mountain-view-lot-wagyu-a5-grilling-overstock-crate",
    "premium-tiny-home-plot-off-grid-energy-package",
    "empty-leg-flight-charter-luxury-villa-gap-night",
  ];

  const sitemapPayload = HyperBundleEngine.generateSitemapXML(
    activeSlugs,
    "http://localhost:3000"
  );

  return c.body(sitemapPayload, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control":
      "public, max-age=3600, s-maxage=14400, stale-while-revalidate=600",
  });
});

// Guard Layer
app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/feeds/") ||
    c.req.path === "/api/test-fault" ||
    c.req.path === "/api/analytics/dashboard" ||
    c.req.path === "/api/treasury" ||
    c.req.path === "/api/bundles/smart-pairs" ||
    c.req.path.startsWith("/api/loyalty/") ||
    c.req.path === "/api/hooks/solana-tx"
  ) {
    await next();
    return;
  }
  if (c.req.header("X-API-Key") !== process.env.ENGINE_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

app.post("/api/scan", async (c) => c.json(await Engine.executeScan()));

// INGESTION ENDPOINT: Push multi-sector pipeline items into the system
app.post("/api/pipeline/ingest", async (c) => {
  const body = await c.req.json();
  const { sector, items } = body;

  if (!sector || !Array.isArray(items)) {
    return c.json({ error: "Invalid layout request matrix structure" }, 400);
  }

  const status = await HyperBundleEngine.ingestExternalFeed(sector, items);
  return c.json({ success: true, tracking: status });
});

// ANALYTICS MONITORING BOARD
app.get("/api/analytics/dashboard", (c) => {
  return c.json({
    ...HyperBundleEngine.getConversionPerformanceMetrics(),
    ...HyperBundleEngine.getMetrics(),
  });
});

// ONE-TAP FIAT PAYMENTS (Stripe / PayPal Handler)
app.post("/api/tx/one-tap", async (c) => {
  const body = await c.req.json();
  const { provider, referenceId, amount, userId } = body;

  console.log(`Processing ${provider} webhook for $${amount}...`);

  try {
    const txId = crypto.randomUUID();
    const result = await db
      .insert(transactions)
      .values({
        id: txId,
        userId: userId ?? "anonymous",
        provider,
        referenceId,
        fiatAmount: amount ?? 0,
        status: "completed",
        createdAt: new Date().toISOString(),
      })
      .returning();

    return c.json({
      success: true,
      message: "Fiat transaction processed instantly via native pipeline",
      txId: result[0]?.id ?? txId,
      provider,
      tx: result[0],
      allocatedHoldingBonus:
        "Pending wallet connection for FLIP/WFC/QC tier upgrade.",
    });
  } catch (err) {
    void Bugbot.capture(toError(err), "POST /api/tx/one-tap");
    return c.json(
      { success: false, error: "Duplicate or invalid transaction block" },
      400
    );
  }
});

// SOLANA / PHANTOM WALLET ONE-TAP AUTH & VERIFICATION
app.post("/api/tx/verify-solana", async (c) => {
  const body = await c.req.json();
  const { publicKey, signature, message, expectedAction } = body;

  const isValid = PaymentEngine.verifySolanaSignature(
    publicKey,
    signature,
    message
  );
  if (!isValid) {
    return c.json(
      { success: false, error: "Invalid cryptographic signature profile" },
      401
    );
  }

  const activeHoldings = { FLIP: 1250, WFC: 500, QC: 0 };
  const loyaltyMultiplier = PaymentEngine.calculateLoyaltyMultiplier({
    flipcoinBalance: activeHoldings.FLIP,
    worldfortecoinBalance: activeHoldings.WFC,
    quancoinBalance: activeHoldings.QC,
  });

  return c.json({
    success: true,
    verifiedWallet: publicKey,
    ecosystemStatus: {
      tokensTracked: [
        "Flipcoin (Solana)",
        "WorldFortecoin (Arweave)",
        "Quancoin (Solana)",
      ],
      promotionalHoldTarget:
        "Hold 1,000 combined tokens for premium platform tiers.",
      activeHoldings,
      loyaltyMultiplier,
    },
    authorizedAction: expectedAction || "HyperBundlePurchase",
  });
});

app.get("/api/feeds/:channel", async (c) => {
  const channel = c.req.param("channel");

  // Capture dynamic wallet mock balances from request headers
  const flipBalance = parseFloat(c.req.header("X-User-FLIP") || "0");
  const wfcBalance = parseFloat(c.req.header("X-User-WFC") || "0");
  const qcBalance = parseFloat(c.req.header("X-User-QC") || "0");

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

  // Pricing tier from active ecosystem holding tokens
  const compiledBundle = HyperBundleEngine.createIrresistibleBundle(
    sampleItemA,
    sampleItemB,
    { FLIP: flipBalance, WFC: wfcBalance, QC: qcBalance }
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
      tierApplied: compiledBundle.tierApplied,
      abGroup: compiledBundle.abGroup,
      distribution_allowed: true,
      raw_components: compiledBundle.components,
    },
  });
});

app.get("/api/test-fault", () => {
  throw new Error("Simulated high-velocity database race condition failure.");
});

// DYNAMIC PDF BROCHURE ENDPOINT (Direct Buffer Delivery)
app.get("/deals/:slug/brochure.pdf", async (c) => {
  const slug = c.req.param("slug");

  const activeBundle = {
    id: crypto.randomUUID(),
    title:
      "The Ultimate Commercial RealEstate & Premium Perishables Combo",
    retailValue: 4100,
    bundlePrice: 1350,
    tierApplied: "Pioneer Tier Active",
    slug,
  };

  try {
    const pdfBuffer = await CatalogGenerator.generateBrochureBuffer(activeBundle);
    HyperBundleEngine.trackMetrics(
      activeBundle.id,
      "pdf_download",
      "control_40pct",
      c.req.header("X-Wallet-Active") === "true"
    );

    c.header("Content-Type", "application/pdf");
    c.header(
      "Content-Disposition",
      `inline; filename="${slug}-brochure.pdf"`
    );
    c.header("Cache-Control", "public, max-age=300");
    return c.body(pdfBuffer);
  } catch (err) {
    void Bugbot.capture(toError(err), `GET /deals/${slug}/brochure.pdf`);
    return c.json(
      { success: false, error: "Failed to generate brochure stream asset" },
      500
    );
  }
});

// ECOSYSTEM DASHBOARD EMBEDDABLE WEB COMPONENT
app.get("/assets/dashboard-component.js", (c) => {
  const clientScript = `
    class EcosystemDashboard extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
      }
      connectedCallback() {
        const flip = this.getAttribute('flip') || '0';
        const wfc = this.getAttribute('wfc') || '0';
        const qc = this.getAttribute('qc') || '0';

        this.shadowRoot.innerHTML = \`
          <style>
            :host { display: block; font-family: sans-serif; max-width: 400px; background: #ffffff; border: 1px solid #eeeeee; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            h3 { margin: 0 0 15px 0; font-size: 1.1rem; color: #111; text-transform: uppercase; letter-spacing: 0.5px; }
            .token-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #f0f0f0; }
            .token-info { display: flex; flex-direction: column; }
            .token-name { font-weight: bold; color: #333; font-size: 0.95rem; }
            .token-net { font-size: 0.75rem; color: #888; }
            .token-val { font-family: monospace; font-size: 1.1rem; font-weight: bold; color: #111; }
          </style>
          <h3>Ecosystem Token Standings</h3>
          <div class="token-row">
            <div class="token-info"><span class="token-name">Flipcoin</span><span class="token-net">Solana Network</span></div>
            <div class="token-val">\${parseFloat(flip).toLocaleString()}</div>
          </div>
          <div class="token-row">
            <div class="token-info"><span class="token-name">WorldFortecoin</span><span class="token-net">Arweave Network</span></div>
            <div class="token-val">\${parseFloat(wfc).toLocaleString()}</div>
          </div>
          <div class="token-row" style="border:none; margin:0; padding:0;">
            <div class="token-info"><span class="token-name">Quancoin</span><span class="token-net">Solana Network</span></div>
            <div class="token-val">\${parseFloat(qc).toLocaleString()}</div>
          </div>
        \`;
      }
    }
    customElements.define('ecosystem-dashboard', EcosystemDashboard);
  `;

  return c.body(clientScript, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

app.get("/deals/:slug", async (c) => {
  const slug = c.req.param("slug");
  const sessionId =
    sanitizeText(c.req.header("X-Session-Id") || crypto.randomUUID(), 80);

  const sampleItemA: InventoryItem = {
    id: "inv_re_1",
    sector: "RealEstate",
    title: "Wilderness Plot",
    wholesalePrice: 1000,
    meta: { retailEstimate: 3000 },
  };
  const sampleItemB: InventoryItem = {
    id: "inv_pe_1",
    sector: "Perishables",
    title: "Prime Wagyu Cut Box",
    wholesalePrice: 100,
    meta: { retailEstimate: 400 },
  };

  const flipBalance = parseFloat(c.req.header("X-User-FLIP") || "0");
  const wfcBalance = parseFloat(c.req.header("X-User-WFC") || "0");
  const qcBalance = parseFloat(c.req.header("X-User-QC") || "0");
  const holdBalances = { FLIP: flipBalance, WFC: wfcBalance, QC: qcBalance };

  const loyalty = HyperBundleEngine.loyalty.touchLoyaltySession(sessionId, {
    holdBalances,
  });

  const bundle = HyperBundleEngine.createIrresistibleBundle(
    sampleItemA,
    sampleItemB,
    holdBalances,
    undefined,
    { streakDays: loyalty.visitStreak }
  );
  bundle.slug = slug;
  bundle.badges = loyalty.badges;

  HyperBundleEngine.trackMetrics(
    bundle.id,
    "impression",
    bundle.abGroup,
    c.req.header("X-Wallet-Active") === "true"
  );

  const seoPage = HyperBundleEngine.generatePSEO(bundle);
  Object.entries(seoPage.headers).forEach(([key, val]) => c.header(key, val));
  c.header("X-Session-Id", sessionId);
  return c.html(seoPage.html);
});

app.post("/deals/:slug/buy", async (c) => {
  const sessionId =
    sanitizeText(c.req.header("X-Session-Id") || crypto.randomUUID(), 80);
  const forced =
    (c.req.query("ab") as "control_40pct" | "aggressive_55pct" | undefined) ||
    (c.req.header("X-AB-Group") as
      | "control_40pct"
      | "aggressive_55pct"
      | undefined);

  const sampleItemA: InventoryItem = {
    id: "inv_re_1",
    sector: "RealEstate",
    title: "Wilderness Plot",
    wholesalePrice: 1000,
    meta: { retailEstimate: 3000 },
  };
  const sampleItemB: InventoryItem = {
    id: "inv_pe_1",
    sector: "Perishables",
    title: "Prime Wagyu Cut Box",
    wholesalePrice: 100,
    meta: { retailEstimate: 400 },
  };

  const loyalty = HyperBundleEngine.loyalty.touchLoyaltySession(sessionId);
  const bundle = HyperBundleEngine.createIrresistibleBundle(
    sampleItemA,
    sampleItemB,
    loyalty.holdBalances,
    forced ?? "control_40pct",
    { streakDays: loyalty.visitStreak }
  );
  bundle.slug = c.req.param("slug");

  const result = HyperBundleEngine.completePurchase(bundle, sessionId, {
    walletConnected: c.req.header("X-Wallet-Active") === "true",
  });

  console.log(
    "🔔 [OUTBOUND PIPE] Immediate Alpha Sale Closed. Alerting fulfillment arrays..."
  );
  return c.json(result);
});

app.post("/deals/:slug/share", async (c) => {
  const sessionId =
    sanitizeText(c.req.header("X-Session-Id") || crypto.randomUUID(), 80);
  const sampleItemA: InventoryItem = {
    id: "inv_re_1",
    sector: "RealEstate",
    title: "Wilderness Plot",
    wholesalePrice: 1000,
    meta: { retailEstimate: 3000 },
  };
  const sampleItemB: InventoryItem = {
    id: "inv_pe_1",
    sector: "Perishables",
    title: "Prime Wagyu Cut Box",
    wholesalePrice: 100,
    meta: { retailEstimate: 400 },
  };
  const bundle = HyperBundleEngine.createIrresistibleBundle(
    sampleItemA,
    sampleItemB,
    undefined,
    "control_40pct"
  );
  bundle.slug = c.req.param("slug");
  return c.json(HyperBundleEngine.shareBundle(bundle, sessionId));
});

// Continuous automated background worker — purge + multi-source feeds
const PORT = 3000;
setInterval(async () => {
  const { purgedCount } = await HyperBundleEngine.purgeExpiredPerishables();
  if (purgedCount > 0) {
    console.log(
      `🧹 Janitor automatic runtime check swept ${purgedCount} dead records.`
    );
  }
  await HyperBundleEngine.ingestAllSources();
}, 30_000);

void HyperBundleEngine.purgeExpiredPerishables();

export default {
  port: PORT,
  hostname: "0.0.0.0", // Forces accessibility across your entire machine
  fetch: app.fetch,
};
