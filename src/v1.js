import { getEbayListingsV1 } from "./markets/ebayV1.js";
import { dumpAccessibilityTree } from "./collectors/modaCollector.js";
import { uploadOpportunities } from "./cloudSync.js";

async function run() {
  console.log("North Star V1 starting...");

  const ebayListings = await getEbayListingsV1();

  console.log(
    `North Star V1 found ${ebayListings.length} eBay listings`
  );

  console.log("Testing Facebook collector...");

  const facebookListings =
    await dumpAccessibilityTree("watchtradercommunity");

  console.log(
    `North Star V1 found ${facebookListings.length} Facebook listings`
  );
  const allListings = [
  ...ebayListings,
  ...facebookListings,
];

console.log(
  `North Star V1 total listings: ${allListings.length}`
);
await uploadOpportunities(allListings);
  process.exit(0);
}

run().catch((error) => {
  console.error("North Star V1 failed:", error);
});