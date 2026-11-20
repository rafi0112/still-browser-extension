/*
 * STILL. — onboarding wizard.
 * Choices are saved as the user goes (so closing the tab loses nothing), but the
 * `onboarded` flag is only set on "Finish setup" — until then no website ever
 * shows a message, because the service worker registers no content scripts.
 */
(function () {
  'use strict';
  const STILL = globalThis.STILL;
  const U = STILL.utils;
  const ui = STILL.ui;
  const C = STILL.components;
  const h = ui.h;

  const model = ui.createModel();
  const STEP_KEY = 'still.onboardingStep';
  const STEPS = ['Welcome', 'Websites', 'Animations', 'Emojis', 'Messages', 'Timing', 'Preview'];

  const $stage = document.getElementById('stage');
  const $next = document.getElementById('next');
  const $back = document.getElementById('back');
  const $note = document.getElementById('footNote');
  const $count = document.getElementById('count');
  const $bar = document.getElementById('bar');
  const $steps = document.getElementById('steps');

  let step = 0;
  let preview = null; // one shared live preview that travels between steps
  let siteEditor = null;

  STEPS.forEach((s) => $steps.appendChild(h('span', { text: s })));

  window.addEventListener('scroll', () => document.querySelector('.ob-top').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  function saveStep() {
    try {
      localStorage.setItem(STEP_KEY, String(step));
    } catch (e) {
      /* storage blocked — fine */
    }
  }
  function loadStep() {
    try {
      const n = Number(localStorage.getItem(STEP_KEY));
      return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function getPreview() {
    if (!preview) preview = C.previewStage(model, { height: 470, autoplay: true });
    return preview;
  }

  function head(eyebrow, title, text) {
    return h('div', { class: 'step-head' }, h('div', { class: 'eyebrow', text: eyebrow }), h('h1', { class: 'display', text: title }), text ? h('p', { text }) : null);
  }

  function withPreview(main, note) {
    const p = getPreview();
    return h('div', { class: 'split' }, h('div', null, main), h('div', { class: 'aside' }, p, h('div', { class: 'aside-note muted small', text: note || 'Live preview — updates as you change things.' })));
  }

  /* ------------------------------------------------------------ steps */

  const views = [
    // 1. Welcome
    function welcome() {
      const hero = C.previewStage(model, {
        height: 500,
        autoplay: false,
        ambient: 3600,
        controls: false,
        transform: (s) => {
          s.animation.styles = ['live-reaction', 'floating-emojis'];
          s.timing.messagesPerWave = 2;
          s.timing.durationMinSec = 5;
          s.timing.durationMaxSec = 6.5;
          s.emoji.emojisPerWave = 6;
          s.emoji.selected = ['🌱', '✨', '💚', '🎯', '🚀', '🌻', '☀️', '📚'];
          s.general.showDock = false;
          s.general.escalation = false;
          return s;
        }
      });
      const point = (icon, title, text) => h('div', null, h('b', null, ui.icon(icon), title), text);
      return h(
        'div',
        { class: 'welcome' },
        h(
          'div',
          null,
          h('h1', { class: 'brand' }, 'STILL', h('i', { text: '.' })),
          h('p', { class: 'tagline', text: 'Make progress. Without the pressure.' }),
          h('p', { class: 'quote', text: '“Your little reminder to stay connected with your goals.”' }),
          h(
            'div',
            { class: 'cta' },
            h('button', { class: 'btn primary lg', type: 'button', onclick: () => go(1) }, 'Get Started', ui.icon('arrowRight', 'sm')),
            h('span', { class: 'muted small', text: 'About two minutes to set up.' })
          ),
          h(
            'div',
            { class: 'points' },
            point('leaf', 'Gentle', 'Never blocks a page or closes a tab.'),
            point('sliders', 'Yours', 'Your words, emojis, pace and look.'),
            point('lock', 'Private', 'Everything stays on this device.')
          )
        ),
        hero
      );
    },

    // 2. Websites
    function websites() {
      siteEditor = C.siteEditor(model, { requestOnAdd: false, showAccess: true });
      return h(
        'div',
        { style: { maxWidth: '820px' } },
        head('Step 2 · Websites', 'Where should STILL. keep you company?', 'Pick the places where you tend to lose track of time. You can add, edit, pause or remove websites at any time.'),
        h(
          'div',
          { class: 'notice', style: { marginBottom: '22px' } },
          ui.icon('shield'),
          h(
            'div',
            null,
            h('b', { text: 'About permissions. ' }),
            'When you continue, your browser will ask to let STILL. run on these websites. That access is only used to draw the floating overlay. STILL. never reads the page, your history, or anything you type, and nothing leaves your device.'
          )
        ),
        siteEditor
      );
    },

    // 3. Animations
    function animations() {
      return withPreview(
        h(
          'div',
          null,
          head('Step 3 · Animation', 'Choose how reminders move.', 'Hover a style to see it move. Select one or several — STILL. rotates between them so it never feels repetitive.'),
          C.stylePicker(model, { onPreview: () => getPreview().play('normal') })
        )
      );
    },

    // 4. Emojis
    function emojis() {
      return withPreview(
        h(
          'div',
          null,
          head('Step 4 · Emoji reactions', 'Pick the reactions that feel like you.', 'They float up alongside your messages. Add any emoji you like to your own collection.'),
          C.emojiEditor(model, { compact: true })
        )
      );
    },

    // 5. Messages
    function messages() {
      return withPreview(
        h(
          'div',
          null,
          head('Step 5 · Your words', 'What do you want to remember?', 'Write the sentences you need to hear — your goals, your reasons, your future. Your own messages are shown more often than the defaults.'),
          C.messageManager(model, { compact: true })
        )
      );
    },

    // 6. Timing
    function timing() {
      return withPreview(
        h(
          'div',
          null,
          head('Step 6 · Rhythm', 'How hard should STILL. push?', 'Gentle stays quiet for five minutes and checks in now and then. Firm and Aggressive bring tough-love lines, giant angry emojis and much faster reminders.'),
          C.intensityPicker(model),
          h('div', { style: { height: '18px' } }),
          C.timingForm(model, { compact: true })
        ),
        'The preview plays one appearance using your counts and durations.'
      );
    },

    // 7. Final preview
    function finalPreview() {
      const p = getPreview();
      const s = model.settings;
      const sumList = h('div', { class: 'summary' });
      const renderSummary = () => {
        const st = model.settings;
        ui.empty(sumList);
        const item = (icon, k, v, target) =>
          h(
            'div',
            { class: 'sum-item' },
            ui.icon(icon),
            h('div', { class: 'grow' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v })),
            h('button', { class: 'btn sm ghost edit', type: 'button', onclick: () => go(target) }, 'Edit')
          );
        const enabledSites = st.sites.filter((x) => x.enabled).map((x) => x.domain);
        const styles = st.animation.styles.map((id) => STILL.ANIMATION_STYLES.find((x) => x.id === id).label);
        const pool = STILL.messageEngine.messagePool(st);
        const mine = pool.filter((m) => m.custom).length;
        sumList.append(
          item('globe', 'Websites', enabledSites.length ? enabledSites.join(', ') : 'None selected', 1),
          item('layers', 'Animation', styles.join(', '), 2),
          item('smile', 'Emojis', st.emoji.selected.length ? st.emoji.selected.join(' ') + '  ·  ' + st.emoji.emojisPerWave + ' per wave' : 'None — text only', 3),
          item('message', 'Messages', pool.length + ' active' + (mine ? ' · ' + mine + ' written by you' : ''), 4),
          item('clock', 'Rhythm', 'First after ' + U.formatMinutes(st.timing.initialDelayMin) + ', then every ' + U.formatMinutes(st.timing.intervalMin), 5)
        );
      };
      renderSummary();
      model.subscribe(renderSummary);

      const tune = h(
        'div',
        { class: 'card pad tune' },
        h('div', { class: 'eyebrow', text: 'Position & size' }),
        ui.field(
          'Position',
          null,
          ui.bind(model, 'appearance.position', ui.segmented, {
            label: 'Position',
            options: [
              { value: 'spread', label: 'Full screen' },
              { value: 'right', label: 'Right' },
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' }
            ]
          })
        ),
        ui.field('Text size', null, ui.bind(model, 'appearance.fontSize', ui.slider, { min: 11, max: 22, label: 'Text size', format: (v) => v + ' px' })),
        ui.field('Look', null, lookControl())
      );

      setTimeout(() => p.play('normal'), 500);
      void s;
      return h(
        'div',
        null,
        head('Step 7 · Preview', 'Here’s how it will feel.', 'Play a wave, try the check-in card, and fine-tune position and size. Everything can be changed later from the STILL. icon.'),
        h('div', { class: 'final-grid' }, h('div', null, p, h('div', { class: 'aside-note muted small', text: 'Press Play preview as often as you like — every wave is a little different.' })), h('div', null, sumList, tune))
      );
    },

    // Done
    function done() {
      const tip = (icon, text) => h('div', { class: 'notice' }, ui.icon(icon), h('span', { text }));
      const first = model.settings.sites.find((s) => s.enabled);
      return h(
        'div',
        { class: 'done' },
        h('div', { class: 'seal' }, ui.icon('check')),
        h('h1', { class: 'display', text: 'You’re all set.' }),
        h(
          'p',
          { text: 'STILL. is now active on your chosen websites. It will stay quiet for ' + U.formatMinutes(model.settings.timing.initialDelayMin) + ', then gently remind you why you started.' }
        ),
        h(
          'div',
          { class: 'row' },
          first ? h('button', { class: 'btn primary lg', type: 'button', onclick: () => chrome.tabs.create({ url: 'https://' + (first.domain === 'x.com' ? 'x.com' : 'www.' + first.domain) }) }, 'Open ' + first.domain, ui.icon('external', 'sm')) : null,
          h('button', { class: 'btn lg', type: 'button', onclick: () => chrome.runtime.openOptionsPage() }, 'Open settings')
        ),
        h(
          'div',
          { class: 'tips' },
          tip('pause', 'Need a break from reminders? Click the STILL. icon in your toolbar to pause for 15 minutes or an hour.'),
          tip('sparkles', 'Use “Preview now” in the toolbar popup to see a wave on any page instantly.'),
          tip('info', 'Pin STILL. to your toolbar: click the puzzle icon, then the pin next to STILL.')
        )
      );
    }
  ];

  let cleanup = null;

  /** Appearance preset switcher that copies the preset's colours too. */
  function lookControl() {
    const seg = ui.segmented({
      label: 'Look',
      value: model.settings.appearance.preset,
      options: Object.entries(STILL.APPEARANCE_PRESETS).map(([value, x]) => ({ value, label: x.label })),
      onChange: (id) => {
        const ps = STILL.APPEARANCE_PRESETS[id];
        model.update((d) => {
          Object.assign(d.appearance, { preset: id, bubbleBg: ps.bubbleBg, textColor: ps.textColor, accent: ps.accent, opacity: ps.opacity, shadow: ps.shadow, font: ps.font });
        });
      }
    });
    model.subscribe((st) => seg.setValue(st.appearance.preset));
    return seg;
  }

  /* ------------------------------------------------------------ navigation */

  function render(dir) {
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        /* ignore */
      }
      cleanup = null;
    }
    if (preview && preview.parentNode) preview.parentNode.removeChild(preview);
    if (preview) preview.clear();
    ui.empty($stage);
    if (step >= 2 && step < STEPS.length) getPreview(); // created outside the step scope: it persists
    const scoped = model.collect(() => views[step]());
    cleanup = scoped.dispose;
    const node = scoped.result;
    node.classList.add('step');
    if (dir < 0) node.classList.add('back');
    $stage.appendChild(node);
    window.scrollTo({ top: 0 });

    const isDone = step === STEPS.length;
    document.getElementById('foot').hidden = step === 0 || isDone;
    $back.hidden = step <= 1;
    $next.textContent = step === STEPS.length - 1 ? 'Finish Setup' : 'Continue';
    $next.classList.toggle('green', step === STEPS.length - 1);
    $next.classList.toggle('primary', step !== STEPS.length - 1);
    $note.textContent = '';
    $note.classList.remove('err');

    const visibleIdx = Math.min(step, STEPS.length - 1);
    $count.textContent = isDone ? 'Done' : 'Step ' + (visibleIdx + 1) + ' of ' + STEPS.length;
    $bar.style.width = (isDone ? 100 : (visibleIdx / (STEPS.length - 1)) * 100) + '%';
    [...$steps.children].forEach((s, i) => {
      s.className = i < visibleIdx || isDone ? 'is-done' : i === visibleIdx ? 'is-now' : '';
    });
    $stage.focus({ preventScroll: true });
  }

  function go(n) {
    const dir = n >= step ? 1 : -1;
    step = U.clamp(n, 0, STEPS.length);
    if (step < STEPS.length) saveStep();
    render(dir);
  }

  function error(msg) {
    $note.textContent = msg;
    $note.classList.add('err');
  }

  $back.addEventListener('click', () => go(step - 1));

  $next.addEventListener('click', () => {
    const s = model.settings;
    if (step === 1) {
      const enabled = s.sites.filter((x) => x.enabled);
      if (!enabled.length) return error('Choose at least one website to continue.');
      // Ask for host access synchronously inside this click (user gesture required).
      const domains = enabled.map((x) => x.domain);
      const origins = domains.flatMap(U.originsForDomain);
      chrome.permissions
        .request({ origins })
        .then((granted) => {
          if (!granted) ui.toast('No problem — you can allow access later from Settings › Websites', 'info');
          go(2);
        })
        .catch(() => go(2));
      return;
    }
    if (step === 3 && !s.emoji.selected.length && s.timing.messagesPerWave === 0) {
      return error('Select at least one emoji, or keep messages on in the next steps.');
    }
    if (step === STEPS.length - 1) {
      $next.disabled = true;
      model
        .update((d) => {
          d.onboarded = true;
          d.enabled = true;
          d.pausedUntil = 0;
        })
        .then(() => {
          try {
            localStorage.removeItem(STEP_KEY);
          } catch (e) {
            /* ignore */
          }
          chrome.runtime.sendMessage({ type: 'still:sync' }).catch(() => {});
          $next.disabled = false;
          go(STEPS.length);
        });
      return;
    }
    go(step + 1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && step === 0) go(1);
  });

  model.ready.then(() => {
    step = model.settings.onboarded ? 0 : loadStep();
    render(1);
  });
})();
