import { describe, expect, test } from "bun:test";
import { FEES } from "../src/config";
import { scorePairMatch } from "../src/hyperbundle-engine";
import {
  computeFeeBreakdown,
  prorateAnnualAumFee,
} from "../src/treasury";
import type { InventoryItem } from "../src/types";

describe("HyperBundle transparent fees", () => {
  test("applies 3.333% transaction fee", () => {
    const fees = computeFeeBreakdown(1000);
    expect(fees.txFeeRate).toBe(FEES.TX_RATE);
    expect(fees.txFeeAmount).toBe(33.33);
    expect(fees.totalDueToday).toBe(1033.33);
    expect(fees.labels.tx).toContain("3.333%");
  });

  test("pro-rates 1.666% annual AUM by remaining days", () => {
    const fullYear = prorateAnnualAumFee(100_000, 365);
    expect(fullYear).toBe(1666);

    const halfYear = prorateAnnualAumFee(100_000, 182);
    expect(halfYear).toBeCloseTo(830.72, 1);
  });

  test("daily AUM display is annual / 365", () => {
    const fees = computeFeeBreakdown(3650);
    expect(fees.aumDailyProRata).toBeCloseTo((3650 * FEES.AUM_ANNUAL_RATE) / 365, 2);
  });
});

describe("smart pairing", () => {
  const lot: InventoryItem = {
    id: "a",
    sector: "RealEstate",
    title: "Mountain Lot",
    wholesalePrice: 1000,
    meta: { retailEstimate: 3000 },
  };
  const wagyu: InventoryItem = {
    id: "b",
    sector: "Perishables",
    title: "Wagyu Box",
    wholesalePrice: 100,
    meta: { retailEstimate: 400 },
  };
  const otherLot: InventoryItem = {
    id: "c",
    sector: "RealEstate",
    title: "Valley Lot",
    wholesalePrice: 1100,
    meta: { retailEstimate: 3100 },
  };

  test("scores complementary sectors higher than same-sector pairs", () => {
    const cross = scorePairMatch(lot, wagyu);
    const same = scorePairMatch(lot, otherLot);
    expect(cross.score).toBeGreaterThan(same.score);
    expect(cross.reason).toContain("RealEstate");
  });
});
