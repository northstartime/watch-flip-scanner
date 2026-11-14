// Small synthetic element tree implementing only the DOM APIs used by the resolver.
// This is not a browser and never performs layout, network requests, or script execution.
export function element(tag, attrs = {}, ...children) {
  const node = {
    tagName: tag.toUpperCase(), attrs, children: [], parentElement: null,
    getAttribute(name) { return Object.hasOwn(this.attrs, name) ? String(this.attrs[name]) : null; },
    get innerText() { return [this.ownText, ...this.children.map(child => child.innerText)].filter(Boolean).join('\n'); },
    get textContent() { return this.innerText; },
    ownText: '',
    matches(selector) {
      const compound = (current, part) => {
        const tag = part.match(/^[A-Za-z][\w-]*/)?.[0];
        if (tag && current.tagName !== tag.toUpperCase()) return false;
        for (const match of part.matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)) {
          const actual = current.getAttribute(match[1]);
          if (actual == null || (match[2] === '=' && actual !== match[3]) || (match[2] === '^=' && !actual.startsWith(match[3]))) return false;
        }
        return true;
      };
      return selector.split(',').some(alternative => {
        const parts = alternative.trim().match(/(?:\[[^\]]*\]|[^\s\[]+)+/g) || [];
        if (!parts.length || !compound(this, parts.at(-1))) return false;
        let ancestor = this.parentElement;
        for (let i = parts.length - 2; i >= 0; i--) {
          while (ancestor && !compound(ancestor, parts[i])) ancestor = ancestor.parentElement;
          if (!ancestor) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    },
    closest(selector) { for (let current = this; current; current = current.parentElement) if (current.matches(selector)) return current; return null; },
    contains(other) { for (let current = other; current; current = current.parentElement) if (current === this) return true; return false; },
    querySelectorAll(selector) {
      const result = [];
      const walk = current => { for (const child of current.children) { if (child.matches(selector)) result.push(child); walk(child); } };
      walk(this);
      return result;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    getClientRects() {
      for (let current = this; current; current = current.parentElement) {
        if (current.getAttribute('hidden') != null || current.getAttribute('aria-hidden') === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/.test(current.getAttribute('style') || '')) return [];
      }
      return [{}];
    },
    compareDocumentPosition(other) {
      let root = this;
      while (root.parentElement) root = root.parentElement;
      const all = [root];
      const walk = current => { for (const child of current.children) { all.push(child); walk(child); } };
      walk(root);
      return !all.includes(other) ? 1 : all.indexOf(this) < all.indexOf(other) ? 4 : 2;
    },
  };
  for (const child of children.flat()) {
    if (typeof child === 'string') node.ownText += child;
    else if (child) { child.parentElement = node; node.children.push(child); }
  }
  return node;
}

export function message(text, attrs = {}) {
  return element('div', { 'data-ad-rendering-role': 'story_message', ...attrs }, text);
}
export function permalink(id, group = 'synthetic', suffix = '/') {
  return element('a', { href: `https://www.facebook.com/groups/${group}/posts/${id}${suffix}` }, 'Timestamp');
}
export function author(name, id = '10') {
  return element('h3', {}, element('a', { href: `/profile.php?id=${id}` }, name));
}
export function post(id, text, { seller = 'Synthetic Seller', sellerId = '10', group = 'synthetic', suffix = '/', attrs = { role: 'article' } } = {}) {
  return element('div', attrs, seller ? author(seller, sellerId) : null, permalink(id, group, suffix), message(text));
}
