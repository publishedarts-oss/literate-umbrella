import { Database } from "bun:sqlite";
import { FEES, TREASURY_TARGETS } from "./config";
import { log } from "./lib/logger";
import type {
  FeeBreakdown,
  FeeLedgerEntry,
  TreasuryAsset,
  TreasurySnapshot,
} from "./types";

const db = new Database("arbitrage.db");

db.run(`
  CREATE TABLE IF NOT EXISTS fee_ledger (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    bundle_id TEXT,
    session_id TEXT,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS treasury_balances (
    asset TEXT PRIMARY KEY,
    amount_usd REAL NOT NULL
  );
`);

// Seed conservative treasury defaults if empty (demo)
const existing = db.query("SELECT COUNT(*) as c FROM treasury_balances").get() as {
  c: number;
};
if (existing.c === 0) {
  db.run(`INSERT INTO treasury_balances (asset, amount_usd) VALUES ('BTC', 60000)`);
  db.run(`INSERT INTO treasury_balances (asset, amount_usd) VALUES ('USDC', 30000)`);
  db.run(
    `INSERT INTO treasury_balances (asset, amount_usd) VALUES ('OPS_STABLE', 10000)`
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeFeeBreakdown(subtotal: number): FeeBreakdown {
  const txFeeAmount = round2(subtotal * FEES.TX_RATE);
  const aumDailyProRata = round2((subtotal * FEES.AUM_ANNUAL_RATE) / 365);
  return {
    subtotal: round2(subtotal),
    txFeeRate: FEES.TX_RATE,
    txFeeAmount,
    aumAnnualRate: FEES.AUM_ANNUAL_RATE,
    aumDailyProRata,
    totalDueToday: round2(subtotal + txFeeAmount),
    labels: {
      tx: FEES.TX_LABEL,
      aum: FEES.AUM_LABEL,
    },
  };
}

/** Pro-rate annual AUM fee for an arbitrary day count (e.g. mid-year join). */
export function prorateAnnualAumFee(
  aumUsd: number,
  daysRemainingInYear: number
): number {
  const days = Math.min(365, Math.max(0, Math.floor(daysRemainingInYear)));
  return round2(aumUsd * FEES.AUM_ANNUAL_RATE * (days / 365));
}

export function recordFee(entry: Omit<FeeLedgerEntry, "id" | "createdAt">): FeeLedgerEntry {
  const row: FeeLedgerEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };

  db.run(
    `INSERT INTO fee_ledger (id, kind, amount_usd, bundle_id, session_id, note, created_at)
     VALUES ($id, $kind, $amount, $bundleId, $sessionId, $note, $createdAt)`,
    {
      $id: row.id,
      $kind: row.kind,
      $amount: row.amountUsd,
      $bundleId: row.bundleId ?? null,
      $sessionId: row.sessionId ?? null,
      $note: row.note,
      $createdAt: row.createdAt,
    }
  );

  // Park collected fees into USDC sleeve by default (treasury safety)
  db.run(
    `UPDATE treasury_balances SET amount_usd = amount_usd + $amount WHERE asset = 'USDC'`,
    { $amount: row.amountUsd }
  );

  log.info("fee_recorded", {
    kind: row.kind,
    amountUsd: row.amountUsd,
    bundleId: row.bundleId,
  });

  return row;
}

export function getTreasurySnapshot(): TreasurySnapshot {
  const rows = db
    .query(`SELECT asset, amount_usd as amountUsd FROM treasury_balances`)
    .all() as { asset: TreasuryAsset; amountUsd: number }[];

  const totalUsd = rows.reduce((sum, r) => sum + r.amountUsd, 0) || 1;
  const positions = rows.map((r) => ({
    asset: r.asset,
    amountUsd: round2(r.amountUsd),
    share: round2(r.amountUsd / totalUsd),
  }));

  const targets: Record<TreasuryAsset, number> = {
    BTC: TREASURY_TARGETS.BTC,
    USDC: TREASURY_TARGETS.USDC,
    OPS_STABLE: TREASURY_TARGETS.OPS_STABLE,
  };

  const suggestions: string[] = [];
  for (const p of positions) {
    const target = targets[p.asset];
    const drift = p.share - target;
    if (Math.abs(drift) > TREASURY_TARGETS.DRIFT_TOLERANCE) {
      const action = drift > 0 ? "trim" : "top-up";
      const usd = round2(Math.abs(drift) * totalUsd);
      suggestions.push(
        `${action.toUpperCase()} ${p.asset}: move ~$${usd.toLocaleString()} toward ${Math.round(target * 100)}% target (BTC/USDC-heavy safety band).`
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Treasury sleeves are inside the BTC/USDC safety band. No rebalance needed — stay boring, stay solvent."
    );
  }

  return {
    totalUsd: round2(totalUsd),
    positions,
    suggestions,
    healthy: suggestions.length === 1 && suggestions[0].includes("No rebalance"),
  };
}

export const Treasury = {
  computeFeeBreakdown,
  prorateAnnualAumFee,
  recordFee,
  getTreasurySnapshot,
};
