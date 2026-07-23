import { queryClient } from "./micro-margin-agent";
import { engine } from "./hyperbundle-engine";
import { FEES } from "./config";
import { log } from "./lib/logger";
import { sanitizeNumber, sanitizeText } from "./lib/sanitize";

export interface PredictionMarket {
  marketId: string;
  targetLotId: string;
  question: string;
  yesPoolSize: number; // QC/FLIP token units
  noPoolSize: number;
  isResolved: boolean;
  finalOutcome?: "YES" | "NO";
}

export class GamingPredictionAgent {
  /**
   * Places a binary wager on an internal marketplace transaction outcome.
   * Charges a standard platform processing fee on entry.
   */
  static placeWager(
    market: PredictionMarket,
    wagerAmount: number,
    prediction: "YES" | "NO"
  ) {
    if (market.isResolved) {
      throw new Error("Market already resolved — no new wagers accepted.");
    }

    const amount = sanitizeNumber(wagerAmount);
    if (amount <= 0) {
      throw new Error("Wager amount must be positive.");
    }

    console.log(
      `🎰 [VIRTUAL VEGAS] Processing wager of ${amount} QC on: "${sanitizeText(market.question, 160)}"`
    );

    // 3.333% platform fee upfront on gaming volume
    const gamingTax = amount * FEES.TX_RATE;
    const netWager = amount - gamingTax;

    if (prediction === "YES") {
      market.yesPoolSize += netWager;
    } else {
      market.noPoolSize += netWager;
    }

    queryClient
      .prepare(
        `INSERT INTO treasury_ledger
         (id, fees_collected, daily_slice, transaction_count, asset_type, timestamp)
         VALUES ($id, $fees, $slice, $count, $asset, $timestamp)`
      )
      .run({
        $id: crypto.randomUUID(),
        $fees: gamingTax,
        $slice: 0,
        $count: 1,
        $asset: "GAMING_FEES_QC",
        $timestamp: new Date().toISOString(),
      });

    // Park gaming tax into USDC sleeve (demo USD-notional)
    engine.updateTreasury(0, gamingTax);

    log.info("vegas_wager_placed", {
      marketId: market.marketId,
      prediction,
      gamingTax,
      netWager,
    });

    const total = market.yesPoolSize + market.noPoolSize || 1;

    return {
      netWagerAdded: netWager,
      currentYesPool: market.yesPoolSize,
      currentNoPool: market.noPoolSize,
      impliedOddsYes: `${((market.yesPoolSize / total) * 100).toFixed(1)}%`,
      gamingTax,
    };
  }

  /**
   * Settles the prediction market based on confirmed transaction metrics.
   */
  static resolveMarket(market: PredictionMarket, outcome: "YES" | "NO") {
    market.isResolved = true;
    market.finalOutcome = outcome;
    const totalPool = market.yesPoolSize + market.noPoolSize;

    console.log(
      `🏁 [MARKET RESOLVED] Result: ${outcome}. Distributing total pool of ${totalPool.toFixed(2)} QC to winners.`
    );
    log.info("vegas_market_resolved", {
      marketId: market.marketId,
      outcome,
      totalPool,
    });

    return {
      marketId: market.marketId,
      status: "settled" as const,
      poolDistributed: totalPool,
      finalOutcome: outcome,
    };
  }
}
