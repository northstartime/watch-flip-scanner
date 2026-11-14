import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { parseAskingPrice } from '../src/listingIntegrity.js';
import { parseListing } from '../src/parser.js';
import { extractPrice, dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { readOwnedFacebookPost } from '../src/collectors/facebookPostOwnership.js';
import { getModaListings } from '../src/markets/moda.js';
import { element, message, permalink, author, post } from './helpers/syntheticDom.js';

globalThis.fetch = () => { throw new Error('Network forbidden in field regressions'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) chromium[method] = () => { throw new Error('Browser forbidden in field regressions'); };
const args = { groupId: 'synthetic', postId: '101' };
const ownedText = 'Rolex 124270\nAsking $8,500.';
const profile = (href, name = 'Synthetic Private Seller') => element('a', { href }, name);
const rootWithHeader = header => element('body', {}, element('div', { role: 'article' }, header, permalink('101'), message(ownedText)));
const resolve = root => readOwnedFacebookPost(root, args);

for (const href of ['/profile.php?id=10&fixture=1', '/groups/synthetic/user/10/', '/user/10/', '/people/Synthetic-Name/10/', '/synthetic.seller/', 'https://m.facebook.com/synthetic.seller/?fixture=1']) test(`verified header supports profile route: ${href}`, () => {
  const result = resolve(rootWithHeader(element('h3', {}, profile(href))));
  assert.equal(result.seller, 'Synthetic Private Seller');
  assert.equal(result.sellerExtraction.reason, 'post_author_identified');
});

for (const tag of ['h2', 'h3', 'h4', 'h5', 'h6']) test(`owned ${tag} author heading is supported`, () => {
  assert.equal(resolve(rootWithHeader(element(tag, {}, profile('/synthetic.seller')))).seller, 'Synthetic Private Seller');
});

for (const header of [
  () => element('div', { role: 'heading' }, profile('/synthetic.seller')),
  () => element('span', { 'data-ad-rendering-role': 'profile_name' }, profile('/synthetic.seller')),
  () => element('a', { href: '/synthetic.seller', 'data-ad-rendering-role': 'profile_name' }, 'Synthetic Private Seller'),
]) test('explicit heading/profile-name author structure is supported', () => {
  assert.equal(resolve(rootWithHeader(header())).seller, 'Synthetic Private Seller');
});

test('ordinary header requires its own target permalink', () => {
  const valid = resolve(rootWithHeader(element('header', {}, profile('/synthetic.seller'), permalink('101'))));
  assert.equal(valid.seller, 'Synthetic Private Seller');
  const invalid = resolve(rootWithHeader(element('header', {}, profile('/synthetic.seller'))));
  assert.equal(invalid.seller, 'Unknown seller');
});

test('header outside the narrow body owner must prove the exact post', () => {
  const build = id => {
    const header = element('header', {}, profile('/synthetic.seller'), permalink(id));
    const region = element('div', {}, message(ownedText), element('a', { href: '/photo/?set=gm.101' }, 'Photo'));
    return element('body', {}, element('div', {}, header, region));
  };
  assert.equal(resolve(build('101')).seller, 'Synthetic Private Seller');
  assert.equal(resolve(build('202')).seller, 'Unknown seller');
});

test('an outer heading without its own permalink cannot supply a seller', () => {
  const region = post('101', ownedText, { seller: null, attrs: {} });
  const root = element('body', {}, element('div', {}, element('h4', {}, profile('/synthetic.seller')), region));
  assert.equal(resolve(root).seller, 'Unknown seller');
});

test('author identity is never inferred from a URL when visible name text is absent', () => {
  const result = resolve(rootWithHeader(element('h4', {}, profile('/synthetic.seller', ''))));
  assert.equal(result.seller, 'Unknown seller');
  assert.equal(result.sellerExtraction.reason, 'no_supported_author_in_verified_header');
});

for (const href of ['/groups', '/watch', '/home.php', 'https://evilfacebook.com/synthetic.seller', 'javascript://www.facebook.com/synthetic.seller', '/groups/other/user/10/', '/profile.php?id=10&id=20']) test(`unsupported author URL stays unknown: ${href}`, () => {
  assert.equal(resolve(rootWithHeader(element('h4', {}, profile(href)))).seller, 'Unknown seller');
});

test('conflicting supported profiles are not merged by equal display names', () => {
  const result = resolve(rootWithHeader(element('h4', {}, profile('/profile.php?id=10'), profile('/synthetic.seller'))));
  assert.equal(result.seller, 'Unknown seller');
  assert.equal(result.sellerExtraction.status, 'ambiguous');
  assert.equal(result.sellerExtraction.reason, 'conflicting_author_evidence');
});

test('tracking variants of one supported identity do not create ambiguity', () => {
  const result = resolve(rootWithHeader(element('h4', {}, profile('/synthetic.seller?fixture=1'), profile('/SYNTHETIC.SELLER/?fixture=2'))));
  assert.equal(result.seller, 'Synthetic Private Seller');
});

test('display-name whitespace is normalized without deriving names from slugs', () => {
  const result = resolve(rootWithHeader(element('h4', {}, profile('/different.slug', ' Synthetic\n  Seller '))));
  assert.equal(result.seller, 'Synthetic Seller');
});

for (const [input, amount] of [
  ['Asking $8,500.', 8500], ['$8,500, shipped.', 8500], ['Price: 8.5k.', 8500],
  ['Asking: USD\u00a08,500', 8500], ['$8\u202f500', 8500], ['$8\u2009500', 8500],
  ['8.5k + shipping', 8500], ['8.5K + ship', 8500], ['8500 + lab', 8500],
  ['Price drop: 8,500', 8500], ['Sale price: 8,500', 8500], ['Cash price $8,500', 8500],
  ['2026 Rolex Ref 126610LN\nAsking $2,000', 2000],
  ['MSRP $10,000\nAsking $8,500', 8500], ['Asking $8,500\nTrade value $10,000', 8500],
  ['Price:\n2026', null], ['Ref: 126610\nAsking: 126610', null], ['8,500', null],
  ['Asking $8,500.999', null], ['Price $8,50', null],
  ['Current bid: $8,500', null], ['High bid $8,500', null], ['Shipping: $150', null], ['$150 shipping', null],
  ['Deposit: $500', null], ['Auction\nCurrent bid $8,500\nMinimum increment $100', null],
  ['Was $9,000\nNow $8,500', null], ['Reference 8500 shipped', null],
  ['Asking GBP 8,500', null], ['Rolex $8,500 CAD', null], ['Asking $8,500 and $9,000', null],
  ['1) Rolex $8,500\n2) Tudor $4,500', null],
]) test(`owned asking-price format: ${input.replaceAll('\n', ' / ')}`, () => {
  assert.equal(parseAskingPrice(input).amount, amount);
  assert.equal(extractPrice(input), amount);
  assert.equal(parseListing(input).buyPrice, amount);
});

test('price result explains missing, rejected and ambiguous values without requiring raw text in logs', () => {
  assert.equal(parseAskingPrice('No amount stated').reason, 'price_not_found');
  assert.equal(parseAskingPrice('Current bid: $8,500').reason, 'price_candidates_rejected');
  assert.equal(parseAskingPrice('Asking $8,500 and $9,000').reason, 'multiple_asking_prices');
  assert.equal(parseAskingPrice('Asking CAD $8,500').reason, 'unsupported_currency');
});

async function collect(root) {
  const diagnostics = [];
  const detail = new EventEmitter();
  let closed = false;
  detail.goto = async () => {};
  detail.waitForSelector = async () => {};
  detail.locator = () => ({ evaluate: async (callback, args) => callback(root, args) });
  detail.isClosed = () => closed;
  detail.close = async () => { closed = true; };
  const page = { waitForSelector: async () => {}, locator: () => ({ evaluateAll: async callback => callback([{ href: 'https://www.facebook.com/groups/synthetic/posts/101/' }]) }), context: () => ({ newPage: async () => detail }) };
  const listings = await dumpAccessibilityTree('synthetic', { getPage: async () => page, saveListings: () => {}, maxListings: 1, maxPosts: 1, maxPasses: 1,
    onTiming: () => {}, onDiagnostic: event => diagnostics.push(event) });
  return { listings, diagnostics, closed };
}

test('collector extracts a scoped vanity author and punctuation-terminated asking price', async () => {
  const result = await collect(rootWithHeader(element('h4', {}, profile('/synthetic.seller'))));
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].seller, 'Synthetic Private Seller');
  assert.equal(result.listings[0].price, 8500);
  assert.equal(result.closed, true);
  const fields = result.diagnostics.filter(event => event.event === 'facebook_field_status');
  assert.deepEqual(fields.map(event => event.status), ['recognized', 'recognized']);
  const serialized = JSON.stringify(result.diagnostics);
  for (const value of ['Synthetic Private Seller', '/synthetic.seller', '8500', 'facebook.com', 'Asking']) assert.equal(serialized.includes(value), false);
});

test('price cannot be borrowed from a header, comment or different post', async () => {
  const target = element('div', { role: 'article' }, element('h4', {}, profile('/synthetic.seller'), 'Asking $999,999'), permalink('101'), message('Rolex model for sale, price on request'),
    element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, message('Asking $8,500')));
  const root = element('body', {}, target, post('202', 'Asking $7,000', { seller: 'Other Seller', sellerId: '20' }));
  const result = await collect(root);
  assert.equal(result.listings[0].price, null);
  assert.equal(result.listings[0].priceExtraction.reason, 'price_not_found');
});

test('explicit truncation blocks price and survives downstream Moda normalization', async () => {
  const story = message(ownedText);
  const button = element('span', { role: 'button' }, 'See more');
  button.parentElement = story;
  story.children.push(button);
  const root = element('body', {}, element('div', { role: 'article' }, author('Synthetic Private Seller'), permalink('101'), story));
  const result = await collect(root);
  assert.equal(result.listings[0].price, null);
  assert.equal(result.listings[0].priceExtraction.reason, 'post_text_truncated');
  assert.equal(result.listings[0].requiresManualReview, true);
  const normalized = await getModaListings(async () => result.listings,{groups:['synthetic']});
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].price, null);
  assert.equal(normalized[0].buyPrice, null);
  assert.equal(normalized[0].priceExtraction.reason, 'post_text_truncated');
});

test('unknown fields retain review state and safe field-level reasons', async () => {
  const result = await collect(element('body', {}, post('101', 'Rolex 124270 for sale, no amount stated', { seller: null })));
  assert.equal(result.listings[0].seller, 'Unknown seller');
  assert.equal(result.listings[0].price, null);
  assert.equal(result.listings[0].requiresManualReview, true);
  assert.deepEqual(result.diagnostics.filter(event => event.event === 'facebook_field_status').map(event => event.reason), ['verified_author_header_not_found', 'price_not_found']);
});
