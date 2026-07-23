import { Connection, clusterApiUrl } from "@solana/web3.js";
import { Database } from "bun:sqlite";
import { engine } from "./hyperbundle-engine";
import { log } from "./lib/logger";
import { sanitizeText } from "./lib/sanitize";
import { MicroMarginSweeper } from "./microMarginSweeper";

const solanaConnection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Switch to "mainnet-beta" later
const ledgerDb = new Database("arbitrage.db");

ledgerDb.run(`
  CREATE TABLE IF NOT EXISTS treasury_ledger (
    id TEXT PRIMARY KEY,
    fees_collected REAL DEFAULT 0,
    daily_slice REAL DEFAULT 0,
    asset_type TEXT DEFAULT 'usdc',
    transaction_count INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL
  );
`);

export class TokenTransactionHook {
  static async verifyAndSweepTokenTx(
    txSignature: string,
    expectedMintAddress: string
  ) {
    const signature = sanitizeText(txSignature, 128);
    const mint = sanitizeText(expectedMintAddress, 64);
    console.log(`🔎 [SOLANA HOOK] Validating ${signature.slice(0, 12)}...`);

    try {
      const txData = await solanaConnection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (!txData?.meta) {
        return {
          success: false as const,
          error: "Transaction not found or not parsed.",
        };
      }

      let totalTokensTransferred = 0;
      const postBalances = txData.meta.postTokenBalances || [];
      const preBalances = txData.meta.preTokenBalances || [];

      const preByAccount = new Map(
        preBalances
          .filter((b) => b.mint === mint)
          .map((b) => [`${b.accountIndex}`, b.uiTokenAmount?.uiAmount || 0])
      );

      for (const balance of postBalances) {
        if (balance.mint !== mint) continue;
        const postAmt = balance.uiTokenAmount?.uiAmount || 0;
        const preAmt = preByAccount.get(`${balance.accountIndex}`) || 0;
        totalTokensTransferred += Math.abs(postAmt - preAmt);
      }

      if (totalTokensTransferred === 0) {
        for (const balance of postBalances) {
          if (balance.mint === mint) {
            totalTokensTransferred += balance.uiTokenAmount?.uiAmount || 0;
          }
        }
      }

      if (totalTokensTransferred === 0 && txData.meta.innerInstructions) {
        console.log("🔍 Checking inner instructions for token moves...");
        // Add deeper parsing if required in future
      }

      if (totalTokensTransferred <= 0) {
        return {
          success: false as const,
          error: "No relevant token transfer detected.",
        };
      }

      console.log(
        `✅ [SOLANA HOOK] Captured ${totalTokensTransferred} tokens from ${signature}`
      );

      // Apply micro-margin (3.333% tx + daily AUM slice)
      const sweep = MicroMarginSweeper.processMicroTransaction(
        totalTokensTransferred,
        "usdc"
      );

      ledgerDb
        .prepare(
          `INSERT INTO treasury_ledger
           (id, fees_collected, daily_slice, asset_type, transaction_count, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          crypto.randomUUID(),
          sweep.feeCollected,
          sweep.dailySlice,
          "usdc",
          1,
          new Date().toISOString()
        );

      // Update main treasury USDC sleeve
      engine.updateTreasury(0, sweep.totalToTreasury);

      log.info("solana_hook_swept", {
        signature,
        tokenVolume: totalTokensTransferred,
        treasuryContribution: sweep.totalToTreasury,
      });

      return {
        success: true as const,
        signature,
        tokenVolume: totalTokensTransferred,
        treasuryContribution: sweep.totalToTreasury,
      };
    } catch (err: any) {
      console.error("❌ [SOLANA HOOK ERROR]", err?.message || err);
      log.error("solana_hook_failed", { err: String(err?.message || err) });
      return { success: false as const, error: err?.message || String(err) };
    }
  }
}
