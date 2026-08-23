import fs from "fs";
import { dumpAccessibilityTree } from "./collectors/modaCollector.js";
const targets = JSON.parse(
  fs.readFileSync("wtb-targets.json", "utf8")
);

const DEMAND_WORDS =
  /\b(?:WTB|ISO|NTQ|NEED|LOOKING FOR|WHO HAS|BUYING)\b/i;

function extractReferences(text) {
  const matches =
  String(text).toUpperCase().match(
  /\b(?:1\d{5}[A-Z]{0,4}|\d{4,8}[A-Z]{1,4}|[A-Z]{2,6}\d{3,8}[A-Z0-9.-]*)\b/g
    ) || [];

  return [...new Set(matches)];
}

async function main() {
  console.log("Scanning Moda WTB / ISO demand...");

const posts = await dumpAccessibilityTree("WatchBuying");


  const demands = posts
    .filter((post) => DEMAND_WORDS.test(post.listingText || ""))
    .map((post) => ({
      id: post.id.replace("moda-", "wtb-"),
      buyer: post.seller,
      references: extractReferences(post.listingText),
      demandText: post.listingText,
      source: "Moda WTB/ISO",
      url: post.url,
      capturedAt: post.capturedAt,
      status: "DEMAND_MATCH_CANDIDATE",
    }));
const matches = [];

for (const target of targets) {
  const targetRef = String(target.reference || "").toUpperCase();

  for (const demand of demands) {
    const demandRefs = demand.references.map((ref) =>
      String(ref).toUpperCase()
    );

    if (demandRefs.includes(targetRef)) {
      const demandText = demand.demandText.toLowerCase();

      let matchQuality = "POSSIBLE";

      if (
        target.year &&
        demandText.match(/\b20\d{2}\b/) &&
        !demandText.includes(String(target.year))
      ) {
        matchQuality = "REJECT";
      }

      if (
        target.set === "watch only" &&
        /\b(full set|complete set|with card|papers)\b/i.test(
          demand.demandText
        )
      ) {
        matchQuality = "REJECT";
      }

      if (
        target.dial &&
        demandText.includes("black") &&
        target.dial.toLowerCase() !== "black"
      ) {
        matchQuality = "REJECT";
      }

      if (matchQuality !== "REJECT") {
        matches.push({
          inventory: target.name,
          reference: target.reference,
          buyer: demand.buyer,
          matchQuality,
          demand: demand.demandText.replace(/\s+/g, " "),
          url: demand.url,
          capturedAt: demand.capturedAt,
        });
      }
    }
  }
}

  fs.writeFileSync(
    "wtb-demand.json",
    JSON.stringify(demands, null, 2),
    "utf8"
  );

  console.log(`\nSaved ${demands.length} WTB/ISO demand posts.\n`);

  console.table(
    demands.map((d) => ({
      buyer: d.buyer,
      references: d.references.join(", "),
      demand: d.demandText.replace(/\s+/g, " ").slice(0, 80),
    }))
  );

console.log("\n===== INVENTORY DEMAND MATCHES =====\n");

if (matches.length === 0) {
  console.log("No current WTB/ISO matches for inventory.");
} else {
  console.table(matches);
}

}

main().catch((error) => {
  console.error("WTB SCANNER ERROR");
  console.error(error);
  process.exitCode = 1;
});