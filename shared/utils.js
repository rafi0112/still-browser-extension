/*
 * STILL. — shared utilities (no DOM assumptions; safe in the service worker).
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  const U = {};

  U.uid = function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '-' + Date.now().toString(36) + rnd;
  };

  U.clamp = function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  U.rand = function rand(min, max) {
    return min + Math.random() * (max - min);
  };

  U.randInt = function randInt(min, max) {
    return Math.floor(U.rand(min, max + 1));
  };

  U.pick = function pick(arr) {
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
  };

  U.shuffle = function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  U.debounce = function debounce(fn, ms) {
    let t = null;
    const d = function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
    d.cancel = () => clearTimeout(t);
    return d;
  };

  U.isPlainObject = function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  };

  /* --------------------------------------------------------------- Text */

  /** Plain, single-line, length-capped text. Never interpreted as HTML anywhere. */
  U.cleanText = function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    // strip control chars, collapse whitespace
    const s = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.slice(0, max || STILL.LIMITS.messageMaxLength);
  };

  /** Accept only short strings that contain at least one emoji-like (pictographic) char. */
  U.cleanEmoji = function cleanEmoji(value) {
    if (typeof value !== 'string') return '';
    const s = value.trim();
    if (!s || s.length > 16) return '';
    if (/[<>&"'`]/.test(s)) return '';
    if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s)) return '';
    // keep only the first grapheme cluster when possible
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const first = seg.segment(s)[Symbol.iterator]().next();
      return first.done ? '' : first.value.segment;
    }
    return s;
  };

  /* ------------------------------------------------------------ Domains */

  /**
   * Normalise user input into a bare registrable host such as "reddit.com".
   * Returns { ok, domain, error }.
   */
  U.normalizeDomain = function normalizeDomain(input) {
    if (typeof input !== 'string') return { ok: false, error: 'Enter a website address.' };
    let s = input.trim().toLowerCase();
    if (!s) return { ok: false, error: 'Enter a website address.' };
    if (/\s/.test(s)) return { ok: false, error: 'Website addresses cannot contain spaces.' };
    if (/^(chrome|edge|about|file|chrome-extension|extension|data|javascript|view-source):/.test(s)) {
      return { ok: false, error: 'Browser pages cannot be used.' };
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
    let host;
    try {
      host = new URL(s).hostname;
    } catch (e) {
      return { ok: false, error: "That doesn't look like a website address." };
    }
    host = host.replace(/^\*\./, '').replace(/^www\./, '').replace(/\.$/, '');
    if (host === 'localhost') return { ok: true, domain: host };
    if (host.length > 253) return { ok: false, error: 'That address is too long.' };
    const labels = host.split('.');
    if (labels.length < 2) return { ok: false, error: 'Include the ending, e.g. "example.com".' };
    const labelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
    if (!labels.every((l) => labelRe.test(l))) return { ok: false, error: "That doesn't look like a valid domain." };
    if (/^[0-9]+$/.test(labels[labels.length - 1]) && labels.length !== 4) {
      return { ok: false, error: "That doesn't look like a valid domain." };
    }
    return { ok: true, domain: host };
  };

  U.hostMatches = function hostMatches(hostname, domain) {
    if (!hostname || !domain) return false;
    hostname = String(hostname).toLowerCase().replace(/\.$/, '');
    return hostname === domain || hostname.endsWith('.' + domain);
  };

  /** Return the enabled site entry that matches a hostname, or null. */
  U.findSite = function findSite(settings, hostname, includeDisabled) {
    const sites = (settings && settings.sites) || [];
    let best = null;
    for (const s of sites) {
      if (!includeDisabled && !s.enabled) continue;
      if (U.hostMatches(hostname, s.domain) && (!best || s.domain.length > best.domain.length)) best = s;
    }
    return best;
  };

  /** Match patterns used both for permission requests and content-script registration. */
  U.originsForDomain = function originsForDomain(domain) {
    return ['*://' + domain + '/*', '*://*.' + domain + '/*'];
  };

  U.hostFromUrl = function hostFromUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.hostname.toLowerCase();
    } catch (e) {
      return null;
    }
  };

  U.displayHost = function displayHost(host) {
    return host ? host.replace(/^www\./, '') : '';
  };

  /* ------------------------------------------------------------- Time */

  U.formatDuration = function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  };

  U.formatMinutes = function formatMinutes(min) {
    if (min < 1) return Math.round(min * 60) + ' sec';
    if (min % 1) return min.toFixed(1).replace(/\.0$/, '') + ' min';
    return min + ' min';
  };

  /* ----------------------------------------------------------- Settings */

  /**
   * Merge stored settings onto defaults and coerce every field into a valid range.
   * This is the single gate all persisted data passes through (load, save, import).
   */
  U.normalizeSettings = function normalizeSettings(raw) {
    const D = STILL.clone(STILL.DEFAULT_SETTINGS);
    const r = U.isPlainObject(raw) ? raw : {};
    const L = STILL.LIMITS;
    const out = D;

    out.onboarded = r.onboarded === true;
    out.enabled = r.enabled !== false;
    out.pausedUntil = Number.isFinite(r.pausedUntil) ? r.pausedUntil : 0;

    // general
    const g = U.isPlainObject(r.general) ? r.general : {};
    out.general.showDock = g.showDock !== false;
    out.general.reduceMotion = ['system', 'always', 'never'].includes(g.reduceMotion) ? g.reduceMotion : 'system';
    out.general.escalation = g.escalation !== false;
    out.general.contextMenu = g.contextMenu !== false;

    // intention
    const it = U.isPlainObject(r.intention) ? r.intention : {};
    out.intention.text = U.cleanText(it.text || '', 120);
    out.intention.date = typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '';
    out.intention.inWaves = it.inWaves !== false;

    // focus
    const f = U.isPlainObject(r.focus) ? r.focus : {};
    out.focus.until = Number.isFinite(f.until) ? f.until : 0;
    out.focus.startedAt = Number.isFinite(f.startedAt) ? f.startedAt : 0;
    if (f.minutes !== undefined) out.focus.minutes = Math.round(U.clamp(f.minutes, 5, 180));
    out.focus.label = U.cleanText(f.label || '', 80);

    // schedule
    const sc = U.isPlainObject(r.schedule) ? r.schedule : {};
    const hm = (v, d) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
    out.schedule.enabled = sc.enabled === true;
    if (Array.isArray(sc.days)) out.schedule.days = Array.from(new Set(sc.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))).sort();
    out.schedule.start = hm(sc.start, out.schedule.start);
    out.schedule.end = hm(sc.end, out.schedule.end);

    // brand
    const br = U.isPlainObject(r.brand) ? r.brand : {};
    out.brand.logo = typeof br.logo === 'string' && STILL.IMG_TOKEN.test('img:' + br.logo) ? br.logo : null;

    // sites
    if (Array.isArray(r.sites)) {
      const seen = new Set();
      out.sites = [];
      for (const s of r.sites) {
        if (!U.isPlainObject(s)) continue;
        const n = U.normalizeDomain(s.domain || '');
        if (!n.ok || seen.has(n.domain)) continue;
        seen.add(n.domain);
        out.sites.push({
          id: typeof s.id === 'string' && s.id ? s.id.slice(0, 64) : U.uid('site'),
          domain: n.domain,
          label: U.cleanText(s.label || '', 40) || n.domain,
          enabled: s.enabled !== false,
          preset: typeof s.preset === 'string' ? s.preset.slice(0, 32) : null,
          budgetMin: Math.round(U.clamp(s.budgetMin || 0, 0, 600))
        });
        if (out.sites.length >= L.maxSites) break;
      }
    }

    // animation
    const a = U.isPlainObject(r.animation) ? r.animation : {};
    const validStyles = STILL.ANIMATION_STYLES.map((x) => x.id);
    if (Array.isArray(a.styles)) {
      const st = a.styles.filter((x) => validStyles.includes(x));
      out.animation.styles = st.length ? Array.from(new Set(st)) : D.animation.styles;
    }
    out.animation.rotation = a.rotation === 'sequential' ? 'sequential' : 'natural';

    // emoji
    const e = U.isPlainObject(r.emoji) ? r.emoji : {};
    if (Array.isArray(e.custom)) {
      out.emoji.custom = Array.from(new Set(e.custom.map(U.cleanEmoji).filter(Boolean))).slice(0, L.maxCustomEmojis);
    }
    if (Array.isArray(e.selected)) {
      const allowed = new Set(STILL.EMOJI_LIBRARY.concat(out.emoji.custom));
      out.emoji.selected = Array.from(new Set(e.selected.filter((x) => allowed.has(x) || (typeof x === 'string' && STILL.IMG_TOKEN.test(x))))).slice(0, 120);
    }
    out.emoji.emojiOnlyReactions = e.emojiOnlyReactions !== false;
    out.emoji.realistic = e.realistic !== false;
    if (e.emojisPerWave !== undefined) out.emoji.emojisPerWave = Math.round(U.clamp(e.emojisPerWave, 0, 12));
    if (e.speed !== undefined) out.emoji.speed = U.clamp(e.speed, 0.5, 2);

    // messages
    const m = U.isPlainObject(r.messages) ? r.messages : {};
    if (Array.isArray(m.collections)) {
      const cols = [];
      const ids = new Set();
      for (const c of m.collections) {
        if (!U.isPlainObject(c)) continue;
        const name = U.cleanText(c.name || '', L.collectionNameMax);
        const id = typeof c.id === 'string' ? c.id.slice(0, 64) : '';
        if (!name || !id || ids.has(id)) continue;
        ids.add(id);
        cols.push({ id, name });
        if (cols.length >= L.maxCollections) break;
      }
      out.messages.collections = cols.length ? cols : D.messages.collections;
    }
    const colIds = new Set(out.messages.collections.map((c) => c.id));
    const catIds = STILL.CATEGORIES.map((c) => c.id);
    if (Array.isArray(m.items)) {
      const items = [];
      const ids = new Set();
      for (const it of m.items) {
        if (!U.isPlainObject(it)) continue;
        const text = U.cleanText(it.text);
        if (!text) continue;
        let id = typeof it.id === 'string' && it.id ? it.id.slice(0, 64) : U.uid('m');
        if (ids.has(id)) id = U.uid('m');
        ids.add(id);
        items.push({
          id,
          text,
          category: catIds.includes(it.category) ? it.category : 'custom',
          enabled: it.enabled !== false,
          favorite: it.favorite === true,
          custom: it.custom === true,
          collection: colIds.has(it.collection) ? it.collection : out.messages.collections[0].id
        });
        if (items.length >= L.maxMessages) break;
      }
      out.messages.items = items; // may legitimately be empty
    }
    out.messages.activeCollection =
      m.activeCollection === 'all' || colIds.has(m.activeCollection) ? m.activeCollection || 'all' : 'all';
    out.messages.rotation = m.rotation === 'sequential' ? 'sequential' : 'random';
    out.messages.preferCustom = m.preferCustom !== false;
    if (Array.isArray(m.categories)) out.messages.categories = m.categories.filter((c) => catIds.includes(c));
    out.messages.focusNudges = m.focusNudges !== false;
    if (m.noRepeatWindow !== undefined) out.messages.noRepeatWindow = Math.round(U.clamp(m.noRepeatWindow, 0, 20));

    // timing
    const t = U.isPlainObject(r.timing) ? r.timing : {};
    const T = out.timing;
    if (t.initialDelayMin !== undefined) T.initialDelayMin = U.clamp(t.initialDelayMin, 0, 120);
    if (t.intervalMin !== undefined) T.intervalMin = U.clamp(t.intervalMin, 0.5, 120);
    if (t.messagesPerWave !== undefined) T.messagesPerWave = Math.round(U.clamp(t.messagesPerWave, 0, 5));
    if (t.maxSimultaneous !== undefined) T.maxSimultaneous = Math.round(U.clamp(t.maxSimultaneous, 1, 6));
    if (t.durationMinSec !== undefined) T.durationMinSec = U.clamp(t.durationMinSec, 3, 15);
    if (t.durationMaxSec !== undefined) T.durationMaxSec = U.clamp(t.durationMaxSec, 3, 15);
    if (T.durationMaxSec < T.durationMinSec) T.durationMaxSec = T.durationMinSec;
    T.frequency = ['calm', 'balanced', 'lively', 'custom'].includes(t.frequency) ? t.frequency : D.timing.frequency;
    T.pauseWhenInactive = t.pauseWhenInactive !== false;
    if (t.sessionResetMin !== undefined) T.sessionResetMin = U.clamp(t.sessionResetMin, 5, 720);
    if (t.reminderAfterMin !== undefined) T.reminderAfterMin = U.clamp(t.reminderAfterMin, 5, 240);
    if (t.reminderRepeatMin !== undefined) T.reminderRepeatMin = U.clamp(t.reminderRepeatMin, 5, 240);

    // appearance
    const p = U.isPlainObject(r.appearance) ? r.appearance : {};
    const A = out.appearance;
    const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
    A.preset = STILL.APPEARANCE_PRESETS[p.preset] || p.preset === 'custom' ? p.preset || A.preset : A.preset;
    A.bubbleBg = hex(p.bubbleBg, A.bubbleBg);
    A.textColor = hex(p.textColor, A.textColor);
    A.accent = hex(p.accent, A.accent);
    if (p.opacity !== undefined) A.opacity = U.clamp(p.opacity, 0.3, 1);
    if (p.radius !== undefined) A.radius = Math.round(U.clamp(p.radius, 0, 28));
    if (p.fontSize !== undefined) A.fontSize = Math.round(U.clamp(p.fontSize, 11, 22));
    if (p.maxWidth !== undefined) A.maxWidth = Math.round(U.clamp(p.maxWidth, 160, 420));
    A.position = ['right', 'left', 'center', 'spread'].includes(p.position) ? p.position : A.position;
    A.direction = p.direction === 'down' ? 'down' : 'up';
    if (p.speed !== undefined) A.speed = U.clamp(p.speed, 0.5, 2);
    if (p.emojiSize !== undefined) A.emojiSize = Math.round(U.clamp(p.emojiSize, 16, 56));
    A.shadow = p.shadow !== false;
    A.glass = p.glass === true;
    A.bubbleIcon = ['emoji', 'logo', 'none'].includes(p.bubbleIcon) ? p.bubbleIcon : 'emoji';
    A.font = p.font === 'serif' ? 'serif' : 'sans';

    // v1 → v2: reactions now fill the whole screen by default (reels-style).
    if ((Number(r.schemaVersion) || 1) < 2 && Object.keys(r).length) {
      if (A.position === 'right') A.position = 'spread';
      if (out.emoji.emojisPerWave === 5) out.emoji.emojisPerWave = 9;
    }
    out.schemaVersion = STILL.SCHEMA_VERSION;

    return out;
  };

  /** The intention text if it was set today, else ''. */
  U.intentionToday = function intentionToday(settings) {
    const it = settings.intention;
    return it && it.text && it.date === STILL.todayKey() ? it.text : '';
  };

  U.focusActive = function focusActive(settings, now) {
    return !!(settings.focus && settings.focus.until > (now || Date.now()));
  };

  /** Quiet-hours check: true when STILL. may appear right now. */
  U.inSchedule = function inSchedule(settings, date) {
    const sc = settings.schedule;
    if (!sc || !sc.enabled) return true;
    const d = date || new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    const toM = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    const a = toM(sc.start);
    const b = toM(sc.end);
    const day = d.getDay();
    if (a <= b) return sc.days.includes(day) && mins >= a && mins < b;
    if (mins >= a) return sc.days.includes(day); // overnight window belongs to its start day
    return mins < b && sc.days.includes((day + 6) % 7);
  };

  /** Read a dotted path from an object. */
  U.getPath = function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  };

  /** Return a copy of obj with dotted path set to value. */
  U.setPath = function setPath(obj, path, value) {
    const copy = STILL.clone(obj);
    const keys = path.split('.');
    let o = copy;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!U.isPlainObject(o[keys[i]])) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
    return copy;
  };

  STILL.utils = U;
})(typeof globalThis !== 'undefined' ? globalThis : self);
