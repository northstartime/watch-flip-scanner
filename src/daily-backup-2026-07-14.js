import fs from "fs";
import { getEbayListings } from "./markets/ebay.js";
import { evaluateWatch } from "./businessScore.js";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

async function main() {
  try {
    const listings = await getEbayListings();

    const evaluatedListings = listings
      .map((watch) => {
        const evaluation = evaluateWatch(watch);

        return {
          watch,
          ...evaluation,
          hiddenGem:
            evaluation.profit >= 2500 &&
            evaluation.roi >= 20 &&
            evaluation.score >= 60,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.profit - a.profit;
      });

    const opportunities = evaluatedListings.filter(
      ({ score, profit, decision }) =>
        score >= 60 ||
        profit >= 1500 ||
        String(decision).includes("BUY") ||
        String(decision).includes("POSSIBLE")
    );

    const hiddenGems = opportunities.filter(
      ({ hiddenGem }) => hiddenGem
    );

    const passedCount = evaluatedListings.filter(
      ({ decision }) => String(decision).includes("PASS")
    ).length;

    let report = `
========================================
       NORTH STAR SCANNER 3.0
             DEAL REPORT
Date: ${new Date().toLocaleDateString()}
========================================

Listings Reviewed: ${evaluatedListings.length}
Opportunities: ${opportunities.length}
Hidden Gems: ${hiddenGems.length}
Passed: ${passedCount}
`;

    if (opportunities.length === 0) {
      report += `
----------------------------------------
NO QUALIFIED OPPORTUNITIES TODAY

Discipline Guard:
Do not force a purchase. Capital preserved.
`;
    }

    for (const result of opportunities) {
      const {
        watch,
        profit,
        roi,
        score,
        decision,
        reasons,
        maximumBid,
        hiddenGem,
      } = result;

      const keepBidding =
        Number(watch.currentBid) <= Number(maximumBid);

      report += `
${hiddenGem ? "⭐⭐⭐ HIDDEN GEM ALERT ⭐⭐⭐" : "----------------------------------------"}
${decision}
${watch.brand} ${watch.model}

Title:             ${watch.title}
Source:            ${watch.source}
Condition:         ${watch.condition}
URL:               ${watch.url}

Buy Price:         $${money(watch.buyPrice)}
Market Value:      $${money(watch.marketValue)}
Fees:              $${money(watch.fees)}
Shipping:          $${money(watch.shipping)}
Projected Profit:  $${money(profit)}
ROI:               ${Number(roi).toFixed(1)}%

Current Bid:       $${money(watch.currentBid)}
Maximum Bid:       $${money(maximumBid)}
Auction Mode:      ${keepBidding ? "KEEP BIDDING" : "STOP BIDDING"}

North Star Score:  ${score}/100

Reasons:
${reasons.map((reason) => `✅ ${reason}`).join("\n")}
`;
    }

    report += `
========================================
END OF NORTH STAR REPORT
========================================
`;

    if (!fs.existsSync("reports")) {
      fs.mkdirSync("reports");
    }

    const fileName =
      `reports/daily-report-${new Date()
        .toISOString()
        .slice(0, 10)}.txt`;

    fs.writeFileSync(fileName, report);

    console.log(report);
    console.log(`Report saved to: ${fileName}`);
  } catch (error) {
    console.error("Scanner failed:");
    console.error(
      error.response?.data ||
      error.stack ||
      error.message ||
      error
    );

    process.exitCode = 1;
  }
}

main();