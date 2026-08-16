import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getEbayListings } from "./markets/ebay.js";
import { getModaListings } from "./markets/moda.js";
import { evaluateWatch } from "./businessScore.js";
import { evaluateAuction } from "./auctionIntelligence.js";
import { getDealers } from "./dealerManager.js";
import { uploadOpportunities } from "./cloudSync.js";
import { exec } from "child_process";
function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function number(value) {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
}

function text(value, fallback = "Unknown") {
  const cleaned = String(value ?? "").trim();
  return cleaned || fallback;
}

function formatListing(result) {
  const {
    watch,
    profit,
    roi,
    score,
    reasons,
    decision,
    maximumBid,
    hiddenGem,
    auction,
  } = result;

  const buyPrice = number(watch.buyPrice);
  const marketValue = number(watch.marketValue);
  const fees = number(watch.fees);
  const shipping = number(watch.shipping);

  const isAuction =
    String(watch.buyingOption || "").toUpperCase().includes("AUCTION") ||
   watch.currentBid !== null &&
watch.currentBid !== undefined;

  const currentBid = number(watch.currentBid || buyPrice);

  const auctionDecision =
    isAuction && maximumBid
      ? currentBid <= maximumBid
        ? "KEEP BIDDING"
        : "STOP BIDDING"
      : "NOT AN AUCTION";

  let output = "";

  if (hiddenGem) {
    output += "⭐⭐⭐ HIDDEN GEM ALERT ⭐⭐⭐\n";
  }

  output += `${text(decision, "🔴 PASS")}\n`;
  output += `${text(watch.brand, "")} ${text(watch.title)}\n\n`;

  output += `Title:             ${text(watch.title)}\n`;
  output += `Source:            ${text(watch.source, "eBay Live")}\n`;
  output += `Condition:         ${text(watch.condition)}\n`;
  output += `URL:               ${text(watch.url, "No URL available")}\n\n`;

  const hasValidBuyPrice =
    watch.buyPrice !== null &&
    watch.buyPrice !== undefined &&
    Number.isFinite(Number(watch.buyPrice)) &&
    Number(watch.buyPrice) > 0;
    const hasValidMarketValue =
  watch.marketValue !== null &&
  watch.marketValue !== undefined &&
  Number.isFinite(Number(watch.marketValue)) &&
  Number(watch.marketValue) > 0;

  output += `Buy Price:         ${
    hasValidBuyPrice ? money(buyPrice) : "Manual Review"
  }\n`;

output += `Market Value:      ${
  hasValidMarketValue ? money(marketValue) : "Manual Review"
}\n`;

if (hasValidBuyPrice && hasValidMarketValue) {
    const edge = marketValue - buyPrice;

    output += `Edge:              ${money(edge)}\n`;

    if (edge >= 2000) {
      output += `Opportunity:       ⭐⭐⭐⭐⭐\n`;
    } else if (edge >= 1500) {
      output += `Opportunity:       ⭐⭐⭐⭐\n`;
    } else if (edge >= 1000) {
      output += `Opportunity:       ⭐⭐⭐\n`;
    }
  } else {
    output += `Edge:              Manual Review\n`;
    output += `Opportunity:       Manual Review\n`;
  }
  if (watch.marketData) {
  output += `Wholesale:     ${money(watch.marketData.wholesale)}\n`;
  output += `Retail:        ${money(watch.marketData.retail)}\n`;
  output += `Confidence:    ${watch.marketData.confidence}%\n`;
  output += `Updated:       ${watch.marketData.updated}\n\n`;
}
  output += `Fees:              ${money(fees)}\n`;
  output += `Shipping:          ${money(shipping)}\n`;
output += `Projected Profit:  ${
  profit !== null ? money(profit) : "Manual Review"
}\n`;

output += `ROI:               ${
  roi !== null ? `${number(roi).toFixed(1)}%` : "Manual Review"
}\n\n`;

if (isAuction) {
  output += `Current Bid:      ${money(currentBid)}\n`;
  output += `Maximum Bid:      ${money(maximumBid)}\n`;
 output += `Auction Mode:     ${auctionDecision}\n`;
output += "Auction Intelligence\n";
output += "--------------------\n";
output += `Status : ${auction.status}\n`;
output += `Reason : ${auction.message}\n\n`;

} else {
  output += `Purchase Type:    FIXED PRICE\n`;
  output += `Auction Mode:     NOT AN AUCTION\n\n`;
}

 output += `North Star Score:  ${number(score)}/100\n`;

  output += "Reasons:\n";

  if (Array.isArray(reasons) && reasons.length > 0) {
    for (const reason of reasons) {
      output += `✅ ${reason}\n`;
    }
  } else {
    output += "• No positive scoring reasons recorded.\n";
  }

  output += "\n----------------------------------------\n\n";

  return output;
}

function formatRejectedCandidate(result, position) {
  const { watch, profit, roi, score, decision } = result;

  return [
    `${position}. ${text(watch.title)}`,
    `   Buy: ${money(watch.buyPrice)} | Market: ${money(
      watch.marketValue
    )} | Profit: ${money(profit)}`,
    `   ROI: ${number(roi).toFixed(1)}% | Score: ${number(
      score
    )}/100 | Decision: ${text(decision)}`,
    `   ${text(watch.url, "No URL available")}`,
    "",
  ].join("\n");
}

async function main() {
  console.log("******** USING DAILY.JS ********");
  try {
    console.log("========================================");
    console.log("       NORTH STAR SCANNER 3.0");
    console.log("========================================");
    console.log("Fetching live eBay listings...\n");
    const dealers = getDealers();

console.log("===== DEALERS =====");
console.table(dealers);

// Get listings from each source
const ebayListings = await getEbayListings();

// Placeholder for future sources
const modaListings = await getModaListings();

console.log("\n========== MODA ==========");
console.log("Moda listings:", modaListings.length);
console.dir(modaListings, { depth: null });
console.log("==========================\n");

const dealerListings = [];

// Combine all listings
const listings = [
  ...ebayListings,
  ...modaListings,
  ...dealerListings
];


console.log(`Listings returned: ${listings.length}`);
    const evaluatedListings = listings
      .map((watch) => {
        const evaluation = evaluateWatch(watch);
  if (watch.source !== "eBay") {
    console.log("\n===== MODA WATCH =====");
    console.dir(watch, { depth: null });

    console.log("\n===== EVALUATION =====");
    console.dir(evaluation, { depth: null });
}      
const auction = evaluateAuction({
  hoursRemaining: watch.hoursRemaining ?? 24,
  bidCount: watch.bidCount ?? 0,
  currentBid: watch.currentBid ?? watch.price,
  maximumBid: evaluation.maximumBid
});

        return {
          watch,
          ...evaluation,
          auction,
          hiddenGem:
            number(evaluation.profit) >= 2500 &&
            number(evaluation.roi) >= 20 &&
            number(evaluation.score) >= 60,
        };
      })
      .sort((a, b) => {
        if (number(b.score) !== number(a.score)) {
          return number(b.score) - number(a.score);
        }

        return number(b.profit) - number(a.profit);
      });
      
const opportunities = evaluatedListings.filter(
  ({ watch, score, profit, decision }) =>
    watch.source === "Moda" ||
    number(score) >= 60 ||
    number(profit) >= 1500 ||
    String(decision).includes("BUY") ||
    String(decision).includes("POSSIBLE")
);
// Open the top 3 opportunities automatically
console.log("Opening", opportunities.length, "opportunities...");

for (const watch of opportunities.slice(0, 3)) {

    console.log("URL:", watch.watch.url);

 if (watch.watch.url) {
    console.log("Opening:", watch.watch.url);
    exec(`start "" "${watch.watch.url}"`);
}

}

    const hiddenGems = opportunities.filter(({ hiddenGem }) => hiddenGem);

    const passedCount = evaluatedListings.filter(({ decision }) =>
      String(decision).includes("PASS")
    ).length;

    const today = new Date().toISOString().slice(0, 10);

    let report = `
========================================
       NORTH STAR SCANNER 3.0
              DEAL REPORT
              ${today}
========================================

Listings Reviewed: ${evaluatedListings.length}
Opportunities: ${opportunities.length}
Hidden Gems: ${hiddenGems.length}
Passed: ${passedCount}

`;

    if (opportunities.length > 0) {
      for (const result of opportunities) {
        report += formatListing(result);
      }
    } else {
      report += `
----------------------------------------

NO QUALIFIED OPPORTUNITIES TODAY

Discipline Guard:
Do not force a purchase. Capital preserved.

----------------------------------------

TOP 5 REJECTED LISTINGS FOR REVIEW

These are included for diagnosis so we can see why
the strongest listings did not qualify.

`;

      evaluatedListings.slice(0, 5).forEach((result, index) => {
        report += formatRejectedCandidate(result, index + 1);
      });
    }

    report += `
========================================
END OF NORTH STAR REPORT
========================================
`;

    console.log(report);
// ------------------------------------
// Update mobile opportunities
// ------------------------------------

const modaCandidates = evaluatedListings
  .filter(({ watch }) => watch.source === "Moda")
  .slice(0, 5);

const mobileResults = [
  ...opportunities,
  ...modaCandidates.filter(
    ({ watch }) =>
      !opportunities.some(
        ({ watch: opportunityWatch }) =>
          opportunityWatch.id === watch.id
      )
  ),
];
  const mobileOpportunities = mobileResults.map(
({ watch, profit, score, decision, roi }) => ({
    id: watch.id || Date.now() + Math.random(),

    brand: watch.brand,
    title: watch.title,

    price: watch.buyPrice,
marketValue: watch.marketValue > 0 ? watch.marketValue : null,
projectedProfit: watch.marketValue > 0 ? Math.round(profit) : null,

    score,
    decision,

    source: watch.source,

    url: watch.url,

    image: watch.image,
    buyingOption: watch.buyingOption,
requiresManualReview: watch.requiresManualReview,
currentBid: watch.currentBid,

   roi: watch.marketValue > 0 ? Math.round(roi) : null,
  })
);

const opportunitiesPath = path.join(
  __dirname,
  "data",
  "opportunities.json"
);

fs.writeFileSync(
  opportunitiesPath,
  JSON.stringify(mobileOpportunities, null, 2),
  "utf8"
);
console.log(`📱 Updated ${mobileOpportunities.length} mobile opportunities.`);

try {
  await uploadOpportunities(mobileOpportunities);
} catch (cloudError) {
  console.error(`☁️ ${cloudError.message || cloudError}`);
  process.exitCode = 1;
}

    fs.mkdirSync("reports", { recursive: true });

    const reportPath = `reports/daily-report-${today}.txt`;
    fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Report saved to: ${reportPath}`);


} catch (error) {
    console.error("\nNORTH STAR SCANNER ERROR");

    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message || error);
    }

    process.exitCode = 1;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().finally(() => {
    process.exit(process.exitCode ?? 0);
  });
}
export { main };

