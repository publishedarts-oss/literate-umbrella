import { queryClient } from "./micro-margin-agent";
import { log } from "./lib/logger";
import { sanitizeNumber, sanitizeText } from "./lib/sanitize";

export interface SecurityContext {
  walletAddress: string;
  ipAddress: string;
  userAgent: string;
  transactionAmountBasis: number;
}

queryClient.run(`
  CREATE TABLE IF NOT EXISTS risk_quarantine_logs (
    id TEXT PRIMARY KEY,
    flagged_target TEXT,
    violation_type TEXT,
    severity REAL,
    timestamp TEXT
  );
`);

export class CasinoSecurityAgent {
  private static globalCircuitBreakerActive = false;
  private static totalHouseExposureUSD = 0;
  private static readonly MAX_ALLOWED_HOUSE_EXPOSURE_60S = 25_000;

  /**
   * Evaluates transaction/wager behavior before execution.
   * Flags high-velocity scripts, flash-loan style sizes, and drain patterns.
   */
  static evaluateTransactionRisk(
    context: SecurityContext,
    _actionType: "bet" | "flash_buy" | "withdrawal"
  ): { allowed: boolean; threatScore: number; reason?: string } {
    if (this.globalCircuitBreakerActive) {
      return {
        allowed: false,
        threatScore: 1.0,
        reason: "GLOBAL_CIRCUIT_BREAKER_ACTIVE_HOUSE_LOCKED",
      };
    }

    let threatScore = 0.0;
    const ua = context.userAgent || "";

    // 1. Non-human velocity / automation signatures
    if (
      !ua ||
      ua.includes("Axios") ||
      ua.includes("curl") ||
      ua.includes("node-fetch") ||
      ua.includes("Bun/")
    ) {
      threatScore += 0.45;
      console.log(
        `🚨 [SECURITY DETECT] Non-browser automated tool signature found.`
      );
    }

    // 2. High-volume anomaly anchoring
    const amount = sanitizeNumber(context.transactionAmountBasis);
    if (amount > 5000) {
      threatScore += 0.35;
    }

    // 3. House over-exposure protector
    this.totalHouseExposureUSD += amount;
    if (this.totalHouseExposureUSD >= this.MAX_ALLOWED_HOUSE_EXPOSURE_60S) {
      this.globalCircuitBreakerActive = true;
      this.logViolation(
        context.walletAddress,
        "EXPOSURE_CEILING_BREACHED",
        1.0
      );
      return {
        allowed: false,
        threatScore: 1.0,
        reason: "RISK_CAP_EXCEEDED_HOUSE_STOPS_ACTIVATED",
      };
    }

    // 4. Vegas barrier — quarantine high threat scores
    if (threatScore >= 0.7) {
      this.logViolation(
        context.walletAddress,
        "BOT_EXPLOIT_PATTERN_MATCH",
        threatScore
      );
      console.warn(
        `🔒 [ANTI-EXPLOIT] High threat signature (${threatScore}). Quarantining transaction.`
      );
      return {
        allowed: false,
        threatScore,
        reason: "AUTOMATED_EXPLOIT_PATTERN_REJECTED",
      };
    }

    return { allowed: true, threatScore };
  }

  private static logViolation(target: string, type: string, score: number) {
    try {
      queryClient
        .prepare(
          `INSERT INTO risk_quarantine_logs
           (id, flagged_target, violation_type, severity, timestamp)
           VALUES ($id, $target, $type, $score, $timestamp)`
        )
        .run({
          $id: crypto.randomUUID(),
          $target: sanitizeText(target, 120) || "unknown",
          $type: type,
          $score: score,
          $timestamp: new Date().toISOString(),
        });

      queryClient
        .prepare(
          `INSERT INTO treasury_ledger
           (id, fees_collected, daily_slice, transaction_count, asset_type, timestamp)
           VALUES ($id, 0, 0, 1, $asset, $timestamp)`
        )
        .run({
          $id: crypto.randomUUID(),
          $asset: `SECURITY_LOCK_${type}`,
          $timestamp: new Date().toISOString(),
        });

      log.warn("casino_security_violation", { target, type, score });
    } catch (err) {
      console.error("Failed to commit audit logging token:", err);
    }
  }

  /** Resets exposure window (cron every 60s). */
  static resetExposureWindow() {
    this.totalHouseExposureUSD = 0;
    if (this.globalCircuitBreakerActive) {
      this.globalCircuitBreakerActive = false;
      console.log(
        "🔄 [CASINO SECURITY] Risk metrics normalized. Circuit breaker reset."
      );
      log.info("casino_circuit_breaker_reset");
    }
  }

  static recentViolations(limit = 5) {
    return queryClient
      .prepare(
        `SELECT id, flagged_target, violation_type, severity, timestamp
         FROM risk_quarantine_logs ORDER BY timestamp DESC LIMIT ?`
      )
      .all(limit);
  }
}
