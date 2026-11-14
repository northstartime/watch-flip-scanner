import { element, message, permalink } from './helpers/syntheticDom.js';
﻿import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { readPostContent } from '../src/listingIntegrity.js';

globalThis.fetch = () => { throw new Error('Network forbidden in diagnostic regression tests'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) chromium[method] = () => { throw new Error('Browser forbidden in diagnostic regression tests'); };
const quiet = () => {};
const privateMarker = 'SYNTHETIC_PRIVATE_CONTENT_DO_NOT_LOG';
function domNode(text, { comment = false } = {}) {
  return { innerText: text, textContent: text, closest: () => comment ? {} : null,
    compareDocumentPosition: () => 4, getAttribute: () => '/profile.php?id=777777777' };
}
function fixture({ texts = [`Rolex 124270\n${privateMarker}\nAsking $8,500`], commentsOnly = false,
  visibleMessages = 1, ownerWithHeading = true, ownerWithoutHeading = true,
  failAt, timeout = false, closeDuringNavigation = false, duplicate = false,
  noCandidates = false, twoPosts = false, hangingNavigation = false,
  commentsFail = false, photoAttributeFails = false, noPrice = false,
} = {}) {
  const diagnostics = [], saved = [];
  const error = () => {
    const value = new Error(`https://private.invalid/${privateMarker}?cookie=synthetic-fixture`);
    if (timeout) value.name = 'TimeoutError';
    return value;
  };
  let currentId = '101';
  const buildRoot = () => {
    const stories = (noPrice ? [`Rolex 124270 for sale\n${privateMarker}`] : texts).map(text => message(text, visibleMessages ? {} : { hidden: '' }));
    const article = element('div', { role: 'article' },
      ownerWithHeading ? element('h3', {}, 'Unattributed synthetic heading') : null,
      ownerWithHeading || ownerWithoutHeading ? permalink(currentId) : null,
      commentsOnly ? element('div', { role: 'article', 'aria-label': 'Comment by fixture' }, ...stories) : stories);
    if (photoAttributeFails) {
      const photo = element('img', { src: 'https://synthetic.fbcdn.net/fixture.jpg' });
      const getAttribute = photo.getAttribute.bind(photo);
      photo.getAttribute = name => { if (name === 'src') throw error(); return getAttribute(name); };
      const link = element('a', { href: `/photo/?set=gm.${currentId}` }, photo);
      link.parentElement = article;
      article.children.push(link);
    }
    if (commentsFail) {
      const query = article.querySelectorAll.bind(article);
      article.querySelectorAll = selector => {
        if (selector.startsWith('[role="article"][aria-label^="Comment by"]')) throw error();
        return query(selector);
      };
    }
    return element('body', {}, article);
  };
  const detail = new EventEmitter();
  detail.closed = false;
  detail.isClosed = () => detail.closed;
  detail.close = async () => { detail.closed = true; };
  detail.goto = async url => {
    currentId = url.match(/posts\/(\d+)/)[1];
    if (hangingNavigation) return new Promise(() => {});
    if (closeDuringNavigation) { detail.closed = true; throw error(); }
    if (failAt === 'navigation') throw error();
  };
  detail.waitForSelector = async () => { if (failAt === 'message_readiness') throw error(); };
  detail.locator = () => ({ evaluate: async (callback, args) => {
    if (failAt === 'content_extraction') throw error();
    return callback(buildRoot(), args);
  } });
  const links = noCandidates ? [] : [{ href: 'https://www.facebook.com/groups/synthetic/posts/101/' }];
  if (duplicate) links.push({ ...links[0] });
  if (twoPosts) links.push({ href: 'https://www.facebook.com/groups/synthetic/posts/102/' });
  const context = { newPage: async () => { if (failAt === 'scratch_creation') throw error(); return detail; } };
  const page = { waitForSelector: async () => {}, locator: () => ({ evaluateAll: async callback => callback(links) }),
    mouse: { wheel: async () => { throw new Error('Regression test must use one discovery pass'); } }, context: () => context };
  return { diagnostics, saved, detail,
    run: overrides => dumpAccessibilityTree('synthetic', {
      getPage: async () => page, saveListings: value => saved.push(value), onTiming: quiet,
      onDiagnostic: event => diagnostics.push(event), maxPasses: 1, ...overrides,
    }),
  };
}
const candidates = events => events.filter(event => event.event === 'facebook_candidate');
const summary = events => events.find(event => event.event === 'facebook_collection_summary');
function assertPrivate(events) {
  const json = JSON.stringify(events);
  for (const forbidden of [privateMarker, '777777777', '/profile.php', 'facebook.com', 'private.invalid', 'cookie=', '8500', 'postId', 'listingText', 'stack', 'Authorization']) assert.equal(json.includes(forbidden), false, `Diagnostics contained forbidden synthetic data: ${forbidden}`);
  for (const event of events) assert.equal(Object.isFrozen(event), true);
}

for (const [name, options, reason] of [
  ['owner lookup has no linked parent', { ownerWithHeading: false, ownerWithoutHeading: false }, 'post_ownership_not_found'],
  ['visible message disappeared after readiness', { visibleMessages: 0 }, 'no_visible_story_message'],
  ['parent message is empty', { texts: ['   '] }, 'empty_parent_message'],
  ['parent has multiple distinct messages', { texts: [privateMarker, 'SECOND_SYNTHETIC_MESSAGE'] }, 'ambiguous_parent_messages'],
  ['only comment messages remain', { commentsOnly: true }, 'no_visible_story_message'],
]) test(`silent skip now diagnosed: ${name}`, async () => {
  const item = fixture(options);
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics).length, 1);
  assert.equal(candidates(item.diagnostics)[0].reason, reason);
  assert.equal(summary(item.diagnostics).reason, 'all_candidates_skipped');
  assert.equal(summary(item.diagnostics).skipped, 1);
  assert.equal(item.detail.closed, true);
  assert.equal(item.detail.listenerCount('popup'), 0);
  assertPrivate(item.diagnostics);
});

for (const prefix of ['Reference check', 'Ref check', 'Reference request', 'References on']) test(`reference-check filter is explicit: ${prefix}`, async () => {
  const item = fixture({ texts: [`${prefix}\n${privateMarker}`] });
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics)[0].reason, 'reference_check_post');
  assert.equal(candidates(item.diagnostics)[0].stage, 'listing_filter');
  assertPrivate(item.diagnostics);
});

for (const stage of ['navigation', 'message_readiness', 'content_extraction']) test(`exception diagnostics record stage without raw details: ${stage}`, async () => {
  const item = fixture({ failAt: stage });
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics)[0].stage, stage);
  assert.equal(candidates(item.diagnostics)[0].reason, 'operation_failed');
  assert.equal(item.detail.closed, true);
  assertPrivate(item.diagnostics);
});

for (const stage of ['navigation', 'message_readiness']) test(`timeout diagnostics identify stage: ${stage}`, async () => {
  const item = fixture({ failAt: stage, timeout: true });
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics)[0].stage, stage);
  assert.equal(candidates(item.diagnostics)[0].reason, 'operation_timeout');
  assertPrivate(item.diagnostics);
});

test('closed detail tab is distinguishable from other navigation failures', async () => {
  const item = fixture({ closeDuringNavigation: true });
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics)[0].reason, 'detail_page_closed');
});

test('unknown seller and missing price remain review candidates, not silent skips', async () => {
  const item = fixture({ noPrice: true });
  const listings = await item.run();
  assert.equal(listings.length, 1);
  assert.equal(listings[0].seller, 'Unknown seller');
  assert.equal(listings[0].price, null);
  assert.deepEqual(candidates(item.diagnostics)[0], { event: 'facebook_candidate', candidate: 1, outcome: 'collected', stage: 'complete', reason: 'listing_collected', sellerRecognized: false, priceRecognized: false });
  assert.equal(summary(item.diagnostics).collected, 1);
  assertPrivate(item.diagnostics);
});

test('optional comments and image failures warn without dropping an otherwise valid listing', async () => {
  const item = fixture({ commentsFail: true, photoAttributeFails: true });
  assert.equal((await item.run()).length, 1);
  assert.deepEqual(item.diagnostics.filter(event => event.event === 'facebook_candidate_warning').map(event => event.reason), ['optional_image_unavailable', 'optional_comments_unavailable']);
  assert.equal(candidates(item.diagnostics)[0].outcome, 'collected');
  assertPrivate(item.diagnostics);
});

test('repeated discovered links produce one terminal candidate event', async () => {
  const item = fixture({ duplicate: true });
  assert.equal((await item.run()).length, 1);
  assert.equal(candidates(item.diagnostics).length, 1);
  assert.equal(summary(item.diagnostics).discovered, 1);
});

test('candidate limits distinguish never-attempted posts from extraction skips', async () => {
  const item = fixture({ twoPosts: true });
  assert.equal((await item.run({ maxListings: 1 })).length, 1);
  assert.deepEqual(candidates(item.diagnostics).map(event => [event.candidate, event.outcome, event.reason]), [[1, 'collected', 'listing_collected'], [2, 'not_attempted', 'listing_limit_reached']]);
  assert.equal(summary(item.diagnostics).attempted, 1);
  assert.equal(summary(item.diagnostics).notAttempted, 1);
});

test('no discovered candidates has its own summary and does not create a scratch tab', async () => {
  const item = fixture({ noCandidates: true, failAt: 'scratch_creation' });
  assert.deepEqual(await item.run(), []);
  assert.equal(candidates(item.diagnostics).length, 0);
  assert.equal(summary(item.diagnostics).reason, 'no_candidates_discovered');
});

test('scratch creation failure records all discovered candidates as not attempted', async () => {
  const item = fixture({ failAt: 'scratch_creation', twoPosts: true });
  await assert.rejects(item.run());
  assert.equal(candidates(item.diagnostics).length, 2);
  assert.equal(candidates(item.diagnostics).every(event => event.outcome === 'not_attempted' && event.stage === 'scratch_creation' && event.reason === 'scratch_creation_failed'), true);
  assert.equal(summary(item.diagnostics).reason, 'collection_interrupted');
  assert.equal(item.saved.length, 0);
  assertPrivate(item.diagnostics);
});

test('group deadline emits a terminal outcome for both active and pending candidates', async () => {
  const item = fixture({ hangingNavigation: true, twoPosts: true });
  await assert.rejects(item.run({ groupTimeoutMs: 30 }), error => error.code === 'TIMEOUT');
  assert.deepEqual(candidates(item.diagnostics).map(event => [event.candidate, event.outcome]), [[1, 'skipped'], [2, 'not_attempted']]);
  assert.equal(candidates(item.diagnostics)[0].reason, 'group_budget_exceeded');
  assert.equal(summary(item.diagnostics).reason, 'collection_interrupted');
  assert.equal(item.detail.closed, true);
  assert.equal(item.saved.length, 0);
  assertPrivate(item.diagnostics);
});

test('diagnostic callback failure cannot discard a valid listing or leak observer errors', async () => {
  const item = fixture();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const result = await item.run({ onDiagnostic: () => { throw new Error(privateMarker); } });
    assert.equal(result.length, 1);
    assert.equal(warnings.length, 5); // Includes the new safe text-status diagnostic.
    assert.equal(warnings.some(value => value.includes(privateMarker)), false);
  } finally { console.warn = originalWarn; }
});

test('default diagnostic logger emits only safe event JSON', async () => {
  const item = fixture({ failAt: 'content_extraction' });
  const originalLog = console.log;
  const messages = [];
  console.log = message => messages.push(message);
  try {
    await item.run({ onDiagnostic: undefined });
    const events = messages.map(message => JSON.parse(message));
    assert.equal(events.length, 2);
    assert.equal(events[0].stage, 'content_extraction');
    assert.equal(messages.some(message => message.includes(privateMarker)), false);
    assert.equal(messages.some(message => message.includes('private.invalid')), false);
  } finally { console.log = originalLog; }
});

test('content inspector distinguishes structural failure modes without changing its default API', () => {
  const article = nodes => ({ querySelectorAll: selector => selector.includes('story_message') ? nodes : [] });
  assert.deepEqual(readPostContent(article([domNode('Listing')])), { text: 'Listing', seller: 'Unknown seller' });
  const empty = readPostContent(article([domNode(' ')]), true);
  assert.equal(empty.diagnostics.contentStatus, 'empty');
  const ambiguous = readPostContent(article([domNode('First'), domNode('Second')]), true);
  assert.equal(ambiguous.diagnostics.contentStatus, 'ambiguous');
  assert.equal(ambiguous.diagnostics.distinctMessageCount, 2);
  const repeated = readPostContent(article([domNode('Same'), domNode('Same')]), true);
  assert.equal(repeated.diagnostics.contentStatus, 'ok');
  assert.equal(repeated.text, 'Same');
});

test('post-owned text without an author heading remains an unknown-seller review candidate', async () => {
  const item = fixture({ ownerWithHeading: false, ownerWithoutHeading: true });
  const listings = await item.run();
  assert.equal(listings.length, 1);
  assert.equal(listings[0].seller, 'Unknown seller');
  assert.equal(listings[0].requiresManualReview, true);
  assert.ok(listings[0].reviewReasons.includes('seller_not_unambiguously_identified'));
  assert.equal(candidates(item.diagnostics)[0].outcome, 'collected');
});
