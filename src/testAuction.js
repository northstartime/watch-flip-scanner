import { evaluateAuction } from "./auctionIntelligence.js";

const result = evaluateAuction({
  hoursRemaining: 11,
  bidCount: 13,
  currentBid: 4550,
  maximumBid: 5100,
  watcherCount: 190,
  sellerScore: 100
});

console.log(result);