import { dumpAccessibilityTree } from "../collectors/modaCollector.js";
import { parseListing } from "../parser.js";

function isAuctionListing(text) {
  return /modaauction|start no reserve|minimum increment|top 3 bids are binding|no reserve auction/i.test(
    text
  );
}

export async function getModaListings() {
  console.log("Searching live Moda listings...");

  const collectedListings = await dumpAccessibilityTree();

  return collectedListings.map((item) => {
    const auction = isAuctionListing(item.listingText);
    const parsed = parseListing(item.listingText);

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

      price: auction ? 0 : parsed.price,
      buyPrice: auction ? 0 : parsed.buyPrice,
      marketValue: auction ? null : parsed.marketValue,

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