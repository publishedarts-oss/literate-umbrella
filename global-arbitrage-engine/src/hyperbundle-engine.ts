import { Database } from "bun:sqlite";
import { APP, COMPLEMENTARY_SECTORS, FEES } from "./config";
import { pullAllFeeds, pullFeed } from "./feeds";
import { log } from "./lib/logger";
import {
  assertNonEmptyArray,
  sanitizeNumber,
  sanitizeSector,
  sanitizeSlug,
  sanitizeText,
} from "./lib/sanitize";
import {
  Loyalty,
  recordPurchase,
  recordShare,
  streakDiscountBonus,
  touchLoyaltySession,
} from "./loyalty";
import { buildEmailReceipt, buildSocialCard } from "./share";
import { Treasury, computeFeeBreakdown, recordFee } from "./treasury";
import type {
  AbGroup,
  Bundle,
  ExternalFeedItem,
  FeedSource,
  HoldBalances,
  InventoryItem,
} from "./types";

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

try {
  queryClient.run(
    `ALTER TABLE analytics_events ADD COLUMN ab_group TEXT NOT NULL DEFAULT 'control_40pct'`
  );
} catch {
  // already migrated
}

function retailOf(item: InventoryItem): number {
  return item.meta.retailEstimate || item.wholesalePrice * 1.5;
}

function holdingMultiplier(holdBalances?: HoldBalances): number {
  if (!holdBalances) return 1.0;
  const score =
    holdBalances.FLIP + holdBalances.WFC * 1.5 + holdBalances.QC * 1.2;
  if (score >= 5000) return 0.8;
  if (score >= 1000) return 0.9;
  return 1.0;
}

/** Score how well two inventory items pair (complementary sectors + value balance). */
export function scorePairMatch(itemA: InventoryItem, itemB: InventoryItem): {
  score: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  const complements = COMPLEMENTARY_SECTORS[itemA.sector] || [];
  if (itemA.sector !== itemB.sector) {
    score += 25;
    reasons.push("cross-sector spark");
  }
  if (complements.includes(itemB.sector)) {
    score += 40;
    reasons.push(`${itemA.sector} ♥ ${itemB.sector}`);
  }

  const retailA = retailOf(itemA);
  const retailB = retailOf(itemB);
  const ratio = Math.max(retailA, retailB) / Math.max(1, Math.min(retailA, retailB));
  if (ratio <= 2) {
    score += 25;
    reasons.push("balanced value");
  } else if (ratio <= 4) {
    score += 10;
    reasons.push("stretch pairing");
  } else {
    reasons.push("anchor + accent");
  }

  // Perishable urgency boosts fun when paired with durable assets
  if (
    (itemA.expiresAt || itemB.expiresAt) &&
    (itemA.sector === "RealEstate" || itemB.sector === "RealEstate")
  ) {
    score += 10;
    reasons.push("now-or-never + lasting");
  }

  return {
    score: Math.min(100, score),
    reason: reasons.join(" · ") || "curious combo",
  };
}

function delightCopy(bundlePrice: number, retailValue: number, matchReason: string): string {
  const saved = Math.max(0, retailValue - bundlePrice);
  const lines = [
    `Save $${saved.toLocaleString()} without the stuffy auction vibe.`,
    `Matched for chemistry: ${matchReason}.`,
    `Fees stay transparent (${FEES.TX_LABEL}) so the treasury can stay BTC/USDC-boring.`,
  ];
  return lines.join(" ");
}

export const HyperBundleEngine = {
  createIrresistibleBundle(
    itemA: InventoryItem,
    itemB: InventoryItem,
    holdBalances?: HoldBalances,
    forcedGroup?: AbGroup,
    opts?: { streakDays?: number; domain?: string }
  ): Bundle {
    if (!itemA?.id || !itemB?.id) {
      throw new Error("Both inventory items are required to weave a HyperBundle");
    }

    const combinedWholesale =
      sanitizeNumber(itemA.wholesalePrice) + sanitizeNumber(itemB.wholesalePrice);
    const combinedRetail = retailOf(itemA) + retailOf(itemB);

    const abGroup: AbGroup =
      forcedGroup ||
      (Math.random() > 0.5 ? "control_40pct" : "aggressive_55pct");
    const baseDiscount = abGroup === "aggressive_55pct" ? 0.55 : 0.4;

    const holdMult = holdingMultiplier(holdBalances);
    const streakBonus = streakDiscountBonus(opts?.streakDays ?? 0);
    const targetedDiscount =
      baseDiscount * (2.0 - holdMult) + streakBonus;

    const optimizedPrice = Math.max(
      combinedWholesale * 1.1,
      combinedRetail * (1 - Math.min(0.75, targetedDiscount))
    );

    const slug = sanitizeSlug(`${itemA.title}-${itemB.title}`);
    const match = scorePairMatch(itemA, itemB);
    const bundlePrice = Math.round(optimizedPrice);
    const retailValue = Math.round(combinedRetail);
    const fees = computeFeeBreakdown(bundlePrice);
    const domain = opts?.domain ?? APP.DEFAULT_DOMAIN;

    const tierApplied =
      holdMult < 1.0
        ? "Premium Gated Discount"
        : streakBonus > 0
          ? "Streak Soft-Landing"
          : "Standard Tier";

    const bundle: Bundle = {
      id: `${itemA.id}_${itemB.id}`,
      slug,
      title: `The Ultimate ${sanitizeSector(itemA.sector)} & ${sanitizeSector(itemB.sector)} Premium Combo`,
      retailValue,
      bundlePrice,
      abGroup,
      tierApplied,
      components: [itemA.id, itemB.id],
      matchScore: match.score,
      matchReason: match.reason,
      fees,
      shareUrl: `${domain}/deals/${slug}`,
      delightCopy: delightCopy(bundlePrice, retailValue, match.reason),
      badges: [],
    };

    log.info("bundle_created", {
      id: bundle.id,
      abGroup,
      bundlePrice,
      matchScore: match.score,
    });

    return bundle;
  },

  /** Rank complementary pairs from an inventory pool. */
  suggestSmartPairs(
    items: InventoryItem[],
    holdBalances?: HoldBalances,
    limit = 5
  ): Bundle[] {
    if (items.length < 2) return [];
    const candidates: Bundle[] = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const match = scorePairMatch(items[i], items[j]);
        if (match.score < 30) continue;
        const bundle = this.createIrresistibleBundle(
          items[i],
          items[j],
          holdBalances,
          "control_40pct"
        );
        candidates.push(bundle);
      }
    }

    return candidates
      .sort((a, b) => b.matchScore - a.matchScore || a.bundlePrice - b.bundlePrice)
      .slice(0, limit);
  },

  generatePSEO(bundle: Bundle): { html: string; headers: Record<string, string> } {
    const social = buildSocialCard(bundle);
    const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/>
<title>${sanitizeText(bundle.title)}</title>
<meta name="description" content="${sanitizeText(social.description, 300)}"/>
<meta property="og:title" content="${sanitizeText(social.ogTitle)}"/>
<meta property="og:description" content="${sanitizeText(social.ogDescription, 300)}"/>
<meta name="twitter:card" content="summary_large_image"/>
</head><body style="font-family:Georgia,serif;max-width:640px;margin:40px auto;padding:24px;background:linear-gradient(180deg,#fffaf3,#f3efe6);color:#1a1a1a;">
  <p style="letter-spacing:0.12em;text-transform:uppercase;font-size:11px;color:#8a6a3a;">${APP.NAME} · quiet market magic</p>
  <span style="background:#c45c26;color:white;padding:4px 10px;font-weight:bold;border-radius:4px;font-size:0.75rem;">BETA MARKET DROP</span>
  <h1 style="margin-top:14px;font-size:2rem;line-height:1.15;">${sanitizeText(bundle.title)}</h1>
  <p style="font-size:1.25rem;">Valued at <del>$${bundle.retailValue}</del> <strong style="color:#2f6f4e;">Now $${bundle.bundlePrice}</strong></p>
  <p style="color:#555;font-size:0.95rem;">${sanitizeText(bundle.delightCopy, 400)}</p>
  <p style="font-size:0.85rem;color:#777;">Variant ${bundle.abGroup} · ${bundle.tierApplied} · Match ${bundle.matchScore}/100<br/>
  Today: $${bundle.fees.totalDueToday} includes ${bundle.fees.labels.tx} ($${bundle.fees.txFeeAmount}). ${bundle.fees.labels.aum}.</p>
  <form action="/deals/${bundle.slug}/buy" method="POST">
    <button style="width:100%;padding:16px;background:#2f6f4e;border:none;color:white;font-size:1.15rem;font-weight:bold;cursor:pointer;border-radius:8px;">One-Tap Bundle · Feel Lucky</button>
  </form>
  <p style="margin-top:18px;font-size:0.8rem;color:#999;"><a href="${bundle.shareUrl}">Share this spark</a> · Fees stay transparent. Treasury stays BTC/USDC heavy.</p>
</body></html>`;

    return {
      html,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=10",
      },
    };
  },

  generateSitemapXML(
    slugs: string[],
    domain: string = APP.DEFAULT_DOMAIN
  ): string {
    const entries = slugs
      .map((slug) => {
        const safe = sanitizeSlug(slug);
        return `
  <url>
    <loc>${domain}/deals/${safe}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`;
      })
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
    try {
      const result = queryClient
        .prepare(
          "DELETE FROM inventory WHERE expires_at IS NOT NULL AND expires_at < $now"
        )
        .run({ $now: now });
      if (result.changes > 0) {
        log.info("janitor_purged", { purgedCount: result.changes });
      }
      return { purgedCount: result.changes };
    } catch (err) {
      log.error("janitor_failed", { err: String(err) });
      return { purgedCount: 0 };
    }
  },

  async ingestExternalFeed(sector: string, externalItems: ExternalFeedItem[]) {
    const safeSector = sanitizeSector(sector);
    assertNonEmptyArray<ExternalFeedItem>(externalItems, "items");
    log.info("pipeline_ingest", {
      sector: safeSector,
      count: externalItems.length,
    });

    const insertStmt = queryClient.prepare(`
      INSERT OR REPLACE INTO inventory (id, sector, title, wholesale_price, meta, expires_at)
      VALUES ($id, $sector, $title, $wholesalePrice, $meta, $expiresAt)
    `);

    let ingestedCount = 0;
    for (const item of externalItems) {
      insertStmt.run({
        $id: sanitizeText(item.uuid || crypto.randomUUID(), 64),
        $sector: safeSector,
        $title: sanitizeText(item.displayTitle, 180),
        $wholesalePrice: sanitizeNumber(item.costBasis),
        $meta: JSON.stringify(item.attributes || {}),
        $expiresAt: item.deadline || null,
      });
      ingestedCount++;
    }
    return { success: true, count: ingestedCount };
  },

  async ingestFromSource(source: FeedSource) {
    const feed = await pullFeed(source);
    return this.ingestExternalFeed(feed.sector, feed.items);
  },

  async ingestAllSources() {
    const feeds = await pullAllFeeds();
    const results = [];
    for (const feed of feeds) {
      results.push({
        source: feed.source,
        ...(await this.ingestExternalFeed(feed.sector, feed.items)),
      });
    }
    return results;
  },

  listInventory(limit = 50): InventoryItem[] {
    const rows = queryClient
      .prepare(
        `SELECT id, sector, title, wholesale_price as wholesalePrice, meta, expires_at as expiresAt
         FROM inventory ORDER BY title LIMIT $limit`
      )
      .all({ $limit: limit }) as any[];

    return rows.map((r) => ({
      id: r.id,
      sector: r.sector,
      title: r.title,
      wholesalePrice: r.wholesalePrice,
      meta: typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta,
      expiresAt: r.expiresAt,
    }));
  },

  trackMetrics(
    bundleId: string,
    eventType: string,
    abGroup: string = "control_40pct",
    walletConnected: boolean = false
  ) {
    try {
      queryClient
        .prepare(
          `INSERT INTO analytics_events (id, bundle_id, event_type, ab_group, wallet_connected, timestamp)
           VALUES ($id, $bundleId, $eventType, $abGroup, $walletConnected, $timestamp)`
        )
        .run({
          $id: crypto.randomUUID(),
          $bundleId: sanitizeText(bundleId, 80),
          $eventType: sanitizeText(eventType, 40),
          $abGroup: sanitizeText(abGroup, 40),
          $walletConnected: walletConnected ? 1 : 0,
          $timestamp: new Date().toISOString(),
        });
    } catch (err) {
      log.warn("analytics_write_failed", { err: String(err) });
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

  /** Checkout helper: record tx fee, loyalty purchase, receipt + social card */
  completePurchase(
    bundle: Bundle,
    sessionId: string,
    opts?: { walletConnected?: boolean }
  ) {
    this.trackMetrics(
      bundle.id,
      "conversion",
      bundle.abGroup,
      opts?.walletConnected ?? false
    );

    recordFee({
      kind: "tx",
      amountUsd: bundle.fees.txFeeAmount,
      bundleId: bundle.id,
      sessionId,
      note: `${FEES.TX_LABEL} on ${bundle.title}`,
    });

    const loyalty = recordPurchase(sessionId);
    const receipt = buildEmailReceipt(bundle, { sessionId });
    const social = buildSocialCard(bundle);

    log.info("purchase_completed", {
      bundleId: bundle.id,
      totalDueToday: bundle.fees.totalDueToday,
      sessionId,
    });

    return {
      success: true as const,
      message: "Bundle locked. Joy delivered. Treasury remains delightfully boring.",
      bundle,
      loyalty,
      receipt,
      social,
      treasury: Treasury.getTreasurySnapshot(),
    };
  },

  shareBundle(bundle: Bundle, sessionId: string) {
    const loyalty = recordShare(sessionId);
    return {
      social: buildSocialCard(bundle),
      loyalty,
    };
  },

  loyalty: Loyalty,
  treasury: Treasury,
  updateTreasury: Treasury.updateTreasury,
};

/** Convenience alias for micro-sweepers and external adapters */
export const engine = HyperBundleEngine;

export type { AbGroup, Bundle, HoldBalances, InventoryItem };
