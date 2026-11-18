/*
 * STILL. — browsing session manager (service worker).
 *
 * One session per configured site (e.g. every reddit.com tab shares one session).
 * Sessions live in chrome.storage.session: they survive service-worker restarts
 * and page reloads, and reset naturally on browser restart.
 *
 * Time is counted as *active* time from heartbeats sent by visible tabs. Each
 * heartbeat adds the wall-clock gap since the previous heartbeat from ANY tab of
 * that site, capped, so several open tabs never double count and long absences
 * never count at all.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  const KEY = 'still.sessions';
  const MAX_DELTA_MS = 25 * 1000; // a heartbeat is sent every ~15s by visible tabs
  let cache = null;
  let writeChain = Promise.resolve();

  async function loadAll() {
    if (cache) return cache;
    const data = await chrome.storage.session.get(KEY);
    cache = data[KEY] && typeof data[KEY] === 'object' ? data[KEY] : {};
    return cache;
  }

  function persist() {
    const snapshot = JSON.parse(JSON.stringify(cache || {}));
    writeChain = writeChain.then(() => chrome.storage.session.set({ [KEY]: snapshot })).catch(() => {});
    return writeChain;
  }

  function fresh(now) {
    return {
      startedAt: now,
      lastBeat: now,
      activeMs: 0,
      waves: 0,
      lastWaveActiveMs: null,
      lastReminderActiveMs: null,
      rotation: null
    };
  }

  const sessions = {
    /** Record a heartbeat and return the (mutable) session object. */
    async beat(domain, settings) {
      const all = await loadAll();
      const now = Date.now();
      const resetMs = settings.timing.sessionResetMin * 60 * 1000;
      let s = all[domain];
      if (!s || now - s.lastBeat > resetMs) {
        s = fresh(now);
        s.lastAdded = 0;
      } else {
        const delta = now - s.lastBeat;
        s.lastAdded = delta > 0 ? Math.min(delta, MAX_DELTA_MS) : 0;
        s.activeMs += s.lastAdded;
        s.lastBeat = now;
      }
      all[domain] = s;
      return s;
    },

    /** Read-only snapshot (popup). Expired sessions are reported as empty. */
    async get(domain, settings) {
      const all = await loadAll();
      const s = all[domain];
      if (!s) return null;
      const resetMs = settings.timing.sessionResetMin * 60 * 1000;
      if (Date.now() - s.lastBeat > resetMs) return null;
      return JSON.parse(JSON.stringify(s));
    },

    save: persist,

    async resetAll() {
      cache = {};
      await chrome.storage.session.remove(KEY);
    },

    /** Drop sessions for sites that no longer exist. */
    async prune(validDomains) {
      const all = await loadAll();
      let changed = false;
      Object.keys(all).forEach((d) => {
        if (!validDomains.includes(d)) {
          delete all[d];
          changed = true;
        }
      });
      if (changed) await persist();
    }
  };

  STILL.sessions = sessions;
})(typeof globalThis !== 'undefined' ? globalThis : self);
