import {randomUUID} from 'node:crypto';
import {validateDirectOfferURL} from './directOfferPolicy.mjs';
import {researchReviewedSnapshot} from './compWorkbench.mjs';
import {channelMarketIntelligence} from './marketIntelligence.mjs';
import {negotiateReviewedOpportunity} from './negotiationEngine.mjs';
import {manualCosts} from './manualCosts.mjs';
import {isWatchChartsEvidence} from './manualEntry.mjs';
import {freshness} from './listingSignals.mjs';

const fields = ['dial', 'bezel', 'bracelet', 'condition', 'completeness', 'year'];
const text = (value, limit = 120) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const fail = code => { throw Object.assign(Error(code), {code}); };
const evidenceKey = row => JSON.stringify([row.source.toLowerCase(), row.recordId]);

export function analyzeDirectOffer(input, {targets, snapshot, history, now}) {
  const target = targets.find(row => row.reference === text(input?.reference).toUpperCase());
  if (!target) fail('SELECT_A_SUPPORTED_REFERENCE');
  const {brand, reference} = target;
  const origin = text(input.sellerOfferReference);
  if (!origin || input.originalOfferConfirmed !== true) fail('ORIGINAL_SELLER_OFFER_PROVENANCE_REQUIRED');
  const amount = typeof input.askingPrice === 'string' ? input.askingPrice.trim() : '';
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 100000000) {
    fail('EXPLICIT_USD_ASKING_PRICE_REQUIRED');
  }
  const id = randomUUID();
  if (input.url != null && (typeof input.url !== 'string' || input.url.length > 2048)) fail('INVALID_OFFER_URL');
  const url = input.url?.trim() ? validateDirectOfferURL(input.url.trim(), {originConfirmed:true, recordId:id}) : null;
  const provenance = {kind:'original_counterparty_offer', id, reference:origin, observedAt:now, url};
  const configuration = Object.fromEntries(fields.flatMap(field => {
    const value = text(input[field]);
    return value ? [[field, value]] : [];
  }));
  const watch = {brand, reference, configuration};
  const listing = {...watch, source:'direct', url, directOfferProvenance:provenance, currency:'USD',
    askingPrice:Number(amount), title:brand+' '+reference, saleStatus:'sale', observedAt:now};

  const research = researchReviewedSnapshot(snapshot, watch, {now, requireCompleteness:true, requireBezel:true});
  const matches = new Set(research.accepted.map(evidenceKey));
  const evidence = (snapshot?.state.records ?? []).flatMap(({evidence:row}) => {
    if (row.watch.reference !== reference || row.watch.brand.toLowerCase() !== brand.toLowerCase()) return [];
    const watchCharts = isWatchChartsEvidence(row.source, row.url);
    if (watchCharts && row.kind !== 'estimate') return [];
    return [{...row, matches:matches.has(evidenceKey(row))}];
  });
  for (const entry of history?.state.listings ?? []) {
    const {content, lastObservedAt} = entry;
    if (content.watch?.brand !== brand || content.watch?.reference !== reference || content.askingPrice == null ||
        !freshness({observedAt:lastObservedAt, status:content.saleStatus}, {now}).availableToAct) continue;
    evidence.push({source:entry.source, recordId:entry.sourceRecordId, kind:'asking', amount:content.askingPrice,
      currency:content.currency, observedAt:lastObservedAt, url:content.url, watch:content.watch, active:true, matches:false});
  }

  const costs = input.costs ? manualCosts(input.costs) : null;
  const market = channelMarketIntelligence(research, {costs, now});
  const quotes = (snapshot?.state.records ?? []).filter(({evidence:row, review}) =>
    row.kind === 'executable_exit' && review && !review.revoked && !isWatchChartsEvidence(row.source, row.url));
  const rights = input.pricingPermitted === true ? {
    authorizedExport:true, pricingPermitted:true, reference:origin,
    expiresAt:new Date(Date.parse(now) + 86_400_000).toISOString(),
  } : null;
  const qualification = {
    askingPriceVerified:input.askingPriceVerified === true,
    exactConfigurationVerified:input.exactConfigurationVerified === true,
    listingCheckedAt:now,
  };

  function scenario(estimate) {
    const rows = research.accepted.filter(row => row.saleChannel === estimate.channel);
    const analysis = negotiateReviewedOpportunity({
      listing, target, targets, costs, rights, qualification, now,
      research:{status:estimate.gross === null ? 'insufficient_data' : 'evidence_available',
        verifiedSoldCount:rows.length, conservativeGrossEstimate:estimate.gross},
      quoteEvidence:quotes.map(record => record.evidence).filter(row => row.saleChannel === estimate.channel),
    });
    const valuation = rights || estimate.gross === null ? estimate : {
      ...estimate, gross:null, net:null, label:'Pricing authorization needed', status:'pricing_authorization_needed',
    };
    return {...valuation, maximumAllIn:analysis.maximumAcquisitionAllIn,
      maximumOffer:analysis.maximumCashOffer, potentialProfit:analysis.estimatedNetProfit,
      netUsedForCeiling:analysis.netExit, reasons:analysis.reasons};
  }

  return {watch, askingPrice:listing.askingPrice, provenance, dataset:'real', evidence:evidence.slice(0, 100),
    evidenceCount:evidence.length, dealer:scenario(market.wholesale), retail:scenario(market.conservativeRetail)};
}
