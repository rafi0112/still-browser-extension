/*
 * STILL. — Insights dashboard and Focus tools (extension pages).
 * Reads the local stats written by the service worker; nothing leaves the device.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;
  const ui = STILL.ui;
  const h = ui.h;

  const fmt = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 1) return ms > 0 ? '<1m' : '0m';
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  };

  function summary(raw, settings) {
    const days = (raw && raw.days) || {};
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = STILL.todayKey(d);
      const rec = days[key] || { sites: {}, moments: 0, focus: 0, focusMin: 0, waves: 0 };
      const total = Object.values(rec.sites || {}).reduce((a, b) => a + b, 0);
      out.push({ key, label: d.toLocaleDateString([], { weekday: 'short' }), total, rec });
    }
    const today = out[6];
    const sites = settings.sites.map((s) => ({ site: s, ms: (today.rec.sites || {})[s.domain] || 0 })).sort((a, b) => b.ms - a.ms);
    const planned = sites.filter((x) => x.site.budgetMin > 0);
    const within = planned.filter((x) => x.ms <= x.site.budgetMin * 60000).length;
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const rec = days[STILL.todayKey(d)];
      if (rec && (rec.moments || 0) + (rec.focus || 0) > 0) streak++;
      else if (i > 0) break;
    }
    const sum = (f) => out.reduce((a, d) => a + (d.rec[f] || 0), 0);
    return {
      days: out,
      today,
      sites,
      planned: planned.length,
      within,
      streak,
      week: out.reduce((a, d) => a + d.total, 0),
      moments: { today: today.rec.moments || 0, week: sum('moments') },
      focus: { week: sum('focus'), minutes: sum('focusMin') },
      breaths: sum('breaths')
    };
  }

  function loadStats() {
    return chrome.storage.local.get(STILL.STATS_KEY).then((d) => d[STILL.STATS_KEY] || { days: {} });
  }
  function onStats(fn) {
    const l = (c, a) => a === 'local' && c[STILL.STATS_KEY] && fn();
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }

  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  }

  /** 7-day bars, today highlighted. */
  function bars(sum, compact) {
    const max = Math.max(1, ...sum.days.map((d) => d.total));
    return h(
      'div',
      { class: 'in-bars' + (compact ? ' compact' : '') },
      sum.days.map((d, i) =>
        h(
          'div',
          { class: 'in-bar' + (i === 6 ? ' today' : ''), title: d.label + ' · ' + fmt(d.total) },
          h('span', { class: 'fill', style: { height: Math.max(4, (d.total / max) * 100) + '%' } }),
          compact ? null : h('span', { class: 'lbl', text: d.label })
        )
      )
    );
  }

  /* ================================================================
   * Insights page
   * ================================================================ */
  function component(model) {
    const wrap = h('div', { class: 'stack', style: { gap: '22px' } });
    let raw = { days: {} };

    function render() {
      ui.empty(wrap);
      const s = model.settings;
      const sum = summary(raw, s);
      const pct = sum.planned ? Math.round((sum.within / sum.planned) * 100) : null;
      const intention = U.intentionToday(s);

      const hero = h(
        'div',
        { class: 'in-hero' },
        h(
          'div',
          { class: 'in-hero-l' },
          h('div', { class: 'in-greet display', text: greeting() + '.' }),
          h('div', { class: 'in-big display', text: fmt(sum.today.total) }),
          h('div', { class: 'muted', text: 'on your STILL. sites today' }),
          intention ? h('div', { class: 'in-intent' }, ui.icon('target', 'sm'), h('span', { text: intention })) : null
        ),
        h('div', { class: 'in-hero-m' }, h('div', { class: 'eyebrow', text: '7-day rhythm' }), bars(sum)),
        h(
          'div',
          { class: 'in-hero-r' },
          pct == null
            ? h('div', null, h('div', { class: 'in-big display', text: String(sum.moments.today) }), h('div', { class: 'muted', text: 'mindful moments today' }))
            : h(
                'div',
                null,
                h('div', { class: 'in-big display', text: pct + '%' }),
                h('div', { class: 'muted', text: 'of sites within today’s plan' }),
                h('div', { class: 'in-progress' }, h('span', { style: { width: pct + '%' } })),
                h('div', { class: 'muted small', text: sum.within + ' of ' + sum.planned + ' planned sites' })
              )
        )
      );

      const stat = (icon, value, label) => h('div', { class: 'in-stat' }, h('span', { class: 'in-stat-ic' }, ui.icon(icon)), h('div', null, h('div', { class: 'in-stat-v', text: value }), h('div', { class: 'muted small', text: label })));
      const stats = h(
        'div',
        { class: 'in-stats' },
        stat('sparkles', String(sum.moments.week), 'mindful moments this week'),
        stat('target', String(sum.focus.week), 'focus sessions · ' + fmt(sum.focus.minutes * 60000)),
        stat('wind', String(sum.breaths), 'breathing breaks this week'),
        stat('flame', sum.streak + (sum.streak === 1 ? ' day' : ' days'), 'mindful streak')
      );

      const rows = sum.sites.length
        ? sum.sites.map(({ site, ms }) => {
            const budget = site.budgetMin * 60000;
            const ratio = budget ? Math.min(1, ms / budget) : 0;
            const over = budget && ms > budget;
            const sel = ui.select({
              label: 'Daily plan for ' + site.domain,
              value: String(site.budgetMin || 0),
              options: [0, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => ({ value: String(v), label: v ? v + ' min plan' : 'No plan' })),
              onChange: (v) => model.update((d) => void (d.sites.find((x) => x.id === site.id).budgetMin = Number(v)))
            });
            sel.style.width = 'auto';
            sel.style.height = '32px';
            return h(
              'div',
              { class: 'list-row' },
              h('span', { class: 'site-glyph', text: site.domain.charAt(0).toUpperCase() }),
              h(
                'div',
                { class: 'grow' },
                h('div', { class: 'row between' }, h('b', { text: site.label || site.domain }), h('span', { class: over ? 'tag warn' : 'tag', text: fmt(ms) + (budget ? ' / ' + site.budgetMin + 'm' : '') })),
                budget ? h('div', { class: 'in-progress sm' + (over ? ' over' : ratio > 0.8 ? ' near' : '') }, h('span', { style: { width: ratio * 100 + '%' } })) : null
              ),
              sel
            );
          })
        : [h('div', { class: 'list-empty', text: 'Add websites to see your time here.' })];

      wrap.append(
        hero,
        stats,
        h(
          'div',
          null,
          h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('div', { class: 'eyebrow', text: 'Today by site' }), h('span', { class: 'muted small', text: 'A daily plan shows one gentle check-in when you reach it — never a block.' })),
          h('div', { class: 'list' }, rows)
        ),
        h('div', { class: 'muted small', text: 'Insights are kept for 60 days on this device only. Only the websites you chose are counted, and only while their tab is visible.' })
      );
    }

    loadStats().then((r) => {
      raw = r;
      render();
    });
    model.onDispose(
      onStats(() =>
        loadStats().then((r) => {
          raw = r;
          render();
        })
      )
    );
    model.subscribe(render);
    render();
    return wrap;
  }

  /* ================================================================
   * Focus, intention & quiet hours
   * ================================================================ */
  function focusCard(model, compact) {
    const box = h('div', { class: 'fo-card' + (compact ? ' compact' : '') });
    let tick = null;
    let chosen = model.settings.focus.minutes || 25;
    const label = h('input', { class: 'input', placeholder: 'What are you focusing on?', maxlength: '80', 'aria-label': 'Focus label' });

    function render() {
      clearInterval(tick);
      ui.empty(box);
      const s = model.settings;
      if (U.focusActive(s)) {
        const total = s.focus.until - s.focus.startedAt;
        const clock = h('div', { class: 'fo-clock display' });
        const bar = h('span');
        const paint = () => {
          const left = Math.max(0, s.focus.until - Date.now());
          const m = Math.floor(left / 60000);
          const sec = Math.floor((left % 60000) / 1000);
          clock.textContent = m + ':' + String(sec).padStart(2, '0');
          bar.style.width = (100 - (left / total) * 100).toFixed(1) + '%';
        };
        paint();
        tick = setInterval(paint, 1000);
        box.append(
          ...[
          h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: 'Focus session' }), h('span', { class: 'tag green', text: 'In progress' })),
          clock,
          s.focus.label ? h('div', { class: 'fo-label', text: s.focus.label }) : null,
          h('div', { class: 'in-progress' }, bar),
          h('div', { class: 'muted small', text: 'STILL. checks in sooner on your sites until the timer ends.' }),
          h('button', { class: 'btn', type: 'button', onclick: () => chrome.runtime.sendMessage({ type: 'still:focus-stop' }) }, 'End session')
          ].filter(Boolean)
        );
        return;
      }
      const chips = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
      [15, 25, 45, 60, 90].forEach((m) =>
        chips.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-pressed': String(chosen === m),
              onclick: () => {
                chosen = m;
                [...chips.children].forEach((c, i) => c.setAttribute('aria-pressed', String([15, 25, 45, 60, 90][i] === m)));
              }
            },
            m + ' min'
          )
        )
      );
      box.append(
        ...[
        h('div', { class: 'eyebrow', text: 'Focus session' }),
        h('div', { class: 'fo-title display', text: 'Protect your next hour.' }),
        compact ? null : h('div', { class: 'muted small', text: 'While it runs, STILL. greets you the moment you open a distracting site and checks in twice as often.' }),
        chips,
        compact ? null : label,
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => chrome.runtime.sendMessage({ type: 'still:focus-start', minutes: chosen, label: label.value })
          },
          ui.icon('play', 'sm'),
          'Start focus'
        )
        ].filter(Boolean)
      );
    }
    render();
    model.subscribe((n, p) => JSON.stringify(n.focus) !== JSON.stringify(p.focus) && render());
    model.onDispose(() => clearInterval(tick));
    return box;
  }

  function intentionField(model, opts) {
    opts = opts || {};
    const input = h('input', { class: 'input' + (opts.cls ? ' ' + opts.cls : ''), maxlength: '120', placeholder: opts.placeholder || 'One thing that would make today a win…', 'aria-label': 'Today’s intention' });
    input.value = U.intentionToday(model.settings);
    const commit = () => {
      const text = U.cleanText(input.value, 120);
      if (text === U.intentionToday(model.settings)) return;
      model.update((d) => {
        d.intention.text = text;
        d.intention.date = text ? STILL.todayKey() : '';
      });
      if (text) ui.toast('Intention set for today', 'target');
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        input.blur();
      }
    });
    input.addEventListener('blur', commit);
    model.subscribe(() => {
      if (document.activeElement !== input) input.value = U.intentionToday(model.settings);
    });
    return input;
  }

  function focusForm(model) {
    const days = h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' } });
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const paintDays = () => {
      ui.empty(days);
      names.forEach((n, i) =>
        days.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-pressed': String(model.settings.schedule.days.includes(i)),
              onclick: () =>
                model.update((d) => {
                  const set = new Set(d.schedule.days);
                  set.has(i) ? set.delete(i) : set.add(i);
                  d.schedule.days = Array.from(set).sort();
                })
            },
            n
          )
        )
      );
    };
    paintDays();
    model.subscribe(paintDays);

    const time = (path) => {
      const t = h('input', { class: 'input', type: 'time', style: { width: '130px' }, 'aria-label': path });
      t.value = U.getPath(model.settings, path);
      t.addEventListener('change', () => t.value && model.patch(path, t.value));
      model.subscribe((s) => document.activeElement !== t && (t.value = U.getPath(s, path)));
      return t;
    };

    const status = h('div', { class: 'notice' }, ui.icon('moon'), h('span'));
    const paintStatus = () => {
      const s = model.settings;
      status.lastChild.textContent = !s.schedule.enabled
        ? 'Quiet hours are off — STILL. can appear any time.'
        : U.inSchedule(s)
          ? 'Inside your active hours right now — STILL. may appear.'
          : 'Outside your active hours right now — STILL. stays quiet (focus sessions still work).';
    };
    paintStatus();
    model.subscribe(paintStatus);

    return h(
      'div',
      { class: 'stack', style: { gap: '22px' } },
      focusCard(model),
      h(
        'div',
        null,
        h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Today’s intention' }),
        h(
          'div',
          { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
          ui.field('Intention', 'Shown in your popup and woven into today’s reminders. It resets tomorrow.', intentionField(model)),
          ui.field('Show in reminders', null, ui.bind(model, 'intention.inWaves', ui.toggle, { label: 'Show intention in reminders' }))
        )
      ),
      h(
        'div',
        null,
        h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Active hours' }),
        h(
          'div',
          { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
          ui.field('Only remind me during set hours', 'Great for work or study hours. Outside them STILL. stays completely quiet.', ui.bind(model, 'schedule.enabled', ui.toggle, { label: 'Active hours' })),
          ui.field('Days', null, days),
          ui.field('From', null, time('schedule.start')),
          ui.field('Until', 'Overnight windows like 22:00 → 02:00 work too.', time('schedule.end'))
        ),
        h('div', { style: { marginTop: '12px' } }, status)
      ),
      h(
        'div',
        null,
        h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Shortcuts & quick capture' }),
        h(
          'div',
          { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
          ui.field('Add text from any page', 'Select a quote anywhere, right-click → “Add to STILL. messages”.', ui.bind(model, 'general.contextMenu', ui.toggle, { label: 'Context menu' })),
          ui.field(
            'Keyboard shortcuts',
            'Change them at chrome://extensions/shortcuts',
            h('div', { class: 'kbd-list' }, kbd('Alt+Shift+S', 'Open STILL.'), kbd('Alt+Shift+P', 'Pause / resume'), kbd('Alt+Shift+Y', 'Preview here'), kbd('Alt+Shift+B', 'Breathe'))
          )
        )
      )
    );
  }

  function kbd(keys, label) {
    return h('div', { class: 'kbd-row' }, h('kbd', { text: keys }), h('span', { class: 'muted small', text: label }));
  }

  STILL.insights = { summary, component, bars, loadStats, onStats, fmt, greeting, focusCard, intentionField, focusForm };
})(typeof globalThis !== 'undefined' ? globalThis : self);
