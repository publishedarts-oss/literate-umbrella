import { queryClient } from "./micro-margin-agent";
import { FEES } from "./config";
import { log } from "./lib/logger";
import { sanitizeSector, sanitizeText } from "./lib/sanitize";

export type LicenseTier = "starter" | "pro" | "enterprise" | "vertical";

export interface License {
  id: string;
  licensee: string;
  tier: LicenseTier;
  sectors: string[];
  monthlyFee: number;
  revenueShare: number;
  active: boolean;
  issuedAt: string;
  expiresAt: string;
  customConfig?: Record<string, unknown>;
}

queryClient.run(`
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    licensee TEXT NOT NULL,
    tier TEXT NOT NULL,
    sectors_json TEXT NOT NULL,
    monthly_fee REAL NOT NULL,
    revenue_share REAL NOT NULL,
    active INTEGER DEFAULT 1,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    custom_config_json TEXT
  );
`);

export class LicensingSystem {
  static readonly BASE_PRICING = {
    starter: { monthly: 499, revenueShare: 0.15 },
    pro: { monthly: 1499, revenueShare: 0.1 },
    enterprise: { monthly: 4999, revenueShare: 0.08 },
    vertical: { monthly: 2999, revenueShare: 0.12 },
  } as const;

  /**
   * Initializes white-labeled and co-branded instances natively.
   */
  async issueLicense(
    licensee: string,
    tier: LicenseTier,
    sectors: string[] = []
  ): Promise<License> {
    const safeTier = (
      ["starter", "pro", "enterprise", "vertical"].includes(tier)
        ? tier
        : "enterprise"
    ) as LicenseTier;
    const pricing = LicensingSystem.BASE_PRICING[safeTier];
    const licenseId = `lic_${crypto.randomUUID().slice(0, 8)}`;
    const cleanLicensee = sanitizeText(licensee, 120) || "Anonymous Group";
    const cleanSectors =
      sectors.length > 0
        ? sectors.map((s) => sanitizeSector(s).toUpperCase())
        : ["GENERAL"];

    const license: License = {
      id: licenseId,
      licensee: cleanLicensee,
      tier: safeTier,
      sectors: cleanSectors,
      monthlyFee: pricing.monthly,
      revenueShare: pricing.revenueShare,
      active: true,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      customConfig: {
        allowedMicroSweeps: true,
        branding:
          safeTier === "enterprise" ? "white-label" : "co-branded",
      },
    };

    try {
      queryClient
        .prepare(
          `INSERT INTO licenses
           (id, licensee, tier, sectors_json, monthly_fee, revenue_share, active, issued_at, expires_at, custom_config_json)
           VALUES ($id, $licensee, $tier, $sectors, $fee, $share, 1, $issued, $expires, $config)`
        )
        .run({
          $id: license.id,
          $licensee: license.licensee,
          $tier: license.tier,
          $sectors: JSON.stringify(license.sectors),
          $fee: license.monthlyFee,
          $share: license.revenueShare,
          $issued: license.issuedAt,
          $expires: license.expiresAt,
          $config: JSON.stringify(license.customConfig ?? {}),
        });

      // Upfront setup fee lands in treasury ledger for transparency
      queryClient
        .prepare(
          `INSERT INTO treasury_ledger
           (id, fees_collected, daily_slice, transaction_count, asset_type, timestamp)
           VALUES ($id, $fees, $slice, $count, $asset, $timestamp)`
        )
        .run({
          $id: crypto.randomUUID(),
          $fees: pricing.monthly,
          $slice: (pricing.monthly * FEES.AUM_ANNUAL_RATE) / 365,
          $count: 1,
          $asset: `SETUP_${safeTier.toUpperCase()}`,
          $timestamp: new Date().toISOString(),
        });

      console.log(
        `🔑 [LICENSING] Clean instance generated for ${cleanLicensee} under lease ID: ${licenseId}`
      );
      log.info("license_issued", {
        id: licenseId,
        licensee: cleanLicensee,
        tier: safeTier,
      });
    } catch (err) {
      console.error(
        "Failed to commit initialization license audit matrix:",
        err
      );
      log.error("license_issue_failed", { err: String(err) });
    }

    return license;
  }

  /**
   * Active license nodes for dashboard cards (DB + seed fallbacks).
   */
  async getAllLicenses(
    fallbackLicensee: string = "Acme Global Markets"
  ): Promise<License[]> {
    const rows = queryClient
      .prepare(
        `SELECT id, licensee, tier, sectors_json, monthly_fee, revenue_share,
                active, issued_at, expires_at, custom_config_json
         FROM licenses WHERE active = 1 ORDER BY issued_at DESC`
      )
      .all() as any[];

    const fromDb: License[] = rows.map((r) => ({
      id: r.id,
      licensee: r.licensee,
      tier: r.tier,
      sectors: JSON.parse(r.sectors_json),
      monthlyFee: r.monthly_fee,
      revenueShare: r.revenue_share,
      active: Boolean(r.active),
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      customConfig: r.custom_config_json
        ? JSON.parse(r.custom_config_json)
        : undefined,
    }));

    if (fromDb.length > 0) return fromDb;

    return [
      {
        id: "lic_de82fa11",
        licensee: fallbackLicensee,
        tier: "enterprise",
        sectors: ["REALESTATE", "PERISHABLES", "AGENTIC_ALPHA"],
        monthlyFee: 4999,
        revenueShare: 0.08,
        active: true,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000_000).toISOString(),
        customConfig: { branding: "white-label" },
      },
      {
        id: "lic_99f2a01b",
        licensee: "Delta Logistics Alpha",
        tier: "vertical",
        sectors: ["AIRLINES"],
        monthlyFee: 2999,
        revenueShare: 0.12,
        active: true,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 500_000_000).toISOString(),
        customConfig: { branding: "co-branded" },
      },
    ];
  }
}

export const licensingSystem = new LicensingSystem();
