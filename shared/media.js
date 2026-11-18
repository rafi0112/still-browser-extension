/*
 * STILL. — media layer for reactions, bubble icons and logos.
 *
 * A reaction "token" is either
 *   - a Unicode emoji ("🌱")  → drawn with the bundled 3D artwork when realistic
 *                                 mode is on, otherwise as system emoji text
 *   - "img:<id>"              → an image the user added in the Studio
 *
 * On websites we never insert <img src> (a page's Content-Security-Policy could
 * block it and it would expose a fingerprintable URL). Instead the bytes are
 * fetched through the service worker / extension storage, decoded with
 * createImageBitmap and painted onto a <canvas> inside our closed shadow root.
 * Extension pages simply use <img>.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  const isExtPage = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
  const bitmaps = new Map(); // key -> ImageBitmap
  const pending = new Map(); // key -> Promise
  let assets = {}; // id -> { id, name, data, createdAt }
  let assetsReady = null;
  const listeners = new Set();

  function alive() {
    try {
      return !!(root.chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function indexAssets(raw) {
    const out = {};
    const items = raw && Array.isArray(raw.items) ? raw.items : [];
    items.forEach((a) => {
      if (a && typeof a.id === 'string' && typeof a.data === 'string' && /^data:image\/(png|webp|jpeg);base64,/.test(a.data)) out[a.id] = a;
    });
    return out;
  }

  function loadAssets() {
    if (assetsReady) return assetsReady;
    if (!alive()) return (assetsReady = Promise.resolve());
    assetsReady = chrome.storage.local.get(STILL.ASSETS_KEY).then((d) => {
      assets = indexAssets(d[STILL.ASSETS_KEY]);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STILL.ASSETS_KEY]) return;
      assets = indexAssets(changes[STILL.ASSETS_KEY].newValue);
      [...bitmaps.keys()].forEach((k) => {
        if (k.startsWith('img:') && !assets[k.slice(4)]) bitmaps.delete(k);
      });
      listeners.forEach((fn) => fn());
    });
    return assetsReady;
  }

  function dataUrlToBlob(url) {
    const comma = url.indexOf(',');
    const mime = url.slice(5, url.indexOf(';'));
    const bin = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /** Describe how a token should be drawn. Returns null for a missing image. */
  function resolve(token, settings) {
    if (!token) return null;
    if (STILL.IMG_TOKEN.test(token)) {
      const a = assets[token.slice(4)];
      return a ? { kind: 'img', key: token, data: a.data, name: a.name } : null;
    }
    const realistic = !settings || settings.emoji.realistic;
    if (realistic && STILL.EMOJI_FILES[token]) return { kind: 'img', key: token, path: STILL.EMOJI_FILES[token], name: STILL.EMOJI_NAMES[token] };
    return { kind: 'text', text: token };
  }

  async function decode(r) {
    if (bitmaps.has(r.key)) return;
    if (pending.has(r.key)) return pending.get(r.key);
    const job = (async () => {
      let url = r.data;
      if (!url && r.path) {
        const res = await new Promise((resolveP) => {
          try {
            chrome.runtime.sendMessage({ type: 'still:asset', path: r.path }, (x) => {
              void chrome.runtime.lastError;
              resolveP(x);
            });
          } catch (e) {
            resolveP(null);
          }
        });
        url = res && res.data;
      }
      if (!url) return;
      const bm = await createImageBitmap(dataUrlToBlob(url));
      bitmaps.set(r.key, bm);
    })()
      .catch(() => {})
      .finally(() => pending.delete(r.key));
    pending.set(r.key, job);
    return job;
  }

  const media = {
    resolve,

    /** Load everything a wave needs before it starts (no-op on extension pages). */
    async prepare(tokens, settings) {
      await loadAssets();
      if (isExtPage) return;
      const uniq = Array.from(new Set(tokens.filter(Boolean)));
      await Promise.all(
        uniq.map((t) => {
          const r = resolve(t, settings);
          return r && r.kind === 'img' ? decode(r) : null;
        })
      );
    },

    /**
     * Build a DOM node for a token at `px` CSS pixels, or null if it can't be drawn.
     * cls: optional class name for the node.
     */
    node(token, px, settings, cls) {
      const r = resolve(token, settings);
      if (!r) return null;
      if (r.kind === 'text') {
        const s = document.createElement('span');
        s.className = (cls || '') + ' emoji-txt';
        s.textContent = r.text;
        return s;
      }
      if (isExtPage) {
        const img = document.createElement('img');
        img.className = (cls || '') + ' emoji-img';
        img.alt = r.name || '';
        img.draggable = false;
        img.decoding = 'async';
        img.src = r.data || chrome.runtime.getURL(r.path);
        img.style.width = img.style.height = px + 'px';
        return img;
      }
      const bm = bitmaps.get(r.key);
      if (!bm) {
        // Fallback to system emoji for Unicode tokens; skip missing user images.
        if (STILL.IMG_TOKEN.test(token)) return null;
        const s = document.createElement('span');
        s.className = (cls || '') + ' emoji-txt';
        s.textContent = token;
        return s;
      }
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const c = document.createElement('canvas');
      c.className = (cls || '') + ' emoji-img';
      c.width = c.height = Math.max(8, Math.round(px * dpr));
      c.style.width = c.style.height = px + 'px';
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bm, 0, 0, c.width, c.height);
      }
      return c;
    },

    /* ---------------- asset library (extension pages) ---------------- */
    async list() {
      await loadAssets();
      return Object.values(assets).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    get(id) {
      return assets[id] || null;
    },
    async save(asset) {
      const d = await chrome.storage.local.get(STILL.ASSETS_KEY);
      const cur = d[STILL.ASSETS_KEY] && Array.isArray(d[STILL.ASSETS_KEY].items) ? d[STILL.ASSETS_KEY].items : [];
      const idx = cur.findIndex((a) => a.id === asset.id);
      if (idx >= 0) cur[idx] = asset;
      else {
        if (cur.length >= STILL.LIMITS.maxImages) throw new Error('limit');
        cur.unshift(asset);
      }
      await chrome.storage.local.set({ [STILL.ASSETS_KEY]: { items: cur } });
      assets = indexAssets({ items: cur });
      return asset;
    },
    async remove(id) {
      const d = await chrome.storage.local.get(STILL.ASSETS_KEY);
      const cur = d[STILL.ASSETS_KEY] && Array.isArray(d[STILL.ASSETS_KEY].items) ? d[STILL.ASSETS_KEY].items : [];
      const next = cur.filter((a) => a.id !== id);
      await chrome.storage.local.set({ [STILL.ASSETS_KEY]: { items: next } });
      assets = indexAssets({ items: next });
    },
    onChange(fn) {
      loadAssets();
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ready: loadAssets
  };

  STILL.media = media;
})(typeof globalThis !== 'undefined' ? globalThis : self);
