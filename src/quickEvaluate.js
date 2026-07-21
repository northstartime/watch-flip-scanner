const exit = EXIT_STRATEGIES.dealer;
import { estimateMarketValue } from "./marketValue.js";
import readline from "readline";
import { getDealer } from "./dealerManager.js";
import { parseListing } from "./parser.js";
import fs from "fs";
import { EXIT_STRATEGIES } from "./exitStrategies.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log("\n==============================");
  console.log(" NORTH STAR IMPORT");
  console.log("==============================");

const listing = fs.readFileSync("listing.txt", "utf8");
  console.log("\n==============================");
  console.log(" ORIGINAL LISTING");
  console.log("==============================\n");

const result = parseListing(listing);
const marketValue = estimateMarketValue(result.originalListing);
const spread = marketValue - result.price;
const sellingFee = marketValue * exit.sellingFeePercent;
const projectedProfit =
  spread -
  sellingFee -
  exit.shippingIn -
  exit.shippingOut;
let decision = "PASS";

let score = 50;
console.log("Starting Score:", score);

const reasons = [];

// Profit
// Profit
if (projectedProfit >= 1500) {
    score += 25;
    reasons.push("+25 Excellent Profit");
}
else if (projectedProfit >= 1000) {
    score += 15;
    reasons.push("+15 Strong Profit");
}
else if (projectedProfit >= 500) {
    score += 8;
    reasons.push("+8 Profitable");
  console.log("After Profit:", score);  
}

// Papers
if (result.hasPapers) {
    score += 10;
    reasons.push("+10 Papers");
      console.log("After Papers:", score);
}

// Box
if (result.hasBox) {
    score += 5;
    reasons.push("+5 Box");
}

// Condition

// Condition
if (result.isPolished) {
    score -= 5;
    reasons.push("-5 Polished");
    console.log("After Polished:", score);
}
console.log("scrambledSerial value =", result.scrambledSerial);
if (result.scrambledSerial) {
    score += 3;
    reasons.push("+3 Scrambled Serial");
    console.log("After Scrambled:", score);
}

if (result.dealerListing) {
    score += 4;
    reasons.push("+4 Dealer Listing");
    console.log("After Dealer Listing:", score);
}




if (result.tradeAccepted) {
    score += 2;
    reasons.push("+2 Trades Accepted");
    console.log("After Trades:", score);
}



// Polished


score = Math.max(0, Math.min(100, score));



if (score >= 80) {
  decision = "BUY";
} else if (score >= 65) {
  decision = "HOLD";
}


console.log(result.originalListing);

console.log("\nBrand: " + result.brand);
console.log("Model: " + result.model);
console.log("Reference: " + result.reference);
console.log("Year: " + (result.year ?? "Unknown"));
console.log("Price: $" + result.price);
console.log("Box: " + (result.hasBox ? "Yes" : "No"));
console.log("Papers: " + (result.hasPapers ? "Yes" : "No"));
console.log("Condition: " + (result.condition ?? "Unknown"));
console.log("Market Value: $" + marketValue);
console.log("Spread: $" + spread);
console.log("Selling Fee: $" + sellingFee.toFixed(2));
console.log("Shipping In: $" + exit.shippingIn.toFixed(2));
console.log("Shipping Out: $" + exit.shippingOut.toFixed(2));
console.log("Projected Net Profit: $" + projectedProfit.toFixed(2));
const maxOffer = Math.max(
  result.price,
  Math.round(marketValue - 1000)
);

console.log("Maximum Offer: $" + maxOffer);


console.log("Planned Exit:", exit.name);
console.log("Score before stars =", score);
const stars = "⭐".repeat(Math.round(score / 20));

console.log("North Star Score: " + score + "/100 " + stars);
console.log("");
console.log("Dealer Intelligence");
console.log("-------------------");

console.log(
    "Polished: " +
    (result.isPolished ? "YES" : "NO")
);

console.log(
    "Scrambled Serial: " +
    (result.scrambledSerial ? "YES" : "NO")
);

console.log(
    "Dealer Listing: " +
    (result.dealerListing ? "YES" : "NO")
);

console.log(
    "Trades Accepted: " +
    (result.tradeAccepted ? "YES" : "NO")
);

console.log(
    "Bracelet Size: " +
    (result.wristSize ?? "Unknown")
);
console.log("");
console.log("Score Breakdown");
console.log("----------------");

for (const reason of reasons) {
    console.log(reason);
}
console.log("Decision: " + decision);



  rl.close();
}

main();