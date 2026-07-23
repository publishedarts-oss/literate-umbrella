/** CSP-ready security headers for HTML / API responses */

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function applySecurityHeaders(
  setHeader: (key: string, value: string) => void
) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    setHeader(key, value);
  }
}
