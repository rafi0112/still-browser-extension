/*
 * STILL. — background service worker (MV3).
 *
 * Responsibilities
 *  1. First run: open the onboarding wizard on install.
 *  2. Content-script registration: only on sites the user picked AND granted access to
 *     (dynamic chrome.scripting registration, re-synced on every relevant change).
 *  3. Sessions + scheduling: content scripts send heartbeats; the worker owns each
 *     site's session clock and decides when a wave is due (no duplicates across tabs).
 *  4. Insights: daily per-site time, mindful moments, focus sessions (local only).
 *  5. Focus sessions, daily site plans (budgets), quiet hours, pause — with badge + alarms.
 *  6. Context menu ("Add selection to STILL."), keyboard shortcuts, bundled-art serving.
 *
 * Messaging protocol (chrome.runtime.sendMessage, all { type, ... }):
 *   content → sw   still:tick     { visible }   → { active, wave?, msUntilDue, activeMs }
 *   content → sw   still:moment   { kind }      mindful moment (thanks / breathe)
 *   content → sw   still:asset    { path }      → { data } bundled 3D emoji as data URL
 *   popup   → sw   still:session  { host }      → { site, session, todayMs }
 *   any     → sw   still:pause / still:resume / still:focus-start / still:focus-stop
 *                  still:sync / still:reset-sessions / still:reset-stats
 *   popup / sw → tab  still:preview / still:breathe / still:clear (tabs.sendMessage)
 *   chrome.storage.onChanged is the real-time channel for all settings.
 */
'use strict';

importScripts(
  '../shared/defaults.js',
  '../shared/utils.js',
  '../shared/storage.js',
  '../shared/message-engine.js',
  'session-manager.js',
  'message-scheduler.js',
  'stats.js'
);

const STILL = self.STILL;
const U = STILL.utils;

const SCRIPT_ID = 'still-overlay';
const CONTENT_FILES = [
  'shared/defaults.js',
  'shared/utils.js',
  'shared/storage.js',
  'shared/message-engine.js',
  'shared/media.js',
  'content/overlay-styles.js',
  'content/animation-engine.js',
  'content/overlay.js',
  'content/content.js'
];
const RESUME_ALARM = 'still-resume';
const FOCUS_ALARM = 'still-focus';
const MENU_ID = 'still-add-selection';
const ALLOWED_ASSETS = new Set(Object.values(STILL.EMOJI_FILES));

/* ------------------------------------------------------------------ install */

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await STILL.store.save(await STILL.store.load()); // normalise / migrate
  if (details.reason === 'install' && !settings.onboarded) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
  await syncContentScripts();
  await syncMenus(settings);
  await refreshBadge(settings);
});

chrome.runtime.onStartup.addListener(async () => {
  const s = await STILL.store.load();
  await syncContentScripts();
  await syncMenus(s);
  await refreshBadge(s);
});

/* -------------------------------------------------- content script registry */

let syncChain = Promise.resolve();
function syncContentScripts() {
  syncChain = syncChain.then(doSync, doSync).catch((e) => console.warn('[STILL.] sync failed', e));
  return syncChain;
}

async function grantedSites(settings) {
  const out = [];
  for (const site of settings.sites) {
    if (!site.enabled) continue;
    let ok = false;
    try {
      ok = await chrome.permissions.contains({ origins: U.originsForDomain(site.domain) });
    } catch (e) {
      ok = false;
    }
    if (ok) out.push(site);
  }
  return out;
}

async function doSync() {
  const settings = await STILL.store.load();
  const sites = settings.onboarded ? await grantedSites(settings) : [];
  const matches = sites.flatMap((s) => U.originsForDomain(s.domain));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  const before = new Set(existing.length ? existing[0].matches || [] : []);
  const filesChanged = existing.length && JSON.stringify(existing[0].js) !== JSON.stringify(CONTENT_FILES);

  if (!matches.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script = { id: SCRIPT_ID, matches, js: CONTENT_FILES, runAt: 'document_idle', allFrames: false, persistAcrossSessions: true };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);

  // Inject into already-open tabs of newly added sites (the content script guards against doubles).
  const added = filesChanged ? matches : matches.filter((m) => !before.has(m));
  if (!added.length) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: added });
  } catch (e) {
    tabs = [];
  }
  await Promise.all(tabs.map((tab) => inject(tab.id)));
}

function inject(tabId) {
  return chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES }).catch(() => {});
}

/** Deliver a message to a tab, injecting STILL. first if needed (activeTab / host access). */
async function deliver(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    await inject(tabId);
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e2) {
      return null;
    }
  }
}

chrome.permissions.onAdded.addListener(() => syncContentScripts());
chrome.permissions.onRemoved.addListener(() => syncContentScripts());

/* -------------------------------------------------------- settings changes */

STILL.store.onChange(async (next, prev) => {
  const sitesChanged = JSON.stringify(next.sites) !== JSON.stringify(prev.sites);
  if (sitesChanged || next.onboarded !== prev.onboarded) {
    await syncContentScripts();
    if (sitesChanged) STILL.sessions.prune(next.sites.map((s) => s.domain)).catch(() => {});
  }
  if (next.enabled !== prev.enabled || next.pausedUntil !== prev.pausedUntil || next.focus.until !== prev.focus.until || next.onboarded !== prev.onboarded) {
    await scheduleAlarms(next);
    await refreshBadge(next);
  }
  if (next.general.contextMenu !== prev.general.contextMenu) await syncMenus(next);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STILL.STATS_KEY]) STILL.stats.invalidate();
});

/* -------------------------------------------------------------- pause & focus */

async function scheduleAlarms(settings) {
  await chrome.alarms.clear(RESUME_ALARM);
  if (settings.pausedUntil > Date.now()) chrome.alarms.create(RESUME_ALARM, { when: settings.pausedUntil + 500 });
  await chrome.alarms.clear(FOCUS_ALARM);
  if (U.focusActive(settings)) chrome.alarms.create(FOCUS_ALARM, { periodInMinutes: 1, delayInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const s = await STILL.store.load();
  if (alarm.name === RESUME_ALARM) {
    if (s.pausedUntil && s.pausedUntil <= Date.now()) await STILL.store.patch('pausedUntil', 0);
    else await refreshBadge(s);
  }
  if (alarm.name === FOCUS_ALARM) {
    if (s.focus.until && s.focus.until <= Date.now()) await finishFocus(true);
    else await refreshBadge(s);
  }
});

async function pause(minutes) {
  const until = Date.now() + U.clamp(minutes, 1, 24 * 60) * 60 * 1000;
  await STILL.store.patch('pausedUntil', until);
  return until;
}

async function startFocus(minutes, label) {
  const m = Math.round(U.clamp(minutes || 25, 5, 180));
  const now = Date.now();
  await STILL.store.update((d) => {
    d.focus = { until: now + m * 60000, startedAt: now, minutes: m, label: U.cleanText(label || '', 80) };
    d.pausedUntil = 0;
  });
  return { until: now + m * 60000 };
}

async function finishFocus(completed) {
  const s = await STILL.store.load();
  if (!s.focus.startedAt) return;
  const minutes = Math.round((Math.min(Date.now(), s.focus.until) - s.focus.startedAt) / 60000);
  if (completed || minutes >= 5) {
    await STILL.stats.count('focus', 1);
    await STILL.stats.count('focusMin', Math.max(0, minutes));
  }
  await STILL.store.update((d) => {
    d.focus.until = 0;
    d.focus.startedAt = 0;
  });
}

/* -------------------------------------------------------------- badge */

async function refreshBadge(settings) {
  settings = settings || (await STILL.store.load());
  let text = '';
  let title = 'STILL.';
  let color = '#2f6f4e';
  if (!settings.onboarded) {
    text = '•';
    title = 'STILL. — finish setup';
  } else if (!settings.enabled) {
    text = 'off';
    title = 'STILL. is off';
    color = '#8a8f8a';
  } else if (STILL.scheduler.isPaused(settings)) {
    text = 'II';
    title = 'STILL. is paused';
    color = '#b7832a';
  } else if (U.focusActive(settings)) {
    const left = Math.max(1, Math.ceil((settings.focus.until - Date.now()) / 60000));
    text = left + 'm';
    title = 'Focus session · ' + left + ' min left';
    color = '#1e4f37';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({ title });
}

/* -------------------------------------------------------------- context menu */

async function syncMenus(settings) {
  if (!chrome.contextMenus) return;
  await new Promise((r) => chrome.contextMenus.removeAll(() => r()));
  if (!settings.general.contextMenu) return;
  chrome.contextMenus.create({ id: MENU_ID, title: 'Add “%s” to STILL. messages', contexts: ['selection'] }, () => void chrome.runtime.lastError);
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== MENU_ID) return;
    const text = U.cleanText(info.selectionText || '');
    if (!text) return;
    let added = false;
    await STILL.store.update((d) => {
      if (d.messages.items.some((m) => m.text.toLowerCase() === text.toLowerCase())) return;
      if (d.messages.items.length >= STILL.LIMITS.maxMessages) return;
      d.messages.items.unshift({ id: U.uid('m'), text, category: 'custom', enabled: true, favorite: false, custom: true, collection: d.messages.collections[0].id });
      if (!d.messages.categories.includes('custom')) d.messages.categories.push('custom');
      added = true;
    });
    await chrome.action.setBadgeText({ text: added ? '+1' : '✓' });
    setTimeout(() => refreshBadge(), 1800);
  });
}

/* -------------------------------------------------------------- shortcuts */

if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const s = await STILL.store.load();
    if (command === 'toggle-pause') {
      if (STILL.scheduler.isPaused(s)) await STILL.store.patch('pausedUntil', 0);
      else await pause(15);
    } else if ((command === 'preview' || command === 'breathe') && tab && U.hostFromUrl(tab.url || 'https://x.y')) {
      await deliver(tab.id, { type: command === 'preview' ? 'still:preview' : 'still:breathe' });
    }
  });
}

/* -------------------------------------------------------------- messaging */

async function handleTick(msg, sender) {
  const settings = await STILL.store.load();
  const host = sender.tab && U.hostFromUrl(sender.tab.url || sender.url);
  const site = host && U.findSite(settings, host);
  if (!site || !settings.onboarded) return { active: false, reason: 'not-configured' };
  if (!settings.enabled) return { active: false, reason: 'disabled', msUntilDue: 60000 };

  const session = await STILL.sessions.beat(site.domain, settings);
  if (msg.visible !== false && session.lastAdded > 0) await STILL.stats.addTime(site.domain, session.lastAdded);

  let wave = null;
  const paused = STILL.scheduler.isPaused(settings);
  const visible = msg.visible !== false;
  const focusOn = U.focusActive(settings);

  if (visible && !paused) {
    // 1. A focus session just started (or this site is visited during one): say so right away.
    if (focusOn && session.focusSeen !== settings.focus.startedAt) {
      session.focusSeen = settings.focus.startedAt;
      wave = STILL.scheduler.commit(settings, session, 'reminder', {
        reminderKind: 'focus',
        focusLeftMin: (settings.focus.until - Date.now()) / 60000
      });
      wave.texts = wave.texts.slice(0, 1);
    }
    // 2. Today's plan for this site is used up (once per day per site).
    if (!wave && site.budgetMin > 0 && U.inSchedule(settings)) {
      const today = await STILL.stats.todayMs(site.domain);
      if (today >= site.budgetMin * 60000 && (await STILL.stats.flag('budget:' + site.domain))) {
        wave = STILL.scheduler.commit(settings, session, 'reminder', { reminderKind: 'budget', budgetMin: site.budgetMin, site: site.label || site.domain });
      }
    }
  }

  const decision = STILL.scheduler.evaluate(settings, session);
  if (!wave && decision.due && visible) wave = STILL.scheduler.commit(settings, session, decision.stage);
  if (wave) STILL.stats.count('waves', 1).catch(() => {});
  await STILL.sessions.save();
  return {
    active: true,
    paused,
    wave,
    activeMs: session.activeMs,
    msUntilDue: decision.due ? STILL.scheduler.effectiveTiming(settings).intervalMin * 60000 : decision.msUntilDue
  };
}

async function handleSession(msg) {
  const settings = await STILL.store.load();
  const host = typeof msg.host === 'string' ? msg.host : '';
  const site = U.findSite(settings, host, true);
  if (!site) return { site: null, session: null, todayMs: 0 };
  const session = await STILL.sessions.get(site.domain, settings);
  return { site, session, todayMs: await STILL.stats.todayMs(site.domain) };
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const assetCache = new Map();
async function handleAsset(msg) {
  if (!ALLOWED_ASSETS.has(msg.path)) return { data: null };
  if (!assetCache.has(msg.path)) {
    const res = await fetch(chrome.runtime.getURL(msg.path));
    assetCache.set(msg.path, 'data:image/png;base64,' + toBase64(await res.arrayBuffer()));
  }
  return { data: assetCache.get(msg.path) };
}

const handlers = {
  'still:tick': handleTick,
  'still:session': handleSession,
  'still:asset': handleAsset,
  'still:pause': async (msg) => ({ pausedUntil: await pause(msg.minutes || 15) }),
  'still:resume': async () => {
    await STILL.store.patch('pausedUntil', 0);
    return { ok: true };
  },
  'still:focus-start': async (msg) => startFocus(msg.minutes, msg.label),
  'still:focus-stop': async () => {
    await finishFocus(false);
    return { ok: true };
  },
  'still:moment': async (msg) => {
    await STILL.stats.count('moments', 1);
    if (msg.kind === 'breathe') await STILL.stats.count('breaths', 1);
    return { ok: true };
  },
  'still:deliver': async (msg) => ({ result: await deliver(msg.tabId, msg.payload) }),
  'still:sync': async () => {
    await syncContentScripts();
    return { ok: true };
  },
  'still:reset-sessions': async () => {
    await STILL.sessions.resetAll();
    return { ok: true };
  },
  'still:reset-stats': async () => {
    await STILL.stats.reset();
    return { ok: true };
  },
  'still:get-content-files': async () => ({ files: CONTENT_FILES })
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) return false;
  const h = handlers[msg.type];
  if (!h) return false;
  Promise.resolve()
    .then(() => h(msg, sender))
    .then((res) => sendResponse(res), (err) => sendResponse({ error: String((err && err.message) || err) }));
  return true;
});

// Keep alarms, badge and menus consistent whenever the worker spins up.
(async () => {
  const s = await STILL.store.load();
  if (s.focus.until && s.focus.until <= Date.now()) await finishFocus(true).catch(() => {});
  await scheduleAlarms(s).catch(() => {});
  await refreshBadge(s).catch(() => {});
})();
