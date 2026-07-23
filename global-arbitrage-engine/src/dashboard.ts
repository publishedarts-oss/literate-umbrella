import { Hono } from "hono";
import { APP, FEES } from "./config";
import { licensingSystem, type License, type LicenseTier } from "./licensing-module";
import { applySecurityHeaders } from "./lib/securityHeaders";
import { sanitizeText } from "./lib/sanitize";
import { queryClient } from "./microMarginSweeper";
import treasuryDashboard from "./treasuryDashboard";

const dashboard = new Hono();

const DASHBOARD_CSP =
  "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://unpkg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function renderLicenseCard(node: License): string {
  const tierColor = node.tier === "enterprise" ? "var(--good)" : "var(--muted)";
  return `
    <div class="lic-card">
      <div class="lic-header">
        <span>${sanitizeText(node.licensee)}</span>
        <span class="lic-tier" style="color:${tierColor}">${node.tier}</span>
      </div>
      <div style="margin-top:6px;">
        ${node.sectors
          .map((sec) => `<span class="sector-tag">${sanitizeText(sec)}</span>`)
          .join("")}
      </div>
      <div class="lic-meta">
        <span>Lease Fee: <b>$${node.monthlyFee}/mo</b></span>
        <span>Rev Split: <b>${node.revenueShare * 100}%</b></span>
      </div>
    </div>`;
}

dashboard.get("/", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  c.header("Content-Security-Policy", DASHBOARD_CSP);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP.NAME} Ops Terminal</title>
  <script src="https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js"></script>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #6b5a3e;
      --paper: #fffaf3;
      --card: rgba(255,255,255,0.82);
      --border: #e8dcc8;
      --good: #2f6f4e;
      --accent: #c45c26;
      --panel: #f7f1e6;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, #fff6e8, transparent 42%),
        linear-gradient(180deg, var(--paper), #efe7d8);
      color: var(--ink);
      padding: 18px 14px 48px;
      margin: 0;
    }
    .container { max-width: 520px; margin: 0 auto; }
    h1 {
      font-size: 1.55rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pulse {
      width: 9px; height: 9px; background: var(--good); border-radius: 50%;
      box-shadow: 0 0 10px rgba(47,111,78,0.55);
      display: inline-block;
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.7; }
    }
    .section-title {
      font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
      color: var(--muted); letter-spacing: 0.08em; margin: 22px 0 10px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 10px 28px rgba(90,60,20,0.05);
      margin-bottom: 14px;
    }
    .lic-card {
      border-left: 4px solid var(--good);
      padding-left: 12px;
      margin-bottom: 12px;
      border-bottom: 1px dashed var(--border);
      padding-bottom: 12px;
    }
    .lic-card:last-of-type { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .lic-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
    .lic-tier {
      background: var(--panel); font-size: 0.7rem; font-weight: 800;
      padding: 2px 6px; border-radius: 4px; text-transform: uppercase;
      border: 1px solid var(--border);
    }
    .lic-meta {
      font-size: 0.8rem; color: var(--muted); margin-top: 6px;
      display: flex; justify-content: space-between; gap: 8px;
    }
    .sector-tag {
      display: inline-block;
      background: rgba(47,111,78,0.1);
      color: var(--good);
      font-size: 0.65rem; font-weight: bold;
      padding: 1px 5px; border-radius: 3px; margin-right: 4px;
      text-transform: uppercase;
    }
    .input-field {
      width: 100%; padding: 12px; background: #fff;
      border: 1px solid var(--border); border-radius: 8px;
      color: var(--ink); font-size: 0.95rem; margin-bottom: 10px;
      font-family: inherit;
    }
    .btn {
      width: 100%; padding: 14px; background: var(--good); border: none;
      border-radius: 10px; color: #fff; font-size: 1rem; font-weight: bold;
      cursor: pointer; display: block; text-align: center;
    }
    .btn:active { transform: scale(0.98); }
    table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 8px; }
    th {
      font-size: 0.72rem; text-transform: uppercase; color: var(--muted);
      padding: 8px 4px; border-bottom: 1px solid var(--border); letter-spacing: 0.05em;
    }
    td {
      padding: 10px 4px; border-bottom: 1px solid var(--border);
      font-size: 0.85rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .nav { color: var(--accent); font-size: 0.85rem; text-decoration: none; }
    .sub { color: var(--muted); margin: 0 0 4px; font-size: 0.92rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="pulse" aria-hidden="true"></span> ${APP.NAME} Ops Terminal</h1>
    <p class="sub">${APP.TAGLINE}</p>
    <p class="sub"><a class="nav" href="/dashboard/treasury">Full treasury sleeves →</a></p>

    <div class="section-title">Active White-Label Operations</div>
    <div id="license-surface" class="panel" hx-get="/dashboard/licenses/cards" hx-trigger="load">
      <p style="color: var(--muted); font-size: 0.85rem;">Retrieving network license status records...</p>
    </div>

    <div class="panel">
      <h3 style="margin-top:0; font-size:1rem; margin-bottom:12px;">Provision New Franchise Node</h3>
      <form hx-post="/dashboard/licenses/generate" hx-target="#license-surface" hx-swap="afterbegin"
            onsubmit="setTimeout(()=>this.reset(), 120)">
        <input type="text" name="licensee" placeholder="Enterprise Partner Name" class="input-field" required />
        <select name="tier" class="input-field">
          <option value="starter">Starter Plan Tier</option>
          <option value="pro">Professional Plan Tier</option>
          <option value="enterprise" selected>Enterprise White-Label Tier</option>
          <option value="vertical">Deep Sector Vertical Tier</option>
        </select>
        <button class="btn" type="submit">Deploy Isolated Node Engine</button>
      </form>
      <p style="margin:10px 0 0; font-size:0.75rem; color:var(--muted);">
        Setup fees stream into treasury (${FEES.TX_LABEL} stack stays separate on micro-sweeps).
      </p>
    </div>

    <div class="section-title">Ecosystem Revenue Sweeps</div>
    <div id="treasury-surface" class="panel" hx-get="/dashboard/data" hx-trigger="load">
      <p style="color: var(--muted); font-size: 0.85rem;">Connecting to high-volume ledgers...</p>
    </div>
  </div>

  <script>
    setInterval(() => {
      if (window.htmx) {
        htmx.ajax('GET', '/dashboard/data', { target: '#treasury-surface' });
      }
    }, 4000);
  </script>
</body>
</html>`;
  return c.html(html);
});

dashboard.get("/licenses/cards", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  const activeNodes = await licensingSystem.getAllLicenses();
  return c.html(activeNodes.map(renderLicenseCard).join(""));
});

dashboard.post("/licenses/generate", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  const body = await c.req.parseBody();
  const licensee = String(body.licensee || "Anonymous Group");
  const tier = String(body.tier || "enterprise") as LicenseTier;

  const node = await licensingSystem.issueLicense(licensee, tier, [
    "AGENTIC_AUTO",
    "MARKET_FEEDS",
  ]);

  return c.html(renderLicenseCard(node));
});

dashboard.get("/data", async (c) => {
  applySecurityHeaders((k, v) => c.header(k, v));
  c.header("Cache-Control", "no-store");

  const ledger = queryClient
    .prepare(
      "SELECT * FROM treasury_ledger ORDER BY timestamp DESC LIMIT 5"
    )
    .all() as any[];

  if (!ledger || ledger.length === 0) {
    return c.html(
      `<p style="color:#6b5a3e; font-size:0.8rem; text-align:center; padding:10px;">Waiting for treasury entries...</p>`
    );
  }

  const total = ledger.reduce(
    (sum, r) => sum + (r.fees_collected || 0),
    0
  );
  const rows = ledger
    .map(
      (r) =>
        `<tr><td>${new Date(r.timestamp).toLocaleTimeString()}</td><td style="color:#2f6f4e;">+$${Number(r.fees_collected).toFixed(4)}</td><td>${r.asset_type}</td></tr>`
    )
    .join("");

  return c.html(`
    <div style="font-size:0.9rem; font-weight:bold; margin-bottom:10px; color:#2f6f4e;">$${total.toFixed(2)} Platform Capture</div>
    <table><thead><tr><th>Time</th><th>Yield</th><th>Asset</th></tr></thead><tbody>${rows}</tbody></table>
  `);
});

dashboard.route("/treasury", treasuryDashboard);

export default dashboard;
