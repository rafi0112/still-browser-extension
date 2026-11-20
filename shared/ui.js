/*
 * STILL. — UI primitives for extension pages.
 * DOM is always built with createElement + textContent; user text is never parsed as HTML.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;
  const ui = {};

  /* ------------------------------------------------------------- DOM builder */
  ui.h = function h(tag, attrs, ...children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, String(v));
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return n;
  };
  const h = ui.h;

  /* ------------------------------------------------------------- icons */
  const C = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const ICONS = {
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    power: 'M12 2v10M18.36 6.64a9 9 0 1 1-12.73 0',
    pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    play: 'M7 4.5l12 7.5-12 7.5z',
    sparkles: 'M12 3l1.7 4.6L18.3 9.3l-4.6 1.7L12 15.6l-1.7-4.6L5.7 9.3l4.6-1.7zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z',
    globe: C(12, 12, 10) + 'M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
    plus: 'M12 5v14M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
    edit: 'M16.5 3.5l4 4L8 20H4v-4zM14 6l4 4',
    star: 'M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.6l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z',
    check: 'M20 6L9 17l-5-5',
    x: 'M18 6L6 18M6 6l12 12',
    clock: C(12, 12, 9) + 'M12 7v5l3 2',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
    download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
    refresh: 'M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    smile: C(12, 12, 9.5) + 'M8 14.5s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01',
    message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    droplet: 'M12 3l5.5 6.5a7 7 0 1 1-11 0z',
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' + C(12, 12, 3),
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    info: C(12, 12, 9.5) + 'M12 16v-5M12 8h.01',
    timer: C(12, 13, 8) + 'M12 9v4l2 2M9 2h6',
    leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
    key: C(8, 15, 4) + 'M11 12l9-9M17 6l3 3',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    chevronDown: 'M6 9l6 6 6-6',
    shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5' + C(15.5, 9, 1.5),
    type: 'M4 7V5h16v2M9 19h6M12 5v14',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    target: C(12, 12, 9) + C(12, 12, 5) + 'M12 12h.01',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7',
    crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
    flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 2 1.5 3 2.5 3-1-3 0-6 .5-8.5z',
    upload2: 'M12 16V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.1-.9-1.4-.9-2.4 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z' + C(7.5, 11, 1) + C(10, 7, 1) + C(15, 7.5, 1)
  };

  ui.icon = function icon(name, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || '');
    svg.appendChild(p);
    return svg;
  };

  /* ------------------------------------------------------------- toast */
  let toastWrap = null;
  ui.toast = function toast(msg, iconName) {
    if (!toastWrap) {
      toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastWrap);
    }
    const t = h('div', { class: 'toast' }, ui.icon(iconName || 'check'), msg);
    toastWrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 2200);
  };

  /* ------------------------------------------------------------- model */
  /**
   * A live view of the stored settings for a page. Writes go to storage; every
   * context (including this one) re-renders from storage.onChanged, so the popup,
   * options, onboarding and all tabs always agree.
   */
  ui.createModel = function createModel() {
    const subs = new Set();
    const model = {
      settings: U.normalizeSettings({}),
      ready: null,
      onSaved: null,
      subscribe(fn) {
        subs.add(fn);
        const off = () => subs.delete(fn);
        if (model._collect) model._collect.push(off);
        return off;
      },
      /**
       * Run a view builder and capture every subscription (and extra disposer
       * registered with model.onDispose) it creates, so a page can tear the view
       * down later without leaking listeners.
       */
      collect(build) {
        const list = [];
        const prev = model._collect;
        model._collect = list;
        let result;
        try {
          result = build();
        } finally {
          model._collect = prev;
        }
        return { result, dispose: () => list.splice(0).forEach((f) => f()) };
      },
      onDispose(fn) {
        if (model._collect) model._collect.push(fn);
      },
      _collect: null,
      async update(fn) {
        const next = await STILL.store.update(fn);
        model._apply(next);
        if (model.onSaved) model.onSaved();
        return next;
      },
      patch(path, value) {
        return model.update((d) => U.setPath(d, path, value));
      },
      get(path) {
        return U.getPath(model.settings, path);
      },
      _apply(next) {
        const prev = model.settings;
        if (JSON.stringify(prev) === JSON.stringify(next)) return;
        model.settings = next;
        subs.forEach((fn) => {
          try {
            fn(next, prev);
          } catch (e) {
            console.error('[STILL.]', e);
          }
        });
      }
    };
    model.ready = STILL.store.load().then((s) => {
      model.settings = s;
      STILL.store.onChange((next) => model._apply(next));
      return s;
    });
    return model;
  };

  /* ------------------------------------------------------------- controls */

  ui.toggle = function toggle(opts) {
    const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': opts.label || '' });
    input.checked = !!opts.checked;
    input.addEventListener('change', () => opts.onChange && opts.onChange(input.checked));
    const wrap = h('label', { class: 'switch' + (opts.small ? ' sm' : ''), title: opts.title || null }, input, h('span', { class: 'track' }));
    wrap.input = input;
    wrap.setValue = (v) => {
      input.checked = !!v;
    };
    return wrap;
  };

  /** Range slider with a formatted output; commits after a short debounce. */
  ui.slider = function slider(opts) {
    const input = h('input', {
      type: 'range',
      min: opts.min,
      max: opts.max,
      step: opts.step || 1,
      'aria-label': opts.label || ''
    });
    const out = h('output');
    const fmt = opts.format || ((v) => String(v));
    let dragging = false;
    const paint = () => {
      const pct = ((input.value - opts.min) / (opts.max - opts.min)) * 100;
      input.style.setProperty('--fill', pct + '%');
      out.textContent = fmt(Number(input.value));
    };
    const commit = U.debounce(() => opts.onChange && opts.onChange(Number(input.value)), opts.debounce == null ? 180 : opts.debounce);
    input.addEventListener('input', () => {
      dragging = true;
      paint();
      if (opts.onInput) opts.onInput(Number(input.value));
      commit();
    });
    input.addEventListener('change', () => {
      dragging = false;
    });
    input.value = opts.value;
    paint();
    const wrap = h('div', { class: 'range' }, input, out);
    wrap.input = input;
    wrap.setValue = (v) => {
      if (dragging && document.activeElement === input) return;
      input.value = v;
      paint();
    };
    return wrap;
  };

  /** Segmented control. options: [{value,label}] */
  ui.segmented = function segmented(opts) {
    const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': opts.label || '' });
    const buttons = opts.options.map((o) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(o.value === opts.value),
        onclick: () => {
          wrap.setValue(o.value);
          if (opts.onChange) opts.onChange(o.value);
        },
        text: o.label
      })
    );
    buttons.forEach((b) => wrap.appendChild(b));
    wrap.setValue = (v) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(opts.options[i].value === v)));
    return wrap;
  };

  ui.select = function select(opts) {
    const s = h('select', { class: 'select', 'aria-label': opts.label || '' });
    const fill = (options) => {
      s.textContent = '';
      options.forEach((o) => s.appendChild(h('option', { value: o.value, text: o.label })));
    };
    fill(opts.options);
    s.value = opts.value;
    s.addEventListener('change', () => opts.onChange && opts.onChange(s.value));
    s.setValue = (v) => {
      s.value = v;
    };
    s.setOptions = (options, v) => {
      fill(options);
      s.value = v;
    };
    return s;
  };

  ui.color = function color(opts) {
    const input = h('input', { type: 'color', 'aria-label': opts.label || '' });
    input.value = opts.value;
    const code = h('code', { text: opts.value });
    const commit = U.debounce(() => opts.onChange && opts.onChange(input.value), 150);
    input.addEventListener('input', () => {
      code.textContent = input.value;
      commit();
    });
    const wrap = h('label', { class: 'color' }, input, code);
    wrap.setValue = (v) => {
      if (document.activeElement === input) return;
      input.value = v;
      code.textContent = v;
    };
    return wrap;
  };

  /** Standard settings row: label + hint on the left, control on the right. */
  ui.field = function field(label, hint, control, opts) {
    return h(
      'div',
      { class: 'field' + (opts && opts.block ? ' block' : '') },
      h('div', null, h('div', { class: 'label', text: label }), hint ? h('div', { class: 'hint', text: hint }) : null),
      h('div', { class: 'control' }, control)
    );
  };

  /**
   * Bind a control to a settings path: initial value, writes, and live sync
   * from storage (so a change made in another window shows up here too).
   */
  ui.bind = function bind(model, path, factory, extra) {
    const ctrl = factory(
      Object.assign({}, extra, {
        value: model.get(path),
        checked: model.get(path),
        onChange: (v) => {
          if (extra && extra.transform) v = extra.transform(v);
          model.patch(path, v);
          if (extra && extra.after) extra.after(v);
        }
      })
    );
    model.subscribe((s) => ctrl.setValue && ctrl.setValue(U.getPath(s, path)));
    return ctrl;
  };

  /** "Saved" indicator that flashes after each write. */
  ui.savedIndicator = function savedIndicator(model) {
    const n = h('span', { class: 'saved' }, ui.icon('check'), 'Saved');
    let t = null;
    model.onSaved = () => {
      n.classList.add('show');
      clearTimeout(t);
      t = setTimeout(() => n.classList.remove('show'), 1400);
    };
    return n;
  };

  ui.empty = function empty(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  STILL.ui = ui;
})(typeof globalThis !== 'undefined' ? globalThis : self);
