import { describe, expect, test } from "bun:test";
import { CasinoSecurityAgent } from "../src/casino-security-agent";

describe("CasinoSecurityAgent", () => {
  test("flags curl agents but allows under 0.70 threshold", () => {
    CasinoSecurityAgent.resetExposureWindow();
    const result = CasinoSecurityAgent.evaluateTransactionRisk(
      {
        walletAddress: "wallet_bot_1",
        ipAddress: "1.1.1.1",
        userAgent: "curl/8.0",
        transactionAmountBasis: 25,
      },
      "bet"
    );
    expect(result.allowed).toBe(true);
    expect(result.threatScore).toBeCloseTo(0.45, 2);
  });

  test("blocks automation + oversized wager patterns", () => {
    CasinoSecurityAgent.resetExposureWindow();
    const result = CasinoSecurityAgent.evaluateTransactionRisk(
      {
        walletAddress: "wallet_bot_2",
        ipAddress: "1.1.1.1",
        userAgent: "curl/8.0",
        transactionAmountBasis: 6000,
      },
      "bet"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("AUTOMATED_EXPLOIT_PATTERN_REJECTED");
    expect(result.threatScore).toBeGreaterThanOrEqual(0.7);
  });

  test("allows browser-like agents under size limits", () => {
    CasinoSecurityAgent.resetExposureWindow();
    const result = CasinoSecurityAgent.evaluateTransactionRisk(
      {
        walletAddress: "wallet_human_1",
        ipAddress: "2.2.2.2",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
        transactionAmountBasis: 50,
      },
      "bet"
    );
    expect(result.allowed).toBe(true);
    expect(result.threatScore).toBeLessThan(0.7);
  });
});
