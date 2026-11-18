/*
 * STILL. — centralised settings manager over chrome.storage.local.
 * Every read and write passes through utils.normalizeSettings so no context
 * can ever observe or persist an invalid configuration.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;
  const KEY = STILL.STORAGE_KEY;

  let queue = Promise.resolve();

  function hasStorage() {
    try {
      return !!(root.chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false; // extension context invalidated (e.g. extension reloaded)
    }
  }

  const store = {
    available: hasStorage,

    async load() {
      if (!hasStorage()) return U.normalizeSettings({});
      const data = await chrome.storage.local.get(KEY);
      return U.normalizeSettings(data[KEY]);
    },

    async save(settings) {
      const clean = U.normalizeSettings(settings);
      if (hasStorage()) await chrome.storage.local.set({ [KEY]: clean });
      return clean;
    },

    /**
     * Read-modify-write, serialised within this context.
     * mutator(draft) may mutate the draft in place or return a new object.
     */
    update(mutator) {
      const run = async () => {
        const current = await store.load();
        const draft = STILL.clone(current);
        const result = mutator(draft);
        return store.save(result && typeof result === 'object' ? result : draft);
      };
      queue = queue.then(run, run);
      return queue;
    },

    /** Set a single dotted path, e.g. patch('timing.intervalMin', 4). */
    patch(path, value) {
      return store.update((d) => U.setPath(d, path, value));
    },

    async reset(keepOnboarded) {
      const fresh = STILL.clone(STILL.DEFAULT_SETTINGS);
      if (keepOnboarded) {
        const cur = await store.load();
        fresh.onboarded = cur.onboarded;
        fresh.sites = cur.sites;
      }
      return store.save(fresh);
    },

    /** Subscribe to settings changes from any context. Returns an unsubscribe fn. */
    onChange(cb) {
      if (!hasStorage()) return () => {};
      const listener = (changes, area) => {
        if (area !== 'local' || !changes[KEY]) return;
        cb(U.normalizeSettings(changes[KEY].newValue), U.normalizeSettings(changes[KEY].oldValue));
      };
      chrome.storage.onChanged.addListener(listener);
      return () => {
        try {
          chrome.storage.onChanged.removeListener(listener);
        } catch (e) {
          /* context gone */
        }
      };
    }
  };

  STILL.store = store;
})(typeof globalThis !== 'undefined' ? globalThis : self);
