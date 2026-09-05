import { getEbayListingsV1 } from "./markets/ebayV1.js";
import { dumpAccessibilityTree } from "./collectors/modaCollector.js";
import { uploadOpportunities } from "./cloudSync.js";

function extractReference(title) {
  const text = String(title || "");

  const match = text.match(/\b\d{5,6}[A-Z]{0,4}\b/i);

  return match ? match[0].toUpperCase() : null;
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

const watchTraderCommunityListings =
  await dumpAccessibilityTree("watchtradercommunity");

const modaWatchClubListings =
  await dumpAccessibilityTree("Watchtrading");

const facebookListings = [
  ...watchTraderCommunityListings,
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
  ...ebayListings,
  ...facebookListings,
]);
const enrichedListings = allListings.map((listing) => ({
  ...listing,
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