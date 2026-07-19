export function evaluateBusinessOpportunity(opportunity) {
  let score = 50;
  const reasons = [];

  if (opportunity.inventoryAccess >= 9) {
    score += 15;
    reasons.push("Excellent inventory access");
  }

  if (opportunity.reputation >= 9) {
    score += 15;
    reasons.push("Excellent reputation");
  }

  if (opportunity.verification >= 8) {
    score += 10;
    reasons.push("Trusted community");
  }

  if (opportunity.networking >= 8) {
    score += 10;
    reasons.push("Strong networking potential");
  }

  if (opportunity.cost <= opportunity.maxBudget) {
    score += 5;
    reasons.push("Within budget");
  } else {
    score -= 10;
    reasons.push("Over budget");
  }

  score = Math.max(0, Math.min(score, 100));

  let recommendation = "PASS";

  if (score >= 85) recommendation = "JOIN";
  else if (score >= 70) recommendation = "CONSIDER";

  return {
    score,
    recommendation,
    reasons,
  };
}