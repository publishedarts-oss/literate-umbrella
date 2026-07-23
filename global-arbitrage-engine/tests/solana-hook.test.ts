import { describe, expect, test } from "bun:test";
import { TokenTransactionHook } from "../src/tokenTransactionHook";

describe("TokenTransactionHook", () => {
  test("returns not-found for bogus signature without throwing", async () => {
    const result = await TokenTransactionHook.verifyAndSweepTokenTx(
      "5".repeat(88),
      "So11111111111111111111111111111111111111112"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  }, 20_000);
});
