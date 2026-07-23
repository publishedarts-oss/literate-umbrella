import type { ExternalFeedItem, FeedSource } from "./types";
import { log } from "./lib/logger";

/** Mock multi-source ingestion adapters — swap for live HTTP later */

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

export async function pullFeed(
  source: FeedSource
): Promise<{ sector: string; items: ExternalFeedItem[] }> {
  log.info("feed_pull_start", { source });

  switch (source) {
    case "empty-leg-broker":
      return {
        sector: "Airlines",
        items: [
          {
            uuid: "flight_mia_nyc",
            displayTitle: "Empty Leg: Miami → NYC Private Jet",
            costBasis: 950,
            attributes: { retailEstimate: 4500, seats: 6 },
            deadline: hoursFromNow(36),
          },
          {
            uuid: "flight_lax_den",
            displayTitle: "Empty Leg: LAX → Denver Citation",
            costBasis: 720,
            attributes: { retailEstimate: 3200, seats: 4 },
            deadline: hoursFromNow(20),
          },
        ],
      };
    case "perishable-clearing":
      return {
        sector: "Perishables",
        items: [
          {
            uuid: "wagyu_a5_crate",
            displayTitle: "Wagyu A5 Grilling Overstock Crate",
            costBasis: 150,
            attributes: { retailEstimate: 600, coldChain: true },
            deadline: hoursFromNow(48),
          },
          {
            uuid: "oyster_flash",
            displayTitle: "Pacific Oyster Flash Lot",
            costBasis: 80,
            attributes: { retailEstimate: 240 },
            deadline: hoursFromNow(18),
          },
        ],
      };
    case "land-lot-auction":
      return {
        sector: "RealEstate",
        items: [
          {
            uuid: "montana_lot",
            displayTitle: "Montana Mountain View Lot",
            costBasis: 1200,
            attributes: { retailEstimate: 3500, acres: 2.1 },
            deadline: null,
          },
          {
            uuid: "austin_micro",
            displayTitle: "Austin Micro Lot",
            costBasis: 800,
            attributes: { retailEstimate: 2200 },
            deadline: null,
          },
        ],
      };
    case "experience-drop":
      return {
        sector: "Experiences",
        items: [
          {
            uuid: "chef_table",
            displayTitle: "Midnight Chef's Table for Two",
            costBasis: 220,
            attributes: { retailEstimate: 780 },
            deadline: hoursFromNow(72),
          },
          {
            uuid: "observatory_night",
            displayTitle: "Private Observatory Night",
            costBasis: 180,
            attributes: { retailEstimate: 640 },
            deadline: hoursFromNow(96),
          },
        ],
      };
    default:
      return { sector: "General", items: [] };
  }
}

export async function pullAllFeeds() {
  const sources: FeedSource[] = [
    "empty-leg-broker",
    "perishable-clearing",
    "land-lot-auction",
    "experience-drop",
  ];
  const results = [];
  for (const source of sources) {
    results.push({ source, ...(await pullFeed(source)) });
  }
  log.info("feed_pull_complete", { sources: sources.length });
  return results;
}
