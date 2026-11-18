/*
 * STILL. — options page.
 * Eight sections, each built from the shared components. Every control saves
 * immediately; open tabs pick the change up through storage.onChanged.
 */
(function () {
  'use strict';
  const STILL = globalThis.STILL;
  const U = STILL.utils;
  const ui = STILL.ui;
  const C = STILL.components;
  const h = ui.h;

  const model = ui.createModel();
  const $nav = document.getElementById('nav');
  const $content = document.getElementById('content');
  const $title = document.getElementById('title');
  const $subtitle = document.getElementById('subtitle');
  const $shell = document.querySelector('.shell');
  const $previewMount = document.getElementById('previewMount');
  const $sideFoot = document.getElementById('sideFoot');

  let preview = null;
  let studioCount = 0;
  const refreshStudio = () =>
    STILL.media.list().then((l) => {
      studioCount = l.length;
      paintBadges();
    });
  STILL.media.onChange(refreshStudio);
  let disposeView = null;
  let current = null;

  const TABS = [
    { id: 'general', label: 'General', icon: 'home', title: 'General', sub: 'Turn STILL. on or off, take a break, and choose how it behaves.', preview: true, build: general },
    { id: 'insights', label: 'Insights', icon: 'chart', title: 'Insights', sub: 'A calm look at where your time goes — and every mindful moment you took back.', preview: false, build: () => STILL.insights.component(model) },
    { id: 'focus', label: 'Focus & Hours', icon: 'target', title: 'Focus & active hours', sub: 'Start a focus session, set today’s intention, and choose when STILL. is allowed to appear.', preview: false, build: () => STILL.insights.focusForm(model) },
    { id: 'websites', label: 'Websites', icon: 'globe', title: 'Websites', sub: 'STILL. only appears on the websites listed here — and only where you have allowed access.', preview: false, build: websites, badge: (s) => s.sites.filter((x) => x.enabled).length },
    { id: 'animations', label: 'Animations', icon: 'layers', title: 'Animations', sub: 'Choose one style or several. Hover a card to watch it move.', preview: true, build: animations },
    { id: 'emojis', label: 'Emojis', icon: 'smile', title: 'Emoji reactions', sub: 'The little reactions that float up with your messages.', preview: true, build: emojis, badge: (s) => s.emoji.selected.length },
    { id: 'studio', label: 'Studio', icon: 'image', title: 'Studio', sub: 'Turn your own pictures into floating reactions, bubble icons or your personal logo.', preview: true, build: () => STILL.studio.component(model), badge: () => studioCount },
    { id: 'messages', label: 'Motivation Messages', icon: 'message', title: 'Motivation messages', sub: 'Write the sentences you need to hear. Organise them into collections and categories.', preview: true, build: messages, badge: (s) => STILL.messageEngine.messagePool(s).length },
    { id: 'timing', label: 'Timing & Frequency', icon: 'clock', title: 'Timing & frequency', sub: 'How soon, how often and how much. Gentle by default.', preview: true, build: timing },
    { id: 'appearance', label: 'Appearance', icon: 'droplet', title: 'Appearance', sub: 'Make the bubbles yours — colours, type, size, position and motion.', preview: true, build: appearance },
    { id: 'privacy', label: 'Data & Privacy', icon: 'shield', title: 'Data & privacy', sub: 'Everything STILL. knows lives on this device. Export it, import it, or start fresh.', preview: false, build: privacy, sep: true }
  ];

  /* ------------------------------------------------------------ nav */
  const navButtons = new Map();
  TABS.forEach((t) => {
    if (t.sep) $nav.appendChild(h('div', { class: 'sep' }));
    const badge = t.badge ? h('span', { class: 'badge' }) : null;
    const b = h('button', { type: 'button', onclick: () => show(t.id) }, ui.icon(t.icon), h('span', { text: t.label }), badge);
    b._badge = badge;
    navButtons.set(t.id, b);
    $nav.appendChild(b);
  });
  function paintBadges() {
    TABS.forEach((t) => {
      if (!t.badge) return;
      navButtons.get(t.id)._badge.textContent = String(t.badge(model.settings));
    });
  }

  /* ------------------------------------------------------------ side status */
  function paintStatus() {
    const s = model.settings;
    ui.empty($sideFoot);
    const paused = s.pausedUntil > Date.now();
    const dot = h('span', { class: 'status-dot' + (s.enabled ? (paused ? ' paused' : ' on') : '') });
    const text = !s.onboarded ? 'Setup not finished' : !s.enabled ? 'STILL. is off' : paused ? 'Paused until ' + new Date(s.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Active';
    $sideFoot.appendChild(
      h(
        'div',
        { class: 'status-pill' },
        dot,
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, fontSize: '13px' }, text })),
        ui.toggle({ checked: s.enabled, small: true, label: 'STILL. on or off', onChange: (v) => model.patch('enabled', v) })
      )
    );
    if (!s.onboarded) {
      $sideFoot.appendChild(h('button', { class: 'btn sm soft', type: 'button', style: { marginTop: '12px', width: '100%' }, onclick: openWizard }, 'Finish setup'));
    }
  }

  function openWizard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }

  /* ------------------------------------------------------------ routing */
  function show(id) {
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    if (current === tab.id) return;
    current = tab.id;
    if (location.hash !== '#' + tab.id) history.replaceState(null, '', '#' + tab.id);
    navButtons.forEach((b, k) => (k === tab.id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    $title.textContent = tab.title;
    $subtitle.textContent = tab.sub;
    document.title = tab.title + ' · STILL.';
    if (disposeView) disposeView();
    ui.empty($content);
    const scoped = model.collect(() => tab.build());
    disposeView = scoped.dispose;
    $content.appendChild(scoped.result);
    $shell.classList.toggle('no-preview', !tab.preview);
    if (preview) preview.clear();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  const section = (label, ...children) => h('div', { class: 'section' }, label ? h('div', { class: 'eyebrow', text: label }) : null, ...children);
  const card = (...rows) => h('div', { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } }, ...rows);

  /* ------------------------------------------------------------ sections */

  function general() {
    const pauseInfo = h('span', { class: 'muted small' });
    const pauseRow = h('div', { class: 'pause-row' });
    const paintPause = () => {
      const s = model.settings;
      const paused = s.pausedUntil > Date.now();
      pauseInfo.textContent = paused ? 'Paused until ' + new Date(s.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      ui.empty(pauseRow);
      if (paused) pauseRow.appendChild(h('button', { class: 'btn sm green', type: 'button', onclick: () => send({ type: 'still:resume' }) }, ui.icon('play', 'sm'), 'Resume now'));
      pauseRow.append(
        h('button', { class: 'btn sm', type: 'button', onclick: () => send({ type: 'still:pause', minutes: 15 }) }, '15 min'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => send({ type: 'still:pause', minutes: 60 }) }, '1 hour'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => send({ type: 'still:pause', minutes: 240 }) }, '4 hours')
      );
    };
    paintPause();
    model.subscribe(paintPause);

    return h(
      'div',
      null,
      section(
        null,
        card(
          ui.field('STILL. is on', 'The master switch. When off, nothing appears anywhere.', ui.bind(model, 'enabled', ui.toggle, { label: 'Enable STILL.' })),
          ui.field('Take a break', null, h('div', { class: 'stack', style: { alignItems: 'flex-end', gap: '6px' } }, pauseRow, pauseInfo))
        )
      ),
      section(
        'Behaviour',
        card(
          ui.field('Show quick controls', 'A small “Hide · Pause 15 min” control appears while reminders are floating.', ui.bind(model, 'general.showDock', ui.toggle, { label: 'Show quick controls' })),
          ui.field(
            'Motion',
            '“Follow system” respects your operating system’s reduced-motion setting.',
            ui.bind(model, 'general.reduceMotion', ui.segmented, {
              label: 'Motion',
              options: [
                { value: 'system', label: 'Follow system' },
                { value: 'always', label: 'Reduce' },
                { value: 'never', label: 'Full motion' }
              ]
            })
          ),
          ui.field('Gentle escalation', 'Reactions first, then a sentence, and a soft check-in card after a long session.', ui.bind(model, 'general.escalation', ui.toggle, { label: 'Gentle escalation' }))
        )
      ),
      section(
        'Setup',
        card(ui.field('Setup wizard', 'Walk through the guided setup again. Your current settings are kept.', h('button', { class: 'btn', type: 'button', onclick: openWizard }, ui.icon('sparkles', 'sm'), 'Run setup again')))
      )
    );
  }

  function websites() {
    return h(
      'div',
      null,
      h(
        'div',
        { class: 'notice', style: { marginBottom: '22px' } },
        ui.icon('shield'),
        h('span', { text: 'Adding a website asks your browser for permission to draw STILL.’s overlay there. STILL. never reads page content or your history. Sites you disable keep their access but stay quiet.' })
      ),
      C.siteEditor(model, { requestOnAdd: true, showAccess: true, budgets: true })
    );
  }

  function animations() {
    return C.stylePicker(model, { onPreview: () => preview && preview.play('normal') });
  }

  function emojis() {
    return C.emojiEditor(model);
  }

  function messages() {
    return C.messageManager(model);
  }

  function timing() {
    return C.timingForm(model);
  }

  function appearance() {
    return h(
      'div',
      { class: 'stack', style: { gap: '18px' } },
      C.appearanceForm(model),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn ghost',
            type: 'button',
            onclick: () =>
              model.update((d) => {
                d.appearance = STILL.clone(STILL.DEFAULT_SETTINGS.appearance);
              })
          },
          ui.icon('refresh', 'sm'),
          'Reset appearance'
        )
      )
    );
  }

  function privacy() {
    const promise = (icon, title, text) => h('div', null, ui.icon(icon), h('span', null, h('b', { text: title }), text));
    const usage = h('span', { class: 'muted small' });
    if (chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null).then((b) => (usage.textContent = (b / 1024).toFixed(1) + ' KB stored on this device'));
    }

    const origins = h('div', { class: 'origins' });
    const paintOrigins = () =>
      chrome.permissions.getAll().then((p) => {
        ui.empty(origins);
        const list = (p.origins || []).map((o) => o.replace(/^\*:\/\/(\*\.)?/, '').replace(/\/\*$/, ''));
        const uniq = Array.from(new Set(list));
        if (!uniq.length) origins.appendChild(h('span', { class: 'muted small', text: 'STILL. currently has access to no websites.' }));
        uniq.forEach((d) => origins.appendChild(h('span', { class: 'tag', text: d })));
      });
    paintOrigins();
    chrome.permissions.onRemoved.addListener(paintOrigins);
    chrome.permissions.onAdded.addListener(paintOrigins);
    model.onDispose(() => {
      chrome.permissions.onRemoved.removeListener(paintOrigins);
      chrome.permissions.onAdded.removeListener(paintOrigins);
    });

    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      if (f.size > 1024 * 1024) return ui.toast('That file is too large', 'info');
      try {
        const data = JSON.parse(await f.text());
        const raw = data && data.app === 'STILL.' ? data.settings : data;
        if (!U.isPlainObject(raw)) throw new Error('bad');
        const clean = U.normalizeSettings(raw);
        const imgs = Array.isArray(data.images) ? data.images.filter((a) => a && typeof a.id === 'string' && STILL.IMG_TOKEN.test('img:' + a.id) && typeof a.data === 'string' && /^data:image\/(png|webp|jpeg);base64,/.test(a.data) && a.data.length < STILL.LIMITS.imageBytes * 1.5) : [];
        if (!confirm('Replace your current settings with ' + clean.messages.items.length + ' messages and ' + clean.sites.length + ' websites from this file?')) return;
        const cur = model.settings;
        clean.onboarded = cur.onboarded || clean.onboarded;
        for (const a of imgs.slice(0, STILL.LIMITS.maxImages)) {
          try {
            await STILL.media.save({ id: a.id, name: U.cleanText(a.name || 'My image', 24), data: a.data, createdAt: Number(a.createdAt) || Date.now() });
          } catch (e2) {
            break;
          }
        }
        await model.update(() => clean);
        send({ type: 'still:sync' });
        ui.toast('Settings imported');
        const missing = clean.sites.length;
        if (missing) ui.toast('Allow website access in Websites if needed', 'info');
      } catch (e) {
        ui.toast('That file isn’t a valid STILL. export', 'info');
      }
    });

    let exportImages = [];
    STILL.media.list().then((l) => (exportImages = l));
    const exportJson = () => {
      const blob = new Blob([JSON.stringify({ app: 'STILL.', version: STILL.SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings: model.settings, images: exportImages }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'still-settings-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    return h(
      'div',
      null,
      section(
        'Our promises',
        h(
          'div',
          { class: 'promise' },
          promise('lock', 'No accounts, no servers', 'STILL. has no backend and makes no network requests.'),
          promise('eye', 'Never reads pages', 'It only draws an overlay. Page content, history and typing are never accessed.'),
          promise('shield', 'No tracking', 'No analytics, telemetry or third-party scripts of any kind.'),
          promise('folder', 'Stored locally', 'Your messages and preferences live in this browser’s extension storage.')
        )
      ),
      section(
        'Website access',
        card(
          ui.field('Granted websites', 'Access is only used to display the overlay.', origins, { block: true }),
          ui.field(
            'Revoke all access',
            'STILL. will stop appearing everywhere until you allow access again.',
            h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: async () => {
                  if (!confirm('Remove STILL.’s access to every website?')) return;
                  const p = await chrome.permissions.getAll();
                  if (p.origins && p.origins.length) await chrome.permissions.remove({ origins: p.origins });
                  send({ type: 'still:sync' });
                  ui.toast('Website access removed');
                }
              },
              'Revoke access'
            )
          )
        )
      ),
      section(
        'Your data',
        card(
          ui.field('Export settings', 'Download a JSON backup of everything, including your messages.', h('button', { class: 'btn', type: 'button', onclick: exportJson }, ui.icon('download', 'sm'), 'Export')),
          ui.field('Import settings', 'Restore from a STILL. backup file. Content is validated before it’s saved.', h('div', null, fileInput, h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, ui.icon('upload', 'sm'), 'Import'))),
          ui.field(
            'Reset insights',
            'Clear the daily time, mindful moments and focus history.',
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => confirm('Clear all insights history?') && send({ type: 'still:reset-stats' }).then(() => ui.toast('Insights cleared'))
              },
              ui.icon('refresh', 'sm'),
              'Reset insights'
            )
          ),
          ui.field(
            'Reset session timers',
            'Start every website’s browsing clock from zero.',
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => send({ type: 'still:reset-sessions' }).then(() => ui.toast('Session timers reset'))
              },
              ui.icon('refresh', 'sm'),
              'Reset timers'
            )
          ),
          ui.field(
            'Reset all settings',
            'Restore defaults for messages, emojis, animations, timing and appearance. Your websites are kept.',
            h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: async () => {
                  if (!confirm('Reset all STILL. settings to their defaults? Your own messages will be removed.')) return;
                  const next = await STILL.store.reset(true);
                  model._apply(next);
                  ui.toast('Settings restored to defaults');
                }
              },
              'Reset settings'
            )
          ),
          ui.field('Storage', null, usage)
        )
      )
    );
  }

  function send(msg) {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  }

  /* ------------------------------------------------------------ boot */
  document.getElementById('saved').appendChild(ui.savedIndicator(model));

  model.ready.then(() => {
    preview = C.previewStage(model, { height: 520, autoplay: true });
    $previewMount.appendChild(preview);
    paintBadges();
    paintStatus();
    model.subscribe(() => {
      paintBadges();
      paintStatus();
    });
    refreshStudio();
    show(location.hash.slice(1) || 'general');
    // keep the "paused until" display honest when the pause expires
    setInterval(paintStatus, 30000);
  });
})();
