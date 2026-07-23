import { describe, expect, test } from "bun:test";
import { licensingSystem } from "../src/licensing-module";

describe("LicensingSystem", () => {
  test("issues an enterprise license with setup fee audit", async () => {
    const license = await licensingSystem.issueLicense(
      "Test Partner Co",
      "enterprise",
      ["REALESTATE", "AIRLINES"]
    );
    expect(license.id.startsWith("lic_")).toBe(true);
    expect(license.monthlyFee).toBe(4999);
    expect(license.revenueShare).toBe(0.08);
    expect(license.customConfig?.branding).toBe("white-label");
  });

  test("lists active licenses after issuance", async () => {
    const all = await licensingSystem.getAllLicenses();
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].licensee.length).toBeGreaterThan(0);
  });
});
