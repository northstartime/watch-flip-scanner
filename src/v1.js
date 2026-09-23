import { getEbayListingsV1 } from "./markets/ebayV1.js";
import { getFacebookDirect } from "./collectors/facebookDirect.js";
import { uploadOpportunities } from "./cloudSync.js";

function extractReference(title) {
  const text = String(title || "");

  const match = text.match(/\b\d{5,6}[A-Z]{0,4}\b/i);

  return match ? match[0].toUpperCase() : null;
}

const BUY_CEILINGS = {
  "126900": 7500,
  "124270": 7000,
  "214270": 8500,
  "226570": 9000,
  "216570": 8000,
  "126300": 8500,
  "126334": 10500,
  "124060": 11000,
  "126610LN": 12000,
  "126613LN": 15500,
  "126710BLNR": 15500,
  "126710BLRO": 20500,
  "310.30.42.50.01.002": 5000,
  "210.30.42.20.03.001": 4000
};
function selectEbayBuyMode(listings) {
  const bad = /\bbox\b|bezel|bracelet|band|dial only|case only|links?\b|custom|aftermarket|lab grown|diamond bezel|parts|replacement|certificate|guarantee card|warranty card|papers only|card only/i;
  const clean = listings.filter(x =>
    x.source === "eBay" &&
    x.price >= 1000 &&
    x.title &&
    !bad.test(x.title) &&
    extractReference(x.title)
  );

  const groups = new Map();

  for (const listing of clean) {
    const ref = extractReference(listing.title);
    if (!BUY_CEILINGS[ref] || listing.price > BUY_CEILINGS[ref]) continue;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(listing);
  }

  return [...groups.values()].flatMap(items =>
    items.sort((a, b) => a.price - b.price).slice(0, 3)
  );
}
function filterListings(listings) {
  return listings.filter((listing) => {
    if (listing.source === "eBay" && !listing.price) {
      return false;
    }

    if (listing.source === "eBay" && listing.price < 1000) {
      return false;
    }
   if (
  listing.source === "eBay" &&
  (!listing.title || listing.title.length < 8)
) {
  return false;
} 
if (
  listing.source === "eBay" &&
  listing.title.toLowerCase().includes("aftermarket")
) {
  return false;
}
if (
  listing.source === "eBay" &&
  listing.title.toLowerCase().includes("custom")
) {
  return false;
}
if (
  listing.source === "eBay" &&
  listing.title.toLowerCase().includes("modified")
) {
  return false;
}

    return true;
  });
}
async function run() {
  console.log("North Star V1 starting...");

  const ebayListings = await getEbayListingsV1();

  console.log(
    `North Star V1 found ${ebayListings.length} eBay listings`
  );
console.log("Testing Facebook collector...");

let watchTraderCommunityListings = [];
let modaWatchClubListings = [];
let modaMainListings = [];
let modaWtbListings = [];

try {
  watchTraderCommunityListings =
    await getFacebookDirect("watchtradercommunity");

  console.log(
    `Watch Trader Community: ${watchTraderCommunityListings.length}`
  );
} catch (error) {
  console.warn(
    "Watch Trader Community collector failed — continuing with other sources.",
    error?.message || error
  );
}


try {
  modaMainListings =
    await getFacebookDirect("Watchtrading");

  console.log(
    `Moda Main: ${modaMainListings.length}`
  );
} catch (error) {
  console.warn(
    "Moda Main collector failed - continuing with other sources.",
    error?.message || error
  );
}

try {
  modaWtbListings =
    await getFacebookDirect("WatchBuying");

  console.log(
    `Moda WTB/ISO: ${modaWtbListings.length}`
  );
} catch (error) {
  console.warn(
    "Moda WTB/ISO collector failed - continuing with other sources.",
    error?.message || error
  );
}
try {
  modaWatchClubListings =
    await getFacebookDirect("558871041349029");
  console.log(
    `Moda Watch Club: ${modaWatchClubListings.length}`
  );
} catch (error) {
  console.warn(
    "Moda Watch Club collector failed — continuing with other sources.",
    error?.message || error
  );
}

const facebookListings = [
  ...watchTraderCommunityListings,
  ...modaMainListings,
  ...modaWtbListings,
  ...modaWatchClubListings,
];
console.log(
  `Watch Trader Community: ${watchTraderCommunityListings.length}`
);

console.log(
  `Moda Watch Club: ${modaWatchClubListings.length}`
);
  console.log(
    `North Star V1 found ${facebookListings.length} Facebook listings`
  );
const allListings = filterListings([
  ...selectEbayBuyMode(ebayListings),
  ...facebookListings,
]);
const enrichedListings = allListings.map((listing) => ({
  ...listing,
  title: listing.title || listing.listingText || "Facebook listing",
  reference: extractReference(
    listing.title || listing.listingText
  ),
}));
console.log(
  `North Star V1 recognized ${enrichedListings.filter((listing) => listing.reference).length} references`
);

console.log(
  `North Star V1 total listings: ${allListings.length}`
);
await uploadOpportunities(enrichedListings);
  process.exit(0);
}

run().catch((error) => {
  console.error("North Star V1 failed:", error);
});









