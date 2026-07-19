import axios from "axios";
import { getEbayAccessToken } from "./ebayAuth.js";
import { estimateMarketValue, getMarketData } from "../marketValue.js";

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

const BLOCKED_TITLE_WORDS = [
  "aftermarket",
  "bezel",
  "box only",
  "bracelet only",
  "buckle",
  "case only",
  "clasp",
  "custom dial",
  "dial only",
  "display stand",
  "down payment",
  "empty box",
  "for parts",
  "homage",
  "insert only",
  "link only",
  "links only",
  "manual only",
  "movement only",
  "parts only",
  "papers only",
  "replica",
  "repair only",
  "strap only",
  "watch band",
  "watch roll",
"certificate",
"certificate only",
"guarantee certificate",
"guarantee card",
"warranty certificate",
"warranty card",
"replacement bracelet",
"oyster bracelet",
"watch bracelet",
"fit rolex",
"deposit",
"down payment",
"custom",
"customized",
"aftermarket dial",
"replica",
"service",
"repair",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getPrice(item) {
  return Number(
    item.currentBidPrice?.value ??
      item.price?.value ??
      0
  );
}

function getShipping(item) {
  const shippingOptions = item.shippingOptions || [];

  if (shippingOptions.length === 0) {
    return 0;
  }

  return Number(
    shippingOptions[0]?.shippingCost?.value ?? 0
  );
}

function isLikelyCompleteWatch(item) {
  const title = normalizeText(item.title);

  if (!title) {
    return false;
  }

  const hasBlockedPhrase = BLOCKED_TITLE_WORDS.some(
    (phrase) => title.includes(phrase)
  );

  if (hasBlockedPhrase) {
    return false;
  }

  /*
   * Reject common accessory listings while avoiding false matches
   * such as "box and papers."
   */
  const accessoryPatterns = [
    /\bbracelet\b.*\bonly\b/,
    /\bdial\b.*\bonly\b/,
    /\bbezel\b.*\bonly\b/,
    /\bcase\b.*\bonly\b/,
    /\bmovement\b.*\bonly\b/,
    /\bstrap\b.*\bonly\b/,
    /\bclasp\b.*\bonly\b/,
    /\blinks?\b.*\bonly\b/,
  ];

  return !accessoryPatterns.some((pattern) =>
    pattern.test(title)
  );
}

function detectBoxAndPapers(title) {
  const text = normalizeText(title);

  const boxTerms =
    text.includes("box") ||
    text.includes("full set") ||
    text.includes("complete set");

  const paperTerms =
    text.includes("papers") ||
    text.includes("card") ||
    text.includes("warranty");

  return boxTerms && paperTerms;
}

function detectFullLinks(title) {
  const text = normalizeText(title);

  return (
    text.includes("full links") ||
    text.includes("all links") ||
    text.includes("complete bracelet")
  );
}

function determineCondition(item) {
  const title = normalizeText(item.title);
  const apiCondition = String(item.condition || "Unknown");

  if (
    title.includes("new unworn") ||
    title.includes("unworn")
  ) {
    return "Unworn";
  }

  if (
    title.includes("new with box") ||
    title.includes("brand new")
  ) {
    return "New";
  }

  if (
    title.includes("excellent condition") ||
    title.includes("mint condition")
  ) {
    return "Pre-owned - Excellent";
  }

  if (
    title.includes("very good condition") ||
    title.includes("very good")
  ) {
    return "Pre-owned - Very Good";
  }

  if (title.includes("good condition")) {
    return "Pre-owned - Good";
  }

  return apiCondition;
}

function normalizeListing(item, brand) {
  const price = getPrice(item);

  if (price < 500) {
    return null;
  }

  if (!isLikelyCompleteWatch(item)) {
    return null;
  }

  const marketData = getMarketData(item.title);

const estimatedMarketValue =
  marketData?.expected ?? estimateMarketValue(item.title);

  if (estimatedMarketValue === null) {
    return null;
  }
  const priceRatio =
    estimatedMarketValue > 0 ? price / estimatedMarketValue : 0;

  if (priceRatio < 0.35) {
    return null;
  }
  const buyingOptions = Array.isArray(item.buyingOptions)
  ? item.buyingOptions
  : [];

const isAuction =
  buyingOptions.some(
    (option) => String(option).toUpperCase() === "AUCTION"
  ) || item.currentBidPrice?.value !== undefined;
  return {
    title: item.title || "Untitled eBay listing",
    brand,
    model: item.title || "Unknown model",

    buyPrice: price,
    buyingOption: isAuction ? "AUCTION" : "FIXED_PRICE",
currentBid: isAuction ? price : undefined,
auctionType: isAuction ? "auction" : "fixed price",
    

    marketValue: estimatedMarketValue,
    marketData,
    valuationFound: true,

    fees: 300,
    shipping: getShipping(item),

    hasBoxAndPapers: detectBoxAndPapers(item.title),
    fullLinks: detectFullLinks(item.title),
    trustedSeller: false,

    condition: determineCondition(item),
    source: "eBay Live",
    url: item.itemWebUrl || "",
    itemId: item.itemId || item.itemWebUrl || "",

    sellerUsername:
      item.seller?.username || "Unknown seller",

    sellerFeedbackPercentage: Number(
      item.seller?.feedbackPercentage ?? 0
    ),

    sellerFeedbackScore: Number(
      item.seller?.feedbackScore ?? 0
    ),

    endDate: item.itemEndDate || null,
  };
}

function removeDuplicateListings(listings) {
  const listingMap = new Map();

  for (const listing of listings) {
    const uniqueKey =
      listing.itemId ||
      listing.url ||
      `${listing.title}-${listing.buyPrice}`;

    if (!listingMap.has(uniqueKey)) {
      listingMap.set(uniqueKey, listing);
    }
  }

  return Array.from(listingMap.values());
}

export async function getEbayListings() {
  console.log("Fetching targeted live eBay listings...");

  const token = await getEbayAccessToken();
  const allListings = [];

  for (const search of SEARCHES) {
    try {
      const response = await axios.get(EBAY_SEARCH_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },

        params: {
          q: search.query,
          limit: 50,

          /*
           * Auction listings located in the United States.
           */
          filter:
          "buyingOptions:{AUCTION|FIXED_PRICE},itemLocationCountry:US",  
        },

        timeout: 20000,
      });

      const items =
        response.data?.itemSummaries || [];

      console.log(
        `${search.query}: ${items.length} listings`
      );

      for (const item of items) {
        const listing = normalizeListing(
          item,
          search.brand
        );

        if (listing) {
          allListings.push(listing);
        }
      }
    } catch (error) {
      const ebayMessage =
        error.response?.data?.errors?.[0]?.message;

      console.error(
        `Search failed for ${search.query}: ${
          ebayMessage || error.message
        }`
      );
    }
  }

  const uniqueListings =
    removeDuplicateListings(allListings);

  const usableListings = uniqueListings.filter(
    (listing) =>
      listing.buyPrice > 0 &&
      listing.marketValue > 0 &&
      listing.valuationFound
  );

  console.log(
    `Found ${uniqueListings.length} unique listings; ` +
      `${usableListings.length} have recognized references.`
  );

  return usableListings;
}