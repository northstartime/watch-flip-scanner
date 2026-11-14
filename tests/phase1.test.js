import { element, post } from './helpers/syntheticDom.js';
﻿import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parseAskingPrice, deduplicateListings, matchesFacebookGroup, readPostContent, toMobileOpportunity } from '../src/listingIntegrity.js';
import { extractPrice, dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { parseListing } from '../src/parser.js';
import { getModaListings } from '../src/markets/moda.js';
import { evaluateWatch } from '../src/businessScore.js';
import { main as quickEvaluate } from '../src/quickEvaluate.js';
import { formatListing } from '../src/daily.js';
import { estimateMarketValue, getMarketData } from '../src/marketValue.js';

// Any accidentally exercised real browser or HTTP path must fail immediately.
globalThis.fetch = () => { throw new Error('Network forbidden in offline tests'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) {
  chromium[method] = () => { throw new Error('Browser forbidden in offline tests'); };
}

for (const [input, expected] of [
  ['14.5k lab', 14500], ['16,750 — SHIPPED OVERNIGHT', 16750],
  ['12,000 + label', 12000], ['Asking: $12,500.00', 12500],
  ['Price: 12.5k', 12500], ['Rolex 126610LN dated 10/31/2026\nAsking USD 12,500', 12500],
  ['2026 Rolex 126300\n$9,000', 9000], ['Price:\n2026\n$9,000', 9000],
  ['126610LN Dated 10/31/2026', null], ['126610 shipped', null],
  ['Reference 14000 shipped', null], ['Ref: 16610\n16610 net', null],
  ['Asking: 2026', null], ['Price: 126610', null],
  ['Asking: $12,000\nReduced: $11,500', null],
  ['1: Rolex $12,000\n2: Tudor $3,000', null],
  ['1. Rolex $12,000\n2. Tudor $3,000', null],
  ['Asking CAD $12,000', null], ['Asking £12,000', null],
  ['Deposit $500', null], ['No price provided', null],
]) {
  test(`asking price: ${input.replaceAll('\n', ' / ')}`, () => {
    assert.equal(parseAskingPrice(input).amount, expected);
    assert.equal(extractPrice(input), expected);
    assert.equal(parseListing(input).buyPrice, expected);
  });
}

test('price ambiguity is explicit and has evidence', () => {
  const result = parseAskingPrice('Asking $12,000\nWas $13,000');
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.currency, null);
  assert.equal(result.evidence.length, 2);
});

test('post identity deduplicates query strings and numeric/vanity group aliases', () => {
  const first = { source: 'Moda', id: 'one', url: 'https://www.facebook.com/groups/synthetic/posts/101/?comment_id=8' };
  const alias = { ...first, id: 'two', url: 'https://m.facebook.com/groups/999/permalink/101/' };
  const other = { ...first, id: 'three', url: 'https://www.facebook.com/groups/synthetic/posts/102/' };
  assert.deepEqual(deduplicateListings([first, alias, other]), [first, other]);
  assert.equal(deduplicateListings([{ title: 'same' }, { title: 'same' }]).length, 2);
});

test('group selection rejects mismatches, feed pages and deceptive domains', () => {
  assert.equal(matchesFacebookGroup('https://www.facebook.com/groups/Synthetic/', 'synthetic'), true);
  for (const url of ['https://www.facebook.com/groups/other/', 'https://www.facebook.com/groups/999/', 'https://www.facebook.com/groups/feed/', 'https://evilfacebook.com/groups/synthetic/']) {
    assert.equal(matchesFacebookGroup(url, 'synthetic'), false);
  }
});

function node(text, { href = '', comment = false, after = false } = {}) {
  return { innerText: text, textContent: text, closest: () => comment ? {} : null,
    getAttribute: () => href, compareDocumentPosition: () => after ? 2 : 4 };
}
function article(messages, authors) {
  return { querySelectorAll: selector => selector.includes('story_message') ? messages : authors };
}

test('seller comes from an author heading; commenters and later headings are excluded', () => {
  const fixture = article([node('Rolex\nAsking $9,000'), node('Comment offer $5,000', { comment: true })], [
    node('Seller One', { href: '/groups/synthetic/user/100/' }),
    node('Commenter', { href: '/profile.php?id=200', comment: true }),
    node('Unrelated profile', { href: '/profile.php?id=300', after: true }),
  ]);
  assert.deepEqual(readPostContent(fixture), { text: 'Rolex\nAsking $9,000', seller: 'Seller One' });
});

test('duplicate author links are accepted; conflicting identities remain unknown', () => {
  const seller = node('Seller One', { href: '/profile.php?id=100' });
  assert.equal(readPostContent(article([node('Listing')], [seller, seller])).seller, 'Seller One');
  assert.equal(readPostContent(article([node('Listing')], [seller, node('Seller Two', { href: '/profile.php?id=200' })])).seller, 'Unknown seller');
  assert.equal(readPostContent(article([node('Listing')], [])).seller, 'Unknown seller');
  assert.equal(readPostContent(article([node('Listing'), node('Different listing')], [seller])).text, '');
});

test('profile URL spoofing and conflicting names are not treated as author evidence', () => {
  assert.equal(readPostContent(article([node('Listing')], [node('Fake', { href: 'https://evil.test/profile.php?id=1' })])).seller, 'Unknown seller');
  assert.equal(readPostContent(article([node('Listing')], [node('One', { href: '/profile.php?id=1' }), node('Two', { href: '/profile.php?id=1' })])).seller, 'Unknown seller');
});

function collectorFixture({ failNavigation = false } = {}) {
  const navigated = [], events = new Map();
  let closed = false, popupClosed = false;
  const popup = { close: async () => { popupClosed = true; }, isClosed: () => popupClosed, on: () => {}, off: () => {} };
  const userTab = { isClosed: () => false, close: () => { throw new Error('Must preserve user tab'); } };
  const parent = { count: async () => 1,
    evaluate: async callback => callback(article([node('Rolex 124270\nAsking $6,000')], [node('Synthetic Seller', { href: '/profile.php?id=10' })])),
    locator: selector => selector.includes('Comment by') ? { allInnerTexts: async () => [] } : { count: async () => 0 },
  };
  const detail = { url: () => navigated.at(-1) || 'about:blank',
    on: (event, callback) => events.set(event, callback), off: event => events.delete(event),
    goto: async url => { navigated.push(url); if (failNavigation) throw new Error('Synthetic navigation failure'); await events.get('popup')?.(popup); },
    waitForTimeout: async () => {}, waitForSelector: async () => {},
    locator: () => ({ evaluate: async (callback, args) => callback(element('body', {}, post(args.postId, 'Rolex 124270\nAsking $6,000')), args) }),
    isClosed: () => closed, close: async () => { closed = true; },
  };
  const links = ['101', '101', '102'].map(id => ({ href: `https://www.facebook.com/groups/synthetic/posts/${id}/` }));
  const posts = { count: async () => links.length, nth: i => ({ locator: () => ({ evaluateAll: async callback => callback([links[i]]) }) }) };
  const context = { newPage: async () => detail, pages: () => [userTab, detail] };
  const page = { waitForSelector: async () => {}, waitForTimeout: async () => {}, mouse: { wheel: async () => {} },
    locator: () => ({ locator: () => posts, evaluateAll: async callback => callback(links) }), context: () => context };
  return { page, navigated, isClosed: () => closed, popupClosed: () => popupClosed, events };
}

test('collector visits discovered posts once, keeps distinct identical-text posts, and cleans only owned tabs', async () => {
  const fixture = collectorFixture();
  let saved;
  const listings = await dumpAccessibilityTree('synthetic', { getPage: async () => fixture.page, saveListings: value => { saved = value; } });
  assert.deepEqual(fixture.navigated.map(url => url.match(/posts\/(\d+)/)[1]), ['101', '102']);
  assert.equal(listings.length, 2);
  assert.equal(listings[0].seller, 'Synthetic Seller');
  assert.equal(listings[0].price, 6000);
  assert.equal(saved, listings);
  assert.equal(fixture.isClosed(), true);
  assert.equal(fixture.popupClosed(), true);
  assert.equal(fixture.events.size, 0);
});

test('collector navigation failures still close its temporary page', async () => {
  const fixture = collectorFixture({ failNavigation: true });
  const listings = await dumpAccessibilityTree('synthetic', { getPage: async () => fixture.page, saveListings: () => {} });
  assert.deepEqual(listings, []);
  assert.equal(fixture.isClosed(), true);
  assert.equal(fixture.events.size, 0);
});

test('Moda normalization deduplicates across groups and separates bids from acquisition prices', async () => {
  const fixed = { id: 'moda-101', source: 'Moda', url: 'https://www.facebook.com/groups/synthetic/posts/101/', listingText: 'Rolex 124270\nAsking $6,000', seller: 'Seller', capturedAt: '2026-01-01' };
  const auction = { ...fixed, id: 'moda-102', url: 'https://www.facebook.com/groups/synthetic/posts/102/', listingText: 'Rolex 124270 No reserve auction\nCurrent bid: $5,000', comments: ['6k'] };
  const calls = [];
  const result = await getModaListings(async group => { calls.push(group); return [fixed, auction]; },{groups:['synthetic','othergroup']});
  assert.equal(calls.length, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].buyPrice, 6000);
  assert.equal(result[0].fees, null);
  assert.equal(result[0].shipping, null);
  assert.equal(result[1].currentBid, 6000);
  assert.equal(result[1].buyPrice, null);
  for (const watch of result) assert.equal(evaluateWatch(watch).profit, null);
});

const verified = { buyPrice: 6000, marketValue: 9000, fees: 300, shipping: 100,
  acquisitionVerified: true, exitVerified: true, exitEvidence: { source: 'Synthetic executable quote', verifiedAt: '2026-01-01' },
  hasBoxAndPapers: true, fullLinks: true, trustedSeller: true, title: 'Rolex Explorer', condition: 'Excellent', buyingOption: 'FIXED_PRICE' };

test('static estimates cannot produce profit, ROI, maximum bid or BUY recommendations', () => {
  const watch = parseListing('Rolex 124270\nAsking $6,000');
  assert.equal(watch.marketValue, null);
  assert.equal(watch.estimatedMarketValue, 7850);
  const evaluation = evaluateWatch({ ...watch, marketValue: 7850, fees: 0, shipping: 0 });
  assert.equal(evaluation.profit, null);
  assert.equal(evaluation.roi, null);
  assert.equal(evaluation.maximumBid, null);
  assert.equal(evaluation.decision, 'REVIEW');
});

test('verified synthetic acquisition and exit preserve net arithmetic', () => {
  const result = evaluateWatch(verified);
  assert.equal(result.profit, 2600);
  assert.equal(result.roi, 2600 / 6400 * 100);
  assert.equal(result.maximumBid, 7600);
  assert.match(result.decision, /BUY/);
});

for (const [name, overrides] of [
  ['unverified acquisition', { acquisitionVerified: false }],
  ['unverified exit', { exitVerified: false }], ['missing exit evidence', { exitEvidence: null }],
  ['unknown fees', { fees: null }], ['unknown shipping', { shipping: null }],
  ['negative costs', { fees: -1 }], ['nonfinite price', { buyPrice: Infinity }],
  ['auction', { buyingOption: 'AUCTION' }], ['manual review', { requiresManualReview: true }],
]) test(`financial gate: ${name}`, () => {
  const result = evaluateWatch({ ...verified, ...overrides });
  assert.equal(result.profit, null);
  assert.equal(result.roi, null);
  assert.equal(result.maximumBid, null);
  assert.equal(result.decision, 'REVIEW');
});

test('mobile payload preserves unknown values instead of rounding null to zero', () => {
  const watch = { ...parseListing('Rolex 124270\nAsking $6,000'), id: 'synthetic', seller: 'Seller' };
  const payload = toMobileOpportunity({ watch, ...evaluateWatch(watch) });
  assert.equal(payload.price, 6000);
  assert.equal(payload.marketValue, null);
  assert.equal(payload.projectedProfit, null);
  assert.equal(payload.roi, null);
  assert.equal(payload.requiresManualReview, true);
  assert.equal(payload.seller, 'Seller');
  assert.equal(payload.estimatedMarketValue, 7850);
});

test('verified mobile profit remains available', () => {
  const payload = toMobileOpportunity({ watch: verified, ...evaluateWatch(verified) });
  assert.equal(payload.projectedProfit, 2600);
  assert.equal(payload.marketValue, 9000);
});

test('manual evaluator uses the same evidence gate', async () => {
  const result = await quickEvaluate('Rolex 124270\nAsking $6,000');
  assert.equal(result.projectedProfit, null);
  assert.equal(result.maxOffer, null);
  assert.equal(result.marketValue, null);
  assert.equal(result.decision, 'REVIEW');
});

test('reports do not advertise an estimated spread as an opportunity or bid target', () => {
  const watch = { ...verified, acquisitionVerified: false, buyingOption: 'AUCTION', fees: null, shipping: null };
  const result = formatListing({ watch, ...evaluateWatch(watch), auction: { status: 'REVIEW', message: 'Synthetic review' } });
  assert.match(result, /Projected Profit:  Manual Review/);
  assert.match(result, /Maximum Bid:      Manual Review/);
  assert.match(result, /Fees:              Unknown/);
  assert.doesNotMatch(result, /KEEP BIDDING|Opportunity:.*⭐/);
});

test('market matching requires complete reference tokens and reports no invented confidence', () => {
  assert.equal(estimateMarketValue('114000'), null);
  assert.equal(estimateMarketValue('14000'), 4800);
  assert.equal(getMarketData('124270').confidence, null);
  assert.equal(getMarketData('124270').verified, false);
  assert.equal(parseListing('Rolex\nAsking $14,000').estimatedMarketValue, null);
});

test('mobile route encoding and detail rendering preserve unknown financial values', async () => {
  const { encodeAmount, formatAmount } = await import('../northstar-mobile-v2/constants/opportunity-values.js');
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(formatAmount(encodeAmount(value)), 'Manual Review');
  }
  assert.equal(formatAmount(encodeAmount(0)), '$0');
  assert.equal(formatAmount(encodeAmount(12000)), '$12,000');
  assert.equal(formatAmount(encodeAmount(-500)), '-$500'.replace('-$', '$-'));
  assert.equal(formatAmount(['12000', '13000']), 'Manual Review');
});

test('daily source has no automatic browser-opening commands', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/daily.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /child_process|exec\(|openBrowser|chromium|start ""/);
});
