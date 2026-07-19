import { businessOpportunities } from "./businessOpportunities.js";
import { evaluateBusinessOpportunity } from "./businessEngine.js";

console.log("");
console.log("==================================");
console.log(" NORTH STAR BUSINESS INTELLIGENCE ");
console.log("==================================");
console.log("");

for (const opportunity of businessOpportunities) {
  const result = evaluateBusinessOpportunity(opportunity);

  console.log(opportunity.name);
  console.log("----------------------------------");
  console.log(`Cost: $${opportunity.cost}`);
  console.log(`Business Score: ${result.score}/100`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log("");

  console.log("Reasons:");

  for (const reason of result.reasons) {
    console.log(`✅ ${reason}`);
  }

  console.log("");
}