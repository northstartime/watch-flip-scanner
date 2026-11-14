import { chromium } from 'playwright';
import { matchesFacebookGroup } from './listingIntegrity.js';
import { withTimeout } from './runtimeUtils.js';

export async function openFacebookSession({ connect = (...args) => chromium.connectOverCDP(...args), timeoutMs = 10000 } = {}) {
  const browser = await connect('http://127.0.0.1:9222', { timeout: timeoutMs });
  let disposed = false;
  return {
    async getPage(group) {
      if (disposed) throw new Error('Facebook browser session is already released.');
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          if (!page.isClosed() && matchesFacebookGroup(page.url(), group)) return page;
        }
      }
      throw new Error('No matching Facebook group tab is open. Verify configured group identities before scanning.');
    },
    async close() {
      if (disposed) return;
      disposed = true;
      // Installed Playwright's CDP browserProcess.close closes only its transport.
      // Never call close() on the user's existing contexts or pages.
      await withTimeout(() => browser.close(), timeoutMs, { label: 'Browser disconnect' });
    },
  };
}

export async function withFacebookSession(operation, options) {
  const session = await openFacebookSession(options);
  try { return await operation(session); }
  finally { await session.close(); }
}

export async function withScratchPage(context, operation, { timeoutMs = 90000, cleanupMs = 5000 } = {}) {
  let creationExpired = false;
  const creation = context.newPage();
  creation.then(page => {
    if (creationExpired) page.close({ runBeforeUnload: false }).catch(() => {});
  }, () => {});
  let page;
  try { page = await withTimeout(() => creation, cleanupMs, { label: 'Scratch page creation', onTimeout: () => { creationExpired = true; } }); }
  catch (error) { creationExpired = true; throw error; }
  const controller = new AbortController();
  const owned = new Set();
  const popupTasks = new Set();
  const own = current => {
    if (owned.has(current)) return;
    owned.add(current);
    current.on('popup', closePopup);
  };
  const closePopup = popup => {
    own(popup);
    const task = withTimeout(() => popup.close({ runBeforeUnload: false }), cleanupMs, { label: 'Popup cleanup' });
    popupTasks.add(task);
    task.catch(() => {}).finally(() => popupTasks.delete(task));
  };
  own(page);
  page.setDefaultTimeout?.(10000);
  page.setDefaultNavigationTimeout?.(15000);
  try {
    return await withTimeout(() => operation(page, controller.signal), timeoutMs, {
      onTimeout: () => controller.abort(), label: 'Facebook detail collection',
    });
  } finally {
    controller.abort();
    try {
      const cleanup = async () => {
        const errors = [];
        // Closing the scratch page first stops further navigation/popups.
        for (const current of owned) {
          if (!current.isClosed()) {
            try { await withTimeout(() => current.close({ runBeforeUnload: false }), cleanupMs, { label: 'Owned page cleanup' }); }
            catch (error) { errors.push(error); }
          }
        }
        await Promise.allSettled([...popupTasks]);
        if (errors.length) throw new Error('One or more scanner-owned pages could not be closed.');
      };
      await withTimeout(cleanup, cleanupMs, { label: 'Scratch cleanup' });
    } finally {
      for (const current of owned) current.off('popup', closePopup);
    }
  }
}
