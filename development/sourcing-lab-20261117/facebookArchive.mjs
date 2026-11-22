import {normalizePublishedInventory} from './reused/development/sources/publishedInventory.mjs';
import {validCalendarTime} from './exportValidation.mjs';

const columns = ['recordId', 'url', 'title', 'observedAt', 'originalListedAt', 'saleStatus',
  'askingPrice', 'currency', 'brand', 'reference', 'dial', 'bezel', 'bracelet', 'year', 'condition',
  'completeness', 'caseMaterial'];
const cell = value => '"'+String(value ?? '').replaceAll('"', '""')+'"';

export function prepareFacebookArchive(rows, now) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    throw Error('FACEBOOK_ARCHIVE_MUST_CONTAIN_1_TO_500_ROWS');
  }
  const issues = [], records = [];
  for (const [index, row] of rows.entries()) {
    if (!['moda','facebook'].includes(String(row?.source ?? '').trim().toLowerCase())) {
      issues.push({row:index+1, code:'FACEBOOK_ARCHIVE_SOURCE_REQUIRED'});
      continue;
    }
    if (!validCalendarTime(row.capturedAt) || (row.originalListedAt != null && !validCalendarTime(row.originalListedAt))) {
      issues.push({row:index+1, code:'ORIGINAL_CAPTURE_OR_LISTING_DATE_REQUIRED'});
      continue;
    }
    const {observations, issues:normalizationIssues} = normalizePublishedInventory([row], {checkedAt:now});
    if (normalizationIssues.length) {
      issues.push({row:index+1, code:normalizationIssues[0].code});
      continue;
    }
    const observation = observations[0], watch = observation.watch;
    if (!watch || !observation.title) {
      issues.push({row:index+1, code:'EXPLICIT_WATCH_IDENTITY_AND_TITLE_REQUIRED'});
      continue;
    }
    // An archived bid or reported outcome cannot become a fixed-price opportunity.
    const fixed = row.buyingOption === 'FIXED_PRICE' && row.saleStatus === 'sale';
    const ask = fixed && row.priceExtraction?.amount === observation.askingPrice ? observation.askingPrice : null;
    records.push({...watch.configuration, recordId:observation.sourceRecordId, url:observation.url,
      title:observation.title, observedAt:observation.observedAt, originalListedAt:observation.originalListedAt,
      saleStatus:fixed ? 'sale' : 'other', askingPrice:ask, currency:ask === null ? null : observation.currency,
      brand:watch.brand, reference:watch.reference});
  }
  records.sort((a,b) => Date.parse(a.observedAt)-Date.parse(b.observedAt));
  return {issues, csv:[columns.map(cell).join(','), ...records.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\n')};
}
