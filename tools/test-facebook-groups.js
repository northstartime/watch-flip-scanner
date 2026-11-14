import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { ASK_GROUPS, MODA_UNDER_10K_TARGET, createTwoGroupPlan, createThreeGroupPlan } from '../src/facebookGroups.js';
import { withFacebookSession } from '../src/browserSession.js';
import { dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { getModaListings } from '../src/markets/moda.js';
import { deduplicateListings } from '../src/listingIntegrity.js';

// Collection-only harness. No daily/V1/WTB runner, images, cloud, or file writes.
export async function runControlledGroupTest({ groupFragments = ASK_GROUPS, connect = (...args) => chromium.connectOverCDP(...args), now = () => performance.now() } = {}) {
  const started = now();
  const plan = groupFragments.length === 3 ? createThreeGroupPlan({ groupFragments }) : createTwoGroupPlan({ groupFragments });
  const report = { status: 'not-started', preflightPassed: false, liveGroupIdentityVerified: false,
    limits: { candidatesPerGroup: plan.maxCandidatesPerGroup, discoveryPasses: plan.maxDiscoveryPasses, collectionMsPerGroup: plan.groupBudgetMs },
    groups: plan.targets.map(target => ({ name: target.name, discovered: null, attempted: null, collected: 0, skipped: null,
      notAttempted: null, runtimeMs: null, tabsBefore: null, tabsAfter: null, tabsCreated: 0, newTabsRemaining: null, originalTabsPreserved: null,
      sellerExtractionSuccesses: 0, sellerExtractionRatePercent: null, askingPriceExtractionSuccesses: 0, askingPriceExtractionRatePercent: null, duplicatesReturned: null,
      fieldDiagnostics: [], candidateDiagnostics: [], warnings: [], stages: [] })),
    uniqueListings: 0, duplicatesRemovedAcrossGroups: 0, unknownSellerListingsRetained: 0,
    unknownSellerListingsMarkedForReview: 0, sellerExtractionSuccesses: 0, askingPriceExtractionSuccesses: 0,
    tabsBefore: null, tabsAfter: null, tabsCreated: 0, newTabsRemaining: null, originalTabsPreserved: null,
    connectionReleased: false, errors: [], totalRuntimeMs: null, uploadsEnabled: false, feedWritesEnabled: false,
  };
  let browser, originals;
  let phase = 'connect', activeGroup = null, rawCollected = 0;
  const listeners = [];
  try {
    await withFacebookSession(async () => {
      phase = 'preflight';
      const before = browser.contexts().flatMap(context => context.pages());
      originals = new Set(before);
      report.tabsBefore = before.length;
      for (const context of browser.contexts()) {
        const listener = () => { report.tabsCreated++; };
        context.on('page', listener);
        listeners.push([context, listener]);
      }
      try {
        // Resolve ALL exact group feeds before any detail page or navigation.
        const pages = new Map();
        for (const target of plan.targets) {
          activeGroup = target.name;
          const matches = before.filter(page => {
            try {
              if (page.isClosed()) return false;
              const url = new URL(page.url());
              const match = url.pathname.match(/^\/groups\/([^/]+)\/?$/i);
              return /^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname) && match
                && match[1].toLowerCase() === target.fragment.toLowerCase() && !url.searchParams.has('multi_permalinks');
            } catch { return false; }
          });
          if (matches.length !== 1) throw new Error('ONE_EXACT_GROUP_FEED_REQUIRED');
          const page = matches[0];
          if ([...pages.values()].includes(page)) throw new Error('DISTINCT_GROUP_FEEDS_REQUIRED');
          pages.set(target.fragment, page);
        }
        report.preflightPassed = true;
        phase = 'collection';
        const listings = await getModaListings(async fragment => {
          const index = plan.targets.findIndex(target => target.fragment === fragment);
          const group = report.groups[index];
          activeGroup = group.name;
          const groupStarted = now();
          const groupOriginals = new Set(browser.contexts().flatMap(context => context.pages()));
          const createdAtStart = report.tabsCreated;
          group.tabsBefore = groupOriginals.size;
          try {
            const result = await dumpAccessibilityTree(fragment, {
              getPage: async () => pages.get(fragment), saveListings: () => {},
              maxListings: plan.maxListingsPerGroup, maxPosts: plan.maxCandidatesPerGroup,
              maxPasses: plan.maxDiscoveryPasses, groupTimeoutMs: plan.groupBudgetMs,
              onTiming: event => group.stages.push(event),
              onDiagnostic: event => {
                if (event.event === 'facebook_candidate') group.candidateDiagnostics.push(event);
                else if (event.event === 'facebook_field_status') group.fieldDiagnostics.push(event);
                else if (event.event === 'facebook_collection_summary') {
                  for (const key of ['discovered', 'attempted', 'collected', 'skipped', 'notAttempted']) group[key] = event[key];
                } else group.warnings.push(event);
              },
            });
            group.duplicatesReturned = result.length - deduplicateListings(result).length;
            rawCollected += result.length;
            return result;
          } finally {
            const afterGroup = browser.contexts().flatMap(context => context.pages());
            group.tabsAfter = afterGroup.length;
            group.tabsCreated = report.tabsCreated - createdAtStart;
            group.newTabsRemaining = afterGroup.filter(page => !groupOriginals.has(page)).length;
            group.originalTabsPreserved = [...groupOriginals].every(page => !page.isClosed());
            const accepted = new Set(group.candidateDiagnostics.filter(event => event.outcome === 'collected').map(event => event.candidate));
            group.sellerExtractionSuccesses = group.fieldDiagnostics.filter(event => accepted.has(event.candidate) && event.field === 'seller' && event.status === 'recognized').length;
            group.askingPriceExtractionSuccesses = group.fieldDiagnostics.filter(event => accepted.has(event.candidate) && event.field === 'asking_price' && event.status === 'recognized').length;
            group.sellerExtractionRatePercent = group.collected ? Math.round(group.sellerExtractionSuccesses / group.collected * 10000) / 100 : null;
            group.askingPriceExtractionRatePercent = group.collected ? Math.round(group.askingPriceExtractionSuccesses / group.collected * 10000) / 100 : null;
            group.runtimeMs = Math.max(0, Math.round(now() - groupStarted));
          }
        }, { groups: plan.targets.map(target => target.fragment), log: () => {} });
        report.uniqueListings = listings.length;
        report.duplicatesRemovedAcrossGroups = rawCollected - listings.length;
        const unknown = listings.filter(item => !item.seller || item.seller === 'Unknown seller');
        report.unknownSellerListingsRetained = unknown.length;
        report.unknownSellerListingsMarkedForReview = unknown.filter(item => item.requiresManualReview === true).length;
        report.sellerExtractionSuccesses = listings.length - unknown.length;
        report.askingPriceExtractionSuccesses = listings.filter(item => typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0).length;
        report.status = 'completed';
      } finally {
        for (const [context, listener] of listeners) context.off('page', listener);
        const after = browser.contexts().flatMap(context => context.pages());
        report.tabsAfter = after.length;
        report.newTabsRemaining = after.filter(page => !originals.has(page)).length;
        report.originalTabsPreserved = [...originals].every(page => !page.isClosed());
        if (report.newTabsRemaining || !report.originalTabsPreserved) {
          report.errors.push({ phase: 'cleanup', reason: 'tab_cleanup_or_preservation_failed' });
          report.status = 'stopped';
        }
      }
    }, { connect: async (...args) => {
      browser = await connect(...args);
      const close = browser.close.bind(browser);
      browser.close = async (...closeArgs) => { await close(...closeArgs); report.connectionReleased = true; };
      return browser;
    } });
  } catch {
    report.status = 'stopped';
    report.errors.push({ phase, group: activeGroup, reason: phase === 'preflight' ? 'all_configured_group_feeds_must_be_open' : 'collection_or_connection_cleanup_failed' });
  } finally { report.totalRuntimeMs = Math.max(0, Math.round(now() - started)); }
  return report;
}

export const runControlledTwoGroupTest = options => runControlledGroupTest(options);
export const runControlledThreeGroupTest = (options = {}) => runControlledGroupTest({ ...options,
  groupFragments: options.groupFragments ?? [...ASK_GROUPS, MODA_UNDER_10K_TARGET.fragment],
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = flag => { const index = process.argv.indexOf(flag); return index < 0 ? null : process.argv[index + 1]; };
  try {
    const threeGroups = process.argv.includes('--include-under-10k');
    const defaults = threeGroups ? [...ASK_GROUPS, MODA_UNDER_10K_TARGET.fragment] : ASK_GROUPS;
    const overrides = [option('--wtc-group'), option('--moda-group'), ...(threeGroups ? [option('--under-10k-group')] : [])];
    const groupFragments = overrides.map((value, index) => value || defaults[index]);
    if (!process.argv.includes('--live')) {
      console.log(JSON.stringify({ mode: 'offline-plan', ...(threeGroups ? createThreeGroupPlan({ groupFragments }) : createTwoGroupPlan({ groupFragments })) }, null, 2));
    } else {
      const result = await runControlledGroupTest({ groupFragments });
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== 'completed') process.exitCode = 1;
    }
  } catch {
    console.error('Invalid controlled-group configuration; no details or credentials printed.');
    process.exitCode = 1;
  }
}
