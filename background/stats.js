/*
 * STILL. — local insights (service worker).
 * Daily totals per configured site, mindful moments and focus sessions, kept for
 * 60 days in chrome.storage.local. Only domains the user configured are ever
 * recorded — never URLs, titles or anything about the page.
 *
 * Shape: { days: { 'YYYY-MM-DD': { sites: { domain: ms }, moments: n, focus: n, focusMin: n, waves: n, flags: {} } } }
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const KEY = STILL.STATS_KEY;
  const KEEP_DAYS = 60;
  let cache = null;
  let chain = Promise.resolve();

  async function load() {
    if (cache) return cache;
    const d = await chrome.storage.local.get(KEY);
    cache = d[KEY] && typeof d[KEY] === 'object' && d[KEY].days ? d[KEY] : { days: {} };
    return cache;
  }

  function day(all, key) {
    key = key || STILL.todayKey();
    if (!all.days[key]) all.days[key] = { sites: {}, moments: 0, focus: 0, focusMin: 0, waves: 0, flags: {} };
    const d = all.days[key];
    d.flags = d.flags || {};
    return d;
  }

  function prune(all) {
    const keys = Object.keys(all.days).sort();
    while (keys.length > KEEP_DAYS) delete all.days[keys.shift()];
  }

  function persist() {
    const snap = JSON.parse(JSON.stringify(cache));
    chain = chain.then(() => chrome.storage.local.set({ [KEY]: snap })).catch(() => {});
    return chain;
  }

  STILL.stats = {
    async addTime(domain, ms) {
      if (!(ms > 0)) return;
      const all = await load();
      const d = day(all);
      d.sites[domain] = (d.sites[domain] || 0) + ms;
      prune(all);
      return persist();
    },
    async todayMs(domain) {
      const all = await load();
      const d = all.days[STILL.todayKey()];
      return d && d.sites[domain] ? d.sites[domain] : 0;
    },
    async count(field, n) {
      const all = await load();
      const d = day(all);
      d[field] = (d[field] || 0) + (n || 1);
      return persist();
    },
    /** One-shot daily flags, e.g. "budget notice already shown for reddit.com". */
    async flag(name) {
      const all = await load();
      const d = day(all);
      if (d.flags[name]) return false;
      d.flags[name] = true;
      await persist();
      return true;
    },
    async hasFlag(name) {
      const all = await load();
      const d = all.days[STILL.todayKey()];
      return !!(d && d.flags && d.flags[name]);
    },
    async reset() {
      cache = { days: {} };
      await chrome.storage.local.remove(KEY);
    },
    /** Other contexts may reset the stats; drop our cache when that happens. */
    invalidate() {
      cache = null;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
