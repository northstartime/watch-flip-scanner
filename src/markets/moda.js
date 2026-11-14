import { ASK_GROUPS, FACEBOOK_ASK_TARGETS, validateGroupFragments } from "../facebookGroups.js";
import { withFacebookSession } from "../browserSession.js";
import { dumpAccessibilityTree } from "../collectors/modaCollector.js";
import { parseListing } from "../parser.js";
import { deduplicateListings, matchesFacebookGroup } from "../listingIntegrity.js";
import { splitSalePost } from '../saleListing.js';

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

export async function getModaListings(collect, { sessionOptions, collectorOptions = {}, groups = ASK_GROUPS, log = console.log } = {}) {
  const configuredGroups = validateGroupFragments(groups);
  if (!collect) return withFacebookSession(session => getModaListings(group => dumpAccessibilityTree(group, { ...collectorOptions, getPage: session.getPage }), { groups: configuredGroups, log }), sessionOptions);
  log("Collecting configured Facebook ASK groups...");

const collectedListings = [];

for (const group of configuredGroups) {
  log(`Scanning ASK group: ${group}`);

  const groupListings = await collect(group);

  collectedListings.push(...groupListings.filter(item=>matchesFacebookGroup(item.url,group)).map(item=>({
    ...item,groupId:new URL(item.url).pathname.split('/')[2],
    groupName:FACEBOOK_ASK_TARGETS.find(target=>target.fragment.toLowerCase()===group.toLowerCase())?.name??group,
  })));
}

  const components=deduplicateListings(collectedListings).flatMap(item=>splitSalePost(item).listings);
  return deduplicateListings(components).map((item) => {
    const auction = isAuctionListing(item.listingText);
    const parsed = parseListing(item.listingText,item.url);
    // Respect owned-text diagnostics, including a deliberately unresolved truncated price.
    const priceExtraction = item.priceExtraction ?? parsed.priceExtraction;
    const fixedPrice = priceExtraction?.status === 'recognized' && priceExtraction.currency === 'USD'
      && typeof priceExtraction.amount === 'number' && Number.isFinite(priceExtraction.amount) && priceExtraction.amount > 0
      ? priceExtraction.amount : null;
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
      parentPostId:item.parentPostId,watchKey:item.watchKey,saleStatus:item.saleStatus,listingKind:item.listingKind,
      groupId:item.groupId,groupName:item.groupName,photoAssociation:item.photoAssociation,textDiagnostics:item.textDiagnostics,
      seller: item.seller || "Unknown seller",
      sellerExtraction: item.sellerExtraction,
      priceExtraction,
      reviewReasons: [...new Set([...(item.reviewReasons??[]),...(fixedPrice===null?[priceExtraction?.reason??'asking_price_not_recognized']:[])])],
      source: "Moda",

      url: item.url,
      image: item.image,
      originalListing: item.listingText,

      buyingOption: auction ? "AUCTION" : "FIXED_PRICE",
      requiresManualReview: true,
      capturedAt: item.capturedAt,
currentBid,

price: auction
  ? currentBid
  : fixedPrice,

buyPrice: auction
  ? null
  : fixedPrice,
marketValue: parsed.marketValue ?? null,

      hasBoxAndPapers:
        Boolean(parsed.hasBox) && Boolean(parsed.hasPapers),

      fullLinks:
        /full links|all links|complete bracelet/i.test(
          item.listingText
        ),

      trustedSeller: false,
      fees: null,
      shipping: null,
    };
  });
}
