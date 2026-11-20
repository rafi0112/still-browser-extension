/*
 * STILL. — reusable settings components.
 * Shared verbatim by the onboarding wizard and the options page so both always
 * edit the same data in the same way. Every component reads from and writes to
 * the page model (which is backed by chrome.storage.local).
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;
  const ui = STILL.ui;
  const h = ui.h;
  const C = {};

  const hasPerms = () => !!(root.chrome && chrome.permissions);

  /* =================================================================
   * Live preview stage
   * ================================================================= */
  /**
   * opts: { height, autoplay, ambient, url, controls, transform(settings) }
   *  autoplay  replay a wave whenever settings change (debounced)
   *  ambient   ms between automatic waves (welcome screen), 0 = off
   *  transform optional fn to adjust settings for the preview only
   */
  C.previewStage = function previewStage(model, opts) {
    opts = Object.assign({ height: 420, autoplay: true, ambient: 0, controls: true }, opts);
    const firstSite = () => {
      const s = model.settings.sites.find((x) => x.enabled);
      return s ? s.domain : opts.url || 'youtube.com';
    };
    const urlText = h('span', { text: firstSite() });
    const viewport = h('div', { class: 'viewport' }, buildFeed());
    const frame = h(
      'div',
      { class: 'preview', style: { height: typeof opts.height === 'number' ? opts.height + 'px' : opts.height } },
      h('div', { class: 'chrome' }, h('div', { class: 'dots' }, h('span'), h('span'), h('span')), h('div', { class: 'url' }, ui.icon('lock'), urlText)),
      viewport
    );

    const view = (s) => (opts.transform ? opts.transform(STILL.clone(s)) : s);
    const overlay = STILL.createOverlay({
      mount: viewport,
      onHide: () => {},
      onPause: () => ui.toast('In a real tab this pauses STILL. for 15 minutes', 'pause')
    });
    overlay.configure(view(model.settings));
    let state = null;
    let ambientT = null;

    function play(stage) {
      const s = view(model.settings);
      overlay.configure(s);
      const wave = STILL.messageEngine.buildWave(s, state, { stage: stage || 'normal', minutes: 24 });
      state = wave.state;
      overlay.playWave(wave);
    }

    if (opts.controls) {
      const playBtn = h('button', { class: 'btn primary sm', type: 'button', onclick: () => play('normal') }, ui.icon('play', 'sm'), 'Play');
      const remBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => play('reminder') }, 'Check-in');
      const clearBtn = h('button', { class: 'btn sm ghost', type: 'button', onclick: () => overlay.clear() }, 'Clear');
      frame.querySelector('.chrome').appendChild(h('div', { class: 'controls' }, playBtn, remBtn, clearBtn));
    }

    const replay = U.debounce(() => {
      overlay.clear();
      setTimeout(() => play('normal'), 260);
    }, 650);

    model.subscribe((next, prev) => {
      urlText.textContent = firstSite();
      overlay.configure(view(next));
      if (!opts.autoplay) return;
      const keys = ['animation', 'emoji', 'messages', 'appearance', 'timing', 'general'];
      if (keys.some((k) => JSON.stringify(next[k]) !== JSON.stringify(prev[k]))) replay();
    });

    function startAmbient() {
      stopAmbient();
      if (!opts.ambient) return;
      const loop = () => {
        if (document.visibilityState === 'visible') play('normal');
        ambientT = setTimeout(loop, opts.ambient);
      };
      ambientT = setTimeout(loop, 400);
    }
    function stopAmbient() {
      clearTimeout(ambientT);
    }
    startAmbient();
    model.onDispose(() => {
      stopAmbient();
      replay.cancel();
      overlay.destroy();
    });

    frame.play = play;
    frame.overlay = overlay;
    frame.clear = () => overlay.clear();
    frame.stopAmbient = stopAmbient;
    frame.startAmbient = startAmbient;
    return frame;
  };

  function buildFeed() {
    const post = (img, lines) =>
      h('div', { class: 'post' }, img ? h('div', { class: 'ph img' }) : null, ...lines.map((w) => h('div', { class: 'ph ' + w })));
    return h(
      'div',
      { class: 'feed' },
      h('div', { class: 'stack', style: { gap: '14px' } }, post(true, ['w80', 'w60']), post(false, ['w60', 'w80', 'w40'])),
      h('div', { class: 'stack', style: { gap: '14px' } }, post(false, ['w40', 'w80']), post(true, ['w60', 'w40'])),
      h('div', { class: 'stack', style: { gap: '14px' } }, post(true, ['w80', 'w60']), post(false, ['w80', 'w40']))
    );
  }

  /* =================================================================
   * Websites
   * ================================================================= */
  /**
   * opts.requestOnAdd: ask for host access immediately when a site is added
   *   (options page). Onboarding asks once for everything on "Continue".
   */
  C.siteEditor = function siteEditor(model, opts) {
    opts = opts || {};
    const root = h('div', { class: 'stack', style: { gap: '18px' } });
    const access = new Map(); // domain -> boolean
    let editing = null;

    async function refreshAccess() {
      if (!hasPerms()) return;
      await Promise.all(
        model.settings.sites.map(async (s) => {
          try {
            access.set(s.domain, await chrome.permissions.contains({ origins: U.originsForDomain(s.domain) }));
          } catch (e) {
            access.set(s.domain, false);
          }
        })
      );
      renderList();
    }

    /** Must be called synchronously inside a click handler (user gesture). */
    function requestAccess(domains) {
      if (!hasPerms() || !domains.length) return Promise.resolve(true);
      const origins = domains.flatMap(U.originsForDomain);
      return chrome.permissions
        .request({ origins })
        .then((granted) => {
          if (!granted) ui.toast('Access not granted — STILL. stays hidden there until you allow it', 'info');
          chrome.runtime.sendMessage({ type: 'still:sync' }).catch(() => {});
          refreshAccess();
          return granted;
        })
        .catch(() => false);
    }
    C.requestSiteAccess = requestAccess;

    /* presets */
    const presetGrid = h('div', { class: 'site-grid' });
    function presetOn(p) {
      return p.domains.every((d) => model.settings.sites.some((s) => s.domain === d && s.enabled));
    }
    function renderPresets() {
      ui.empty(presetGrid);
      STILL.SITE_PRESETS.forEach((p) => {
        const on = presetOn(p);
        presetGrid.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'tile site-tile',
              'aria-pressed': String(on),
              onclick: () => {
                const turningOn = !presetOn(p);
                if (turningOn && opts.requestOnAdd) requestAccess(p.domains);
                model.update((d) => {
                  p.domains.forEach((dom) => {
                    const ex = d.sites.find((s) => s.domain === dom);
                    if (turningOn) {
                      if (ex) ex.enabled = true;
                      else
                        d.sites.push({
                          id: U.uid('site'),
                          domain: dom,
                          label: p.domains.length > 1 ? p.label + (dom === p.domains[0] ? '' : ' · ' + dom) : p.label,
                          enabled: true,
                          preset: p.id
                        });
                    } else if (ex) {
                      d.sites = d.sites.filter((s) => s.domain !== dom);
                    }
                  });
                });
              }
            },
            h('span', { class: 'site-glyph', text: p.glyph }),
            h('span', { class: 'grow' }, h('div', { class: 'name', text: p.label }), h('div', { class: 'dom', text: p.domains.join(' · ') })),
            h('span', { class: 'check' }, ui.icon('check'))
          )
        );
      });
    }

    /* custom add */
    const input = h('input', { class: 'input', type: 'text', placeholder: 'e.g. news.ycombinator.com', 'aria-label': 'Website address', spellcheck: 'false', autocomplete: 'off' });
    const err = h('div', { class: 'field-error', role: 'alert' });
    function addCustom() {
      const n = U.normalizeDomain(input.value);
      if (!n.ok) {
        err.textContent = n.error;
        input.classList.add('invalid');
        return;
      }
      if (model.settings.sites.some((s) => s.domain === n.domain)) {
        err.textContent = n.domain + ' is already on your list.';
        input.classList.add('invalid');
        return;
      }
      if (model.settings.sites.length >= STILL.LIMITS.maxSites) {
        err.textContent = 'You have reached the maximum number of websites.';
        return;
      }
      if (opts.requestOnAdd) requestAccess([n.domain]);
      err.textContent = '';
      input.classList.remove('invalid');
      input.value = '';
      model.update((d) => {
        d.sites.push({ id: U.uid('site'), domain: n.domain, label: n.domain, enabled: true, preset: null });
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustom();
    });
    input.addEventListener('input', () => {
      err.textContent = '';
      input.classList.remove('invalid');
    });
    const addRow = h(
      'div',
      null,
      h('div', { class: 'row' }, h('div', { class: 'grow' }, input), h('button', { class: 'btn primary', type: 'button', onclick: addCustom }, ui.icon('plus', 'sm'), 'Add website')),
      err
    );

    /* list */
    const list = h('div', { class: 'list' });
    function renderList() {
      ui.empty(list);
      const sites = model.settings.sites;
      if (!sites.length) {
        list.appendChild(h('div', { class: 'list-empty', text: 'No websites yet. Pick a few above or add your own.' }));
        return;
      }
      sites.forEach((site) => {
        const granted = access.get(site.domain);
        if (editing === site.id) {
          const ed = h('input', { class: 'input', value: site.domain, 'aria-label': 'Edit website', spellcheck: 'false' });
          const e2 = h('div', { class: 'field-error' });
          const save = () => {
            const n = U.normalizeDomain(ed.value);
            if (!n.ok) {
              e2.textContent = n.error;
              ed.classList.add('invalid');
              return;
            }
            if (n.domain !== site.domain && sites.some((s) => s.domain === n.domain)) {
              e2.textContent = 'Already on your list.';
              return;
            }
            if (n.domain !== site.domain && opts.requestOnAdd) requestAccess([n.domain]);
            editing = null;
            model.update((d) => {
              const t = d.sites.find((s) => s.id === site.id);
              if (t) {
                if (t.label === t.domain || t.preset) t.label = n.domain;
                t.domain = n.domain;
                t.preset = null;
              }
            });
          };
          ed.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              editing = null;
              renderList();
            }
          });
          list.appendChild(
            h(
              'div',
              { class: 'list-row' },
              h('div', { class: 'grow' }, ed, e2),
              h('button', { class: 'btn sm green', type: 'button', onclick: save }, 'Save'),
              h('button', { class: 'btn sm ghost', type: 'button', onclick: () => ((editing = null), renderList()) }, 'Cancel')
            )
          );
          setTimeout(() => ed.focus(), 0);
          return;
        }
        const tog = ui.toggle({
          checked: site.enabled,
          small: true,
          label: 'Show STILL. on ' + site.domain,
          onChange: (v) => {
            if (v && opts.requestOnAdd && !granted) requestAccess([site.domain]);
            model.update((d) => {
              const t = d.sites.find((s) => s.id === site.id);
              if (t) t.enabled = v;
            });
          }
        });
        const status =
          granted === undefined || !hasPerms()
            ? null
            : granted
              ? h('span', { class: 'tag green' }, 'Access granted')
              : h(
                  'button',
                  { class: 'btn sm soft', type: 'button', onclick: () => requestAccess([site.domain]), title: 'Allow STILL. to display its overlay on this site' },
                  ui.icon('key', 'sm'),
                  'Allow access'
                );
        const budget = opts.budgets
          ? ui.select({
              label: 'Daily plan for ' + site.domain,
              value: String(site.budgetMin || 0),
              options: [0, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => ({ value: String(v), label: v ? v + ' min / day' : 'No daily plan' })),
              onChange: (v) => model.update((d) => void (d.sites.find((x) => x.id === site.id).budgetMin = Number(v)))
            })
          : null;
        if (budget) {
          budget.style.width = 'auto';
          budget.style.height = '32px';
          budget.title = 'A gentle check-in appears once you reach this much time on the site today';
        }
        list.appendChild(
          h(
            'div',
            { class: 'list-row' + (site.enabled ? '' : ' off') },
            tog,
            h('div', { class: 'grow' }, h('div', { class: 'dom-name', style: { fontWeight: 600 }, text: site.label !== site.domain ? site.label : site.domain }), site.label !== site.domain ? h('div', { class: 'muted small', text: site.domain }) : null),
            opts.showAccess === false ? null : status,
            budget,
            h(
              'div',
              { class: 'actions' },
              h('button', { class: 'icon-btn', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + site.domain, onclick: () => ((editing = site.id), renderList()) }, ui.icon('edit')),
              h(
                'button',
                {
                  class: 'icon-btn danger',
                  type: 'button',
                  title: 'Remove',
                  'aria-label': 'Remove ' + site.domain,
                  onclick: () => model.update((d) => void (d.sites = d.sites.filter((s) => s.id !== site.id)))
                },
                ui.icon('trash')
              )
            )
          )
        );
      });
    }

    root.append(
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Popular' }), presetGrid),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Add any website' }), addRow),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Your websites' }), list)
    );
    renderPresets();
    renderList();
    refreshAccess();
    model.subscribe((n, p) => {
      if (JSON.stringify(n.sites) === JSON.stringify(p.sites)) return;
      renderPresets();
      renderList();
      refreshAccess();
    });
    if (hasPerms()) {
      chrome.permissions.onAdded.addListener(refreshAccess);
      chrome.permissions.onRemoved.addListener(refreshAccess);
      model.onDispose(() => {
        chrome.permissions.onAdded.removeListener(refreshAccess);
        chrome.permissions.onRemoved.removeListener(refreshAccess);
      });
    }
    root.requestAccess = requestAccess;
    root.missingAccess = () => model.settings.sites.filter((s) => s.enabled && access.get(s.domain) !== true).map((s) => s.domain);
    return root;
  };

  /* =================================================================
   * Animation styles
   * ================================================================= */
  function miniStatic(id) {
    const P = (x, y, w, o, em, extra) =>
      h('span', { class: 'm-pill ' + (extra || ''), style: { left: x + '%', top: y + '%', width: w + 'px', opacity: o } }, em ? h('i', { text: em }) : null, h('b'));
    const E = (x, y, em, s, o) => h('span', { class: 'm-emoji', style: { left: x + '%', top: y + '%', fontSize: (s || 16) + 'px', opacity: o == null ? 1 : o }, text: em });
    switch (id) {
      case 'live-reaction':
        return [P(46, 66, 96, 1, '🌱'), P(52, 40, 84, 0.7, '✨'), P(44, 15, 90, 0.35, '💚')];
      case 'floating-emojis':
        return [E(20, 64, '🌱', 20), E(40, 40, '✨', 16, 0.8), E(62, 70, '🚀', 18), E(76, 30, '💚', 15, 0.55), E(30, 16, '🌻', 13, 0.35)];
      case 'bubbles':
        return [P(14, 56, 112, 1, null, 'tail'), P(44, 18, 90, 0.55, null, 'tail')];
      case 'particle':
        return [P(8, 18, 60, 0.9, null, 'tiny'), P(52, 44, 70, 0.6, null, 'tiny'), P(18, 70, 54, 0.4, null, 'tiny')];
      case 'side-float':
        return [P(40, 30, 104, 1, null, 'bar'), P(56, 62, 80, 0.45, null, 'bar')];
      case 'gentle-fade':
        return [h('span', { class: 'm-card' }, h('b'), h('b', { class: 's' }))];
      case 'rising-hearts':
        return [E(46, 66, '❤️', 18), E(38, 44, '💚', 15, 0.85), E(56, 36, '✨', 14, 0.7), E(44, 20, '⭐', 12, 0.45), E(60, 58, '💫', 13, 0.8)];
      default:
        return [P(10, 60, 84, 1, '🌱'), E(70, 66, '✨', 18), P(40, 22, 70, 0.5, null, 'tiny'), E(30, 28, '💚', 14, 0.6)];
    }
  }

  function demoWaveFor(styleId, settings) {
    const msgs = STILL.messageEngine.messagePool(settings);
    const texts = U.shuffle(msgs.length ? msgs : STILL.DEFAULT_MESSAGES)
      .slice(0, 2)
      .map((m) => ({ text: m.text, emoji: U.pick(settings.emoji.selected) || '', personal: !!m.custom }));
    const emojis = Array.from({ length: 5 }, () => U.pick(settings.emoji.selected.length ? settings.emoji.selected : STILL.EMOJI_LIBRARY));
    const style = STILL.ANIMATION_STYLES.find((s) => s.id === styleId);
    if (style.kind === 'mix') {
      return { textStyle: U.pick(STILL.messageEngine.TEXT_STYLES), emojiStyle: U.pick(STILL.messageEngine.EMOJI_STYLES), texts: texts.slice(0, 1), emojis: emojis.slice(0, 3) };
    }
    if (style.kind === 'emoji') {
      return { textStyle: 'live-reaction', emojiStyle: styleId, texts: [], emojis: styleId === 'rising-hearts' ? STILL.HEART_EMOJIS.slice(0, 6) : emojis };
    }
    return { textStyle: styleId, emojiStyle: 'floating-emojis', texts: styleId === 'gentle-fade' ? texts.slice(0, 1) : texts, emojis: [] };
  }

  function miniSettings(s) {
    const m = STILL.clone(s);
    m.appearance.fontSize = 10;
    m.appearance.maxWidth = 150;
    m.appearance.emojiSize = 17;
    m.appearance.position = 'spread';
    m.appearance.radius = Math.min(m.appearance.radius, 12);
    m.timing.durationMinSec = 2.6;
    m.timing.durationMaxSec = 3.2;
    m.timing.maxSimultaneous = 3;
    m.general.showDock = false;
    return m;
  }

  /** opts.onPreview(): play the large preview */
  C.stylePicker = function stylePicker(model, opts) {
    opts = opts || {};
    const grid = h('div', { class: 'style-grid' });
    const tiles = new Map();
    STILL.ANIMATION_STYLES.forEach((style) => {
      const mini = h('div', { class: 'mini' }, h('div', { class: 'm-static' }, miniStatic(style.id)));
      const tile = h(
        'button',
        { type: 'button', class: 'tile style-tile', 'aria-pressed': 'false', 'aria-label': style.label },
        mini,
        h('div', { class: 'meta' }, h('div', { class: 'name', text: style.label }), h('div', { class: 'desc', text: style.desc })),
        h('span', { class: 'check' }, ui.icon('check'))
      );
      let ov = null;
      let loopT = null;
      const start = () => {
        if (!ov) ov = STILL.createOverlay({ mount: mini });
        ov.configure(miniSettings(model.settings));
        mini.classList.add('live');
        const loop = () => {
          ov.playWave(demoWaveFor(style.id, model.settings));
          loopT = setTimeout(loop, 1900);
        };
        clearTimeout(loopT);
        loop();
      };
      const stop = () => {
        clearTimeout(loopT);
        mini.classList.remove('live');
        if (ov) ov.clear();
      };
      tile.addEventListener('mouseenter', start);
      tile.addEventListener('focus', start);
      tile.addEventListener('mouseleave', stop);
      tile.addEventListener('blur', stop);
      tile.addEventListener('click', () => {
        model.update((d) => {
          const set = new Set(d.animation.styles);
          if (set.has(style.id)) {
            if (set.size > 1) set.delete(style.id);
            else ui.toast('Keep at least one style selected', 'info');
          } else set.add(style.id);
          d.animation.styles = STILL.ANIMATION_STYLES.map((s) => s.id).filter((id) => set.has(id));
        });
      });
      tiles.set(style.id, tile);
      grid.appendChild(tile);
    });

    const paint = () => tiles.forEach((t, id) => t.setAttribute('aria-pressed', String(model.settings.animation.styles.includes(id))));
    paint();
    model.subscribe(paint);

    const rotation = ui.bind(model, 'animation.rotation', ui.segmented, {
      label: 'Style rotation',
      options: [
        { value: 'natural', label: 'Natural shuffle' },
        { value: 'sequential', label: 'In order' }
      ]
    });

    const summary = h('div', { class: 'muted small' });
    const paintSummary = () => {
      const n = model.settings.animation.styles.length;
      summary.textContent = model.settings.animation.styles.includes('random-mix')
        ? 'Random Mix is on — every wave picks its own look.'
        : n === 1
          ? 'One style selected.'
          : n + ' styles selected — STILL. rotates between them naturally.';
    };
    paintSummary();
    model.subscribe(paintSummary);

    return h(
      'div',
      { class: 'stack', style: { gap: '16px' } },
      grid,
      h(
        'div',
        { class: 'row between', style: { flexWrap: 'wrap' } },
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, rotation, summary),
        opts.onPreview ? h('button', { class: 'btn soft', type: 'button', onclick: opts.onPreview }, ui.icon('play', 'sm'), 'Preview animation') : null
      )
    );
  };

  /* =================================================================
   * Emojis
   * ================================================================= */
  /* =================================================================
   * Emojis — realistic 3D library, your own images, custom emoji
   * ================================================================= */
  C.emojiEditor = function emojiEditor(model, opts) {
    opts = opts || {};
    const wrap = h('div', { class: 'stack', style: { gap: '18px' } });
    const groupsBox = h('div', { class: 'stack', style: { gap: '16px' } });
    let images = [];

    const toggleToken = (tok) =>
      model.update((d) => {
        const s = new Set(d.emoji.selected);
        s.has(tok) ? s.delete(tok) : s.add(tok);
        d.emoji.selected = Array.from(s);
      });

    function tile(tok, label, extra) {
      const sel = model.settings.emoji.selected.includes(tok);
      const art = STILL.media.node(tok, 30, model.settings) || h('span', { text: '?' });
      const t = h(
        'button',
        {
          type: 'button',
          class: 'tile emoji-tile' + (extra && extra.cls ? ' ' + extra.cls : ''),
          'aria-pressed': String(sel),
          title: label,
          'aria-label': (sel ? 'Deselect ' : 'Select ') + label,
          onclick: () => toggleToken(tok)
        },
        art,
        h('span', { class: 'check' }, ui.icon('check'))
      );
      if (extra && extra.onRemove) {
        const rm = h('span', { class: 'remove', role: 'button', title: 'Remove', 'aria-label': 'Remove ' + label }, ui.icon('x'));
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          extra.onRemove();
        });
        t.appendChild(rm);
      }
      return t;
    }

    function section(label, tiles, aside) {
      return h(
        'div',
        null,
        h('div', { class: 'row between', style: { marginBottom: '8px' } }, h('div', { class: 'eyebrow', text: label }), aside || null),
        h('div', { class: 'emoji-grid' }, tiles)
      );
    }

    function render() {
      ui.empty(groupsBox);
      // your images first: they are the most personal reactions
      const imgTiles = images.map((a) => tile('img:' + a.id, a.name || 'My image', { cls: 'is-image' }));
      const addTile = h(
        'button',
        {
          type: 'button',
          class: 'tile emoji-tile add-tile',
          title: 'Add your own image',
          'aria-label': 'Add your own image',
          onclick: () => STILL.studio && STILL.studio.openEditor(model, { asReaction: true })
        },
        ui.icon('plus')
      );
      groupsBox.appendChild(
        section('My images', imgTiles.concat([addTile]), h('span', { class: 'muted small', text: images.length ? 'Your photos, logos and stickers' : 'Upload a photo, logo or sticker' }))
      );
      STILL.EMOJI_GROUPS.forEach((g) => {
        const tiles = STILL.EMOJI_SET.filter((e) => e.group === g.id).map((e) => tile(e.char, e.name));
        groupsBox.appendChild(section(g.label, tiles));
      });
      const custom = model.settings.emoji.custom.filter((e) => !STILL.EMOJI_LIBRARY.includes(e));
      if (custom.length) {
        groupsBox.appendChild(
          section(
            'Added by you',
            custom.map((em) =>
              tile(em, em, {
                onRemove: () =>
                  model.update((d) => {
                    d.emoji.custom = d.emoji.custom.filter((x) => x !== em);
                    d.emoji.selected = d.emoji.selected.filter((x) => x !== em);
                  })
              })
            )
          )
        );
      }
    }

    STILL.media.list().then((list) => {
      images = list;
      render();
    });
    const offMedia = STILL.media.onChange(() =>
      STILL.media.list().then((list) => {
        images = list;
        render();
      })
    );
    model.onDispose(offMedia);
    model.subscribe((n, p) => {
      if (JSON.stringify(n.emoji) !== JSON.stringify(p.emoji)) render();
    });

    /* look switch */
    const look = ui.bind(model, 'emoji.realistic', ui.segmented, {
      label: 'Emoji look',
      options: [
        { value: true, label: 'Realistic 3D' },
        { value: false, label: 'System emoji' }
      ]
    });

    const count = h('span', { class: 'muted small' });
    const paintCount = () => {
      const n = model.settings.emoji.selected.length;
      count.textContent = n ? n + ' selected' : 'None selected — waves will be text only';
    };
    paintCount();
    model.subscribe(paintCount);

    const bulk = h(
      'div',
      { class: 'row', style: { gap: '4px' } },
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => model.patch('emoji.selected', STILL.EMOJI_LIBRARY.concat(model.settings.emoji.custom, images.map((a) => 'img:' + a.id))) }, 'Select all'),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => model.patch('emoji.selected', []) }, 'Clear')
    );

    /* custom unicode emoji */
    const input = h('input', { class: 'input', type: 'text', placeholder: 'Paste any emoji, e.g. 🌊', 'aria-label': 'Add emoji', style: { maxWidth: '240px' }, autocomplete: 'off' });
    const err = h('div', { class: 'field-error', role: 'alert' });
    const add = () => {
      const em = U.cleanEmoji(input.value);
      if (!em) {
        err.textContent = 'Please enter a single emoji.';
        input.classList.add('invalid');
        return;
      }
      if (model.settings.emoji.custom.length >= STILL.LIMITS.maxCustomEmojis) {
        err.textContent = 'Your emoji collection is full.';
        return;
      }
      err.textContent = '';
      input.classList.remove('invalid');
      input.value = '';
      model.update((d) => {
        if (!STILL.EMOJI_LIBRARY.includes(em) && !d.emoji.custom.includes(em)) d.emoji.custom.push(em);
        if (!d.emoji.selected.includes(em)) d.emoji.selected.push(em);
      });
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    input.addEventListener('input', () => {
      err.textContent = '';
      input.classList.remove('invalid');
    });

    const settingsCard = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Emoji-only reactions', 'Allow gentle waves made only of emojis, without a sentence.', ui.bind(model, 'emoji.emojiOnlyReactions', ui.toggle, { label: 'Emoji-only reactions' })),
      ui.field(
        'Emoji frequency',
        'How many reactions float up with each appearance. Separate from your messages.',
        ui.bind(model, 'emoji.emojisPerWave', ui.slider, { min: 0, max: 12, step: 1, label: 'Emojis per appearance', format: (v) => (v === 0 ? 'None' : v + ' per wave') })
      ),
      ui.field('Emoji speed', 'Relative to the overall animation speed.', ui.bind(model, 'emoji.speed', ui.slider, { min: 0.5, max: 2, step: 0.1, label: 'Emoji speed', format: (v) => (v === 1 ? 'Normal' : v.toFixed(1) + '×') }))
    );

    wrap.append(
      h('div', { class: 'row between', style: { flexWrap: 'wrap', gap: '10px' } }, h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } }, look, count), bulk),
      groupsBox,
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' }, text: 'Any other emoji' }), h('div', { class: 'row', style: { alignItems: 'flex-start' } }, input, h('button', { class: 'btn', type: 'button', onclick: add }, ui.icon('plus', 'sm'), 'Add')), err),
      settingsCard,
      h('div', null, h('div', { class: 'eyebrow', style: { margin: '6px 0 10px' }, text: 'Size & giant reactions' }), C.emojiSizeForm(model))
    );
    void opts;
    return wrap;
  };

  /* =================================================================
   * Motivation messages
   * ================================================================= */
  C.messageManager = function messageManager(model, opts) {
    opts = opts || {};
    const L = STILL.LIMITS;
    let filterCol = 'all';
    let filterCat = 'all';
    let editing = null;
    const catLabel = (id) => (STILL.CATEGORIES.find((c) => c.id === id) || { label: id }).label;
    const colName = (id) => (model.settings.messages.collections.find((c) => c.id === id) || { name: '—' }).name;

    /* --- add form --- */
    const ta = h('textarea', { class: 'textarea', maxlength: String(L.messageMaxLength), placeholder: 'e.g. My dream is to become a software engineer. I need to stay focused.', 'aria-label': 'New message', rows: '2' });
    const counter = h('span', { class: 'muted small', text: '0 / ' + L.messageMaxLength });
    ta.addEventListener('input', () => (counter.textContent = ta.value.length + ' / ' + L.messageMaxLength));
    const catSel = ui.select({ label: 'Category', value: 'custom', options: STILL.CATEGORIES.map((c) => ({ value: c.id, label: c.label })) });
    catSel.style.width = 'auto';
    const colOptions = () => model.settings.messages.collections.map((c) => ({ value: c.id, label: c.name }));
    const colSel = ui.select({ label: 'Collection', value: model.settings.messages.collections[0].id, options: colOptions() });
    colSel.style.width = 'auto';
    const addErr = h('div', { class: 'field-error', role: 'alert' });
    const add = () => {
      const text = U.cleanText(ta.value);
      if (!text) {
        addErr.textContent = 'Write a sentence first.';
        return;
      }
      if (model.settings.messages.items.length >= L.maxMessages) {
        addErr.textContent = 'You have reached the message limit (' + L.maxMessages + ').';
        return;
      }
      if (model.settings.messages.items.some((m) => m.text.toLowerCase() === text.toLowerCase())) {
        addErr.textContent = 'That message is already in your list.';
        return;
      }
      addErr.textContent = '';
      ta.value = '';
      counter.textContent = '0 / ' + L.messageMaxLength;
      const cat = catSel.value;
      const col = colSel.value;
      model.update((d) => {
        d.messages.items.unshift({ id: U.uid('m'), text, category: cat, enabled: true, favorite: false, custom: true, collection: col });
        if (!d.messages.categories.includes(cat)) d.messages.categories.push(cat);
      });
      ui.toast('Message added');
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        add();
      }
    });
    const addForm = h(
      'div',
      { class: 'card pad stack', style: { gap: '10px' } },
      ta,
      h(
        'div',
        { class: 'row between', style: { flexWrap: 'wrap' } },
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, catSel, colSel, counter),
        h('button', { class: 'btn primary', type: 'button', onclick: add }, ui.icon('plus', 'sm'), 'Add message')
      ),
      addErr
    );

    /* --- collections bar --- */
    const colBar = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } });
    const colInput = h('input', { class: 'input', placeholder: 'Collection name', maxlength: String(L.collectionNameMax), style: { width: '180px', height: '32px' }, 'aria-label': 'New collection name' });
    let addingCol = false;
    function renderCols() {
      ui.empty(colBar);
      const cols = model.settings.messages.collections;
      const chip = (id, label, count) =>
        h(
          'button',
          { type: 'button', class: 'chip', 'aria-pressed': String(filterCol === id), onclick: () => ((filterCol = id), renderCols(), renderList()) },
          label,
          h('span', { class: 'muted', text: String(count) })
        );
      colBar.appendChild(chip('all', 'All', model.settings.messages.items.length));
      cols.forEach((c) => colBar.appendChild(chip(c.id, c.name, model.settings.messages.items.filter((m) => m.collection === c.id).length)));
      if (addingCol) {
        const save = () => {
          const name = U.cleanText(colInput.value, L.collectionNameMax);
          addingCol = false;
          colInput.value = '';
          if (!name) return renderCols();
          if (cols.length >= L.maxCollections) {
            ui.toast('Collection limit reached', 'info');
            return renderCols();
          }
          const id = U.uid('col');
          filterCol = id;
          model.update((d) => void d.messages.collections.push({ id, name }));
        };
        colInput.onkeydown = (e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            addingCol = false;
            renderCols();
          }
        };
        colBar.append(colInput, h('button', { class: 'btn sm green', type: 'button', onclick: save }, 'Create'));
        setTimeout(() => colInput.focus(), 0);
      } else {
        colBar.appendChild(h('button', { class: 'chip', type: 'button', onclick: () => ((addingCol = true), renderCols()) }, ui.icon('plus', 'sm'), 'New collection'));
      }
      if (filterCol !== 'all') {
        const col = cols.find((c) => c.id === filterCol);
        if (col) {
          colBar.appendChild(
            h(
              'button',
              {
                class: 'btn sm ghost',
                type: 'button',
                onclick: () => {
                  const name = U.cleanText(prompt('Rename collection', col.name) || '', L.collectionNameMax);
                  if (name) model.update((d) => void (d.messages.collections.find((c) => c.id === col.id).name = name));
                }
              },
              ui.icon('edit', 'sm'),
              'Rename'
            )
          );
          if (cols.length > 1) {
            colBar.appendChild(
              h(
                'button',
                {
                  class: 'btn sm ghost danger',
                  type: 'button',
                  onclick: () => {
                    if (!confirm('Delete "' + col.name + '"? Its messages move to another collection.')) return;
                    filterCol = 'all';
                    model.update((d) => {
                      d.messages.collections = d.messages.collections.filter((c) => c.id !== col.id);
                      const fallback = d.messages.collections[0].id;
                      d.messages.items.forEach((m) => {
                        if (m.collection === col.id) m.collection = fallback;
                      });
                      if (d.messages.activeCollection === col.id) d.messages.activeCollection = 'all';
                    });
                  }
                },
                ui.icon('trash', 'sm'),
                'Delete collection'
              )
            );
          }
        }
      }
    }

    const catFilter = ui.select({
      label: 'Filter by category',
      value: 'all',
      options: [{ value: 'all', label: 'All categories' }].concat(STILL.CATEGORIES.map((c) => ({ value: c.id, label: c.label }))),
      onChange: (v) => {
        filterCat = v;
        renderList();
      }
    });
    catFilter.style.width = 'auto';
    catFilter.style.height = '32px';

    /* --- list --- */
    const list = h('div', { class: 'list' });
    function renderList() {
      ui.empty(list);
      const items = model.settings.messages.items.filter(
        (m) => (filterCol === 'all' || m.collection === filterCol) && (filterCat === 'all' || m.category === filterCat)
      );
      if (!model.settings.messages.items.length) {
        list.appendChild(h('div', { class: 'list-empty', text: 'Your message list is empty. STILL. will use a gentle default until you add one.' }));
        return;
      }
      if (!items.length) {
        list.appendChild(h('div', { class: 'list-empty', text: 'No messages match this filter.' }));
        return;
      }
      items.forEach((m) => {
        if (editing === m.id) {
          const et = h('textarea', { class: 'textarea', maxlength: String(L.messageMaxLength), rows: '2', 'aria-label': 'Edit message' });
          et.value = m.text;
          const ec = ui.select({ label: 'Category', value: m.category, options: STILL.CATEGORIES.map((c) => ({ value: c.id, label: c.label })) });
          const eco = ui.select({ label: 'Collection', value: m.collection, options: colOptions() });
          ec.style.width = eco.style.width = 'auto';
          ec.style.height = eco.style.height = '32px';
          const save = () => {
            const text = U.cleanText(et.value);
            if (!text) return;
            editing = null;
            model.update((d) => {
              const t = d.messages.items.find((x) => x.id === m.id);
              if (t) {
                if (t.text !== text) t.custom = true;
                t.text = text;
                t.category = ec.value;
                t.collection = eco.value;
              }
              if (!d.messages.categories.includes(ec.value)) d.messages.categories.push(ec.value);
            });
          };
          et.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              editing = null;
              renderList();
            }
          });
          list.appendChild(
            h(
              'div',
              { class: 'list-row', style: { alignItems: 'flex-start', flexDirection: 'column', gap: '8px' } },
              et,
              h(
                'div',
                { class: 'row between', style: { width: '100%' } },
                h('div', { class: 'row', style: { gap: '8px' } }, ec, eco),
                h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn sm ghost', type: 'button', onclick: () => ((editing = null), renderList()) }, 'Cancel'), h('button', { class: 'btn sm green', type: 'button', onclick: save }, 'Save'))
              )
            )
          );
          setTimeout(() => et.focus(), 0);
          return;
        }
        const tog = ui.toggle({
          checked: m.enabled,
          small: true,
          label: 'Use this message',
          onChange: (v) => model.update((d) => void (d.messages.items.find((x) => x.id === m.id).enabled = v))
        });
        list.appendChild(
          h(
            'div',
            { class: 'list-row' + (m.enabled ? '' : ' off') },
            tog,
            h(
              'div',
              { class: 'text' },
              h('div', { text: m.text }),
              h(
                'div',
                { class: 'meta' },
                h('span', { class: 'tag', text: catLabel(m.category) }),
                model.settings.messages.collections.length > 1 ? h('span', { class: 'tag sand', text: colName(m.collection) }) : null,
                m.custom ? h('span', { class: 'tag green', text: 'Yours' }) : null
              )
            ),
            h(
              'div',
              { class: 'actions' },
              h(
                'button',
                {
                  class: 'icon-btn' + (m.favorite ? ' on' : ''),
                  type: 'button',
                  title: m.favorite ? 'Unfavourite' : 'Favourite (shown more often)',
                  'aria-pressed': String(m.favorite),
                  'aria-label': 'Favourite',
                  onclick: () => model.update((d) => void (d.messages.items.find((x) => x.id === m.id).favorite = !m.favorite))
                },
                (() => {
                  const ic = ui.icon('star');
                  if (m.favorite) ic.style.fill = 'currentColor';
                  return ic;
                })()
              ),
              h('button', { class: 'icon-btn', type: 'button', title: 'Edit', 'aria-label': 'Edit message', onclick: () => ((editing = m.id), renderList()) }, ui.icon('edit')),
              h(
                'button',
                { class: 'icon-btn danger', type: 'button', title: 'Delete', 'aria-label': 'Delete message', onclick: () => model.update((d) => void (d.messages.items = d.messages.items.filter((x) => x.id !== m.id))) },
                ui.icon('trash')
              )
            )
          )
        );
      });
    }

    const poolWarn = h('div', { class: 'notice warn', hidden: true }, ui.icon('info'), h('span', { text: '' }));
    function paintWarn() {
      const n = STILL.messageEngine.messagePool(model.settings).length;
      poolWarn.hidden = n > 0;
      poolWarn.lastChild.textContent = 'No messages are currently active (check toggles, categories and the active collection). STILL. will show “' + STILL.FALLBACK_MESSAGE + '” until you enable some.';
    }

    renderCols();
    renderList();
    paintWarn();
    model.subscribe((n, p) => {
      if (JSON.stringify(n.messages) === JSON.stringify(p.messages)) return;
      if (filterCol !== 'all' && !n.messages.collections.some((c) => c.id === filterCol)) filterCol = 'all';
      colSel.setOptions(colOptions(), n.messages.collections.some((c) => c.id === colSel.value) ? colSel.value : n.messages.collections[0].id);
      renderCols();
      renderList();
      paintWarn();
    });

    /* --- behaviour settings --- */
    const activeCol = ui.select({
      label: 'Active collection',
      value: model.settings.messages.activeCollection,
      options: [{ value: 'all', label: 'All collections' }].concat(colOptions()),
      onChange: (v) => model.patch('messages.activeCollection', v)
    });
    model.subscribe((s) => activeCol.setOptions([{ value: 'all', label: 'All collections' }].concat(colOptions()), s.messages.activeCollection));
    activeCol.style.width = 'auto';

    const catChips = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' } });
    const paintCats = () => {
      ui.empty(catChips);
      STILL.CATEGORIES.forEach((c) =>
        catChips.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-pressed': String(model.settings.messages.categories.includes(c.id)),
              onclick: () =>
                model.update((d) => {
                  const s = new Set(d.messages.categories);
                  s.has(c.id) ? s.delete(c.id) : s.add(c.id);
                  d.messages.categories = STILL.CATEGORIES.map((x) => x.id).filter((id) => s.has(id));
                })
            },
            c.label
          )
        )
      );
    };
    paintCats();
    model.subscribe(paintCats);

    const rotation = ui.bind(model, 'messages.rotation', ui.segmented, {
      label: 'Message rotation',
      options: [
        { value: 'random', label: 'Random' },
        { value: 'sequential', label: 'Sequential' }
      ]
    });

    const behaviour = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Rotation', 'Random never repeats a sentence too soon. Sequential walks through your list in order.', rotation),
      ui.field('Prioritise my own messages', 'Sentences you wrote appear about three times as often. Favourites appear twice as often.', ui.bind(model, 'messages.preferCustom', ui.toggle, { label: 'Prioritise my messages' })),
      opts.compact ? null : ui.field('Active collection', 'Only messages from this collection will appear.', activeCol),
      opts.compact ? null : ui.field('Categories', 'Turn whole categories on or off.', catChips),
      opts.compact
        ? null
        : ui.field('Avoid repeats', 'How many recent sentences must pass before one can return.', ui.bind(model, 'messages.noRepeatWindow', ui.slider, { min: 0, max: 20, step: 1, label: 'No-repeat window', format: (v) => (v ? v + ' messages' : 'Off') })),
      opts.compact ? null : ui.field('Short focus nudges', 'Occasionally mix in tiny phrases like “Breathe.” or “Back to it?”.', ui.bind(model, 'messages.focusNudges', ui.toggle, { label: 'Focus nudges' }))
    );

    return h(
      'div',
      { class: 'stack', style: { gap: '18px' } },
      addForm,
      poolWarn,
      h('div', { class: 'row between', style: { flexWrap: 'wrap', gap: '10px' } }, colBar, catFilter),
      list,
      behaviour
    );
  };

  /* =================================================================
   * Timing & frequency
   * ================================================================= */
  C.timingForm = function timingForm(model, opts) {
    opts = opts || {};
    const fmtMin = (v) => (v === 0 ? 'Right away' : U.formatMinutes(v));

    // Any manual change to a frequency field marks the preset as "custom".
    const bindT = (path, factory, extra) => {
      const ctrl = factory(
        Object.assign({}, extra, {
          value: model.get(path),
          checked: model.get(path),
          onChange: (v) =>
            model.update((d) => {
              const next = U.setPath(d, path, v);
              if (extra && extra.freq) next.timing.frequency = 'custom';
              if (path === 'timing.durationMinSec' && next.timing.durationMaxSec < v) next.timing.durationMaxSec = v;
              if (path === 'timing.durationMaxSec' && next.timing.durationMinSec > v) next.timing.durationMinSec = v;
              return next;
            })
        })
      );
      model.subscribe((s) => ctrl.setValue(U.getPath(s, path)));
      return ctrl;
    };

    const presets = ui.segmented({
      label: 'Frequency',
      value: model.settings.timing.frequency,
      options: Object.entries(STILL.FREQUENCY_PRESETS)
        .map(([value, p]) => ({ value, label: p.label }))
        .concat([{ value: 'custom', label: 'Custom' }]),
      onChange: (v) => {
        const p = STILL.FREQUENCY_PRESETS[v];
        if (!p) return model.patch('timing.frequency', 'custom');
        model.update((d) => {
          d.timing.frequency = v;
          d.timing.intervalMin = p.intervalMin;
          d.timing.messagesPerWave = p.messagesPerWave;
          d.emoji.emojisPerWave = p.emojisPerWave;
        });
      }
    });
    model.subscribe((s) => presets.setValue(s.timing.frequency));

    const summary = h('div', { class: 'notice' }, ui.icon('clock'), h('span'));
    const paintSummary = () => {
      const t = model.settings.timing;
      const s = model.settings;
      const parts = [];
      parts.push(t.initialDelayMin ? 'Nothing for the first ' + U.formatMinutes(t.initialDelayMin) + '.' : 'Starts right away.');
      parts.push('Then every ' + U.formatMinutes(t.intervalMin) + ': ' + (t.messagesPerWave || 'no') + ' message' + (t.messagesPerWave === 1 ? '' : 's') + ' and ' + (s.emoji.emojisPerWave || 'no') + ' emoji' + (s.emoji.emojisPerWave === 1 ? '' : 's') + '.');
      if (s.general.escalation) parts.push('A gentle check-in after ' + U.formatMinutes(t.reminderAfterMin) + '.');
      summary.lastChild.textContent = parts.join(' ');
    };
    paintSummary();
    model.subscribe(paintSummary);

    const card = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Frequency', 'Quick presets. Adjusting any slider below switches to Custom.', presets),
      ui.field('Initial delay', 'Quiet time on a site before the first appearance.', bindT('timing.initialDelayMin', ui.slider, { min: 0, max: 60, step: 0.5, label: 'Initial delay', format: fmtMin })),
      ui.field('Interval', 'Time between appearances.', bindT('timing.intervalMin', ui.slider, { min: 0.5, max: 30, step: 0.5, label: 'Interval', format: U.formatMinutes, freq: true })),
      ui.field('Messages per appearance', 'Sentences in each wave.', bindT('timing.messagesPerWave', ui.slider, { min: 0, max: 5, step: 1, label: 'Messages per appearance', format: (v) => (v ? String(v) : 'Emojis only'), freq: true })),
      ui.field('Emojis per appearance', 'Controlled separately from messages.', bindT('emoji.emojisPerWave', ui.slider, { min: 0, max: 12, step: 1, label: 'Emojis per appearance', format: (v) => (v ? String(v) : 'None'), freq: true })),
      ui.field('Max on screen at once', 'Upper limit for floating messages at the same time.', bindT('timing.maxSimultaneous', ui.slider, { min: 1, max: 6, step: 1, label: 'Maximum simultaneous messages' })),
      ui.field('Shortest animation', null, bindT('timing.durationMinSec', ui.slider, { min: 3, max: 15, step: 0.5, label: 'Shortest animation', format: (v) => v + ' sec' })),
      ui.field('Longest animation', 'Each message picks a duration in this range.', bindT('timing.durationMaxSec', ui.slider, { min: 3, max: 15, step: 0.5, label: 'Longest animation', format: (v) => v + ' sec' })),
      ui.field('Pause in background tabs', 'Only count time while the tab is visible.', bindT('timing.pauseWhenInactive', ui.toggle, { label: 'Pause when tab inactive' })),
      opts.compact
        ? null
        : ui.field('New session after', 'Time away from a site before its session clock starts over.', bindT('timing.sessionResetMin', ui.slider, { min: 5, max: 240, step: 5, label: 'Session reset', format: U.formatMinutes })),
      ui.field('Gentle escalation', 'First a few reactions, then a sentence, later a soft check-in card.', bindT('general.escalation', ui.toggle, { label: 'Gentle escalation' })),
      ui.field('Check-in after', 'When the slightly more noticeable reminder may appear.', bindT('timing.reminderAfterMin', ui.slider, { min: 5, max: 120, step: 5, label: 'Check-in after', format: U.formatMinutes })),
      opts.compact ? null : ui.field('Repeat check-in every', null, bindT('timing.reminderRepeatMin', ui.slider, { min: 5, max: 120, step: 5, label: 'Repeat check-in', format: U.formatMinutes }))
    );
    return h('div', { class: 'stack', style: { gap: '14px' } }, summary, card);
  };

  /* =================================================================
   * Appearance
   * ================================================================= */
  C.appearanceForm = function appearanceForm(model) {
    const presetRow = h('div', { class: 'style-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } });
    function renderPresets() {
      ui.empty(presetRow);
      Object.entries(STILL.APPEARANCE_PRESETS).forEach(([id, p]) => {
        const sample = h(
          'div',
          {
            class: 'preset-sample',
            style: {
              background:
                id === 'transparent' || id === 'glass'
                  ? 'repeating-linear-gradient(45deg,#e9efe9 0 6px,#fafaf8 6px 12px)'
                  : id === 'midnight' || id === 'aurora' || id === 'tough'
                    ? '#2a2f2c'
                    : '#f6f5f0'
            }
          },
          h(
            'span',
            {
              class: 'preset-bubble',
              style: {
                background: hexA(p.bubbleBg, p.opacity),
                color: p.textColor,
                fontFamily: STILL.FONT_STACKS[p.font] || 'var(--font)',
                fontWeight: String(p.fontWeight || 500),
                textTransform: p.uppercase ? 'uppercase' : 'none',
                boxShadow: p.shadow ? '0 6px 16px -8px rgba(0,0,0,.35)' : '0 0 0 1px rgba(0,0,0,.08)',
                backdropFilter: p.glass ? 'blur(8px)' : null
              }
            },
            (() => {
              const i = h('i', { style: { background: hexA(p.accent, 0.15) } });
              const art = STILL.media ? STILL.media.node('🌱', 16, model.settings) : null;
              if (art) i.appendChild(art);
              else i.textContent = '🌱';
              return i;
            })(),
            'Make today count.'
          )
        );
        presetRow.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'tile style-tile',
              'aria-pressed': String(model.settings.appearance.preset === id),
              onclick: () =>
                model.update((d) => {
                  Object.assign(d.appearance, { preset: id, bubbleBg: p.bubbleBg, textColor: p.textColor, accent: p.accent, opacity: p.opacity, shadow: p.shadow, font: p.font, glass: !!p.glass, fontWeight: p.fontWeight || 500, uppercase: !!p.uppercase });
                })
            },
            sample,
            h('div', { class: 'meta' }, h('div', { class: 'name', text: p.label }), id === 'minimal-white' ? h('div', { class: 'desc', text: 'Default' }) : null),
            h('span', { class: 'check' }, ui.icon('check'))
          )
        );
      });
    }
    renderPresets();
    model.subscribe((n, p) => n.appearance.preset !== p.appearance.preset && renderPresets());

    // Manual tweaks to look-related fields switch the preset to "custom".
    const LOOK = ['bubbleBg', 'textColor', 'accent', 'opacity', 'shadow', 'font', 'glass'];
    const bindA = (key, factory, extra) => {
      const path = 'appearance.' + key;
      const ctrl = factory(
        Object.assign({}, extra, {
          value: model.get(path),
          checked: model.get(path),
          onChange: (v) =>
            model.update((d) => {
              d.appearance[key] = v;
              if (LOOK.includes(key)) d.appearance.preset = 'custom';
            })
        })
      );
      model.subscribe((s) => ctrl.setValue(s.appearance[key]));
      return ctrl;
    };

    const look = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Bubble background', null, bindA('bubbleBg', ui.color, { label: 'Bubble background' })),
      ui.field('Text colour', null, bindA('textColor', ui.color, { label: 'Text colour' })),
      ui.field('Accent', 'Used for emoji circles, personal-message dots and buttons.', bindA('accent', ui.color, { label: 'Accent colour' })),
      ui.field('Bubble opacity', null, bindA('opacity', ui.slider, { min: 0.3, max: 1, step: 0.01, label: 'Bubble opacity', format: (v) => Math.round(v * 100) + '%' })),
      ui.field('Soft shadow', null, bindA('shadow', ui.toggle, { label: 'Soft shadow' })),
      ui.field('Frosted glass', 'Blurs what is behind each bubble. Looks best with lower opacity.', bindA('glass', ui.toggle, { label: 'Frosted glass' })),
      ui.field(
        'Bubble icon',
        'What sits beside each message. “My logo” uses the logo you set in Studio.',
        bindA('bubbleIcon', ui.segmented, {
          label: 'Bubble icon',
          options: [
            { value: 'emoji', label: 'Emoji' },
            { value: 'logo', label: 'My logo' },
            { value: 'none', label: 'None' }
          ]
        })
      )
    );
    const shape = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Corner radius', null, bindA('radius', ui.slider, { min: 0, max: 28, step: 1, label: 'Corner radius', format: (v) => v + ' px' })),
      ui.field('Text & emoji size', 'Fonts and text size live in Typography; emoji sizes in Emojis.', h('span', { class: 'muted small', text: model.settings.appearance.fontSize + ' px text · ' + model.settings.appearance.emojiSize + ' px emojis' }))
    );
    const motion = h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field(
        'Floating position',
        'Where on the screen reactions travel.',
        bindA('position', ui.segmented, {
          label: 'Floating position',
          options: [
            { value: 'spread', label: 'Full screen' },
            { value: 'right', label: 'Right' },
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' }
          ]
        })
      ),
      ui.field('Direction', null, bindA('direction', ui.segmented, { label: 'Animation direction', options: [{ value: 'up', label: 'Rise up' }, { value: 'down', label: 'Drift down' }] })),
      ui.field('Animation speed', null, bindA('speed', ui.slider, { min: 0.5, max: 2, step: 0.1, label: 'Animation speed', format: (v) => (v === 1 ? 'Normal' : v.toFixed(1) + '×') }))
    );

    return h(
      'div',
      { class: 'stack', style: { gap: '18px' } },
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Presets' }), presetRow),
      h('div', null, h('div', { class: 'eyebrow', style: { margin: '6px 0 10px' }, text: 'Colour' }), look),
      h('div', null, h('div', { class: 'eyebrow', style: { margin: '6px 0 10px' }, text: 'Shape' }), shape),
      h('div', null, h('div', { class: 'eyebrow', style: { margin: '6px 0 10px' }, text: 'Motion' }), motion)
    );
  };

  /* =================================================================
   * v1.2 — Intensity, typography, emoji size, interactions
   * ================================================================= */

  /** Gentle / Firm / Aggressive cards. opts.compact for popup-sized rows. */
  C.intensityPicker = function intensityPicker(model, opts) {
    opts = opts || {};
    const wrap = h('div', { class: 'int-grid' + (opts.compact ? ' compact' : ''), role: 'radiogroup', 'aria-label': 'Intensity' });
    const paint = () => {
      ui.empty(wrap);
      Object.entries(STILL.INTENSITY).forEach(([id, p]) => {
        const on = model.settings.general.intensity === id;
        const art = STILL.media ? STILL.media.node(p.icon, opts.compact ? 26 : 44, model.settings) : null;
        wrap.appendChild(
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(on),
              class: 'tile int-card int-' + id + (on ? ' selected' : ''),
              onclick: () => {
                model.update((d) => U.applyIntensity(d, id));
                if (!opts.compact) ui.toast(p.label + ' mode on', 'sparkles');
              }
            },
            h('span', { class: 'int-ic' }, art || p.icon),
            h('span', { class: 'int-tx' }, h('b', { text: p.label }), opts.compact ? null : h('span', { class: 'muted small', text: p.desc })),
            opts.compact ? null : h('span', { class: 'check' }, ui.icon('check'))
          )
        );
      });
    };
    paint();
    model.subscribe((n, p) => n.general.intensity !== p.general.intensity && paint());
    return wrap;
  };

  /** Font family cards + weight, size, case, spacing and line height. */
  C.typographyForm = function typographyForm(model) {
    const fonts = h('div', { class: 'font-grid' });
    const paintFonts = () => {
      ui.empty(fonts);
      const a = model.settings.appearance;
      STILL.FONTS.forEach((f) => {
        const on = a.font === f.id;
        fonts.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'tile font-card' + (on ? ' selected' : ''),
              'aria-pressed': String(on),
              onclick: () => model.update((d) => void (d.appearance.font = f.id))
            },
            h('span', {
              class: 'font-sample',
              style: { fontFamily: f.stack, fontWeight: String(a.fontWeight), textTransform: a.uppercase ? 'uppercase' : 'none' },
              text: f.id === 'bangla' ? 'লক্ষ্যে থাকুন।' : 'Make today count.'
            }),
            h('span', { class: 'font-name', text: f.label }),
            h('span', { class: 'check' }, ui.icon('check'))
          )
        );
      });
    };
    paintFonts();
    model.subscribe((n, p) => JSON.stringify(n.appearance) !== JSON.stringify(p.appearance) && paintFonts());

    const sizeChips = ui.segmented({
      label: 'Text size preset',
      value: model.settings.appearance.fontSize,
      options: STILL.TEXT_SIZE_PRESETS,
      onChange: (v) => model.patch('appearance.fontSize', v)
    });
    model.subscribe((s) => sizeChips.setValue(s.appearance.fontSize));

    return h(
      'div',
      { class: 'stack', style: { gap: '18px' } },
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Typeface' }), fonts),
      h(
        'div',
        { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
        ui.field('Text size', 'Quick sizes, or fine-tune with the slider.', h('div', { class: 'stack', style: { gap: '10px', alignItems: 'flex-end', width: '100%' } }, sizeChips, ui.bind(model, 'appearance.fontSize', ui.slider, { min: 11, max: 40, step: 1, label: 'Text size', format: (v) => v + ' px' }))),
        ui.field('Weight', null, ui.bind(model, 'appearance.fontWeight', ui.segmented, { label: 'Font weight', options: STILL.FONT_WEIGHTS })),
        ui.field('ALL CAPS', 'Shouty and hard to miss. Pairs well with Aggressive mode.', ui.bind(model, 'appearance.uppercase', ui.toggle, { label: 'Uppercase text' })),
        ui.field('Letter spacing', null, ui.bind(model, 'appearance.letterSpacing', ui.slider, { min: -1, max: 4, step: 0.1, label: 'Letter spacing', format: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' px' })),
        ui.field('Line height', null, ui.bind(model, 'appearance.lineHeight', ui.slider, { min: 1.1, max: 1.8, step: 0.02, label: 'Line height', format: (v) => v.toFixed(2) })),
        ui.field('Message width', 'Maximum width before a sentence wraps.', ui.bind(model, 'appearance.maxWidth', ui.slider, { min: 160, max: 420, step: 10, label: 'Message width', format: (v) => v + ' px' }))
      )
    );
  };

  /** Emoji size presets, variety and giant angry reactions. */
  C.emojiSizeForm = function emojiSizeForm(model) {
    const chips = ui.segmented({
      label: 'Emoji size preset',
      value: model.settings.appearance.emojiSize,
      options: STILL.EMOJI_SIZE_PRESETS,
      onChange: (v) => model.patch('appearance.emojiSize', v)
    });
    model.subscribe((s) => chips.setValue(s.appearance.emojiSize));
    return h(
      'div',
      { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
      ui.field('Emoji size', 'From subtle to giant.', h('div', { class: 'stack', style: { gap: '10px', alignItems: 'flex-end', width: '100%' } }, chips, ui.bind(model, 'appearance.emojiSize', ui.slider, { min: 16, max: 160, step: 2, label: 'Emoji size', format: (v) => v + ' px' }))),
      ui.field('Size variety', 'Mix big and small for a natural look.', ui.bind(model, 'emoji.sizeVariety', ui.slider, { min: 0, max: 1, step: 0.05, label: 'Size variety', format: (v) => (v === 0 ? 'Same size' : Math.round(v * 100) + '%') })),
      ui.field('Giant angry reactions', 'Adds big angry emojis that slam in and shake with every appearance. On automatically in Firm and Aggressive.', ui.bind(model, 'emoji.giantAngry', ui.toggle, { label: 'Giant angry reactions' })),
      ui.field('Giant size', 'Also used by the Angry Storm style.', ui.bind(model, 'emoji.giantSize', ui.slider, { min: 80, max: 260, step: 5, label: 'Giant emoji size', format: (v) => v + ' px' }))
    );
  };

  /** Hover, pop, quick actions, Esc, sounds. */
  C.interactionForm = function interactionForm(model) {
    const testBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => {
      const v = model.settings.interaction.volume;
      ['pop', 'chime', 'slam'].forEach((k, i) => setTimeout(() => STILL.sound && STILL.sound.play(k, v || 0.5), i * 450));
    } }, ui.icon('play', 'sm'), 'Test sounds');
    return h(
      'div',
      { class: 'stack', style: { gap: '18px' } },
      h(
        'div',
        { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
        ui.field('Interactive reactions', 'Reactions and messages respond to your pointer. Turn off to keep them completely click-through.', ui.bind(model, 'interaction.interactive', ui.toggle, { label: 'Interactive reactions' })),
        ui.field('Hover to pause', 'Rest the pointer on a message to freeze it and read it.', ui.bind(model, 'interaction.hoverPause', ui.toggle, { label: 'Hover to pause' })),
        ui.field('Quick actions', '♥ favourite (shown more often) · ✓ I’m on it · ✕ dismiss — right on each message.', ui.bind(model, 'interaction.quickActions', ui.toggle, { label: 'Quick actions' })),
        ui.field('Pop reactions', 'Click any emoji to pop it into confetti.', ui.bind(model, 'interaction.popEmojis', ui.toggle, { label: 'Pop reactions' })),
        ui.field('Esc clears the screen', null, ui.bind(model, 'interaction.escToClear', ui.toggle, { label: 'Esc clears the screen' }))
      ),
      h(
        'div',
        { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
        ui.field('Sounds', 'Soft pops and chimes; a sharp alert in Aggressive mode. Generated on the fly, no audio files.', ui.bind(model, 'interaction.sounds', ui.toggle, { label: 'Sounds' })),
        ui.field('Volume', null, h('div', { class: 'row', style: { width: '100%', justifyContent: 'flex-end' } }, ui.bind(model, 'interaction.volume', ui.slider, { min: 0, max: 1, step: 0.05, label: 'Volume', format: (v) => Math.round(v * 100) + '%' }), testBtn))
      )
    );
  };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  STILL.components = C;
})(typeof globalThis !== 'undefined' ? globalThis : self);
