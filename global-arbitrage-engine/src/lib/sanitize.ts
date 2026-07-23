/** Lightweight input sanitization for titles, sectors, and free-text fields */

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeText(input: unknown, maxLen = 200): string {
  if (typeof input !== "string") return "";
  return input.replace(CONTROL_CHARS, "").trim().slice(0, maxLen);
}

export function sanitizeSector(input: unknown): string {
  const cleaned = sanitizeText(input, 64);
  return cleaned.replace(/[^a-zA-Z0-9 _-]/g, "") || "General";
}

export function sanitizeSlug(input: unknown): string {
  return sanitizeText(input, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function sanitizeNumber(input: unknown, fallback = 0): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function assertNonEmptyArray<T>(
  value: unknown,
  label: string
): asserts value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid ${label}: expected a non-empty array`);
  }
}
