import { Database } from "bun:sqlite";
import { LOYALTY } from "./config";
import { log } from "./lib/logger";
import type { AchievementBadge, HoldBalances, LoyaltyProfile } from "./types";

const db = new Database("arbitrage.db");

db.run(`
  CREATE TABLE IF NOT EXISTS loyalty_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT,
    visit_streak INTEGER DEFAULT 1,
    last_visit_day TEXT NOT NULL,
    shares_count INTEGER DEFAULT 0,
    purchases_count INTEGER DEFAULT 0,
    badges_json TEXT DEFAULT '[]',
    hold_flip REAL DEFAULT 0,
    hold_wfc REAL DEFAULT 0,
    hold_qc REAL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseBadges(raw: string): AchievementBadge[] {
  try {
    return JSON.parse(raw) as AchievementBadge[];
  } catch {
    return [];
  }
}

function unlockBadge(
  badges: AchievementBadge[],
  id: string,
  name: string,
  emoji: string,
  description: string
): AchievementBadge[] {
  if (badges.some((b) => b.id === id)) return badges;
  return [
    ...badges,
    {
      id,
      name,
      emoji,
      description,
      unlockedAt: new Date().toISOString(),
    },
  ];
}

function rowToProfile(row: any): LoyaltyProfile {
  return {
    sessionId: row.session_id,
    userId: row.user_id ?? undefined,
    visitStreak: row.visit_streak,
    lastVisitDay: row.last_visit_day,
    sharesCount: row.shares_count,
    purchasesCount: row.purchases_count,
    badges: parseBadges(row.badges_json),
    holdBalances: {
      FLIP: row.hold_flip,
      WFC: row.hold_wfc,
      QC: row.hold_qc,
    },
  };
}

export function touchLoyaltySession(
  sessionId: string,
  opts?: {
    userId?: string;
    holdBalances?: HoldBalances;
  }
): LoyaltyProfile {
  const today = todayKey();
  const existing = db
    .query(`SELECT * FROM loyalty_sessions WHERE session_id = $id`)
    .get({ $id: sessionId }) as any;

  if (!existing) {
    const badges = unlockBadge(
      [],
      "first_drop_in",
      "First Drop-In",
      "✨",
      "You peeked behind the curtain. Welcome to HyperBundle."
    );
    db.run(
      `INSERT INTO loyalty_sessions
       (session_id, user_id, visit_streak, last_visit_day, shares_count, purchases_count, badges_json, hold_flip, hold_wfc, hold_qc, updated_at)
       VALUES ($id, $userId, 1, $day, 0, 0, $badges, $flip, $wfc, $qc, $now)`,
      {
        $id: sessionId,
        $userId: opts?.userId ?? null,
        $day: today,
        $badges: JSON.stringify(badges),
        $flip: opts?.holdBalances?.FLIP ?? 0,
        $wfc: opts?.holdBalances?.WFC ?? 0,
        $qc: opts?.holdBalances?.QC ?? 0,
        $now: new Date().toISOString(),
      }
    );
    log.info("loyalty_session_created", { sessionId });
    return touchLoyaltySession(sessionId, opts);
  }

  let streak = existing.visit_streak;
  let badges = parseBadges(existing.badges_json);
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (existing.last_visit_day !== today) {
    streak = existing.last_visit_day === yesterdayKey ? streak + 1 : 1;
  }

  if (streak >= 3) {
    badges = unlockBadge(
      badges,
      "streak_spark",
      "Streak Spark",
      "🔥",
      "Three-day streak — your bundle radar is warming up."
    );
  }
  if (streak >= 7) {
    badges = unlockBadge(
      badges,
      "weekender",
      "Weekender",
      "🛸",
      "Seven days of curiosity. The marketplace notices."
    );
  }

  db.run(
    `UPDATE loyalty_sessions SET
      visit_streak = $streak,
      last_visit_day = $day,
      badges_json = $badges,
      user_id = COALESCE($userId, user_id),
      hold_flip = COALESCE($flip, hold_flip),
      hold_wfc = COALESCE($wfc, hold_wfc),
      hold_qc = COALESCE($qc, hold_qc),
      updated_at = $now
     WHERE session_id = $id`,
    {
      $id: sessionId,
      $streak: streak,
      $day: today,
      $badges: JSON.stringify(badges),
      $userId: opts?.userId ?? null,
      $flip: opts?.holdBalances?.FLIP ?? null,
      $wfc: opts?.holdBalances?.WFC ?? null,
      $qc: opts?.holdBalances?.QC ?? null,
      $now: new Date().toISOString(),
    }
  );

  return rowToProfile(
    db.query(`SELECT * FROM loyalty_sessions WHERE session_id = $id`).get({
      $id: sessionId,
    })
  );
}

export function recordShare(sessionId: string): LoyaltyProfile {
  const profile = touchLoyaltySession(sessionId);
  let badges = profile.badges;
  const shares = profile.sharesCount + 1;
  if (shares >= LOYALTY.SHARE_STREAK_THRESHOLD) {
    badges = unlockBadge(
      badges,
      "signal_booster",
      "Signal Booster",
      "📡",
      "You shared a bundle trio — quiet dominance loves word-of-mouth."
    );
  }
  db.run(
    `UPDATE loyalty_sessions SET shares_count = $shares, badges_json = $badges, updated_at = $now WHERE session_id = $id`,
    {
      $id: sessionId,
      $shares: shares,
      $badges: JSON.stringify(badges),
      $now: new Date().toISOString(),
    }
  );
  return touchLoyaltySession(sessionId);
}

export function recordPurchase(sessionId: string): LoyaltyProfile {
  const profile = touchLoyaltySession(sessionId);
  let badges = profile.badges;
  const purchases = profile.purchasesCount + 1;
  badges = unlockBadge(
    badges,
    "first_bundle",
    "First Bundle",
    "🎁",
    "You closed a HyperBundle. Treasury stays boring; joy does not."
  );
  if (purchases >= 5) {
    badges = unlockBadge(
      badges,
      "curator",
      "Curator",
      "🧭",
      "Five bundles deep — you're building a personal constellation."
    );
  }
  db.run(
    `UPDATE loyalty_sessions SET purchases_count = $purchases, badges_json = $badges, updated_at = $now WHERE session_id = $id`,
    {
      $id: sessionId,
      $purchases: purchases,
      $badges: JSON.stringify(badges),
      $now: new Date().toISOString(),
    }
  );
  return touchLoyaltySession(sessionId);
}

export function streakDiscountBonus(visitStreak: number): number {
  return Math.min(
    LOYALTY.STREAK_BONUS_CAP,
    Math.max(0, visitStreak - 1) * LOYALTY.STREAK_BONUS_PER_DAY
  );
}

export const Loyalty = {
  touchLoyaltySession,
  recordShare,
  recordPurchase,
  streakDiscountBonus,
};
