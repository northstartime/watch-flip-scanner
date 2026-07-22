export function parseListing(listing) {

  // Find asking price
const priceMatch =
  listing.match(/\basking\s*(?:price\s*)?[:\-]?\s*\$?\s*([\d,]{3,8})\b/i) ||
  listing.match(/\bprice\s*[:\-]?\s*\$?\s*([\d,]{3,8})\b/i) ||
  listing.match(/\$?\s*([\d,]{3,8})\s*\+\s*(?:l|label)\b/i) ||
  listing.match(/^\s*\$?\s*([\d,]{3,8})\s*(?:firm|shipped)\b/im);

  // Find reference number
 const referenceMatch =
  listing.match(/\b(?:Ref\.?|Reference)\s*(\d{4,6})\b/i) ||
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

if (/\bDJ\b/i.test(listing)) {
  model = "Datejust";
  if (!brand) brand = "Rolex";
} else if (/\b(SUB|SUBMARINER)\b/i.test(listing)) {
  model = "Submariner";
  if (!brand) brand = "Rolex";
} else if (/\bGMT\b/i.test(listing)) {
  model = "GMT-Master II";
  if (!brand) brand = "Rolex";
} else if (/\bEXP\b/i.test(listing)) {
  model = "Explorer";
  if (!brand) brand = "Rolex";
} else if (/\bAK\b/i.test(listing)) {
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
return {
    originalListing: listing,
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
    year: yearMatch ? Number(yearMatch[0]) : null,
    hasBox,
    hasPapers,
    condition: conditionMatch ? conditionMatch[1] : null
};

}