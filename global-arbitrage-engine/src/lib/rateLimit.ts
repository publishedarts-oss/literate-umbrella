import { RATE_LIMITS } from "../config";
import { log } from "./logger";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * In-memory rate limiter stub — swap for Redis/Upstash in production.
 */
export function checkRateLimit(
  key: string,
  max = RATE_LIMITS.DEFAULT_MAX,
  windowMs = RATE_LIMITS.DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    log.warn("rate_limit_hit", { key, max });
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: max - existing.count,
    retryAfterMs: 0,
  };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
