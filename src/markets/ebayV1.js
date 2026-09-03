import axios from "axios";
import { getEbayAccessToken } from "./ebayAuth.js";

const EBAY_SEARCH_URL =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

const SEARCHES = [
  { query: "Rolex 126900", brand: "Rolex" },
  { query: "Rolex 124270", brand: "Rolex" },
  { query: "Rolex 214270", brand: "Rolex" },
  { query: "Rolex 226570", brand: "Rolex" },
  { query: "Rolex 216570", brand: "Rolex" },
  { query: "Rolex 126300", brand: "Rolex" },
  { query: "Rolex 126334", brand: "Rolex" },
  { query: "Rolex 124060", brand: "Rolex" },
  { query: "Rolex 126610LN", brand: "Rolex" },
  { query: "Rolex 126710BLNR", brand: "Rolex" },
  { query: "Rolex 126710BLRO", brand: "Rolex" },
  { query: "Omega 310.30.42.50.01.002", brand: "Omega" },
  { query: "Omega 210.30.42.20.03.001", brand: "Omega" },
];

const BLOCKED = [
  "box only",
  "bracelet only",
  "dial only",
  "bezel only",
  "case only",
  "movement only",
  "strap only",
  "links only",
  "papers only",
  "replica",
  "homage",
  "for parts",
  "down payment",
  "deposit",
];

function isWatch(title) {
  const text = String(title || "").toLowerCase();

  return !BLOCKED.some((word) => text.includes(word));
}

function getPrice(item) {
  return Number(
    item.currentBidPrice?.value ??
    item.price?.value ??
    0
  );
}

function removeDuplicates(listings) {
  const map = new Map();

  for (const listing of listings) {
    const key = listing.id || listing.url;

    if (!map.has(key)) {
      map.set(key, listing);
    }
  }

  return [...map.values()];
}

export async function getEbayListingsV1() {
  console.log("V1: Fetching eBay listings...");

  const token = await getEbayAccessToken();
  const listings = [];

  for (const search of SEARCHES) {
    try {
      const response = await axios.get(
        EBAY_SEARCH_URL,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          },

          params: {
            q: search.query,
          limit: 35,
            filter:
              "buyingOptions:{FIXED_PRICE},itemLocationCountry:US",
          },

          timeout: 20000,
        }
      );

      const items =
        response.data?.itemSummaries || [];

      console.log(
        `${search.query}: ${items.length}`
      );

      for (const item of items) {
        if (!isWatch(item.title)) {
          continue;
        }

        const price = getPrice(item);

        if (price < 500) {
          continue;
        }

        listings.push({
          id: `ebay-${item.itemId}`,
          title: item.title || "",
          brand: search.brand,
          price,
          source: "eBay",
          seller:
            item.seller?.username ||
            "Unknown seller",
          url: item.itemWebUrl || "",
          image:
            item.image?.imageUrl ||
            item.thumbnailImages?.[0]?.imageUrl ||
            "",
          capturedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(
        `eBay failed: ${search.query}`,
        error.message
      );
    }
  }

  const unique =
    removeDuplicates(listings);

  console.log(
    `V1: ${unique.length} eBay listings captured`
  );

  return unique;
}