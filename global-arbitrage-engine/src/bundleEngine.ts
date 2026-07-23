import { Database } from "bun:sqlite";

// Shared inventory connection for the cron janitor (same file as API bootstrap)
const inventoryClient = new Database("arbitrage.db");
inventoryClient.run(`
  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    sector TEXT NOT NULL,
    title TEXT NOT NULL,
    wholesale_price REAL NOT NULL,
    meta TEXT NOT NULL,
    expires_at TEXT
  );
`);

// Pure functional optimization logic to build high-margin bundles
export const HyperBundleEngine = {
  // Calculates price based on holding vectors of FLIP, WFC, and QC
  createIrresistibleBundle(
    itemA: any,
    itemB: any,
    holdBalances?: { FLIP: number; WFC: number; QC: number }
  ): any {
    const combinedWholesale = itemA.wholesalePrice + itemB.wholesalePrice;
    const combinedRetail =
      (itemA.meta.retailEstimate || itemA.wholesalePrice * 1.5) +
      (itemB.meta.retailEstimate || itemB.wholesalePrice * 1.5);

    // Calculate loyalty discounts based on coin holding metrics
    let holdingDiscountMultiplier = 1.0;
    if (holdBalances) {
      const combinedHoldScore =
        holdBalances.FLIP + holdBalances.WFC * 1.5 + holdBalances.QC * 1.2;
      if (combinedHoldScore >= 5000)
        holdingDiscountMultiplier = 0.8; // 20% discount for Whale Tier
      else if (combinedHoldScore >= 1000)
        holdingDiscountMultiplier = 0.9; // 10% discount for Pioneer Tier
    }

    // Baseline 40% consumer discount modified by holding tier rewards
    const targetedBaseDiscount = 0.4 * (2.0 - holdingDiscountMultiplier);
    const optimizedPrice = Math.max(
      combinedWholesale * 1.1,
      combinedRetail * (1 - targetedBaseDiscount)
    );
    const slug = `${itemA.title}-${itemB.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    return {
      id: crypto.randomUUID(),
      slug,
      title: `The Ultimate ${itemA.sector} & ${itemB.sector} Premium Combo`,
      retailValue: Math.round(combinedRetail),
      bundlePrice: Math.round(optimizedPrice),
      tierApplied:
        holdingDiscountMultiplier < 1.0
          ? "Premium Gated Discount"
          : "Standard Tier",
      components: [itemA.id, itemB.id],
    };
  },

  generatePSEO(bundle: any): { html: string; headers: Record<string, string> } {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${bundle.title}</title></head><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;background:#f9f9f9;"><span style="background:#ff4757;color:white;padding:4px 8px;font-weight:bold;border-radius:4px;font-size:0.8rem;">GATED DEAL VIA FLIP/WFC/QC BOARDS</span><h1 style="margin-top:10px;color:#111;">${bundle.title}</h1><p style="font-size:1.2rem;color:#333;">Valued at <del>$${bundle.retailValue}</del> <strong style="color:#2ed573;">Now Only $${bundle.bundlePrice}</strong></p><p style="font-size:0.9rem;color:#777;">System Tier Tracking: <b>${bundle.tierApplied || "None"}</b></p><button style="width:100%;padding:15px;background:#2ed573;border:none;color:white;font-size:1.2rem;font-weight:bold;cursor:pointer;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">One-Tap Buy Now</button></body></html>`;
    return {
      html,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=60",
      },
    };
  },

  // HIGH-SPEED XML SITEMAP ENGINE
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

  // CRON-JOB JANITOR ENGINE
  async purgeExpiredPerishables(): Promise<{ purgedCount: number }> {
    const now = new Date().toISOString();
    console.log(
      `🧹 [CRON JANITOR] Scanning for inventory components expired before ${now}...`
    );

    try {
      const query = inventoryClient.prepare(
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
};
