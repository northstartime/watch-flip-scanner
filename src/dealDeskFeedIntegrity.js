import { facebookPostIdentity } from './listingIntegrity.js';

export function financialReviewReasons(watch) {
  const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const issues = [];
  if (watch.scoringReviewIssue) issues.push(watch.scoringReviewIssue);
  const auction = String(watch.buyingOption).toUpperCase().includes('AUCTION');
  if (auction) issues.push('Auction bid cannot establish a fixed acquisition price');
  else if (!positive(watch.buyPrice)) {
    const diagnostics = {
      post_text_truncated: 'Listing text is truncated. Confirm the full asking price.',
      multiple_asking_prices: 'Multiple prices found. Confirm the current asking price.',
      multi_watch_post: 'Multiple watches share this post. Confirm the price for this watch.',
      unsupported_currency: 'Confirm the asking price in USD.',
    };
    issues.push(diagnostics[watch.priceExtraction?.reason] ?? 'Missing reliable acquisition price');
  }
  if (!positive(watch.marketValue)) issues.push("Missing reliable resale value");
  if (watch.acquisitionVerified !== true) issues.push("Acquisition price and total costs are unverified");
  if (watch.exitVerified !== true || !watch.exitEvidence?.source || !watch.exitEvidence?.verifiedAt) issues.push("Resale exit is unverified");
  const validCost = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!validCost(watch.fees)) issues.push('Fees are missing or invalid');
  if (!validCost(watch.shipping)) issues.push('Shipping costs are missing or invalid');
  if (watch.seller === 'Unknown seller') issues.push('Seller identity is unconfirmed');
  else if (watch.requiresManualReview && !auction && positive(watch.buyPrice)) issues.push('Listing requires manual review');
  return issues;
}

export function deduplicateFeedOpportunities(rows, now = Date.now()) {
  const positions = new Map(), distinct = [];
  const captureTime = row => {
    const time = Date.parse(row.capturedAt);
    return Number.isFinite(time) && time <= now ? time : -Infinity;
  };
  for (const row of rows) {
    const post = facebookPostIdentity(row.url);
    const key = post ? (row.watchKey ? post+':watch:'+row.watchKey : post) : (row.id == null ? null : 'id:'+String(row.id));
    const index = key == null ? undefined : positions.get(key);
    if (index === undefined) {
      if (key != null) positions.set(key, distinct.length);
      distinct.push(row);
    } else if (captureTime(row) > captureTime(distinct[index])) {
      distinct[index] = row;
    }
  }
  return distinct;
}

export function projectOpportunityForFeed(row, now = Date.now()) {
  const hasValuation = [row.marketValue, row.projectedProfit, row.maximumOffer, row.maximumAllIn, row.openingOffer].some(Number.isFinite) || row.score > 0;
  if (!hasValuation) return row;
  const captured = Date.parse(row.capturedAt);
  const expired = row.valuationExpiresAt != null && !(Date.parse(row.valuationExpiresAt) > now);
  if (!expired && Number.isFinite(captured) && captured <= now && now - captured < 86400000) return row;
  const hold = expired ? 'The reviewed valuation expired. Recheck the exit and costs.'
    : 'Listing capture is stale or undated. Recheck availability and price.';
  return {...row, marketValue:null, projectedProfit:null, roi:null, score:0, maximumOffer:null,
    maximumAllIn:null, openingOffer:null, decision:'REVIEW', requiresManualReview:true,
    reasons:[hold]};
}

export function toMobileOpportunity({ watch, profit, roi, score, decision, reasons = [] }) {
  const reviewReasons = financialReviewReasons(watch);
  const verified = reviewReasons.length === 0 && decision !== 'REVIEW';
  return { id: watch.id, brand: watch.brand, title: watch.title, reference: watch.reference ?? null,
    condition: watch.configuration?.condition ?? watch.condition ?? null,
    completeness: watch.configuration?.completeness ?? null,
    originalListing: watch.originalListing ?? null, seller: watch.seller ?? "Unknown seller", capturedAt: watch.capturedAt ?? null,
    price: watch.buyPrice ?? watch.price ?? null, marketValue: verified ? watch.marketValue : null,
    estimatedMarketValue: watch.estimatedMarketValue ?? watch.marketValue ?? null,
    projectedProfit: verified && Number.isFinite(profit) ? (watch.dealDeskValuation ? profit : Math.round(profit)) : null,
    roi: verified && Number.isFinite(roi) ? (watch.dealDeskValuation ? roi : Math.round(roi)) : null,
    score: verified ? score : 0, decision: verified ? decision : "REVIEW",
    reasons: reviewReasons.length ? reviewReasons : reasons,
    source: watch.source, url: watch.url, image: watch.image ?? null, buyingOption: watch.buyingOption,
    requiresManualReview: !verified, currentBid: watch.currentBid ?? null,
    ...(verified && watch.valuationExpiresAt ? {valuationExpiresAt:watch.valuationExpiresAt} : {}),
    ...(verified && watch.dealDeskValuation ? {
      maximumOffer: watch.dealDeskValuation.maximumCashOffer,
      maximumAllIn: watch.dealDeskValuation.maximumAcquisitionAllIn,
      openingOffer: watch.dealDeskValuation.recommendedOpeningOffer,
      valuationBasis: watch.valuationBasis,
    } : {}) };
}
