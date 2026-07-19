function number(value) {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function evaluateWatch(watch) {
  const buyPrice = number(watch.buyPrice);
  const marketValue = number(watch.marketValue);
  const fees = number(watch.fees);
  const shipping = number(watch.shipping);

  const profit = marketValue - buyPrice - fees - shipping;
  const roi = buyPrice > 0 ? (profit / buyPrice) * 100 : 0;

  const desiredProfit = 1000;
  const maximumBid = Math.max(
    0,
    marketValue - fees - shipping - desiredProfit
  );

  let score = 0;
  const reasons = [];
  const warnings = [];
  let integrityScore = 100;
const integrityIssues = [];

  const title = normalized(watch.title);
  const model = normalized(watch.model);
  const condition = normalized(watch.condition);


  /*
   * PROFIT SCORE — maximum 40 points
   */
  if (profit >= 2000) {
    score += 40;
    reasons.push("Exceptional profit potential");
  } else if (profit >= 1500) {
    score += 36;
    reasons.push("Strong profit potential");
  } else if (profit >= 1000) {
    score += 31;
    reasons.push("Target profit achieved");
  } else if (profit >= 750) {
    score += 24;
    reasons.push("Useful profit margin");
  } else if (profit >= 500) {
    score += 17;
    reasons.push("Moderate profit margin");
  } else if (profit > 0) {
    score += 5;
    warnings.push("Profit below preferred target");
  } else {
    score -= 30;
    warnings.push("Projected loss");
  }

  /*
   * ROI SCORE — maximum 25 points
   */
  if (roi >= 20) {
    score += 25;
    reasons.push("Exceptional ROI");
  } else if (roi >= 15) {
    score += 22;
    reasons.push("Excellent ROI");
  } else if (roi >= 10) {
    score += 17;
    reasons.push("Good ROI");
  } else if (roi >= 7) {
    score += 11;
    reasons.push("Acceptable ROI");
  } else if (roi >= 4) {
    score += 4;
    warnings.push("Thin ROI");
  } else {
    score -= 12;
    warnings.push("Weak ROI");
  }

  /*
   * SELLER AND PACKAGE QUALITY
   */
  /*
 * INTEGRITY ENGINE
 */

if (!watch.hasBoxAndPapers) {
  integrityScore -= 10;
  integrityIssues.push("No box and papers");
}

if (!watch.fullLinks) {
  integrityScore -= 5;
  integrityIssues.push("Missing bracelet links");
}

if (!watch.trustedSeller) {
  integrityScore -= 10;
  integrityIssues.push("Seller not verified");
}

if (watch.stockPhoto) {
  integrityScore -= 15;
  integrityIssues.push("Possible stock photos");
}

if (watch.listingConflict) {
  integrityScore -= 20;
  integrityIssues.push("Listing information conflict");
}

integrityScore = Math.max(0, integrityScore);
  if (watch.trustedSeller) {
    score += 10;
    reasons.push("Trusted seller");
  }

  if (watch.hasBoxAndPapers) {
    score += 8;
    reasons.push("Box and papers");
  }

  if (watch.fullLinks) {
    score += 5;
    reasons.push("Full links");
  }

  /*
   * CONDITION
   */
  if (
    includesAny(condition, [
      "unworn",
      "brand new",
      "new without tags",
      "new",
    ])
  ) {
    score += 8;
    reasons.push("Strong condition");
  } else if (
    includesAny(condition, [
      "excellent",
      "very good",
      "pre-owned - excellent",
      "mint",
    ])
  ) {
    score += 6;
    reasons.push("Good condition");
  } else if (condition.includes("fair") || condition.includes("poor")) {
    score -= 8;
    warnings.push("Condition risk");
  }

  /*
   * TOM FACTOR
   */
  const modelText = `${model} ${title}`;

  if (modelText.includes("explorer")) {
    score += 8;
    reasons.push("Tom Factor: Explorer familiarity");
  } else if (
    modelText.includes("datejust") ||
    modelText.includes("date just")
  ) {
    score += 7;
    reasons.push("Tom Factor: Datejust familiarity");
  } else if (
    modelText.includes("air-king") ||
    modelText.includes("air king")
  ) {
    score += 7;
    reasons.push("Tom Factor: Air-King familiarity");
  } else if (modelText.includes("submariner")) {
    score += 6;
    reasons.push("Tom Factor: strong resale familiarity");
  } else {
    score += 2;
    reasons.push("Tom Factor: neutral");
  }

  /*
   * RISK GUARDS
   */
  if (buyPrice <= 0 || marketValue <= 0) {
    score = 0;
    warnings.push("Missing reliable price data");
  }

  if (buyPrice > marketValue) {
    score -= 25;
    warnings.push("Buy price exceeds estimated market value");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  /*
   * PRACTICAL BUSINESS DECISION
   *
   * A WATCH listing is worth seeing even when it is not yet a BUY.
   */
  let decision = "🔴 PASS";

  if (profit >= 1500 && roi >= 12 && score >= 72) {
    decision = "🟢 BUY NOW";
  } else if (profit >= 1000 && roi >= 10 && score >= 60) {
    decision = "🟡 STRONG WATCH";
  } else if (profit >= 750 && roi >= 7 && score >= 48) {
    decision = "🟠 WORTH CONTACTING";
  } else if (profit >= 500 && roi >= 5 && score >= 38) {
    decision = "👀 POSSIBLE";
  }

return {
  profit,
  roi,
  score,
  integrityScore,
  integrityIssues,
  reasons: [...reasons, ...warnings],
  decision,
  maximumBid,
};
}