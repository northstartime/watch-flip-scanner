import fs from "fs";

const opportunities = JSON.parse(
  fs.readFileSync("src/data/opportunities.json", "utf8")
);

const demands = JSON.parse(
  fs.readFileSync("wtb-demand.json", "utf8")
);

const inventory = JSON.parse(
  fs.readFileSync("wtb-targets.json", "utf8")
);
function extractReferences(text) {
  const matches =
    String(text).toUpperCase().match(
  /\b(?:1\d{5}[A-Z]{0,4}|\d{4,8}[A-Z]{1,4}|[A-Z]{2,6}\d{3,8}[A-Z0-9.-]*)\b/g   
    ) || [];

  return [...new Set(matches)];
}
const inventoryMatches = [];
const opportunityMatches = [];

for (const demand of demands) {
  const demandRefs = (demand.references || []).map((ref) =>
    String(ref).toUpperCase()
  );

  for (const item of inventory) {
    const inventoryRef = String(item.reference || "").toUpperCase();

    if (inventoryRef && demandRefs.includes(inventoryRef)) {
      inventoryMatches.push({
        type: "INVENTORY MATCH",
        watch: item.name,
        reference: item.reference,
        buyer: demand.buyer,
        demand: demand.demandText,
        demandUrl: demand.url,
      });
    }
  }

  for (const opportunity of opportunities) {
   const opportunityRefs = extractReferences(
  opportunity.reference ||
  opportunity.originalListing ||
  opportunity.title ||
  ""
);

    for (const ref of opportunityRefs) {
      if (demandRefs.includes(ref)) {
        const askText = String(
  opportunity.originalListing ||
  opportunity.title ||
  ""
).toLowerCase();

const demandText = String(
  demand.demandText ||
  ""
).toLowerCase();

let matchQuality = "POSSIBLE";
let matchScore = 1;

const demandYears =
  demandText.match(/\b20\d{2}\b/g) || [];

if (
  demandYears.length > 0 &&
  !demandYears.some((year) => askText.includes(year))
) {
  matchQuality = "REJECT";
}

if (
  /\b(full set|complete set|with card|papers)\b/i.test(demand.demandText || "") &&
  !/\b(full set|complete set|with card|papers)\b/i.test(
    opportunity.originalListing || ""
  )
) {
  matchQuality = "REJECT";
}

if (
  /\b(full set|complete set|with card|papers)\b/i.test(demand.demandText || "") &&
  /\b(full set|complete set|with card|papers)\b/i.test(
    opportunity.originalListing || ""
  )
) {
  matchScore += 2;
}

if (
  demandYears.length > 0 &&
  demandYears.some((year) => askText.includes(year))
) {
  matchScore += 2;
}


const configWords = [
  "black",
  "blue",
  "white",
  "green",
  "rhodium",
  "silver",
  "red",
  "grape",
  "meteorite",
  "jubilee",
  "oyster",
  "champ",
  "champagne",
  "panda"
];

const demandedConfigs = configWords.filter((word) =>
  demandText.includes(word)
);

if (demandedConfigs.length > 0) {
  const matchedConfigs = demandedConfigs.filter((word) =>
    askText.includes(word)
  );

  if (matchedConfigs.length === 0) {
    matchQuality = "REJECT";
  } else {
    matchScore += matchedConfigs.length;
  }
}
if (matchQuality !== "REJECT") {
  if (matchScore >= 5) {
    matchQuality = "EXACT";
  } else if (matchScore >= 3) {
    matchQuality = "STRONG";
  } else {
    matchQuality = "POSSIBLE";
  }
}

if (matchQuality !== "REJECT") {
        opportunityMatches.push({
          type: "ARBITRAGE CANDIDATE",
          matchQuality,
          matchScore,
          watch: opportunity.title,
          reference: ref,
          askPrice: opportunity.price,
          marketValue: opportunity.marketValue,
          projectedProfit: opportunity.projectedProfit,
          sellerSource: opportunity.source,
          sellerUrl: opportunity.url,
          buyer: demand.buyer,
          demand: demand.demandText,
          demandUrl: demand.url,
        });
      }
    }
  }
}
}
console.log("\n===== DEBUG REFERENCES =====\n");

console.log("WTB references:");
for (const demand of demands) {
  console.log(
    demand.buyer,
    "=>",
    (demand.references || []).join(", ")
  );
}

console.log("\nASK references:");
for (const opportunity of opportunities) {
  console.log(
    opportunity.title,
    "=>",
extractReferences(
  opportunity.reference ||
  opportunity.originalListing ||
  opportunity.title ||
  ""
).join(", ")
  );
}

console.log("\nINVENTORY references:");
for (const item of inventory) {
  console.log(
    item.name,
    "=>",
    item.reference || ""
  );
}
console.log("\n===== INVENTORY MATCHES =====\n");
console.table(inventoryMatches);

console.log("\n===== LIVE ASK / WTB MATCHES =====\n");
console.table(opportunityMatches);
const historyPath = "market-matches.json";

let history = [];

if (fs.existsSync(historyPath)) {
  try {
    history = JSON.parse(
      fs.readFileSync(historyPath, "utf8")
    );

    if (!Array.isArray(history)) {
      history = [history];
    }
  } catch {
    history = [];
  }
}

if (
  inventoryMatches.length > 0 ||
  opportunityMatches.length > 0
) {
  history.push({
    generatedAt: new Date().toISOString(),
    inventoryMatches,
    opportunityMatches,
  });

  fs.writeFileSync(
    historyPath,
    JSON.stringify(history, null, 2),
    "utf8"
  );

  console.log("\nSaved match history to market-matches.json");
} else {
  console.log("\nNo matches found — history not updated.");
}