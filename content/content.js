/*
 * STILL. — content script entry.
 * Injected only into sites the user chose (dynamic registration) or, on demand,
 * into the active tab for a popup preview (activeTab).
 *
 * It never reads page content. It keeps one isolated overlay, sends a light
 * heartbeat while the tab is visible, and plays the waves the service worker
 * hands back. Settings changes arrive through chrome.storage.onChanged and are
 * applied immediately, including in background tabs.
 */
(function () {
  'use strict';
  const STILL = globalThis.STILL;
  if (!STILL || !STILL.utils || window.top !== window) return;

  // ---- duplicate / orphan guard -------------------------------------------
  const prev = globalThis.__STILL_CONTENT__;
  if (prev) {
    if (prev.alive()) return; // already running in this tab
    prev.destroy(); // orphan from a previous extension version/reload
  }
  try {
    document.querySelectorAll('still-overlay').forEach((n) => n.remove());
  } catch (e) {
    /* ignore */
  }

  const U = STILL.utils;
  const HEARTBEAT_MS = 15000;

  let settings = null;
  let overlay = null;
  let timer = null;
  let destroyed = false;
  let siteActive = false;
  let unsubscribe = () => {};
  let previewState = null;

  function alive() {
    try {
      return !destroyed && !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function send(msg) {
    return new Promise((resolve) => {
      if (!alive()) return resolve(null);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          // reading lastError marks it handled (no console noise when the worker is waking)
          if (chrome.runtime.lastError) return resolve(null);
          resolve(res || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function ensureOverlay() {
    if (!overlay) {
      overlay = STILL.createOverlay({
        onHide: () => {},
        onPause: (minutes) => send({ type: 'still:pause', minutes: minutes || 15 }),
        onMoment: (kind) => send({ type: 'still:moment', kind }),
        onEndFocus: () => send({ type: 'still:focus-stop' }),
        onItemAction: (kind, item) => {
          // ♥ on a floating message marks it as a favourite (shown twice as often).
          if (kind === 'favorite' && item && item.id) {
            STILL.store
              .update((d) => {
                const m = d.messages.items.find((x) => x.id === item.id);
                if (m) m.favorite = true;
              })
              .catch(() => {});
          }
        }
      });
    }
    overlay.ensureAttached();
    overlay.configure(settings);
    return overlay;
  }

  /** Decode every image a wave needs, then play it. */
  async function playPrepared(wave) {
    const tokens = (wave.emojis || []).concat((wave.texts || []).map((t) => t.emoji), wave.giants || [], wave.reminder && wave.reminder.icon ? [wave.reminder.icon] : []);
    if (settings.brand.logo) tokens.push('img:' + settings.brand.logo);
    try {
      if (STILL.media) await STILL.media.prepare(tokens, settings);
    } catch (e) {
      /* fall back to system emoji */
    }
    if (destroyed) return;
    ensureOverlay().playWave(wave);
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  function schedule(ms) {
    stopTimer();
    if (destroyed || !siteActive) return;
    timer = setTimeout(tick, U.clamp(ms, 500, HEARTBEAT_MS));
  }

  async function tick() {
    timer = null;
    if (!alive()) return destroy();
    if (!siteActive) return;
    const hidden = document.visibilityState === 'hidden';
    if (hidden && settings.timing.pauseWhenInactive) return; // resumes on visibilitychange

    const res = await send({ type: 'still:tick', visible: !hidden });
    if (destroyed) return;
    if (!res) return schedule(HEARTBEAT_MS); // worker waking up; try again shortly
    if (res.active === false && res.reason === 'not-configured') {
      siteActive = false;
      return;
    }
    if (res.wave && settings.enabled && !(settings.pausedUntil > Date.now())) {
      playPrepared(res.wave).catch(() => {
        /* never let a rendering issue affect the page */
      });
    }
    schedule(Math.min(HEARTBEAT_MS, res.msUntilDue || HEARTBEAT_MS));
  }

  function evaluate() {
    const wasActive = siteActive;
    siteActive = !!(settings.onboarded && settings.enabled && U.findSite(settings, location.hostname));
    if (overlay) overlay.configure(settings);
    if (!settings.enabled || settings.pausedUntil > Date.now()) {
      if (overlay) overlay.clear();
    }
    if (siteActive) schedule(wasActive ? 1000 : 1200);
    else stopTimer();
  }

  function onVisibility() {
    if (!siteActive) return;
    if (document.visibilityState === 'visible') schedule(600);
    else if (settings.timing.pauseWhenInactive) stopTimer();
  }

  /** Esc clears whatever STILL. is showing (it never swallows the key). */
  function onKey(e) {
    if (e.key !== 'Escape' || !overlay || !settings || !settings.interaction.escToClear) return;
    overlay.clear();
  }

  function onPageShow(e) {
    if (e.persisted && siteActive) schedule(600); // restored from back/forward cache
  }

  function onMessage(msg, sender, sendResponse) {
    if (!msg || sender.id !== chrome.runtime.id) return false;
    if (msg.type === 'still:ping') {
      sendResponse({ ok: true, host: location.hostname, active: siteActive });
      return false;
    }
    if (msg.type === 'still:preview') {
      const run = () => {
        const wave = STILL.messageEngine.buildWave(settings, previewState, { stage: msg.stage || 'normal', minutes: 20 });
        previewState = wave.state;
        playPrepared(wave).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      };
      if (settings) run();
      else ready.then(run);
      return true;
    }
    if (msg.type === 'still:breathe') {
      const run = async () => {
        if (settings.brand.logo && STILL.media) await STILL.media.prepare(['img:' + settings.brand.logo], settings).catch(() => {});
        ensureOverlay().showBreathing();
        sendResponse({ ok: true });
      };
      if (settings) run();
      else ready.then(run);
      return true;
    }
    if (msg.type === 'still:clear') {
      if (overlay) overlay.clear();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopTimer();
    try {
      unsubscribe();
    } catch (e) {
      /* ignore */
    }
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pageshow', onPageShow);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch (e) {
      /* ignore */
    }
    if (overlay) overlay.destroy();
    overlay = null;
    if (globalThis.__STILL_CONTENT__ === instance) delete globalThis.__STILL_CONTENT__;
  }

  const instance = { alive, destroy };
  globalThis.__STILL_CONTENT__ = instance;

  try {
    chrome.runtime.onMessage.addListener(onMessage);
  } catch (e) {
    return;
  }
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('pageshow', onPageShow);

  const ready = STILL.store
    .load()
    .then((s) => {
      if (destroyed) return;
      settings = s;
      unsubscribe = STILL.store.onChange((next, prevS) => {
        if (!alive()) return destroy();
        settings = next;
        const timingChanged = JSON.stringify(next.timing) !== JSON.stringify(prevS.timing);
        evaluate();
        if (timingChanged && siteActive) schedule(800);
      });
      evaluate();
    })
    .catch(() => destroy());
})();
