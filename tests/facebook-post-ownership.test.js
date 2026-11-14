import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { readOwnedFacebookPost } from '../src/collectors/facebookPostOwnership.js';
import { dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { element, message, permalink, author, post } from './helpers/syntheticDom.js';

globalThis.fetch = () => { throw new Error('Network forbidden in ownership regressions'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) chromium[method] = () => { throw new Error('Browser forbidden in ownership regressions'); };
const args = { groupId: 'synthetic', postId: '101' };
const resolve = root => readOwnedFacebookPost(root, args);
const body = (...nodes) => element('body', {}, ...nodes);
const targetText = 'Rolex 124270\nAsking $8,500';
const foreignText = 'UNRELATED_PRIVATE_FIXTURE\nAsking $999,999';
const photo = (id, src = 'https://synthetic.fbcdn.net/target.jpg') => element('a', { href: `/photo/?set=gm.${id}` }, element('img', { src }));
const append = (parent, ...nodes) => { for (const node of nodes) { node.parentElement = parent; parent.children.push(node); } return parent; };

for (const reversed of [false, true]) test(`sibling posts resolve by exact ownership, regardless of order (${reversed})`, () => {
  const target = post('101', targetText, { seller: 'Target Seller', sellerId: '10' });
  const foreign = post('202', foreignText, { seller: 'Other Seller', sellerId: '20' });
  const result = resolve(body(element('div', {}, ...(reversed ? [foreign, target] : [target, foreign]))));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Target Seller');
  assert.equal(result.diagnostics.matchedMessageCount, 1);
  assert.equal(result.text.includes('UNRELATED_PRIVATE_FIXTURE'), false);
});

test('two flat post regions inside one wrapper can be distinguished by local ownership links', () => {
  const target = post('101', targetText, { attrs: {}, seller: 'Target Seller' });
  const foreign = post('202', foreignText, { attrs: {}, seller: 'Other Seller', sellerId: '20' });
  const result = resolve(body(element('div', {}, foreign, target)));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Target Seller');
});

test('shared header and two unowned messages remain explicitly ambiguous', () => {
  const result = resolve(body(element('div', { role: 'article' }, author('Seller'), permalink('101'), message(targetText), message(foreignText))));
  assert.equal(result.reason, 'ambiguous_parent_messages');
  assert.equal(result.text, '');
  assert.equal(result.seller, 'Unknown seller');
});

test('duplicate visible target posts cannot be chosen by order or text equality', () => {
  const result = resolve(body(post('101', targetText), post('101', targetText)));
  assert.equal(result.reason, 'ambiguous_post_ownership');
  assert.equal(result.diagnostics.matchedMessageCount, 2);
  assert.equal(result.text, '');
});

test('identical messages in a shared owner are still structurally ambiguous', () => {
  const result = resolve(body(element('div', { role: 'article' }, permalink('101'), message(targetText), message(targetText))));
  assert.equal(result.reason, 'ambiguous_parent_messages');
});

test('a permalink mentioned inside message text is not ownership evidence', () => {
  const story = message(targetText);
  append(story, permalink('101'));
  const result = resolve(body(element('div', { role: 'article' }, author('Other Seller'), story)));
  assert.equal(result.reason, 'post_ownership_not_found');
});

test('comment/reply permalinks cannot establish parent-post ownership', () => {
  for (const query of ['?comment_id=7', '?reply_comment_id=8']) {
    const result = resolve(body(element('div', { role: 'article' }, permalink('101', 'synthetic', `/${query}`), message(targetText))));
    assert.equal(result.reason, 'post_ownership_not_found');
  }
});

test('post ID prefixes and unrelated photo sets do not match', () => {
  for (const link of [permalink('1010'), photo('1010')]) {
    const result = resolve(body(element('div', { role: 'article' }, link, message(targetText))));
    assert.equal(result.reason, 'post_ownership_not_found');
  }
});

test('an exact tied photo set can establish local post ownership', () => {
  for (const kind of ['gm', 'pcb']) {
    const link = element('a', { href: `/photo/?set=${kind}.101` }, element('img', { src: 'https://synthetic.fbcdn.net/photo.jpg' }));
    const result = resolve(body(element('div', { role: 'article' }, author('Photo Seller'), message(targetText), link)));
    assert.equal(result.text, targetText);
    assert.equal(result.seller, 'Photo Seller');
  }
});

test('exact canonical paths work with or without a trailing slash', () => {
  for (const suffix of ['', '/', '?fixture=1']) {
    assert.equal(resolve(body(post('101', targetText, { suffix }))).text, targetText);
  }
});

test('exact permalink route is also accepted', () => {
  const link = element('a', { href: '/groups/synthetic/permalink/101' }, 'Timestamp');
  assert.equal(resolve(body(element('div', { role: 'article' }, link, message(targetText)))).text, targetText);
});

test('mismatched groups and deceptive hosts cannot authorize text', () => {
  for (const href of ['/groups/other/posts/101/', 'https://evilfacebook.com/groups/synthetic/posts/101/']) {
    const result = resolve(body(element('div', { role: 'article' }, element('a', { href }, 'Timestamp'), message(targetText))));
    assert.equal(result.reason, 'post_ownership_not_found');
  }
});

for (const attrs of [{ hidden: '' }, { 'aria-hidden': 'true' }, { style: 'display:none' }, { style: 'visibility:hidden' }]) test(`hidden alternate message is not combined: ${JSON.stringify(attrs)}`, () => {
  const target = post('101', targetText);
  append(target, message(foreignText, attrs));
  assert.equal(resolve(body(target)).text, targetText);
});

test('comment and reply story messages do not contaminate parent content or seller', () => {
  const target = post('101', targetText, { seller: 'Target Seller' });
  const comment = element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, author('Comment Seller', '20'), message(foreignText));
  const reply = element('div', { role: 'article', 'aria-label': 'Reply by fixture' }, message('Reply fixture'));
  append(target, comment, reply);
  const result = resolve(body(target));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Target Seller');
  assert.equal(result.comments.length, 2);
});

test('embedded post and its seller/photos/comments stay in their own semantic boundary', () => {
  const target = post('101', targetText, { seller: 'Target Seller' });
  const embedded = post('202', foreignText, { seller: 'Embedded Seller', sellerId: '20' });
  append(embedded, photo('101', 'https://synthetic.fbcdn.net/wrong.jpg'), element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, 'Embedded comment'));
  append(target, photo('101'), embedded, element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, 'Target comment'));
  const result = resolve(body(target));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Target Seller');
  assert.equal(result.image, 'https://synthetic.fbcdn.net/target.jpg');
  assert.deepEqual(result.comments, ['Target comment']);
});

test('a nested foreign message cannot borrow an outer target permalink', () => {
  const result = resolve(body(element('div', { role: 'article' }, author('Outer Seller'), permalink('101'), post('202', foreignText))));
  assert.equal(result.reason, 'post_ownership_not_found');
  assert.equal(result.text, '');
});

test('quoted story messages are excluded from ownership resolution', () => {
  const target = post('101', targetText);
  append(target, element('blockquote', {}, permalink('202'), message(foreignText)));
  assert.equal(resolve(body(target)).text, targetText);
});

test('conflicting ownership links in the only message region force a skip', () => {
  const target = post('101', targetText);
  append(target, permalink('202'));
  const result = resolve(body(target));
  assert.equal(result.reason, 'conflicting_post_ownership');
});

test('seller cannot be borrowed from a sibling heading or shared outer wrapper', () => {
  const target = post('101', targetText, { seller: null });
  const result = resolve(body(element('div', {}, author('Unrelated Seller'), target, post('202', foreignText, { seller: 'Other Seller', sellerId: '20' }))));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Unknown seller');
});

test('conflicting author identities or names remain unknown', () => {
  for (const id of ['10', '20']) {
    const target = post('101', targetText, { seller: 'First Seller', sellerId: '10' });
    const heading = author('Second Seller', id);
    heading.parentElement = target;
    target.children.unshift(heading);
    assert.equal(resolve(body(target)).seller, 'Unknown seller');
  }
});

test('a profile heading after the message cannot identify its author', () => {
  const target = post('101', targetText, { seller: null });
  append(target, author('Later Profile'));
  assert.equal(resolve(body(target)).seller, 'Unknown seller');
});

test('empty owned messages are skipped instead of borrowing another post text', () => {
  const result = resolve(body(post('101', '   '), post('202', foreignText)));
  assert.equal(result.reason, 'empty_parent_message');
});

test('data-pagelet and story-role boundaries isolate neighboring posts', () => {
  for (const attrs of [{ 'data-pagelet': 'FeedUnit_fixture' }, { 'data-ad-rendering-role': 'story' }]) {
    const result = resolve(body(post('101', targetText, { attrs }), post('202', foreignText, { attrs })));
    assert.equal(result.text, targetText);
  }
});

test('page callback remains self-contained when serialized', () => {
  const isolated = runInNewContext(`(${readOwnedFacebookPost.toString()})`, { URL });
  const result = isolated(body(post('101', targetText), post('202', foreignText)), args);
  assert.equal(result.text, targetText);
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

test('collector regression: broad wrapper with two posts produces only the target listing', async () => {
  const result = await collect(body(element('div', {}, post('202', foreignText, { seller: 'Other Seller', sellerId: '20' }), post('101', targetText, { seller: 'Target Seller' }))));
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].listingText, targetText);
  assert.equal(result.listings[0].seller, 'Target Seller');
  assert.equal(result.listings[0].price, 8500);
  assert.equal(result.closed, true);
  assert.equal(JSON.stringify(result.diagnostics).includes('Target Seller'), false);
});

test('collector regression: unresolved multiple messages skip with an explicit safe reason', async () => {
  const result = await collect(body(element('div', { role: 'article' }, permalink('101'), message(targetText), message(foreignText))));
  assert.equal(result.listings.length, 0);
  assert.equal(result.diagnostics.find(event => event.event === 'facebook_candidate').reason, 'ambiguous_parent_messages');
  assert.equal(JSON.stringify(result.diagnostics).includes('UNRELATED_PRIVATE_FIXTURE'), false);
  assert.equal(result.closed, true);
});

test('collector preserves an unresolved author as a review requirement', async () => {
  const result = await collect(body(post('101', targetText, { seller: null })));
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].seller, 'Unknown seller');
  assert.equal(result.listings[0].requiresManualReview, true);
  assert.ok(result.listings[0].reviewReasons.includes('seller_not_unambiguously_identified'));
});

test('boundary-less post region cannot expand into an unrelated seller heading', () => {
  const target = post('101', targetText, { seller: null, attrs: {} });
  const wrapper = element('div', {}, author('Unrelated wrapper profile', '99'), target);
  const result = resolve(body(wrapper));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Unknown seller');
});

test('one-message semantic post boundary may supply its own header and ancillary data', () => {
  const region = element('div', {}, message(targetText), photo('101'));
  const target = element('div', { role: 'article' }, author('Post Header Seller'), region,
    element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, 'Owned comment'));
  const result = resolve(body(target));
  assert.equal(result.text, targetText);
  assert.equal(result.seller, 'Post Header Seller');
  assert.deepEqual(result.comments, ['Owned comment']);
});

test('an embedded foreign story inside the selected message is skipped rather than concatenated', () => {
  const story = message(targetText);
  append(story, post('202', foreignText));
  const result = resolve(body(element('div', { role: 'article' }, author('Target Seller'), permalink('101'), story)));
  assert.equal(result.reason, 'nested_story_content');
  assert.equal(result.text, '');
});

test('a comment body nested inside the chosen story message cannot contaminate its text', () => {
  const story = message(targetText);
  append(story, element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, message(foreignText)));
  const result = resolve(body(element('div', { role: 'article' }, permalink('101'), story)));
  assert.equal(result.reason, 'nested_story_content');
  assert.equal(result.text, '');
});
