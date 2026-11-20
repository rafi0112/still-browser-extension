/*
 * STILL. — toolbar popup.
 */
(function () {
  'use strict';
  const STILL = globalThis.STILL;
  const U = STILL.utils;
  const ui = STILL.ui;
  const I = STILL.insights;
  const $ = (id) => document.getElementById(id);

  const model = ui.createModel();
  let tab = null;
  let host = null;
  let session = null;
  let todayMs = 0;
  let stats = { days: {} };

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

  $('openSettings').appendChild(ui.icon('sliders'));
  $('setupSeal').appendChild(ui.icon('sparkles'));
  document.querySelectorAll('[data-icon]').forEach((n) => n.appendChild(ui.icon(n.dataset.icon)));
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const openOptions = (hash) => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#' + (hash || 'general')) });
    window.close();
  };
  $('openSettings').addEventListener('click', () => openOptions('general'));
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openOptions(b.dataset.open)));
  $('startSetup').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    window.close();
  });

  const master = ui.toggle({ checked: true, label: 'STILL. on or off', onChange: (v) => model.patch('enabled', v) });
  $('masterWrap').appendChild(master);

  /* ------------------------------------------------------------ site toggle */
  const siteToggle = ui.toggle({
    checked: false,
    small: true,
    label: 'Show STILL. on this site',
    onChange: (v) => {
      if (!host) return;
      const site = U.findSite(model.settings, host, true);
      const n = U.normalizeDomain(host);
      const domain = site ? site.domain : n.ok ? n.domain : null;
      if (!domain) return;
      if (v) {
        // Request first, synchronously, while we still hold the user gesture.
        chrome.permissions.request({ origins: U.originsForDomain(domain) }).then(
          (granted) => {
            if (!granted) $('err').textContent = 'Access was not granted, so STILL. can’t appear here.';
            send({ type: 'still:sync' });
            refreshSession();
          },
          () => {}
        );
      }
      model.update((d) => {
        const t = d.sites.find((s) => s.domain === domain);
        if (t) t.enabled = v;
        else if (v) d.sites.push({ id: U.uid('site'), domain, label: domain, enabled: true, preset: null, budgetMin: 0 });
      });
    }
  });
  $('siteToggleWrap').appendChild(siteToggle);

  /* ------------------------------------------------------------ actions */
  $('pause15').addEventListener('click', () => send({ type: 'still:pause', minutes: 15 }));
  $('pause60').addEventListener('click', () => send({ type: 'still:pause', minutes: 60 }));
  $('resume').addEventListener('click', () => send({ type: 'still:resume' }));
  $('preview').addEventListener('click', () => toTab('still:preview'));
  $('breathe').addEventListener('click', () => toTab('still:breathe'));

  async function toTab(type) {
    $('err').textContent = '';
    if (!tab || !host) {
      $('err').textContent = 'This works on regular websites, not browser pages.';
      return;
    }
    const res = await send({ type: 'still:deliver', tabId: tab.id, payload: { type } });
    if (!res || !res.result) {
      $('err').textContent = 'This page doesn’t allow extensions to draw on it.';
      return;
    }
    setTimeout(() => window.close(), 150);
  }

  /* ------------------------------------------------------------ render */
  function paint() {
    const s = model.settings;
    $('setup').hidden = s.onboarded;
    $('main').hidden = !s.onboarded;
    master.setValue(s.enabled);
    master.style.display = s.onboarded ? '' : 'none';
    if (!s.onboarded) return;

    const paused = s.pausedUntil > Date.now();
    const focus = U.focusActive(s);
    const site = host ? U.findSite(s, host, true) : null;
    const activeHere = !!(site && site.enabled);

    $('greet').textContent = I.greeting() + '.';
    let state = 'Active';
    let dot = 'on';
    if (!s.enabled) {
      state = 'Off';
      dot = '';
    } else if (paused) {
      state = 'Paused · ' + new Date(s.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      dot = 'paused';
    } else if (focus) {
      state = 'Focus';
      dot = 'focus';
    } else if (!U.inSchedule(s)) {
      state = 'Quiet hours';
      dot = '';
    }
    $('state').textContent = state;
    $('dot').className = 'status-dot ' + dot;

    const sum = I.summary(stats, s);
    $('todayTotal').textContent = I.fmt(sum.today.total);
    $('todaySub').textContent = sum.moments.today ? 'today · ' + sum.moments.today + ' mindful moment' + (sum.moments.today === 1 ? '' : 's') : 'on your sites today';
    ui.empty($('bars')).appendChild(I.bars(sum, true));

    $('resume').hidden = !paused;
    $('pause15').hidden = paused;
    $('pause60').hidden = paused;
    $('pause15').disabled = $('pause60').disabled = !s.enabled;

    if (host) {
      const d = U.displayHost(host);
      $('host').textContent = d;
      $('siteGlyph').textContent = d.charAt(0).toUpperCase();
      $('hostSub').textContent = activeHere ? (paused ? 'Paused here too' : 'STILL. is with you here') : site ? 'Turned off for this site' : 'Not on your list — switch on to add';
      $('siteToggleWrap').hidden = false;
      siteToggle.setValue(activeHere);
      const budget = site && site.budgetMin ? site.budgetMin * 60000 : 0;
      $('plan').hidden = !budget;
      if (budget) {
        const ratio = Math.min(1, todayMs / budget);
        $('planText').textContent = I.fmt(todayMs) + ' of your ' + site.budgetMin + '-minute plan';
        $('planPct').textContent = Math.round(ratio * 100) + '%';
        $('planBar').style.width = ratio * 100 + '%';
        $('plan').querySelector('.in-progress').className = 'in-progress sm' + (todayMs > budget ? ' over' : ratio > 0.8 ? ' near' : '');
      }
    } else {
      $('host').textContent = 'Browser page';
      $('siteGlyph').textContent = '·';
      $('hostSub').textContent = 'STILL. only runs on regular websites';
      $('siteToggleWrap').hidden = true;
      $('plan').hidden = true;
    }
    paintTimer();
  }

  function paintTimer() {
    const s = model.settings;
    const site = host ? U.findSite(s, host, true) : null;
    if (!site || !session) {
      $('timerWrap').hidden = true;
      return;
    }
    $('timerWrap').hidden = false;
    const live = Date.now() - session.lastBeat < 20000 && s.enabled;
    const extra = live ? Math.min(Date.now() - session.lastBeat, 25000) : 0;
    $('time').textContent = U.formatDuration(session.activeMs + Math.max(0, extra));
  }

  async function refreshSession() {
    if (!host) return;
    const res = await send({ type: 'still:session', host });
    session = res && res.session ? res.session : null;
    todayMs = (res && res.todayMs) || 0;
    paint();
  }

  /* ------------------------------------------------------------ boot */
  Promise.all([model.ready, chrome.tabs.query({ active: true, currentWindow: true }), I.loadStats()]).then(([, tabs, st]) => {
    tab = tabs && tabs[0];
    host = tab && tab.url ? U.hostFromUrl(tab.url) : null;
    stats = st;
    $('intentMount').appendChild(I.intentionField(model, { placeholder: 'What would make today a win?' }));
    $('focusMount').appendChild(I.focusCard(model, true));
    $('intensityMount').appendChild(STILL.components.intensityPicker(model, { compact: true }));
    paint();
    refreshSession();
    model.subscribe(() => paint());
    I.onStats(() => I.loadStats().then((x) => ((stats = x), paint())));
    setInterval(paintTimer, 1000);
    setInterval(refreshSession, 15000);
  });
})();
