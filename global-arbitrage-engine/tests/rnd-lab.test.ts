import { describe, expect, test } from "bun:test";
import { AgenticRnDLab } from "../src/rnd-lab-agent";
import { HyperBundleEngine } from "../src/hyperbundle-engine";

describe("AgenticRnDLab", () => {
  test("discovery cycle returns scored opportunities", async () => {
    const results = await AgenticRnDLab.runDiscoveryCycle();
    expect(Array.isArray(results)).toBe(true);
    for (const row of results) {
      expect(row.confidence).toBeGreaterThan(0.65);
      expect(row.potentialMargin).toBeGreaterThan(0);
      expect(["bundle", "micro-sweep", "new-vertical", "monitor"]).toContain(
        row.suggestedAction
      );
    }
  });

  test("qualified finds may land in AGENTIC_ALPHA inventory", async () => {
    await AgenticRnDLab.runDiscoveryCycle();
    const inventory = HyperBundleEngine.listInventory(200);
    // Not guaranteed every run qualifies — just assert listInventory works post-cycle
    expect(Array.isArray(inventory)).toBe(true);
  });
});
