import { Database } from "bun:sqlite";

const queryClient = new Database("arbitrage.db");
queryClient.run(`
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

// Migrate older analytics tables that predate ab_group
try {
  queryClient.run(
    `ALTER TABLE analytics_events ADD COLUMN ab_group TEXT NOT NULL DEFAULT 'control_40pct'`
  );
} catch {
  // column already exists
}

export type AbGroup = "control_40pct" | "aggressive_55pct";

export const HyperBundleEngine = {
  // Dynamic A/B Pricing Algorithm
  createIrresistibleBundle(
    itemA: any,
    itemB: any,
    holdBalances?: { FLIP: number; WFC: number; QC: number },
    forcedGroup?: AbGroup
  ): any {
    const combinedWholesale = itemA.wholesalePrice + itemB.wholesalePrice;
    const combinedRetail =
      (itemA.meta.retailEstimate || itemA.wholesalePrice * 1.5) +
      (itemB.meta.retailEstimate || itemB.wholesalePrice * 1.5);

    const abGroup: AbGroup =
      forcedGroup ||
      (Math.random() > 0.5 ? "control_40pct" : "aggressive_55pct");
    const baseDiscount = abGroup === "aggressive_55pct" ? 0.55 : 0.4;

    let holdingDiscountMultiplier = 1.0;
    if (holdBalances) {
      const combinedHoldScore =
        holdBalances.FLIP + holdBalances.WFC * 1.5 + holdBalances.QC * 1.2;
      if (combinedHoldScore >= 5000) holdingDiscountMultiplier = 0.8;
      else if (combinedHoldScore >= 1000) holdingDiscountMultiplier = 0.9;
    }

    const targetedDiscount = baseDiscount * (2.0 - holdingDiscountMultiplier);
    const optimizedPrice = Math.max(
      combinedWholesale * 1.1,
      combinedRetail * (1 - targetedDiscount)
    );
    const slug = `${itemA.title}-${itemB.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    return {
      id: `${itemA.id}_${itemB.id}`,
      slug,
      title: `The Ultimate ${itemA.sector} & ${itemB.sector} Premium Combo`,
      retailValue: Math.round(combinedRetail),
      bundlePrice: Math.round(optimizedPrice),
      abGroup,
      tierApplied:
        holdingDiscountMultiplier < 1.0
          ? "Premium Gated Discount"
          : "Standard Tier",
      components: [itemA.id, itemB.id],
    };
  },

  generatePSEO(bundle: any): { html: string; headers: Record<string, string> } {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${bundle.title}</title></head><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;background:#fafafa;">
      <span style="background:#ff4757;color:white;padding:4px 8px;font-weight:bold;border-radius:4px;font-size:0.8rem;">BETA MARKET DROP</span>
      <h1 style="margin-top:10px;">${bundle.title}</h1>
      <p style="font-size:1.3rem;">Valued at <del>$${bundle.retailValue}</del> <strong style="color:#2ed573;">Now Only $${bundle.bundlePrice}</strong></p>
      <small style="color:#999;">Variant ID: ${bundle.abGroup || "control_40pct"} | ${bundle.tierApplied}</small><br><br>
      <form action="/deals/${bundle.slug}/buy" method="POST"><button style="width:100%;padding:15px;background:#2ed573;border:none;color:white;font-size:1.2rem;font-weight:bold;cursor:pointer;border-radius:6px;">One-Tap Buy Now</button></form>
    </body></html>`;
    return {
      html,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=10",
      },
    };
  },

  generateSitemapXML(
    slugs: string[],
    domain: string = "https://yourmarketplace.com"
  ): string {
    const entries = slugs
      .map(
        (slug) => `
  <url>
    <loc>${domain}/deals/${slug}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${entries}
</urlset>`.trim();
  },

  async purgeExpiredPerishables(): Promise<{ purgedCount: number }> {
    const now = new Date().toISOString();
    console.log(
      `🧹 [CRON JANITOR] Scanning for inventory components expired before ${now}...`
    );
    try {
      const query = queryClient.prepare(
        "DELETE FROM inventory WHERE expires_at IS NOT NULL AND expires_at < $now"
      );
      const result = query.run({ $now: now });
      if (result.changes > 0) {
        console.log(
          `✨ [CRON JANITOR] Successfully purged ${result.changes} expired perishable records.`
        );
      }
      return { purgedCount: result.changes };
    } catch (err) {
      console.error("❌ [CRON JANITOR] Clean sweep macro failed:", err);
      return { purgedCount: 0 };
    }
  },

  async ingestExternalFeed(sector: string, externalItems: any[]) {
    console.log(
      `📥 [PIPELINE] Ingesting ${externalItems.length} streams for sector: ${sector}`
    );
    const insertStmt = queryClient.prepare(`
      INSERT OR REPLACE INTO inventory (id, sector, title, wholesale_price, meta, expires_at)
      VALUES ($id, $sector, $title, $wholesalePrice, $meta, $expiresAt)
    `);

    let ingestedCount = 0;
    for (const item of externalItems) {
      insertStmt.run({
        $id: item.uuid || crypto.randomUUID(),
        $sector: sector,
        $title: item.displayTitle,
        $wholesalePrice: item.costBasis,
        $meta: JSON.stringify(item.attributes || {}),
        $expiresAt: item.deadline || null,
      });
      ingestedCount++;
    }
    return { success: true, count: ingestedCount };
  },

  trackMetrics(
    bundleId: string,
    eventType: string,
    abGroup: string = "control_40pct",
    walletConnected: boolean = false
  ) {
    try {
      const query = queryClient.prepare(`
        INSERT INTO analytics_events (id, bundle_id, event_type, ab_group, wallet_connected, timestamp)
        VALUES ($id, $bundleId, $eventType, $abGroup, $walletConnected, $timestamp)
      `);
      query.run({
        $id: crypto.randomUUID(),
        $bundleId: bundleId,
        $eventType: eventType,
        $abGroup: abGroup,
        $walletConnected: walletConnected ? 1 : 0,
        $timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Analytics failure ignored:", err);
    }
  },

  getMetrics() {
    const total = queryClient
      .prepare(
        "SELECT event_type, ab_group, COUNT(*) as count FROM analytics_events GROUP BY event_type, ab_group"
      )
      .all() as { event_type: string; ab_group: string; count: number }[];

    return { engine: "AM-v1", rawEventMatrix: total };
  },

  // Backward-compatible aggregate dashboard shape
  getConversionPerformanceMetrics() {
    const totalImpressions = queryClient
      .prepare(
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'impression'"
      )
      .get() as { count: number };
    const totalConversions = queryClient
      .prepare(
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'conversion'"
      )
      .get() as { count: number };
    const walletCheck = queryClient
      .prepare(
        "SELECT COUNT(*) as count FROM analytics_events WHERE wallet_connected = 1"
      )
      .get() as { count: number };

    const rate =
      totalImpressions.count > 0
        ? (totalConversions.count / totalImpressions.count) * 100
        : 0;

    return {
      metricsEngine: "AM-v1",
      aggregateData: {
        rawImpressions: totalImpressions.count,
        rawConversions: totalConversions.count,
        walletEngagedUsers: walletCheck.count,
        blendedConversionRate: `${rate.toFixed(2)}%`,
      },
      abMatrix: this.getMetrics().rawEventMatrix,
    };
  },
};
