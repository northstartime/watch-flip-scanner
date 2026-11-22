import {facebookPostIdentity} from './listingIntegrity.js';

const required = ['dial', 'bezel', 'bracelet', 'year', 'condition', 'completeness'];
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
const known = value => Boolean(normalize(value)) && !/^(unknown|unspecified|not known|n\/?a|\?|-)$/i.test(value.trim());
const same = (left, right) => normalize(left) === normalize(right);
const referenceKey = (brand, reference) => normalize(brand)==='tudor'
  ? normalize(reference).replace(/^m(?=\d)/,'').replace(/-\d{4}$/,'') : normalize(reference);
const identity = url => facebookPostIdentity(url) ?? url;
const unavailable = (watch, reason) => ({...watch, scoringReviewIssue:reason});
const amount = value => typeof value === 'number' && Number.isFinite(value);

export async function readDealDeskValuations(directory, {clock} = {}) {
  // The standard scanner has no dependency on the local Deal Desk unless requested.
  const {createDashboardService} = await import('../development/sourcing-lab-20261117/dashboardService.mjs');
  const {rows} = await createDashboardService(directory, {clock}).state('real',{wholesaleOnly:true});
  return rows;
}

export function dealDeskPreviewListings(rows, now = Date.now()) {
  return rows.filter(row => row.dataKind === 'AUTHORIZED_EXPORT' && row.history?.availableToAct &&
    row.settings?.rights?.internalOnly === true && row.settings.rights.authorizedToProcess === true &&
    Date.parse(row.settings.rights.expiresAt) > now &&
    row.currency === 'USD' && amount(row.askingPrice) && row.askingPrice > 0 && row.watch && row.url)
    .map(row => ({
      id:row.key, source:row.source, url:row.url, title:row.title, brand:row.watch.brand,
      reference:row.watch.reference, configuration:row.watch.configuration,
      condition:row.watch.configuration?.condition, capturedAt:row.observedAt,
      permissionExpiresAt:row.settings.rights.expiresAt,
      buyPrice:row.askingPrice, buyingOption:'FIXED_PRICE',
    }));
}

function explicitConfiguration(watch) {
  const fields = {...watch.configuration};
  for (const line of String(watch.originalListing ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(dial|bezel|bracelet|year|condition|completeness|box\s*(?:&|and|\/)\s*papers)\s*:\s*(.+)$/i);
    if (!match) continue;
    const field = required.includes(match[1].toLowerCase()) ? match[1].toLowerCase() : 'completeness';
    if (Object.hasOwn(fields, field) && !same(fields[field], match[2])) return null;
    fields[field] = match[2].trim();
  }
  return fields;
}

export function applyDealDeskValuation(watch, valuations) {
  const watchId = identity(watch.url);
  const samePost = valuations.filter(row => watchId && identity(row.url) === watchId);
  if (!samePost.length) {
    const similar = valuations.some(row => same(row.watch?.brand, watch.brand) && referenceKey(watch.brand, row.watch?.reference) === referenceKey(watch.brand, watch.reference));
    return unavailable(watch, similar ? 'A Deal Desk review exists for this reference, but it belongs to a different listing.'
      : 'No Deal Desk review was found for this listing.');
  }
  if (samePost.length !== 1) return unavailable(watch, 'Multiple Deal Desk records match this listing. Resolve the duplicate reviews.');
  const [row] = samePost;
  const current = explicitConfiguration(watch);
  const reviewed = row.watch?.configuration ?? {};
  const sameCapture = Boolean(watch.capturedAt) && Date.parse(watch.capturedAt) === Date.parse(row.observedAt) &&
    same(watch.title, row.title);
  const requiredFields = new Set([...required, ...Object.keys(reviewed)]);
  if (!same(row.watch?.brand, watch.brand) || referenceKey(watch.brand, row.watch?.reference) !== referenceKey(watch.brand, watch.reference) || !current ||
      [...requiredFields].some(field => !known(reviewed[field]) ||
        (!sameCapture || Object.hasOwn(current,field)) && (!known(current[field]) || !same(current[field], reviewed[field]))) ||
      Object.entries(current).some(([field,value]) => known(value) && !same(value, reviewed[field]))) {
    return unavailable(watch, 'Deal Desk watch configuration is missing or differs from this listing.');
  }
  if (row.currency !== 'USD' || row.askingPrice !== watch.buyPrice) {
    return unavailable(watch, 'The asking price or currency changed after the Deal Desk review.');
  }

  const analysis = row.analysis;
  const costs = analysis?.acquisitionAtAsk;
  if (row.dataKind !== 'AUTHORIZED_EXPORT' || !row.history?.availableToAct ||
      !['BUY','NEGOTIATE','PASS'].includes(analysis?.decision) || !analysis.exitEvidence?.source ||
      ![analysis.grossExitUsed, analysis.netExit, analysis.estimatedNetProfit, analysis.estimatedROI,
        analysis.maximumAcquisitionAllIn, costs?.allIn].every(amount) || costs.price !== watch.buyPrice) {
    const reasons = analysis?.reasons?.map(reason=>reason.replaceAll('_',' ')).join('; ');
    return unavailable(watch, 'Deal Desk wholesale valuation needs review'+(reasons ? ': '+reasons : '.'));
  }

  const expiresAt = Math.min(Date.parse(analysis.exitEvidence.expiresAt), Date.parse(row.settings.rights.expiresAt),
    Date.parse(row.observedAt) + 86400000, Date.parse(row.settings.qualification.listingCheckedAt) + 86400000);
  if (!Number.isFinite(expiresAt)) return unavailable(watch, 'Deal Desk review expiry could not be established.');
  return {...watch, valuationExpiresAt:new Date(expiresAt).toISOString(), acquisitionVerified:true, marketValue:analysis.grossExitUsed, exitVerified:true,
    exitEvidence:analysis.exitEvidence, fees:Math.max(0,analysis.grossExitUsed-analysis.netExit),
    shipping:Math.max(0,costs.allIn-costs.price), configuration:reviewed, valuationBasis:'Reviewed wholesale exit', dealDeskValuation:analysis};
}
