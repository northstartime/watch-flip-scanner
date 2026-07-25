import readline from "readline";
import { parseListing } from "./parser.js";
import { evaluateWatch } from "./businessScore.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("");
console.log("======================================");
console.log("      NORTH STAR MODA EVALUATOR");
console.log("======================================");
console.log("");
console.log("Paste a Moda listing below.");
console.log("Press ENTER twice when finished.");
console.log("");

let lines = [];

rl.on("line", (line) => {
  if (line.trim() === "") {
    const listing = lines.join("\n");

    const watch = parseListing(listing);

    console.log("\nParsed Watch:");
    console.log(watch);

    try {
      const result = evaluateWatch(watch);

      console.log("\nEvaluation:");
      console.log(result);
    } catch (err) {
      console.log("\nEvaluation Error:");
      console.log(err.message);
    }

    rl.close();
    return;
  }

  lines.push(line);
});