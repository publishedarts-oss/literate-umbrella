import { APP } from "./config";
import type { Bundle, EmailReceipt, SocialCard } from "./types";

export function buildSocialCard(bundle: Bundle, domain = APP.DEFAULT_DOMAIN): SocialCard {
  const url = `${domain}/deals/${bundle.slug}`;
  const title = `${bundle.title} — $${bundle.bundlePrice}`;
  const description = `Valued at $${bundle.retailValue}. ${bundle.delightCopy} Fees transparent: ${bundle.fees.labels.tx}.`;

  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    twitterCard: "summary_large_image",
    shareText: `I just found a HyperBundle: ${bundle.title} for $${bundle.bundlePrice} (was $${bundle.retailValue}). ${url}`,
  };
}

export function buildEmailReceipt(
  bundle: Bundle,
  opts?: { buyerEmail?: string; sessionId?: string }
): EmailReceipt {
  const subject = `Your HyperBundle is locked in — ${bundle.title}`;
  const text = [
    `Thanks for bundling with ${APP.NAME}.`,
    ``,
    `${bundle.title}`,
    `Offer price: $${bundle.bundlePrice}`,
    `Retail value: $${bundle.retailValue}`,
    `Platform fee (${bundle.fees.labels.tx}): $${bundle.fees.txFeeAmount}`,
    `Total charged today: $${bundle.fees.totalDueToday}`,
    `AUM note: ${bundle.fees.labels.aum} (pro-rated; shown for transparency).`,
    ``,
    `Variant: ${bundle.abGroup} | ${bundle.tierApplied}`,
    `Match: ${bundle.matchReason}`,
    opts?.sessionId ? `Session: ${opts.sessionId}` : "",
    ``,
    APP.TAGLINE,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:560px;margin:24px auto;color:#111;background:#fffaf3;padding:24px;">
  <p style="letter-spacing:0.08em;text-transform:uppercase;font-size:12px;color:#8a6a3a;">HyperBundle receipt</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">${bundle.title}</h1>
  <p>Offer <strong>$${bundle.bundlePrice}</strong> · Retail <del>$${bundle.retailValue}</del></p>
  <p style="color:#444;">${bundle.fees.labels.tx}: <strong>$${bundle.fees.txFeeAmount}</strong><br/>
  Total today: <strong>$${bundle.fees.totalDueToday}</strong></p>
  <p style="font-size:13px;color:#666;">${bundle.fees.labels.aum}</p>
  <hr style="border:none;border-top:1px solid #e8dcc8;margin:20px 0;"/>
  <p style="font-size:14px;color:#555;">${bundle.delightCopy}</p>
  <p style="font-size:12px;color:#999;">${APP.TAGLINE}</p>
  </body></html>`;

  return { subject, text, html };
}
