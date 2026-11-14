// Self-contained DOM callback: serialized by Playwright; no browser/network imports.
export function readOwnedFacebookPost(root, { groupId, postId, expand = false, inspectText = false }) {
  const messageSelector = '[data-ad-rendering-role="story_message"]';
  const commentSelector = '[data-commentid], [aria-label^="Comment by"], [aria-label^="Reply by"]';
  const excludedSelector = `${commentSelector}, blockquote, [data-ad-rendering-role="shared_story"]`;
  const boundarySelector = '[role="article"], [data-pagelet^="FeedUnit_"], [data-ad-rendering-role="story"]';
  const visible = node => {
    if (node.closest('[hidden], [aria-hidden="true"]') || !node.getClientRects().length) return false;
    const style = node.ownerDocument?.defaultView?.getComputedStyle(node);
    return !style || (style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility));
  };
  const excluded = node => Boolean(node.closest(excludedSelector));
  const boundaries = new WeakMap();
  const boundary = node => {
    if (boundaries.has(node)) return boundaries.get(node);
    let current = node;
    while (current && root.contains(current)) {
      if (current.matches(boundarySelector) && !current.matches(commentSelector)) break;
      current = current.parentElement;
    }
    const result = current && root.contains(current) ? current : null;
    boundaries.set(node, result);
    return result;
  };
  const identity = node => {
    try {
      const url = new URL(node.getAttribute('href'), 'https://www.facebook.com');
      if (!/^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname)) return null;
      if (url.searchParams.has('comment_id') || url.searchParams.has('reply_comment_id')) return null;
      const match = url.pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/?$/i);
      if (match) return { id: match[2], group: match[1], kind: 'permalink' };
      const photo = url.searchParams.get('set')?.match(/^(?:gm|pcb)\.(\d+)$/);
      return photo ? { id: photo[1], group: null, kind: 'photo' } : null;
    } catch { return null; }
  };
  const matchesTarget = value => value.id === postId && (value.group == null || value.group.toLowerCase() === groupId.toLowerCase());
  const messages = [...root.querySelectorAll(messageSelector)].filter(node => visible(node) && !excluded(node));
  const links = [...root.querySelectorAll('a[href]')]
    .filter(node => visible(node) && !excluded(node) && !node.closest(messageSelector))
    .map(node => ({ node, identity: identity(node), boundary: boundary(node) }))
    .filter(link => link.identity);
  const diagnostics = { visibleStoryMessageCount: messages.length, matchedMessageCount: 0, storyMessageCount: 0, distinctMessageCount: 0 };
  const failure = reason => ({ text: '', seller: 'Unknown seller', image: null, comments: [], reason, diagnostics });
  if (!messages.length) return failure('no_visible_story_message');
  const candidates = [];
  let ambiguous = false, conflicting = false;
  for (const message of messages) {
    const postBoundary = boundary(message);
    let owner = null;
    // A shared page/dialog wrapper is not itself proof of message ownership.
    // Choose only a region with target evidence and exactly this one local message.
    for (let scope = message.parentElement; scope && scope !== root; scope = scope.parentElement) {
      if (postBoundary && !postBoundary.contains(scope)) break;
      const localLinks = links.filter(link => link.boundary === postBoundary && scope.contains(link.node));
      if (localLinks.some(link => matchesTarget(link.identity))) {
        const foreign = localLinks.some(link => !matchesTarget(link.identity));
        const localMessages = messages.filter(node => boundary(node) === postBoundary && scope.contains(node));
        if (foreign) conflicting = true;
        else if (localMessages.length === 1 && localMessages[0] === message) {
          // Do not expand a boundary-less region into a shared wrapper just to find a seller.
          // A semantic post boundary is the only permitted wider scope.
          if (!owner || scope === postBoundary) owner = scope;
        } else {
          ambiguous = true;
          diagnostics.storyMessageCount = Math.max(diagnostics.storyMessageCount, localMessages.length);
          diagnostics.distinctMessageCount = Math.max(diagnostics.distinctMessageCount,
            new Set(localMessages.map(node => String(node.innerText ?? node.textContent ?? '').trim()).filter(Boolean)).size);
        }
      }
      if (scope === postBoundary) break;
    }
    if (owner) candidates.push({ message, owner, postBoundary });
  }
  diagnostics.matchedMessageCount = candidates.length;
  if (candidates.length > 1) return failure('ambiguous_post_ownership');
  if (!candidates.length) return failure(conflicting ? 'conflicting_post_ownership' : ambiguous ? 'ambiguous_parent_messages' : 'post_ownership_not_found');
  const { message, owner, postBoundary } = candidates[0];
  // innerText includes descendant content. Do not let an embedded story/comment
  // inside the chosen message silently become part of this listing's body.
  if (message.querySelectorAll(`${messageSelector}, ${boundarySelector}, ${excludedSelector}`).length) return failure('nested_story_content');
  const text = String(message.innerText ?? message.textContent ?? '').trim();
  const expandable=[...message.querySelectorAll('button, [role="button"]')].filter(node=>visible(node)
    && /^(?:see|read) more(?:\.\.\.|\u2026)?$/i.test(String(node.innerText??node.textContent??'').trim()));
  diagnostics.expansionAttempted=false;
  if(expand && expandable.length===1 && typeof expandable[0].click==='function'){
    expandable[0].click();diagnostics.expansionAttempted=true;
  }
  const rendered=text.normalize('NFKC');
  const dom=String(message.textContent??'').normalize('NFKC');
  diagnostics.renderedDigitCount=(rendered.match(/\d/g)??[]).length;
  diagnostics.domDigitCount=(dom.match(/\d/g)??[]).length;
  diagnostics.domHasAdditionalDigits=diagnostics.domDigitCount>diagnostics.renderedDigitCount;
  diagnostics.compatibilityDigitsNormalized=text!==rendered;
  diagnostics.storyMessageCount = 1;
  diagnostics.distinctMessageCount = text ? 1 : 0;
  if (!text) return failure('empty_parent_message');
  const headerSelector = 'h2, h3, h4, h5, h6, [role="heading"], [data-ad-rendering-role="profile_name"], header';
  const headerProof = header => {
    const evidence = links.filter(link => header.contains(link.node) && link.boundary === postBoundary);
    return evidence.some(link => link.identity.kind === 'permalink' && matchesTarget(link.identity))
      && !evidence.some(link => !matchesTarget(link.identity));
  };
  const headers = new Set();
  const addHeaders = (scope, requirePermalink) => {
    const nodes = [...scope.querySelectorAll(headerSelector)];
    if (scope.matches(headerSelector)) nodes.push(scope);
    for (const header of nodes) {
      if (!visible(header) || excluded(header) || header.closest(messageSelector) || boundary(header) !== postBoundary
        || header.contains(message) || !(header.compareDocumentPosition(message) & 4)) continue;
      if ((requirePermalink || header.tagName.toLowerCase() === 'header') && !headerProof(header)) continue;
      headers.add(header);
    }
  };
  addHeaders(owner, false);
  // A header outside the narrow text owner is usable only if its own permalink
  // proves the target post and its containing region still has one local message.
  for (let scope = owner.parentElement; scope && scope !== root; scope = scope.parentElement) {
    if (postBoundary && !postBoundary.contains(scope)) break;
    const localMessages = messages.filter(node => boundary(node) === postBoundary && scope.contains(node));
    const localLinks = links.filter(link => link.boundary === postBoundary && scope.contains(link.node));
    if (localMessages.length !== 1 || localMessages[0] !== message || localLinks.some(link => !matchesTarget(link.identity))) break;
    addHeaders(scope, true);
    if (scope === postBoundary) break;
  }
  const authors = new Map();
  const anchors = new Set();
  for (const header of headers) {
    if (header.matches('a[href]')) anchors.add(header);
    for (const anchor of header.querySelectorAll('a[href]')) anchors.add(anchor);
  }
  const reserved = new Set(['groups', 'posts', 'permalink', 'photo', 'photos', 'watch', 'marketplace', 'reel', 'reels',
    'share', 'login', 'logout', 'help', 'notifications', 'settings', 'people', 'home', 'friends', 'events', 'messages', 'search']);
  let profileCandidateCount = 0;
  for (const anchor of anchors) {
    if (!visible(anchor) || excluded(anchor) || boundary(anchor) !== postBoundary || anchor.closest(messageSelector)
      || !(anchor.compareDocumentPosition(message) & 4)) continue;
    try {
      const url = new URL(anchor.getAttribute('href'), 'https://www.facebook.com');
      if (!['https:', 'http:'].includes(url.protocol) || !/^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname)) continue;
      const grouped = url.pathname.match(/^\/groups\/([^/]+)\/user\/(\d+)\/?$/i);
      const direct = url.pathname.match(/^\/user\/(\d+)\/?$/i);
      const people = url.pathname.match(/^\/people\/[^/]+\/(\d+)\/?$/i);
      let identity = null;
      if (grouped && grouped[1].toLowerCase() === groupId.toLowerCase()) identity = 'id:' + grouped[2];
      else if (direct || people) identity = 'id:' + (direct?.[1] || people[1]);
      else if (url.pathname === '/profile.php' && url.searchParams.getAll('id').length === 1 && /^\d+$/.test(url.searchParams.get('id'))) identity = 'id:' + url.searchParams.get('id');
      else {
        const vanity = url.pathname.match(/^\/([A-Za-z0-9.]+)\/?$/)?.[1];
        if (vanity && !vanity.toLowerCase().endsWith('.php') && !reserved.has(vanity.toLowerCase())) identity = 'username:' + vanity.toLowerCase();
      }
      if (!identity) continue;
      profileCandidateCount++;
      const name = String(anchor.innerText ?? anchor.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const names = authors.get(identity) || new Set();
      names.add(name);
      authors.set(identity, names);
    } catch { /* Unsupported author evidence stays unknown. */ }
  }
  const names = authors.size === 1 ? [...authors.values()][0] : new Set();
  const seller = names.size === 1 ? [...names][0] : 'Unknown seller';
  const sellerExtraction = { status: seller !== 'Unknown seller' ? 'recognized' : authors.size ? 'ambiguous' : 'missing',
    reason: seller !== 'Unknown seller' ? 'post_author_identified' : authors.size ? 'conflicting_author_evidence'
      : headers.size ? 'no_supported_author_in_verified_header' : 'verified_author_header_not_found',
    headerCount: headers.size, profileCandidateCount };
  diagnostics.textStatus = [...message.querySelectorAll('button, [role="button"]')].some(node => visible(node)
    && /^(?:see|read) more(?:\.\.\.|\u2026)?$/i.test(String(node.innerText ?? node.textContent ?? '').trim())) ? 'truncated' : 'complete';
  let image = null;
  const photos=[];
  const warnings = [];
  try {
    for (const link of links) {
      if (link.boundary !== postBoundary || !owner.contains(link.node) || link.identity.kind !== 'photo' || !matchesTarget(link.identity)) continue;
      const photo = link.node.querySelector('img');
      if (photo && visible(photo)) {
        const src=photo.getAttribute('src');
        if(src){photos.push({src,alt:photo.getAttribute('alt')??'',postId});if(!image)image=src;}
      }
    }
  } catch { warnings.push('optional_image_unavailable'); }
  let comments = [];
  try {
    comments = [...owner.querySelectorAll('[role="article"][aria-label^="Comment by"], [role="article"][aria-label^="Reply by"]')]
      .filter(node => visible(node) && boundary(node) === postBoundary)
      .map(node => String(node.innerText ?? node.textContent ?? '').trim()).filter(Boolean);
  } catch { warnings.push('optional_comments_unavailable'); }
  return { text, seller, sellerExtraction, image, photos, comments, reason: null, warnings, diagnostics,
    ...(inspectText?{diagnosticText:{domText:dom,renderedText:rendered}}:{}) };
}
