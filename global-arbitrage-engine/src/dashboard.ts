import { Hono } from "hono";
import { APP, FEES } from "./config";
import { applySecurityHeaders } from "./lib/securityHeaders";
import { queryClient } from "./microMarginSweeper";
import treasuryDashboard from "./treasuryDashboard";

const dashboard = new Hono();

const DASHBOARD_CSP =
  "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://unpkg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

dashboard.get("/", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  c.header("Content-Security-Policy", DASHBOARD_CSP);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP.NAME} · Treasury Live</title>
  <script src="https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js"></script>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #6b5a3e;
      --paper: #fffaf3;
      --panel: #f7f1e6;
      --line: #e8dcc8;
      --good: #2f6f4e;
      --accent: #c45c26;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top right, #fff6e8, transparent 40%),
        linear-gradient(180deg, var(--paper), #efe7d8);
      color: var(--ink);
      padding: 24px 16px 48px;
      margin: 0;
    }
    .container { max-width: 860px; margin: 0 auto; }
    .live {
      background: rgba(255,255,255,0.78);
      padding: 24px;
      border-radius: 16px;
      margin: 20px 0;
      border: 1px solid var(--line);
      box-shadow: 0 12px 28px rgba(90, 60, 20, 0.06);
    }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: 0.06em;
      padding: 12px 10px;
      border-bottom: 2px solid var(--line);
    }
    td { padding: 14px 10px; border-bottom: 1px solid var(--line); font-size: 0.95rem; }
    tr:last-child td { border-bottom: none; }
    .positive { color: var(--good); font-weight: bold; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
    h1 {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
    }
    .pulse {
      width: 10px;
      height: 10px;
      background: var(--good);
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(47, 111, 78, 0.55);
      display: inline-block;
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.25); opacity: 0.7; }
    }
    .sub {
      color: var(--muted);
      margin: 8px 0 0;
      max-width: 36rem;
    }
    .chip {
      display: inline-block;
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--ink);
    }
    a.nav {
      color: var(--accent);
      font-size: 0.9rem;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="pulse" aria-hidden="true"></span> ${APP.NAME} Treasury · Live Feed</h1>
    <p class="sub">${APP.TAGLINE} Transparent ${FEES.TX_LABEL} + ${FEES.AUM_LABEL}. <a class="nav" href="/dashboard/treasury">Full sleeve view →</a></p>
    <div id="treasury-content" class="live" hx-get="/dashboard/data" hx-trigger="load">
      <p style="color: var(--muted);">Synchronizing ledger matrices...</p>
    </div>
  </div>

  <script>
    setInterval(() => {
      if (window.htmx) {
        htmx.ajax('GET', '/dashboard/data', { target: '#treasury-content' });
      }
    }, 3000);
  </script>
</body>
</html>`;
  return c.html(html);
});

dashboard.get("/data", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  c.header("Content-Security-Policy", DASHBOARD_CSP);
  c.header("Cache-Control", "no-store");

  const ledger = queryClient
    .prepare(
      "SELECT * FROM treasury_ledger ORDER BY timestamp DESC LIMIT 15"
    )
    .all() as Array<{
    fees_collected?: number;
    daily_slice?: number;
    transaction_count?: number;
    asset_type?: string;
    timestamp?: string;
  }>;

  if (!ledger || ledger.length === 0) {
    return c.html(
      `<p style="color: #6b5a3e; text-align: center; padding: 20px;">No transaction history available. Waiting for incoming volume pipelines...</p>`
    );
  }

  const totalCaptured = ledger.reduce(
    (sum, r) => sum + (r.fees_collected || 0),
    0
  );

  const html = `
    <h2 style="margin-top:0; font-size: 1.25rem; font-weight: 600; margin-bottom: 20px;">
      Overview · <span style="color: #2f6f4e;">$${totalCaptured.toFixed(4)}</span> captured in recent batches
    </h2>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr><th>Timestamp</th><th>Fees Collected</th><th>Daily Slice</th><th>Tx Count</th><th>Asset Class</th></tr>
        </thead>
        <tbody>
          ${ledger
            .map(
              (row) => `
            <tr>
              <td class="mono">${row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : "N/A"}</td>
              <td class="positive">+$${Number(row.fees_collected || 0).toFixed(6)}</td>
              <td class="mono">$${Number(row.daily_slice || 0).toFixed(6)}</td>
              <td>${row.transaction_count || "1"}</td>
              <td><span class="chip">${(row.asset_type || "USDC").toString().toUpperCase()}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p style="margin-top:20px; margin-bottom:0; color:#8a6a3a; font-size: 0.8rem;">Auto-refresh every 3s · Micro-margin sweeper matrix running</p>
  `;
  return c.html(html);
});

// Nest the fuller sleeve dashboard under /dashboard/treasury
dashboard.route("/treasury", treasuryDashboard);

export default dashboard;
