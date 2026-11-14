import fs from 'fs';
import { parseAskingPrice, matchesFacebookGroup } from '../listingIntegrity.js';
import { openFacebookSession, withFacebookSession, withScratchPage } from '../browserSession.js';
import { measureStage, withTimeout } from '../runtimeUtils.js';
import { readOwnedFacebookPost } from './facebookPostOwnership.js';
import { classifySale } from '../saleListing.js';

const legacySessions = new WeakMap();
export async function getLatestModaPage(group = null) {
  const session = await openFacebookSession();
  try {
    const page = await session.getPage(group);
    legacySessions.set(page, session);
    return page;
  } catch (error) { await session.close(); throw error; }
}
export async function releaseModaPage(page) {
  const session = legacySessions.get(page);
  legacySessions.delete(page);
  await session?.close();
}
export function extractPrice(text) { return parseAskingPrice(text).amount; }

export async function dumpAccessibilityTree(group = null, options = {}) {
  const { getPage, saveListings = listings => fs.writeFileSync('moda-listings.json', JSON.stringify(listings, null, 2), 'utf8'),
    maxListings = 12, maxPosts = 24, maxPasses = 3, groupTimeoutMs = 90000, onTiming,
    onDiagnostic = event => console.log(JSON.stringify(event)), now = () => performance.now(),
  } = options;
  if (!getPage) return withFacebookSession(session => dumpAccessibilityTree(group, { ...options, getPage: session.getPage }));
  const timing = { now, ...(onTiming ? { onTiming } : {}) };
  // Only code-defined reason/stage strings and bounded numeric counts are emitted.
  // Never attach a listing, URL, post/profile ID, error object, or page content.
  const emit = event => {
    try { onDiagnostic(Object.freeze(event)); }
    catch { console.warn('Facebook diagnostic observer failed; details suppressed.'); }
  };
  const count = value => Number.isInteger(value) && value >= 0 ? Math.min(value, 100000) : 0;
  return measureStage('facebook-group', async () => {
    const started = now();
    const remaining = () => Math.max(1, groupTimeoutMs - (now() - started));
    const page = await getPage(group);
    const posts = await measureStage('facebook-discovery', () => withTimeout(async () => {
      await page.waitForSelector('[data-ad-rendering-role="story_message"]', { timeout: Math.min(15000, remaining()) });
      const found = new Map();
      for (let pass = 0; pass < maxPasses; pass++) {
        const links = await page.locator('a[href*="/posts/"]').evaluateAll(nodes => nodes.map(node => node.href));
        for (const href of links) {
          const match = href.match(/\/groups\/([^/]+)\/posts\/(\d+)/i);
          if (!match || !matchesFacebookGroup(href, group)) continue;
          found.set(match[2], { groupId: match[1], postId: match[2] });
          if (found.size >= maxPosts) break;
        }
        if (found.size >= maxListings || pass + 1 >= maxPasses) break;
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(Math.min(600, remaining()));
      }
      return [...found.values()].slice(0, maxPosts);
    }, remaining(), { label: 'Facebook discovery' }), timing);
    if (!posts.length) {
      emit({ event: 'facebook_collection_summary', reason: 'no_candidates_discovered', discovered: 0, attempted: 0, collected: 0, skipped: 0, notAttempted: 0 });
      saveListings([]);
      return [];
    }
    let attempted = 0, collected = 0, skipped = 0, notAttempted = 0, interrupted = false;
    const terminal = new Set();
    const outcome = (candidate, stage, reason, status = 'skipped', metadata = {}) => {
      if (terminal.has(candidate)) return;
      terminal.add(candidate);
      if (status === 'skipped') skipped++;
      if (status === 'not_attempted') notAttempted++;
      emit({ event: 'facebook_candidate', candidate, outcome: status, stage, reason, ...metadata });
    };
    let activeCandidate = null, activeStage = 'scratch_creation';
    let listings;
    try {
      listings = await measureStage('facebook-details', () => withScratchPage(page.context(), async (detailPage, signal) => {
        const found = [];
        for (let index = 0; index < posts.length; index++) {
          const candidate = index + 1;
          activeCandidate = candidate;
          activeStage = 'budget';
          if (signal.aborted || now() - started >= groupTimeoutMs) {
            outcome(candidate, activeStage, 'group_budget_exceeded', 'not_attempted');
            throw new Error('Facebook group collection timed out.');
          }
          attempted++;
          const { groupId, postId } = posts[index];
          const url = `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
          try {
            activeStage = 'navigation';
            await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(15000, remaining()) });
            activeStage = 'message_readiness';
            await detailPage.waitForSelector('[data-ad-rendering-role="story_message"]:visible', { timeout: Math.min(10000, remaining()) });
            activeStage = 'content_extraction';
            // One DOM snapshot binds text, author, image and comments to the same post.
            let content = await detailPage.locator('body').evaluate(readOwnedFacebookPost, { groupId, postId, expand:true });
            if(content.diagnostics?.expansionAttempted){
              await detailPage.waitForTimeout(Math.min(350,remaining()));
              content=await detailPage.locator('body').evaluate(readOwnedFacebookPost,{groupId,postId});
              content.diagnostics.expansionAttempted=true;
            }
            if (!content.text) {
              const reasons = new Set(['no_visible_story_message', 'post_ownership_not_found', 'conflicting_post_ownership',
                'ambiguous_post_ownership', 'ambiguous_parent_messages', 'nested_story_content', 'empty_parent_message']);
              const reason = reasons.has(content.reason) ? content.reason : 'post_ownership_not_found';
              outcome(candidate, reason === 'post_ownership_not_found' || reason === 'conflicting_post_ownership' || reason === 'no_visible_story_message' ? 'owner_lookup' : activeStage,
                reason, 'skipped', { visibleStoryMessageCount: count(content.diagnostics?.visibleStoryMessageCount),
                  matchedMessageCount: count(content.diagnostics?.matchedMessageCount), storyMessageCount: count(content.diagnostics?.storyMessageCount),
                  distinctMessageCount: count(content.diagnostics?.distinctMessageCount) });
              continue;
            }
            const sale=classifySale(content.text);
            if (sale.kind!=='sale') {
              outcome(candidate, 'listing_filter', sale.reason);
              continue;
            }
            for (const reason of content.warnings || []) {
              if (reason === 'optional_image_unavailable' || reason === 'optional_comments_unavailable') emit({ event: 'facebook_candidate_warning', candidate,
                stage: reason === 'optional_image_unavailable' ? 'image_extraction' : 'comment_extraction', reason });
            }
            const image = content.image || null;
            const comments = content.comments || [];
            const sellerReasons = new Set(['post_author_identified', 'conflicting_author_evidence',
              'no_supported_author_in_verified_header', 'verified_author_header_not_found']);
            const sellerReason = sellerReasons.has(content.sellerExtraction?.reason) ? content.sellerExtraction.reason : 'verified_author_header_not_found';
            emit({ event: 'facebook_field_status', candidate, field: 'seller',
              status: content.seller !== 'Unknown seller' ? 'recognized' : content.sellerExtraction?.status === 'ambiguous' ? 'ambiguous' : 'missing',
              reason: sellerReason, headerCount: count(content.sellerExtraction?.headerCount), profileCandidateCount: count(content.sellerExtraction?.profileCandidateCount) });
            const priceExtraction = content.diagnostics?.textStatus === 'truncated'
              ? { amount: null, currency: null, status: 'missing', reason: 'post_text_truncated', evidence: [], rejectedReasons: [] }
              : parseAskingPrice(content.text);
            const price = priceExtraction.amount;
            emit({event:'facebook_text_status',candidate,expanded:Boolean(content.diagnostics?.expansionAttempted),
              truncated:content.diagnostics?.textStatus==='truncated',domHasAdditionalDigits:Boolean(content.diagnostics?.domHasAdditionalDigits),
              renderedDigitCount:count(content.diagnostics?.renderedDigitCount),domDigitCount:count(content.diagnostics?.domDigitCount)});
            emit({ event: 'facebook_field_status', candidate, field: 'asking_price', status: priceExtraction.status, reason: priceExtraction.reason });
            found.push({ id: `moda-${postId}`, seller: content.seller, listingText: content.text, price, priceExtraction, sellerExtraction: content.sellerExtraction, comments,
              photos:content.photos??[],textStatus:content.diagnostics?.textStatus,
              textDiagnostics:{expansionAttempted:Boolean(content.diagnostics?.expansionAttempted),textStatus:content.diagnostics?.textStatus??'unknown',
                domHasAdditionalDigits:Boolean(content.diagnostics?.domHasAdditionalDigits),renderedDigitCount:count(content.diagnostics?.renderedDigitCount),domDigitCount:count(content.diagnostics?.domDigitCount)},
              source: 'Moda', url, image, requiresManualReview: content.seller === 'Unknown seller' || price === null,
              reviewReasons: [...(content.seller === 'Unknown seller' ? ['seller_not_unambiguously_identified'] : []), ...(price === null ? ['asking_price_not_recognized', priceExtraction.reason] : [])],
              capturedAt: new Date().toISOString() });
            collected++;
            outcome(candidate, 'complete', 'listing_collected', 'collected', { sellerRecognized: content.seller !== 'Unknown seller', priceRecognized: price !== null });
            if (found.length >= maxListings) {
              for (let pending = index + 2; pending <= posts.length; pending++) outcome(pending, 'budget', 'listing_limit_reached', 'not_attempted');
              break;
            }
          } catch (error) {
            if (signal.aborted) {
              outcome(candidate, activeStage, 'group_budget_exceeded');
              throw new Error('Facebook detail collection timed out.');
            }
            const timedOut = error?.name === 'TimeoutError' || error?.code === 'TIMEOUT';
            outcome(candidate, activeStage, detailPage.isClosed() ? 'detail_page_closed' : timedOut ? 'operation_timeout' : 'operation_failed');
          }
        }
        return found;
      }, { timeoutMs: remaining() }), timing);
    } catch (error) {
      interrupted = true;
      // The outer deadline may reject before the inner operation notices cancellation.
      if (activeCandidate != null) outcome(activeCandidate, activeStage, error?.code === 'TIMEOUT' ? 'group_budget_exceeded' : 'detail_collection_interrupted');
      for (let candidate = 1; candidate <= posts.length; candidate++) {
        if (!terminal.has(candidate)) outcome(candidate, activeCandidate == null ? 'scratch_creation' : 'budget',
          activeCandidate == null ? error?.code === 'TIMEOUT' ? 'scratch_creation_timeout' : 'scratch_creation_failed' : 'collection_interrupted', 'not_attempted');
      }
      throw error;
    } finally {
      emit({ event: 'facebook_collection_summary', reason: interrupted ? 'collection_interrupted' : collected ? 'collection_completed' : 'all_candidates_skipped',
        discovered: posts.length, attempted, collected, skipped, notAttempted });
    }
    saveListings(listings);
    return listings;
  }, timing);
}
