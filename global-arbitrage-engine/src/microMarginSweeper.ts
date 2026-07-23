import { Database } from "bun:sqlite";
import { z } from "zod";
import { FEES } from "./config";
import { engine } from "./hyperbundle-engine";
import { log } from "./lib/logger";

const queryClient = new Database("arbitrage.db");

export { queryClient };

queryClient.run(`
  CREATE TABLE IF NOT EXISTS treasury_ledger (
    id TEXT PRIMARY KEY,
    fees_collected REAL DEFAULT 0,
    daily_slice REAL DEFAULT 0,
    asset_type TEXT DEFAULT 'usdc',
    transaction_count INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL
  );
`);

const MicroTransactionSchema = z.object({
  amount: z.number().positive(),
});

const SweepBatchSchema = z.object({
  transactions: z
    .array(z.object({ amount: z.number().positive() }))
    .min(1)
    .max(100_000),
  assetType: z.enum(["usdc", "btc", "points"]).default("usdc"),
});

export type MicroAssetType = "usdc" | "btc" | "points";

export class MicroMarginSweeper {
  static readonly FEES = {
    TRANSACTION: FEES.TX_RATE, // 3.333%
    ANNUAL_PRORATED_DAILY: FEES.AUM_ANNUAL_RATE / 365, // 1.666% / 365
  };

  static processMicroTransaction(
    amount: number,
    assetType: MicroAssetType = "usdc"
  ) {
    const validated = MicroTransactionSchema.parse({ amount });

    const fee = validated.amount * this.FEES.TRANSACTION;
    const dailySlice = validated.amount * this.FEES.ANNUAL_PRORATED_DAILY;

    return {
      feeCollected: fee,
      dailySlice,
      totalToTreasury: fee + dailySlice,
      assetType,
    };
  }

  static async sweepGlobalVolume(
    transactions: Array<{ amount: number }>,
    assetType: MicroAssetType = "usdc"
  ) {
    const parsed = SweepBatchSchema.parse({ transactions, assetType });

    let totalCollected = 0;
    let totalDailySlice = 0;
    const count = parsed.transactions.length;

    for (const tx of parsed.transactions) {
      const result = this.processMicroTransaction(tx.amount, parsed.assetType);
      totalCollected += result.feeCollected;
      totalDailySlice += result.dailySlice;
    }

    const totalToTreasury = totalCollected + totalDailySlice;

    try {
      const stmt = queryClient.prepare(`
        INSERT INTO treasury_ledger
        (id, fees_collected, daily_slice, asset_type, transaction_count, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        crypto.randomUUID(),
        totalCollected,
        totalDailySlice,
        parsed.assetType.toUpperCase(),
        count,
        new Date().toISOString()
      );

      // Sync with main treasury (points park into USDC sleeve for demo solvency)
      const btcCredit = parsed.assetType === "btc" ? totalToTreasury : 0;
      const usdcCredit =
        parsed.assetType === "usdc" || parsed.assetType === "points"
          ? totalToTreasury
          : 0;
      engine.updateTreasury(btcCredit, usdcCredit);

      log.info("micro_sweeper_captured", {
        totalToTreasury,
        count,
        assetType: parsed.assetType.toUpperCase(),
      });
      console.log(
        `✨ [MICRO-SWEEPER] Captured $${totalToTreasury.toFixed(6)} from ${count} micro-transactions (${parsed.assetType.toUpperCase()})`
      );
    } catch (err) {
      log.error("micro_sweeper_storage_failed", { err: String(err) });
      console.error("Treasury sweep storage issue:", err);
    }

    return totalToTreasury;
  }

  static recentSweeps(limit = 20) {
    return queryClient
      .prepare(
        `SELECT id, fees_collected as feesCollected, daily_slice as dailySlice,
                asset_type as assetType, transaction_count as transactionCount, timestamp
         FROM treasury_ledger ORDER BY timestamp DESC LIMIT ?`
      )
      .all(limit);
  }
}

// Standalone high-velocity stress test
if (import.meta.main) {
  const highVolumeMockBatch = Array.from({ length: 10_000 }, () => ({
    amount: Math.random() * 5 + 0.01,
  }));

  console.log("⚡ Running High-Velocity Micro-Margin Stress Test...");
  const start = performance.now();

  MicroMarginSweeper.sweepGlobalVolume(highVolumeMockBatch).then((total) => {
    const duration = performance.now() - start;
    console.log(
      `🏆 Test complete in ${duration.toFixed(2)}ms → Treasury boosted by $${total.toFixed(6)}`
    );
    console.log("Treasury snapshot:", engine.treasury.getTreasurySnapshot());
  });
}
