import { ASK_GROUPS } from "./facebookGroups.js";
import { withFacebookSession } from "./browserSession.js";
import { deduplicateListings, toMobileOpportunity } from "./listingIntegrity.js";
import { dumpAccessibilityTree } from "./collectors/modaCollector.js";
import { uploadOpportunities } from "./cloudSync.js";
import { fileURLToPath } from 'node:url';

function extractReference(title) {
  const text = String(title || "").toUpperCase();
let match = text.match(/\b\d{4}\.\d{2}(?:\.\d{2})?\b/);
if (match) return match[0];

match = text.match(/\b[A-Z]{2,5}\d{4,7}\b/);
if (match) return match[0];

match = text.match(/\b\d{5,6}[A-Z]{0,4}\b/);
if (match) return match[0];
return null;
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

  const { getEbayListingsV1 } = await import('./markets/ebayV1.js');
  const ebayListings = await getEbayListingsV1();

  console.log(
    `North Star V1 found ${ebayListings.length} eBay listings`
  );

  console.log("Testing Facebook collector...");

const facebookListings = await withFacebookSession(async session => {
  const collected = [];
  for (const group of ASK_GROUPS) collected.push(...await dumpAccessibilityTree(group, { getPage: session.getPage }));
  return collected;
});
  console.log(
    `North Star V1 found ${facebookListings.length} Facebook listings`
  );
const allListings = filterListings([
  ...ebayListings,
  ...facebookListings,
]);
const enrichedListings = deduplicateListings(allListings).map((listing) => ({
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
const mobileListings = enrichedListings.map(listing => toMobileOpportunity({
  watch: { ...listing, title: listing.title ?? listing.listingText ?? "", image: listing.image ?? null },
  score: 0, decision: "REVIEW",
}));
await uploadOpportunities(mobileListings);
  // Resources are explicitly released; allow Node to exit naturally.
}

// Legacy V1 collects eBay. It is deliberately unavailable during Facebook-only rollout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error('Legacy V1 is disabled for the Facebook-only rollout. Use the approved daily runner.');
  process.exitCode = 1;
}
