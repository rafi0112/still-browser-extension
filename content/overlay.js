/*
 * STILL. — overlay shell.
 * Builds the isolated Shadow DOM layer, the animation engine, the small dismiss
 * dock, the check-in card (time / daily plan / focus) and the one-minute
 * breathing moment. Used on websites (fixed, full viewport, closed shadow root)
 * and inside extension pages (contained previews).
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  const HOST_STYLE = {
    fixed:
      'all:initial !important;position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;' +
      'z-index:2147483646 !important;pointer-events:none !important;display:block !important;margin:0 !important;' +
      'padding:0 !important;border:0 !important;background:transparent !important;contain:strict !important;',
    contained: 'position:absolute;inset:0;pointer-events:none;display:block;overflow:hidden;border-radius:inherit;z-index:5;'
  };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(cls, text, onClick) {
    const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /**
   * opts:
   *   mount        element to append to (contained previews); omitted → page overlay
   *   onHide()     user hid the current wave
   *   onPause()    user asked for a 15 minute pause
   *   onMoment(k)  a mindful moment happened ('thanks' | 'breathe')
   *   onEndFocus() user ended the focus session from the card
   *   onItemAction(kind, item)  'favorite' | 'done' | 'hide' | 'pop' on a floating item
   */
  STILL.createOverlay = function createOverlay(opts) {
    opts = opts || {};
    const contained = !!opts.mount;
    const host = document.createElement(contained ? 'div' : 'still-overlay');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-still', '');
    host.style.cssText = contained ? HOST_STYLE.contained : HOST_STYLE.fixed;
    const shadow = host.attachShadow({ mode: contained ? 'open' : 'closed' });
    const style = document.createElement('style');
    style.textContent = STILL.OVERLAY_CSS;
    shadow.appendChild(style);
    const layer = el('div', 'layer');
    shadow.appendChild(layer);

    let settings = STILL.utils.normalizeSettings({});
    let dockHideT = null;
    let reminderNode = null;
    let reminderT = null;
    let breathNode = null;
    let breathTimers = [];

    /* ---------------------------------------------------------------- brand */
    function brandNode(px) {
      const wrap = el('span', 'brand-logo');
      const logo = settings.brand.logo ? STILL.media && STILL.media.node('img:' + settings.brand.logo, px, settings) : null;
      if (logo) wrap.appendChild(logo);
      else {
        wrap.appendChild(document.createTextNode('STILL'));
        wrap.appendChild(el('i', null, '.'));
      }
      return wrap;
    }

    /* ---------------------------------------------------------------- dock */
    const dock = el('div', 'dock');
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', 'STILL. controls');
    const brand = el('span', 'brand');
    dock.append(
      brand,
      button('', 'Hide', () => {
        api.clear();
        if (opts.onHide) opts.onHide();
      }),
      button('', 'Breathe', () => {
        api.clear();
        showBreathing();
      }),
      button('', 'Pause 15 min', () => {
        api.clear();
        if (opts.onPause) opts.onPause();
      })
    );
    layer.appendChild(dock);

    function paintBrand() {
      brand.textContent = '';
      brand.appendChild(brandNode(18));
    }

    function placeSide(node, bottomPx) {
      const pos = settings.appearance.position;
      node.style.left = node.style.right = node.style.marginLeft = '';
      if (pos === 'left') node.style.left = '14px';
      else if (pos === 'center' || pos === 'spread') {
        node.style.left = '50%';
        node.style.marginLeft = '-' + Math.round(node.offsetWidth / 2) + 'px';
      } else node.style.right = '14px';
      if (bottomPx != null) node.style.bottom = bottomPx + 'px';
    }

    function setDock(show) {
      clearTimeout(dockHideT);
      if (show && settings.general.showDock) {
        dock.classList.add('show');
        placeSide(dock);
      } else {
        dockHideT = setTimeout(() => {
          if (!reminderNode && !breathNode) dock.classList.remove('show');
        }, 1400);
      }
    }

    const engine = new STILL.AnimationEngine(layer, {
      onActivity: (active) => setDock(active),
      onItemAction: (kind, item) => {
        if (kind === 'done' && opts.onMoment) opts.onMoment('thanks');
        if (opts.onItemAction) opts.onItemAction(kind, item);
      }
    });

    /* ------------------------------------------------------------ check-in card */
    function closeReminder() {
      clearTimeout(reminderT);
      if (!reminderNode) return;
      const n = reminderNode;
      reminderNode = null;
      n.classList.add('out');
      setTimeout(() => n.remove(), 460);
      if (!engine.active) setDock(false);
    }

    function showReminder(rem) {
      if (typeof rem === 'string') rem = { text: rem, kind: 'time' };
      closeReminder();
      const kind = rem.kind || 'time';
      const tough = !!rem.tough;
      const card = el('div', 'reminder kind-' + kind + (tough ? ' tough' : ''));
      card.setAttribute('role', tough ? 'alert' : 'status');
      const head = el('div', 'head');
      const title = tough
        ? kind === 'focus'
          ? 'Focus. Now.'
          : 'Wake-up call'
        : kind === 'focus'
          ? 'Focus session'
          : kind === 'budget'
            ? 'Your daily plan'
            : 'A gentle check-in';
      const logo = settings.brand.logo && STILL.media ? STILL.media.node('img:' + settings.brand.logo, 16, settings) : null;
      head.append(logo || el('span', 'dot'), el('span', null, 'STILL. · ' + title));
      if (tough && rem.icon && STILL.media) {
        const big = el('div', 'big');
        const art = STILL.media.node(rem.icon, 92, settings);
        if (art) big.appendChild(art);
        card.appendChild(big);
      }
      const msg = el('p', 'msg', rem.text);
      card.append(head, msg);
      if (rem.sub) card.appendChild(el('div', 'sub', rem.sub));
      const actions = el('div', 'actions');
      const breathe = button('', 'Breathe', () => {
        closeReminder();
        api.clear();
        showBreathing();
      });
      if (kind === 'focus') {
        actions.append(
          button('', 'End focus', () => {
            closeReminder();
            if (opts.onEndFocus) opts.onEndFocus();
          }),
          breathe,
          button('primary', 'Back to focus', () => {
            closeReminder();
            api.clear();
            if (opts.onMoment) opts.onMoment('thanks');
          })
        );
      } else if (tough) {
        actions.append(
          button('', '5 more min', () => {
            closeReminder();
            api.clear();
            if (opts.onPause) opts.onPause(5);
          }),
          breathe,
          button('primary', "OK, I'm closing it", () => {
            closeReminder();
            api.clear();
            if (opts.onMoment) opts.onMoment('thanks');
          })
        );
      } else {
        actions.append(
          button('', 'Pause 15 min', () => {
            closeReminder();
            api.clear();
            if (opts.onPause) opts.onPause();
          }),
          breathe,
          button('primary', "Thanks, I'm on it", () => {
            closeReminder();
            if (opts.onMoment) opts.onMoment('thanks');
          })
        );
      }
      card.appendChild(actions);
      layer.appendChild(card);
      if (!tough) placeSide(card, settings.general.showDock ? 62 : 18);
      engine.sound(tough ? 'alert' : 'chime');
      if (tough) engine.flash();
      reminderNode = card;
      const arm = () => {
        clearTimeout(reminderT);
        reminderT = setTimeout(closeReminder, 18000);
      };
      card.addEventListener('mouseenter', () => clearTimeout(reminderT));
      card.addEventListener('mouseleave', arm);
      arm();
      setDock(true);
    }

    /* ------------------------------------------------------------ breathing */
    function closeBreathing() {
      breathTimers.forEach(clearTimeout);
      breathTimers = [];
      if (!breathNode) return;
      const n = breathNode;
      breathNode = null;
      n.classList.add('out');
      setTimeout(() => n.remove(), 460);
      setDock(false);
    }

    /** One minute: 5 cycles of in 4s · hold 2s · out 6s. */
    function showBreathing() {
      closeReminder();
      closeBreathing();
      const card = el('div', 'breath');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Breathing moment');
      const wrap = el('div', 'orb-wrap');
      wrap.append(el('div', 'ring'), el('div', 'orb'));
      const phase = el('div', 'phase', 'Breathe in');
      const count = el('div', 'count', 'One calm minute · 1 of 5');
      const actions = el('div', 'actions');
      actions.appendChild(button('', 'Done', () => closeBreathing()));
      card.append(wrap, phase, count, actions);
      layer.appendChild(card);
      breathNode = card;
      const CYCLE = 12000;
      for (let c = 0; c < 5; c++) {
        const t0 = c * CYCLE;
        breathTimers.push(setTimeout(() => ((phase.textContent = 'Breathe in'), (count.textContent = 'One calm minute · ' + (c + 1) + ' of 5')), t0));
        breathTimers.push(setTimeout(() => (phase.textContent = 'Hold'), t0 + 4000));
        breathTimers.push(setTimeout(() => (phase.textContent = 'Breathe out'), t0 + 6000));
      }
      breathTimers.push(
        setTimeout(() => {
          phase.textContent = 'Nicely done.';
          count.textContent = 'Carry this calm with you.';
          if (opts.onMoment) opts.onMoment('breathe');
          breathTimers.push(setTimeout(closeBreathing, 3500));
        }, 5 * CYCLE)
      );
    }

    /* ------------------------------------------------------------ api */
    const api = {
      host,
      engine,
      contained,

      configure(next) {
        settings = next;
        engine.configure(next);
        paintBrand();
        if (!next.general.showDock) dock.classList.remove('show');
      },

      /** Play a wave produced by STILL.messageEngine.buildWave */
      playWave(wave) {
        if (!wave) return;
        const info = engine.play(wave) || { textsEndAt: 0 };
        if (wave.reminder && wave.reminder.text) {
          const delay = wave.texts && wave.texts.length ? 700 : 250;
          setTimeout(() => {
            if (!engine.destroyed && !breathNode) showReminder(wave.reminder);
          }, delay);
        }
        return info;
      },

      showReminder,
      showBreathing,

      clear() {
        engine.clear();
        closeReminder();
      },

      /** SPA frameworks occasionally wipe <html> children; re-attach cheaply. */
      ensureAttached() {
        if (!contained && !host.isConnected && document.documentElement) document.documentElement.appendChild(host);
      },

      destroy() {
        clearTimeout(dockHideT);
        clearTimeout(reminderT);
        breathTimers.forEach(clearTimeout);
        engine.destroy();
        host.remove();
      }
    };

    paintBrand();
    if (contained) opts.mount.appendChild(host);
    else (document.documentElement || document.body).appendChild(host);
    return api;
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
