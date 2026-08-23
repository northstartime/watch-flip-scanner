import { dumpAccessibilityTree } from "../collectors/modaCollector.js";
import { parseListing } from "../parser.js";

function isAuctionListing(text) {
  return /modaauction|start no reserve|minimum increment|top 3 bids are binding|no reserve auction|soft close/i.test(
    text
  );
}
function parseCurrentBid(text) {
  const match = text.match(
    /(?:current\s+bid|high\s+bid|highest\s+bid|bid\s+at)\s*[:\-]?\s*\$?\s*([\d,]+)/i
  );

  if (!match) return null;

  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function parseBidComment(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);

  const bids = [];

  for (const line of lines) {
    // Examples: 7k, 7k leading, 2k, 1.6k
    const kMatch = line.match(
      /^\$?\s*(\d+(?:\.\d+)?)\s*k(?:\s+leading)?$/i
    );

    if (kMatch) {
      bids.push(Math.round(Number(kMatch[1]) * 1000));
      continue;
    }

    // Examples: 2.1, 1.6, 1.3, 2.1 leading
    const decimalMatch = line.match(
      /^(\d+\.\d+)(?:\s+leading)?$/i
    );

    if (decimalMatch) {
      bids.push(Math.round(Number(decimalMatch[1]) * 1000));
      continue;
    }

    // Examples: $7,000, $2100
    const dollarMatch = line.match(
      /^\$\s*([\d,]+)(?:\s+leading)?$/i
    );

    if (dollarMatch) {
      bids.push(Number(dollarMatch[1].replace(/,/g, "")));
      continue;
    }

    // Examples: 1400, 1600, 7000, 2000 leading
    const plainMatch = line.match(
      /^([\d,]{3,6})(?:\s+leading)?$/i
    );

    if (plainMatch) {
      bids.push(Number(plainMatch[1].replace(/,/g, "")));
    }
  }

  const validBids = bids.filter(
    (value) => Number.isFinite(value) && value > 0
  );

  return validBids.length ? Math.max(...validBids) : null;
}

const ASK_GROUPS = [
  "558871041349029",
  "watchtradercommunity",
 "150223938977815",
  "402925935441346",
];
export async function getModaListings() {
  console.log("Searching live Moda listings...");

const collectedListings = [];

for (const group of ASK_GROUPS) {
  console.log(`Scanning ASK group: ${group}`);

  const groupListings = await dumpAccessibilityTree(group);

  collectedListings.push(...groupListings);
}

  return collectedListings.map((item) => {
    const auction = isAuctionListing(item.listingText);
    const parsed = parseListing(item.listingText);
 const commentBids = auction
  ? (item.comments || [])
      .map(parseBidComment)
      .filter((value) => Number.isFinite(value) && value > 0)
  : [];

const currentBid = auction
  ? Math.max(
      parseCurrentBid(item.listingText) || 0,
      ...commentBids,
      0
    ) || null
  : null;

    return {
      ...parsed,

      id: item.id,
      seller: item.seller,
      source: "Moda",

      url: item.url,
      image: item.image,
      originalListing: item.listingText,

      buyingOption: auction ? "AUCTION" : "FIXED_PRICE",
      requiresManualReview: auction,
currentBid,

price: auction
  ? currentBid ?? 0
  : parsed.price,

buyPrice: auction
  ? currentBid ?? 0
  : parsed.buyPrice ?? parsed.price ?? null,
marketValue: parsed.marketValue ?? null,

      hasBoxAndPapers:
        Boolean(parsed.hasBox) && Boolean(parsed.hasPapers),

      fullLinks:
        /full links|all links|complete bracelet/i.test(
          item.listingText
        ),

      trustedSeller: false,
      fees: 0,
      shipping: 0,
    };
  });
}