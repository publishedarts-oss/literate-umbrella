import { describe, expect, test } from "bun:test";
import {
  GamingPredictionAgent,
  type PredictionMarket,
} from "../src/gaming-prediction-agent";
import { TreasuryInvestmentAgent } from "../src/treasury-investment-agent";

describe("GamingPredictionAgent", () => {
  test("places a YES wager and takes 3.333% gaming tax", () => {
    const market: PredictionMarket = {
      marketId: "pred_test",
      targetLotId: "lot_1",
      question: "Will this test resolve YES?",
      yesPoolSize: 100,
      noPoolSize: 100,
      isResolved: false,
    };
    const report = GamingPredictionAgent.placeWager(market, 100, "YES");
    expect(report.gamingTax).toBeCloseTo(3.333, 3);
    expect(report.netWagerAdded).toBeCloseTo(96.667, 3);
    expect(market.yesPoolSize).toBeCloseTo(196.667, 3);
  });

  test("resolves market and marks settled", () => {
    const market: PredictionMarket = {
      marketId: "pred_test_2",
      targetLotId: "lot_2",
      question: "Settle me",
      yesPoolSize: 50,
      noPoolSize: 50,
      isResolved: false,
    };
    const result = GamingPredictionAgent.resolveMarket(market, "NO");
    expect(result.status).toBe("settled");
    expect(market.isResolved).toBe(true);
    expect(market.finalOutcome).toBe("NO");
  });
});

describe("TreasuryInvestmentAgent", () => {
  test("pays compute overhead from USDC reserves", () => {
    const reserves = {
      usdcBalance: 1000,
      btcBalance: 1,
      fiatCashBalance: 100,
    };
    const summary = TreasuryInvestmentAgent.optimizeAndPayOverhead(reserves, 150);
    expect(summary.invoiceSettled).toBe(true);
    expect(summary.remainingUsdc).toBe(850);
  });
});
