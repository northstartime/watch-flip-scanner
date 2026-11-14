// Pure helpers: no browser, environment, filesystem or network side effects.
export function parseAskingPrice(text) {
  const original = String(text ?? "");
  // Normalize only explicit typographic spacing, never concatenate arbitrary digits.
  const input = original.replace(/(\d)[\u00a0\u202f\u2009](?=\d{3}(?:\D|$))/g, '$1')
    .replace(/[\u00a0\u202f\u2009]/g, ' ');
  const evidence = [], rejected = new Set();
  const result = (amount, status, reason) => ({ amount, currency: amount == null ? null : 'USD', status, reason, evidence, rejectedReasons: [...rejected] });
  if ((input.match(/^\s*\d+[.):]\s+/gm) || []).length >= 2) return result(null, 'ambiguous', 'multi_watch_post');
  const refs = [...input.matchAll(/\b(?:ref(?:erence)?\.?)[ \t]*[:#-]?[ \t]*([A-Z0-9.-]+)/gi)].map(m => m[1].toLowerCase());
  const candidates = [];
  // A sentence-final period/comma is allowed; numeric suffixes cannot be truncated.
  const pattern = /(?<![\w.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?[ \t]*k?(?!\w|,\d|\.\d)/gi;
  for (const line of input.split(/\r?\n/)) {
    for (const match of line.matchAll(pattern)) {
      const before = line.slice(0, match.index), after = line.slice(match.index + match[0].length);
      const raw = match[0].replace(/[, \t]/g, '');
      const amount = Number.parseFloat(raw) * (/k$/i.test(raw) ? 1000 : 1);
      const currency = /(?:\$|\bUSD)[ \t]*$/i.test(before) || /^[ \t]*USD\b/i.test(after);
      const label = /\b(?:asking(?:[ \t]+price)?|ask|price(?:[ \t]+drop)?|sale[ \t]+price|cash[ \t]+price|take it(?: home)?(?: for)?)[ \t]*[:=-]?[ \t]*(?:\$|USD)?[ \t]*$/i.test(before);
      const suffix = /^[ \t]*(?:[\u2014\u2013-][ \t]*)?(?:\+[ \t]*(?:label|lab|ship|shipping)\b|obo\b|firm\b|shipped\b|net\b|lab\b)/i.test(after) && /^[ \t]*\$?[ \t]*$/.test(before);
      if (!currency && !label && !suffix) continue;
      const deny = reason => { rejected.add(reason); return true; };
      if (/\b(?:deposit|down payment|shipping|shipping cost|shipping fee|discount|saving|msrp|retail|current bid|high bid|highest bid|opening bid|minimum bid|minimum increment|trade value|purchase price|paid)[ \t]*[:=-]?[ \t]*(?:\$|USD)?[ \t]*$/i.test(before)) { deny('non_asking_amount'); continue; }
      if (!label && /^[ \t]*(?:deposit|shipping|shipping fee|shipping cost|minimum increment)\b/i.test(after)) { deny('non_asking_amount'); continue; }
      if (/\b(?:ref(?:erence)?\.?|year|dated)[ \t]*[:#-]?[ \t]*\$?[ \t]*$/i.test(before) || /^[ \t]*\//.test(after) || /\/$/.test(before)) { deny('reference_or_date'); continue; }
      if (!currency && amount >= 1900 && amount <= 2099 && !/k$/i.test(raw)) { deny('reference_or_date'); continue; }
      if (!currency && (refs.includes(raw.toLowerCase()) || (!/k$|,|\./i.test(raw) && amount >= 100000))) { deny('reference_or_date'); continue; }
      if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) { deny('unsupported_amount'); continue; }
      candidates.push(amount);
      evidence.push(line.trim());
    }
  }
  const amounts = [...new Set(candidates)];
  if (/\b(?:CAD|AUD|HKD|SGD|EUR|GBP|CHF)\b|[\u20ac\u00a3]|(?:C|A|HK|SG)\$/i.test(input)) return result(null, 'ambiguous', 'unsupported_currency');
  if (amounts.length > 1) return result(null, 'ambiguous', 'multiple_asking_prices');
  if (amounts.length === 1) return result(amounts[0], 'recognized', 'explicit_asking_price');
  return result(null, 'missing', rejected.size ? 'price_candidates_rejected' : 'price_not_found');
}

export function facebookPostIdentity(value) {
  try {
    const url = new URL(value);
    if (!/^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/?$/i);
    return match ? `facebook-post:${match[2]}` : null;
  } catch { return null; }
}

export function deduplicateListings(listings) {
  const seen = new Set();
  return listings.filter(item => {
    const key = facebookPostIdentity(item.url) || (item.id ? `${item.source}:${item.id}` : item.url);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchesFacebookGroup(value, requested) {
  try {
    const url = new URL(value);
    if (!/^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname)) return false;
    const group = url.pathname.match(/^\/groups\/([^/]+)(?:\/|$)/i)?.[1];
    return Boolean(group && group !== "feed" && (!requested || group.toLowerCase() === requested.toLowerCase()));
  } catch { return false; }
}

// Serializable page callback; synthetic DOM fixtures exercise this exact function.
export function readPostContent(article, includeDiagnostics = false) {
  const isComment = node => Boolean(node.closest('[data-commentid], [aria-label^="Comment by"], [aria-label^="Reply by"]'));
  const messages = [...article.querySelectorAll('[data-ad-rendering-role="story_message"]')].filter(node => !isComment(node));
  const texts = [...new Set(messages.map(node => (node.innerText || node.textContent || "").trim()).filter(Boolean))];
  const diagnostics = { storyMessageCount: messages.length, distinctMessageCount: texts.length,
    contentStatus: texts.length > 1 ? "ambiguous" : texts.length === 0 ? "empty" : "ok" };
  const finish = result => includeDiagnostics ? { ...result, diagnostics } : result;
  if (texts.length !== 1) return finish({ text: "", seller: "Unknown seller" });
  const authors = [...article.querySelectorAll('h2 a, h3 a, [role="heading"] a')]
    .filter(node => !isComment(node))
    .filter(node => node.compareDocumentPosition(messages[0]) & 4)
    .map(node => ({ name: (node.innerText || node.textContent || "").trim(), href: node.getAttribute("href") || "" }))
    .filter(({ name, href }) => name && /(?:\/user\/|\/profile\.php\?)/i.test(href));
  const identities = new Map();
  for (const author of authors) {
    try {
      const url = new URL(author.href, "https://www.facebook.com");
      if (!/^(?:www\.|m\.)?facebook\.com$/i.test(url.hostname)) continue;
      const id = url.pathname.match(/\/user\/([^/]+)/)?.[1] || url.searchParams.get("id");
      if (id) {
        const names = identities.get(id) || new Set();
        names.add(author.name);
        identities.set(id, names);
      }
    } catch { /* Leave ambiguous authors unknown. */ }
  }
  const names = identities.size === 1 ? [...identities.values()][0] : new Set();
  return finish({ text: texts[0], seller: names.size === 1 ? [...names][0] : "Unknown seller" });
}

export function financialReviewReasons(watch) {
  const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const issues = [];
  if (!positive(watch.buyPrice)) issues.push("Missing reliable acquisition price");
  if (!positive(watch.marketValue)) issues.push("Missing reliable resale value");
  if (watch.acquisitionVerified !== true) issues.push("Acquisition price and total costs are unverified");
  if (watch.exitVerified !== true || !watch.exitEvidence?.source || !watch.exitEvidence?.verifiedAt) issues.push("Resale exit is unverified");
  if (![watch.fees, watch.shipping].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) issues.push("Acquisition or selling costs are incomplete");
  if (watch.requiresManualReview || String(watch.buyingOption).toUpperCase().includes("AUCTION")) issues.push("Listing requires manual review");
  return issues;
}

export function toMobileOpportunity({ watch, profit, roi, score, decision, reasons = [] }) {
  const verified = financialReviewReasons(watch).length === 0;
  return { id: watch.id, brand: watch.brand, title: watch.title, reference: watch.reference ?? null,
    originalListing: watch.originalListing ?? null, seller: watch.seller ?? "Unknown seller", capturedAt: watch.capturedAt ?? null,
    price: watch.buyPrice ?? watch.price ?? null, marketValue: verified ? watch.marketValue : null,
    estimatedMarketValue: watch.estimatedMarketValue ?? watch.marketValue ?? null,
    projectedProfit: verified && Number.isFinite(profit) ? Math.round(profit) : null,
    roi: verified && Number.isFinite(roi) ? Math.round(roi) : null,
    score: verified ? score : 0, decision: verified ? decision : "REVIEW", reasons,
    source: watch.source, url: watch.url, image: watch.image ?? null, buyingOption: watch.buyingOption,
    requiresManualReview: !verified, currentBid: watch.currentBid ?? null };
}
