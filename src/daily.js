import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getModaListings } from "./markets/moda.js";
import { evaluateWatch } from "./businessScore.js";
import { evaluateAuction } from "./auctionIntelligence.js";
import { uploadOpportunities } from "./cloudSync.js";
import { deduplicateListings, toMobileOpportunity } from "./listingIntegrity.js";
import { embedModaImages } from "./mobileImages.js";
import { measureStage, loadRuntimeEnvironment } from "./runtimeUtils.js";
import { scannerOutputDirectory, validateScannerConfiguration } from './scannerConfig.js';
import { eligibleSaleRecord } from './saleListing.js';

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

export function formatListing(result) {
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
      : isAuction ? "MANUAL REVIEW" : "NOT AN AUCTION";

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
  profit !== null && hasValidMarketValue ? money(marketValue) : "Manual Review"
}\n`;

if (profit !== null && hasValidBuyPrice && hasValidMarketValue) {
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
  if (profit !== null && watch.marketData) {
  output += `Wholesale:     ${money(watch.marketData.wholesale)}\n`;
  output += `Retail:        ${money(watch.marketData.retail)}\n`;
  output += `Confidence:    ${watch.marketData.confidence}%\n`;
  output += `Updated:       ${watch.marketData.updated}\n\n`;
}
  output += `Fees:              ${watch.fees == null ? "Unknown" : money(fees)}\n`;
  output += `Shipping:          ${watch.shipping == null ? "Unknown" : money(shipping)}\n`;
output += `Projected Profit:  ${
  profit !== null ? money(profit) : "Manual Review"
}\n`;

output += `ROI:               ${
  roi !== null ? `${number(roi).toFixed(1)}%` : "Manual Review"
}\n\n`;

if (isAuction) {
  output += `Current Bid:      ${money(currentBid)}\n`;
  output += `Maximum Bid:      ${maximumBid == null ? "Manual Review" : money(maximumBid)}\n`;
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
    )} | Profit: ${profit == null ? "Manual Review" : money(profit)}`,
    `   ROI: ${roi == null ? "Manual Review" : number(roi).toFixed(1) + "%"} | Score: ${number(
      score
    )}/100 | Decision: ${text(decision)}`,
    `   ${text(watch.url, "No URL available")}`,
    "",
  ].join("\n");
}

async function main({ collect = getModaListings, embed = embedModaImages, upload = uploadOpportunities, config = {} } = {}) {
  const outputDirectory = scannerOutputDirectory(config);
  console.log("******** USING DAILY.JS ********");
  try {
    console.log("========================================");
    console.log("       NORTH STAR SCANNER 3.0");
    console.log("========================================");
    console.log("Collecting Facebook listings; eBay collection remains disabled.\n");
// Get listings from each source
const ebayListings = [];

// Placeholder for future sources
const modaListings = await measureStage("facebook-collection", () => collect());

const dealerListings = [];

// Combine all listings
const listings = deduplicateListings([
  ...ebayListings,
  ...modaListings,
  ...dealerListings
]).filter(watch=>eligibleSaleRecord(watch));


console.log(`Listings returned: ${listings.length}`);
    const evaluatedListings = listings
      .map((watch) => {
        const evaluation = evaluateWatch(watch);
const auction = evaluation.maximumBid == null ? { status: "REVIEW", message: "Verified acquisition and exit required before bidding." } : evaluateAuction({
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
    number(score) >= 60 ||
    number(profit) >= 1500 ||
    String(decision).includes("BUY") ||
    String(decision).includes("POSSIBLE")
);
// Browser navigation is user initiated; scans never open opportunity tabs.

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
  .filter(({ watch,decision }) => watch.source === "Moda" && eligibleSaleRecord(watch) && decision==='REVIEW');

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
const mobileOpportunities = mobileResults.map(toMobileOpportunity);

const mobileOpportunitiesWithImages = await measureStage("image-embedding", () => embed(mobileOpportunities));
const opportunitiesPath = path.join(
  outputDirectory,
  "opportunities.json"
);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  opportunitiesPath,
JSON.stringify(mobileOpportunitiesWithImages, null, 2),
  "utf8"
);
console.log(`📱 Updated ${mobileOpportunities.length} mobile opportunities.`);

try {
await measureStage("cloud-upload", () => upload(mobileOpportunitiesWithImages));
} catch (cloudError) {
  console.error(`☁️ ${cloudError.message || cloudError}`);
  process.exitCode = 1;
}

    const reportPath = path.join(outputDirectory, `daily-report-${today}.txt`);
    fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Report saved to: ${reportPath}`);


} catch (error) {
    console.error("\nNORTH STAR SCANNER ERROR");

    console.error('Scanner failed. No automatic retry was performed.');

    process.exitCode = 1;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await loadRuntimeEnvironment();
    validateScannerConfiguration();
    await measureStage("daily-total", () => main());
  } catch {
    console.error('Scanner configuration failed. No scan was started.');
    process.exitCode = 1;
  }
}
export { main };

