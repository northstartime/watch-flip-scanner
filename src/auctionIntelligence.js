export function evaluateAuction({
  hoursRemaining,
  bidCount,
  currentBid,
  maximumBid,
  watcherCount = 0,
  sellerScore = 100
}) {

  if (currentBid >= maximumBid) {
    return {
      status: "PASS",
      color: "🔴",
      message: "Maximum bid reached."
    };
  }

  if (hoursRemaining > 6) {
    return {
      status: "WATCH",
      color: "🟡",
      message: "Too much time remaining. Wait before bidding."
    };
  }

  if (hoursRemaining <= 1) {
    return {
      status: "ATTACK",
      color: "🟢",
      message: "Auction ending soon. Prepare to bid."
    };
  }

  return {
    status: "MONITOR",
    color: "🟠",
    message: "Watch closely until final hour."
  };
}