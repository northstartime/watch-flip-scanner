import { estimateMarketValue } from "./marketValue.js";
export function parseListing(listing, shareLink) {

  // Extract Facebook URL if present
const listingUrl =
  shareLink?.trim() || "https://www.facebook.com/groups/Watchtrading";

// Find asking price
const pricePatterns = [
  /\basking\s*(?:price\s*)?[:\-]?\s*\$?\s*([\d,]{3,8})\b/i,
  /\bprice\s*[:\-]?\s*\$?\s*([\d,]{3,8})\b/i,
  /^\$?\s*([\d,]{3,8})\s*\+\s*(?:label)\b/i,
  /^\$?\s*([\d,]{3,8})\s*(?:obo|firm|shipped|net)\b/i,
  /^\$?\s*([\d,]{3,8})\b/i,
  /(?:take it home|take it)\s*(?:for\s*)?\$?\s*([\d,]{3,8})\b/i,
  /^\s*\$?\s*([\d,]{3,8})\s*(?:take it home|take it|shipped|obo|firm|net)\b/im,
];

const numberedItems = listing.match(/^\s*\d+\s*:/gm) || [];
const isMultiWatchPost = numberedItems.length >= 2;

let priceMatch = null;

if (!isMultiWatchPost) {
  for (const pattern of pricePatterns) {
    const match = listing.match(pattern);

    if (match) {
      priceMatch = match;
      break;
    }
  }
}


  // Find reference number
const referenceMatch =
listing.match(
  /\b(?:Ref\.?|Reference)\s*:?\s*([A-Z0-9]+(?:\.[A-Z0-9]+){1,})\b/i
) ||
listing.match(
  /\b(\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}|\d{4}\.\d{2})\b/
) ||
  listing.match(/\b(?:Ref\.?|Reference)\s*:?\s*(\d{4,6})\b/i) ||
  listing.match(/\b(11\d{4}|12\d{4}|21\d{4}|22\d{4})\b/);

  // Find brand
  let brand = null;

  if (/\b(RLX|ROLEX)\b/i.test(listing)) {
    brand = "Rolex";
  } else if (/\b(OMG|OMEGA)\b/i.test(listing)) {
    brand = "Omega";
  } else if (/\b(TDR|TUDOR)\b/i.test(listing)) {
    brand = "Tudor";
  }
  // Find model
  let model = null;

if (/(\bDJ\b|DATEJUST|126300|126334|126333|116234|16234)/i.test(listing)) {
  model = "Datejust";
  if (!brand) brand = "Rolex";

} else if (/(\bSUB\b|SUBMARINER|124060|126610|116610|16610)/i.test(listing)) {
  model = "Submariner";
  if (!brand) brand = "Rolex";

} else if (/(\bGMT\b|BATMAN|BATGIRL|PEPSI|SPRITE)/i.test(listing)) {
  model = "GMT-Master II";
  if (!brand) brand = "Rolex";

} else if (/(\bEXP\s*II\b|EXPLORER\s*II|226570|216570|POLAR)/i.test(listing)) {
  model = "Explorer II";
  if (!brand) brand = "Rolex";

} else if (/(\bEXP\b|EXPLORER|124270|214270)/i.test(listing)) {
  model = "Explorer";
  if (!brand) brand = "Rolex";

} else if (/(\bAK\b|AIR.?KING|126900|116900)/i.test(listing)) {
  model = "Air-King";
  if (!brand) brand = "Rolex";
}
const hasBox = /\bbox\b/i.test(listing) && !/box not included/i.test(listing);
const hasPapers = /\bpaper|card\b/i.test(listing);

const yearMatch = listing.match(/20\d{2}/);

const conditionMatch =
  listing.match(/(\d(?:\.\d)?\/10)/) ||
  listing.match(/condition[: ]+([^\n]+)/i);

const isPolished =
  /\bpolished\b/i.test(listing) &&
  !/\bunpolished\b/i.test(listing);

const scrambledSerial = /scrambled/i.test(listing);

const tradeAccepted = /trade/i.test(listing);

const dealerListing =
    /\+ label/i.test(listing) ||
    /wire/i.test(listing) ||
    /welcome/i.test(listing);

const braceletMatch = listing.match(/(\d+(?:\.\d+)?)\s*inch/i);

const wristSize = braceletMatch
    ? Number(braceletMatch[1])
    : null;
    const listingLines = listing
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const displayTitle =
  listingLines.find((line) => !/^#\w+/i.test(line)) ||
  listingLines[0] ||
  "Unknown listing";
return {
    originalListing: listing,
  title: displayTitle,
    brand,
    model,
    isPolished,
scrambledSerial,
tradeAccepted,
dealerListing,
wristSize,
    reference: referenceMatch ? referenceMatch[1] : null,
   price: priceMatch
  ? Number(priceMatch[1].replace(/,/g, ""))
  : null,
  buyPrice: priceMatch
  ? Number(priceMatch[1].replace(/,/g, ""))
  : null,

source: "Moda",
url: listingUrl,

marketValue: estimateMarketValue(listing),
    year: yearMatch ? Number(yearMatch[0]) : null,
    hasBox,
    hasPapers,
    condition: conditionMatch ? conditionMatch[1] : null
};

}