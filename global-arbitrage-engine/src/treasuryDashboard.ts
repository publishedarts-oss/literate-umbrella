import { Hono } from "hono";
import { APP, FEES } from "./config";
import { engine } from "./hyperbundle-engine";
import { applySecurityHeaders } from "./lib/securityHeaders";
import { queryClient } from "./microMarginSweeper";

const treasuryDashboard = new Hono();

treasuryDashboard.get("/", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));

  const ledger = queryClient
    .prepare(
      `
    SELECT * FROM treasury_ledger
    ORDER BY timestamp DESC LIMIT 20
  `
    )
    .all() as Array<{
    fees_collected: number;
    daily_slice: number;
    transaction_count: number;
    asset_type: string;
    timestamp: string;
  }>;

  const metrics = engine.getMetrics();
  const snapshot = engine.treasury.getTreasurySnapshot();
  const feesCaptured = ledger.reduce(
    (sum, row) => sum + (row.fees_collected || 0),
    0
  );
  const slicesCaptured = ledger.reduce(
    (sum, row) => sum + (row.daily_slice || 0),
    0
  );

  const positionsHtml = snapshot.positions
    .map(
      (p) =>
        `<li><strong>${p.asset}</strong> · $${p.amountUsd.toLocaleString()} <span style="color:#8a6a3a;">(${Math.round(p.share * 100)}%)</span></li>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${APP.NAME} Treasury · Live</title>
  <meta name="description" content="Live HyperBundle treasury transparency — micro-margins compounding quietly."/>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #6b5a3e;
      --paper: #fffaf3;
      --panel: #f3efe6;
      --line: #e8dcc8;
      --good: #2f6f4e;
      --accent: #c45c26;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, #fff6e8, transparent 45%),
        linear-gradient(180deg, var(--paper), #efe7d8);
      color: var(--ink);
      padding: 28px 20px 60px;
    }
    main { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 2rem; margin: 0 0 6px; }
    h2 { font-size: 1.15rem; margin: 0 0 12px; letter-spacing: 0.02em; }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.72rem;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .card {
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: 0 10px 30px rgba(90, 60, 20, 0.04);
    }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 0.95rem; }
    th { color: var(--muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .positive { color: var(--good); font-weight: 700; }
    .stat { font-size: 1.6rem; margin: 4px 0 0; }
    ul { margin: 0; padding-left: 18px; line-height: 1.7; }
    pre {
      background: var(--panel);
      border-radius: 10px;
      padding: 14px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.82rem;
    }
    .footer {
      text-align: center;
      margin-top: 36px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .pill {
      display: inline-block;
      background: var(--accent);
      color: white;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">${APP.NAME} · beta transparency</p>
    <h1>Treasury Dashboard</h1>
    <p style="color:var(--muted);max-width:40rem;">${APP.TAGLINE} Fees stay obvious: ${FEES.TX_LABEL} + ${FEES.AUM_LABEL}.</p>
    <span class="pill">${snapshot.healthy ? "Safety band OK" : "Rebalance suggested"}</span>

    <div class="card">
      <h2>Overview</h2>
      <p class="stat">$${feesCaptured.toFixed(4)}</p>
      <p style="color:var(--muted);margin:0;">Micro fees captured in the last ${ledger.length} ledger rows · daily AUM slices $${slicesCaptured.toFixed(4)}</p>
      <p style="margin:14px 0 0;">Treasury total <strong>$${snapshot.totalUsd.toLocaleString()}</strong></p>
      <ul>${positionsHtml}</ul>
      <p style="color:var(--muted);font-size:0.9rem;">${snapshot.suggestions[0] || ""}</p>
    </div>

    <div class="card">
      <h2>Recent Sweeps</h2>
      <table>
        <thead>
          <tr><th>Time</th><th>Fees</th><th>Daily Slice</th><th>Count</th><th>Asset</th></tr>
        </thead>
        <tbody>
          ${
            ledger.length === 0
              ? `<tr><td colspan="5" style="color:var(--muted);">No sweeps yet — run a micro-sweep or Solana hook to light this up.</td></tr>`
              : ledger
                  .map(
                    (row) => `
            <tr>
              <td>${new Date(row.timestamp).toLocaleString()}</td>
              <td class="positive">$${Number(row.fees_collected).toFixed(6)}</td>
              <td>$${Number(row.daily_slice).toFixed(6)}</td>
              <td>${row.transaction_count}</td>
              <td>${row.asset_type}</td>
            </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Engine Metrics</h2>
      <pre>${JSON.stringify(metrics, null, 2)}</pre>
    </div>

    <p class="footer">
      Treasury is self-sustaining · Micro-margins compounding quietly · Beta Transparency Mode
    </p>
  </main>
</body>
</html>`;

  return c.html(html);
});

export default treasuryDashboard;
