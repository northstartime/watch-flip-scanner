import readline from "readline";
import { getDealer } from "./dealerManager.js";

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
  console.log(" NORTH STAR QUICK EVALUATE");
  console.log("==============================\n");

  const title = await ask("Watch: ");
  const price = await ask("Asking Price: ");
  const dealer = await ask("Dealer: ");

  const dealerInfo = getDealer(dealer);

  console.log("\n------------------------------");
  console.log("Watch :", title);
  console.log("Price :", price);
  console.log("Dealer:", dealer);

  if (dealerInfo) {
    console.log("Dealer Score:", dealerInfo.dealerScore);
  } else {
    console.log("Dealer Score: Unknown");
  }

  console.log("------------------------------");

  rl.close();
}

main();