import { describe, expect, test } from "bun:test";
import { FEES } from "../src/config";
import { MicroMarginSweeper } from "../src/microMarginSweeper";

describe("MicroMarginSweeper", () => {
  test("applies 3.333% + daily AUM slice on a single micro tx", () => {
    const result = MicroMarginSweeper.processMicroTransaction(100, "usdc");
    expect(result.feeCollected).toBeCloseTo(100 * FEES.TX_RATE, 6);
    expect(result.dailySlice).toBeCloseTo(100 * (FEES.AUM_ANNUAL_RATE / 365), 8);
    expect(result.totalToTreasury).toBeCloseTo(
      result.feeCollected + result.dailySlice,
      8
    );
  });

  test("rejects non-positive amounts", () => {
    expect(() => MicroMarginSweeper.processMicroTransaction(0)).toThrow();
    expect(() => MicroMarginSweeper.processMicroTransaction(-1)).toThrow();
  });

  test("sweeps a small batch into treasury ledger", async () => {
    const total = await MicroMarginSweeper.sweepGlobalVolume(
      [{ amount: 1 }, { amount: 2 }, { amount: 3 }],
      "usdc"
    );
    expect(total).toBeGreaterThan(0);
    const recent = MicroMarginSweeper.recentSweeps(1);
    expect(recent[0]?.transactionCount).toBe(3);
  });
});
