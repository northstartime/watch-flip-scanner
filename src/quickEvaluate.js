import fs from "fs";
import { fileURLToPath } from "url";
import { parseListing } from "./parser.js";
import { evaluateWatch } from "./businessScore.js";

export async function main(listingText = null) {
  const listing = listingText ?? fs.readFileSync("listing.txt", "utf8");
  const watch = parseListing(listing);
  const evaluation = evaluateWatch(watch);
  return {
    brand: watch.brand, model: watch.model, reference: watch.reference,
    year: watch.year, price: watch.price, marketValue: watch.marketValue,
    estimatedMarketValue: watch.estimatedMarketValue,
    projectedProfit: evaluation.profit, maxOffer: evaluation.maximumBid,
    score: evaluation.score, stars: "", decision: evaluation.decision,
    reasons: evaluation.reasons,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(result)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
