import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ASK_GROUPS, FACEBOOK_ASK_TARGETS, createTwoGroupPlan, validateGroupFragments } from '../src/facebookGroups.js';
import { getModaListings } from '../src/markets/moda.js';
import { runControlledTwoGroupTest } from '../tools/test-facebook-groups.js';
import { element, post } from './helpers/syntheticDom.js';

globalThis.fetch = () => { throw new Error('Network forbidden in readiness tests'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) chromium[method] = () => { throw new Error('Real browser forbidden in readiness tests'); };

function fixture({ fragments = ASK_GROUPS, missingSecond = false, postOnlySecond = false, extraPostFirst = false,
  popups = false, failNavigationId = null, failSecondFeed = false, empty = false,
} = {}) {
  let connects = 0, disconnects = 0, scratchCreated = 0, maxScratchOpen = 0;
  const navigated = [], allPages = [];
  const context = new EventEmitter();
  context.pages = () => allPages.filter(page => !page.closed);
  context.close = () => { throw new Error('Never close the user context'); };
  const createPage = (url, type) => {
    const page = new EventEmitter();
    page.type = type; page.address = url; page.closed = false;
    page.url = () => page.address;
    page.isClosed = () => page.closed;
    page.context = () => context;
    page.close = async () => {
      if (type === 'feed' || type === 'original-post' || type === 'unrelated') throw new Error('User tab closure forbidden');
      page.closed = true;
    };
    allPages.push(page);
    return page;
  };
  if (extraPostFirst) createPage(`https://www.facebook.com/groups/${fragments[0]}/posts/909/`, 'original-post');
  const feed = (fragment, index) => {
    const page = createPage(`https://www.facebook.com/groups/${fragment}/?sorting_setting=CHRONOLOGICAL`, 'feed');
    page.waitForSelector = async () => { if (failSecondFeed && index === 1) throw new Error('SYNTHETIC_PRIVATE_FAILURE'); };
    page.waitForTimeout = async () => {};
    page.mouse = { wheel: async () => {} };
    const ids = empty ? [] : index === 0 ? ['101', '101', '102', '103', '102'] : ['103', '104', '104', '105'];
    page.locator = () => ({ evaluateAll: async callback => callback(ids.map(id => ({ href: `https://www.facebook.com/groups/${fragment}/posts/${id}/` }))) });
    return page;
  };
  feed(fragments[0], 0);
  if (!missingSecond && !postOnlySecond) feed(fragments[1], 1);
  if (postOnlySecond) createPage(`https://www.facebook.com/groups/${fragments[1]}/posts/909/`, 'original-post');
  createPage('https://example.invalid/', 'unrelated');
  const originals = [...allPages];
  context.newPage = async () => {
    const page = createPage('about:blank', 'scratch');
    scratchCreated++;
    maxScratchOpen = Math.max(maxScratchOpen, allPages.filter(page => page.type === 'scratch' && !page.closed).length);
    context.emit('page', page);
    let madePopup = false;
    page.goto = async url => {
      page.address = url;
      const match = new URL(url).pathname.match(/^\/groups\/([^/]+)\/posts\/(\d+)\/$/);
      navigated.push({ group: match[1], id: match[2] });
      if (match[2] === failNavigationId) throw new Error('SYNTHETIC_PRIVATE_FAILURE');
      if (popups && !madePopup) {
        madePopup = true;
        const popup = createPage('about:blank', 'popup'); context.emit('page', popup); page.emit('popup', popup);
        const child = createPage('about:blank', 'popup'); context.emit('page', child); popup.emit('popup', child);
      }
    };
    page.waitForSelector = async () => {};
    page.locator = selector => {
      assert.equal(selector, 'body');
      return { evaluate: async (callback, args) => callback(element('body', {}, post(args.postId, 'Rolex 124270 for sale\nAsking $8,500.', {
        group: args.groupId, seller: args.postId === '101' ? 'SYNTHETIC_PRIVATE_SELLER' : null,
      })), args) };
    };
    return page;
  };
  const browser = { contexts: () => [context], close: async () => { disconnects++; } };
  return {
    connect: async (endpoint, options) => { connects++; assert.equal(endpoint, 'http://127.0.0.1:9222'); assert.equal(options.timeout, 10000); return browser; },
    navigated, originals, allPages,
    stats: () => ({ connects, disconnects, scratchCreated, maxScratchOpen, listeners: context.listenerCount('page'),
      liveNewPages: allPages.filter(page => !originals.includes(page) && !page.closed).length,
      allUserPagesPreserved: originals.every(page => !page.closed),
      popupListeners: allPages.reduce((sum, page) => sum + page.listenerCount('popup'), 0) }),
  };
}

test('two distinct intended groups are configured once with unchanged exact defaults', () => {
  assert.deepEqual(ASK_GROUPS, ['watchtradercommunity', 'Watchtrading']);
  assert.deepEqual(FACEBOOK_ASK_TARGETS.map(target => target.name), ['Watch Trader Community', 'Moda Watch Club']);
  assert.equal(new Set(ASK_GROUPS.map(group => group.toLowerCase())).size, 2);
  assert.ok(Object.isFrozen(FACEBOOK_ASK_TARGETS));
  const plan = createTwoGroupPlan();
  assert.equal(plan.liveGroupIdentityVerified, false);
  assert.equal(plan.uploadsEnabled, false);
  assert.equal(plan.feedWritesEnabled, false);
  assert.equal(plan.chromeLaunchEnabled, false);
  assert.equal(plan.maxCandidatesPerGroup, 5);
  assert.equal(plan.groupBudgetMs, 30000);
});

for (const groups of [[], ['feed', 'other'], ['group', 'GROUP'], ['https://www.facebook.com/groups/group/', 'other'], ['..', 'other'], ['group/extra', 'other']]) test('malformed or duplicate configuration is rejected offline', () => {
  assert.throws(() => createTwoGroupPlan({ groupFragments: groups }));
});

test('explicit numeric group IDs work without guessing a vanity alias', () => {
  const plan = createTwoGroupPlan({ groupFragments: ['111111', '222222'] });
  assert.deepEqual(plan.targets.map(target => target.fragment), ['111111', '222222']);
  assert.equal(plan.liveGroupIdentityVerified, false);
});

test('invalid controlled configuration never connects', async () => {
  const fake = fixture();
  await assert.rejects(runControlledTwoGroupTest({ groupFragments: ['same', 'SAME'], connect: fake.connect }));
  assert.equal(fake.stats().connects, 0);
});

test('normalization visits exactly the configured groups and retains unknown sellers', async () => {
  const calls = [];
  const raw = { id: 'moda-101', source: 'Moda', url: 'https://www.facebook.com/groups/groupone/posts/101/', listingText: 'Rolex 124270 Asking $8,500', price: 8500 };
  const result = await getModaListings(async group => { calls.push(group); return [raw]; }, { groups: ['groupone', 'grouptwo'], log: () => {} });
  assert.deepEqual(calls, ['groupone', 'grouptwo']);
  assert.equal(result.length, 1);
  assert.equal(result[0].seller, 'Unknown seller');
  assert.equal(result[0].requiresManualReview, true);
  assert.equal(result[0].buyPrice, 8500);
});

test('both feeds process multiple posts once, deduplicate across groups, and retain unknown sellers', async () => {
  const fake = fixture();
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'completed');
  assert.equal(report.preflightPassed, true);
  assert.deepEqual(report.groups.map(group => [group.discovered, group.collected, group.skipped]), [[3, 3, 0], [3, 3, 0]]);
  assert.equal(report.uniqueListings, 5);
  assert.equal(report.duplicatesRemovedAcrossGroups, 1);
  assert.equal(report.unknownSellerListingsRetained, 4);
  assert.equal(report.unknownSellerListingsMarkedForReview, 4);
  assert.equal(report.sellerExtractionSuccesses, 1);
  assert.equal(report.askingPriceExtractionSuccesses, 5);
  assert.equal(fake.navigated.length, 6);
  for (const group of ASK_GROUPS) {
    const posts = fake.navigated.filter(item => item.group === group).map(item => item.id);
    assert.equal(posts.length, new Set(posts).size);
  }
  assert.deepEqual(fake.stats(), { connects: 1, disconnects: 1, scratchCreated: 2, maxScratchOpen: 1, listeners: 0,
    liveNewPages: 0, allUserPagesPreserved: true, popupListeners: 0 });
  assert.equal(report.tabsBefore, report.tabsAfter);
  assert.equal(report.newTabsRemaining, 0);
  assert.equal(report.connectionReleased, true);
  assert.equal(report.uploadsEnabled, false);
  assert.equal(report.feedWritesEnabled, false);
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_SELLER'), false);
  assert.equal(JSON.stringify(report).includes('8500'), false);
  assert.equal(JSON.stringify(report).includes('facebook.com'), false);
});

test('popup descendants close for both groups, preserving all existing user tabs', async () => {
  const fake = fixture({ popups: true, extraPostFirst: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'completed');
  assert.equal(report.tabsCreated, 6);
  assert.equal(report.tabsBefore, report.tabsAfter);
  assert.equal(fake.stats().maxScratchOpen, 1);
  assert.equal(fake.stats().liveNewPages, 0);
  assert.equal(fake.stats().allUserPagesPreserved, true);
  assert.equal(fake.stats().popupListeners, 0);
});

test('missing second feed stops before scanning even the first group', async () => {
  const fake = fixture({ missingSecond: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'stopped');
  assert.equal(report.preflightPassed, false);
  assert.equal(report.errors[0].phase, 'preflight');
  assert.equal(fake.navigated.length, 0);
  assert.equal(fake.stats().scratchCreated, 0);
  assert.equal(fake.stats().disconnects, 1);
});

test('standalone post tab does not substitute for the second group feed', async () => {
  const fake = fixture({ postOnlySecond: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.preflightPassed, false);
  assert.equal(fake.navigated.length, 0);
  assert.equal(fake.stats().scratchCreated, 0);
});

test('extra first-group post tab does not hide the correctly open feed tab', async () => {
  const fake = fixture({ extraPostFirst: true });
  assert.equal((await runControlledTwoGroupTest({ connect: fake.connect })).status, 'completed');
  assert.equal(fake.stats().allUserPagesPreserved, true);
});

test('numeric configured identities select only their exact feed tabs', async () => {
  const fragments = ['111111', '222222'];
  const fake = fixture({ fragments });
  const report = await runControlledTwoGroupTest({ connect: fake.connect, groupFragments: fragments });
  assert.equal(report.status, 'completed');
  assert.equal(fake.navigated.every(item => fragments.includes(item.group)), true);
  const mismatch = fixture();
  const blocked = await runControlledTwoGroupTest({ connect: mismatch.connect, groupFragments: fragments });
  assert.equal(blocked.preflightPassed, false);
  assert.equal(mismatch.navigated.length, 0);
});

test('one unreadable post is explicitly skipped while later posts still process and cleanup completes', async () => {
  const fake = fixture({ failNavigationId: '102', popups: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'completed');
  assert.equal(report.groups[0].skipped, 1);
  assert.equal(report.groups[0].candidateDiagnostics.find(event => event.outcome === 'skipped').reason, 'operation_failed');
  assert.equal(report.uniqueListings, 4);
  assert.equal(report.unknownSellerListingsRetained, report.unknownSellerListingsMarkedForReview);
  assert.equal(fake.stats().liveNewPages, 0);
});

test('second-group failure releases the shared connection and all first-group temporary pages', async () => {
  const fake = fixture({ failSecondFeed: true, popups: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'stopped');
  assert.equal(report.errors[0].phase, 'collection');
  assert.equal(report.groups[0].collected, 3);
  assert.equal(fake.stats().liveNewPages, 0);
  assert.equal(fake.stats().allUserPagesPreserved, true);
  assert.equal(fake.stats().disconnects, 1);
  assert.equal(report.connectionReleased, true);
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_FAILURE'), false);
});

test('empty groups create no scratch tabs and produce explicit zero-count summaries', async () => {
  const fake = fixture({ empty: true });
  const report = await runControlledTwoGroupTest({ connect: fake.connect });
  assert.equal(report.status, 'completed');
  assert.equal(report.uniqueListings, 0);
  assert.equal(fake.stats().scratchCreated, 0);
  assert.deepEqual(report.groups.map(group => group.discovered), [0, 0]);
});

test('controlled runner imports no cloud, image embedding, full scanner or scheduled automation path', async () => {
  const source = await readFile(new URL('../tools/test-facebook-groups.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:cloudSync|daily|v1|wtbScan|mobileImages)|writeFile|Start-Process|chromium\.launch|fetch\(/);
  const v1 = await readFile(new URL('../src/v1.js', import.meta.url), 'utf8');
  assert.match(v1, /import \{ ASK_GROUPS \} from "\.\/facebookGroups\.js"/);
  assert.doesNotMatch(v1, /dumpAccessibilityTree\("(?:watchtradercommunity|Watchtrading)"/);
});
