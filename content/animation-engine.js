/*
 * STILL. — animation engine.
 * Renders "waves" (texts + emojis) into a layer element using CSS keyframes.
 * Reused by the on-page overlay and by every preview inside the extension UI.
 *
 * Design notes
 *  - Each item is positioned once (left/top inside our own isolated layer) and then
 *    only transform/opacity animate, so there is no layout work on the host page.
 *  - Randomised, bounded parameters (duration, sway, drift, rotation, stagger)
 *    keep repeated waves from looking mechanical.
 *  - Hard caps on simultaneous texts / emojis; every element and timer is tracked
 *    and cleaned up on animationend, a safety timeout, clear() or destroy().
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;

  const SANS = '"Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,Inter,"Helvetica Neue",Arial,sans-serif';
  const SERIF = '"Iowan Old Style","Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';
  const MAX_EMOJIS = 26;
  const MAX_GIANTS = 5;

  /**
   * Tiny synthesized sound set (Web Audio, no files): pop, chime, slam, alert.
   * Browsers only let audio start after the page has had a user gesture, so a
   * sound that can't play is silently skipped.
   */
  class Sound {
    constructor() {
      this.ctx = null;
    }
    _ctx() {
      try {
        if (!this.ctx) {
          const AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) return null;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx.state === 'running' ? this.ctx : null;
      } catch (e) {
        return null;
      }
    }
    _tone(ctx, { type, f0, f1, dur, vol, at }) {
      const t = ctx.currentTime + (at || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    play(kind, volume) {
      const ctx = this._ctx();
      if (!ctx || !(volume > 0)) return;
      const v = Math.min(1, volume) * 0.35;
      if (kind === 'pop') this._tone(ctx, { type: 'sine', f0: 520, f1: 1250, dur: 0.09, vol: v });
      else if (kind === 'chime') {
        this._tone(ctx, { type: 'sine', f0: 880, dur: 0.7, vol: v * 0.7 });
        this._tone(ctx, { type: 'sine', f0: 1318.5, dur: 0.9, vol: v * 0.5, at: 0.09 });
      } else if (kind === 'slam') {
        this._tone(ctx, { type: 'sine', f0: 140, f1: 48, dur: 0.32, vol: v * 1.3 });
        this._tone(ctx, { type: 'triangle', f0: 220, f1: 90, dur: 0.18, vol: v * 0.5 });
      } else if (kind === 'alert') {
        [0, 0.16, 0.32].forEach((at, i) => this._tone(ctx, { type: 'square', f0: i % 2 ? 660 : 523, dur: 0.12, vol: v * 0.25, at }));
      }
    }
  }
  STILL.sound = STILL.sound || new Sound();

  function hexToRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (!Number.isFinite(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function luminance([r, g, b]) {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // user text is only ever set via textContent
    return n;
  }

  class AnimationEngine {
    /**
     * @param {HTMLElement} layer  positioned container (absolute, inset 0)
     * @param {{onActivity?: (active:boolean)=>void}} opts
     */
    constructor(layer, opts) {
      this.layer = layer;
      this.opts = opts || {};
      this.vignette = el('div', 'vignette');
      this.stage = el('div', 'stage');
      layer.append(this.vignette, this.stage);
      this.timers = new Set();
      this.items = new Set();
      this.textCount = 0;
      this.emojiCount = 0;
      this.settings = U.normalizeSettings({});
      this.destroyed = false;
      this.mql = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
      this._onMql = () => this._applyMotion();
      if (this.mql && this.mql.addEventListener) this.mql.addEventListener('change', this._onMql);
      this.configure(this.settings);
    }

    /* ------------------------------------------------------------ config */

    configure(settings) {
      this.settings = settings;
      const a = settings.appearance;
      const s = this.layer.style;
      const rgb = hexToRgb(a.bubbleBg);
      const fgRgb = hexToRgb(a.textColor);
      const accRgb = hexToRgb(a.accent);
      const rgba = (c, o) => `rgba(${c[0]},${c[1]},${c[2]},${o})`;
      s.setProperty('--bg', rgba(rgb, a.opacity));
      s.setProperty('--bg-soft', rgba(rgb, Math.max(0.3, a.opacity * 0.86)));
      s.setProperty('--bg-solid', rgba(rgb, Math.max(a.opacity, 0.97)));
      s.setProperty('--fg', a.textColor);
      s.setProperty('--muted', rgba(fgRgb, 0.55));
      s.setProperty('--accent', a.accent);
      s.setProperty('--accent-soft', rgba(accRgb, luminance(rgb) < 0.2 ? 0.22 : 0.12));
      s.setProperty('--accent-line', rgba(accRgb, 0.38));
      s.setProperty('--on-accent', luminance(accRgb) > 0.45 ? '#121512' : '#ffffff');
      s.setProperty('--radius', a.radius + 'px');
      s.setProperty('--fs', a.fontSize + 'px');
      s.setProperty('--maxw', a.maxWidth + 'px');
      s.setProperty('--esize', a.emojiSize + 'px');
      const font = (STILL.FONT_STACKS && STILL.FONT_STACKS[a.font]) || SANS;
      s.setProperty('--font', font);
      s.setProperty('--display', a.font === 'sans' ? SERIF : font);
      s.setProperty('--fw', String(a.fontWeight || 500));
      s.setProperty('--tt', a.uppercase ? 'uppercase' : 'none');
      s.setProperty('--ls', (a.letterSpacing || 0) + 'px');
      s.setProperty('--lh', String(a.lineHeight || 1.38));
      const ix = settings.interaction || {};
      const cl = this.layer.classList;
      cl.toggle('int', !!ix.interactive);
      cl.toggle('hp', !!(ix.interactive && ix.hoverPause));
      cl.toggle('aggr', settings.general.intensity === 'aggressive');
      cl.toggle('firm', settings.general.intensity === 'firm');
      s.setProperty(
        '--shadow',
        a.shadow ? '0 1px 2px rgba(0,0,0,.06), 0 10px 28px -10px rgba(0,0,0,.22)' : '0 0 0 1px ' + rgba(fgRgb, 0.1)
      );
      s.setProperty('--shadow-sm', a.shadow ? '0 1px 2px rgba(0,0,0,.08), 0 4px 12px -6px rgba(0,0,0,.18)' : 'none');
      this.layer.classList.toggle('glass', !!a.glass);
      this.layer.classList.toggle('full', a.position === 'spread');
      this._applyMotion();
    }

    /** Draw a reaction token (3D art, user image or system emoji) at px size. */
    _media(token, px) {
      if (!token) return null;
      if (STILL.media) return STILL.media.node(token, px, this.settings);
      return el('span', 'emoji-txt', token);
    }

    /** Play a synthesized sound if the user turned sounds on. */
    sound(kind) {
      const ix = this.settings.interaction;
      if (ix && ix.sounds) STILL.sound.play(kind, ix.volume);
    }

    /** Red pulse around the edges (aggressive intensity). */
    flash() {
      const v = this.vignette;
      v.classList.remove('on');
      void v.offsetWidth;
      v.classList.add('on');
    }

    reducedMotion() {
      const pref = this.settings.general.reduceMotion;
      if (pref === 'always') return true;
      if (pref === 'never') return false;
      return !!(this.mql && this.mql.matches);
    }

    _applyMotion() {
      this.layer.classList.toggle('rm', this.reducedMotion());
    }

    /* ------------------------------------------------------------ geometry */

    _size() {
      const w = this.layer.clientWidth || root.innerWidth || 800;
      const h = this.layer.clientHeight || root.innerHeight || 600;
      return { w, h, m: w < 520 ? 10 : 20 };
    }

    _lane() {
      const { w, m } = this._size();
      const a = this.settings.appearance;
      const lw = Math.min(w - 2 * m, Math.max(a.maxWidth + 70, w * 0.3));
      switch (a.position) {
        case 'left':
          return [m, m + lw];
        case 'center':
          return [(w - lw) / 2, (w + lw) / 2];
        case 'spread':
          return [m, w - m];
        default:
          return [w - m - lw, w - m];
      }
    }

    /* ------------------------------------------------------------ timers */

    _later(fn, ms) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (!this.destroyed) fn();
      }, ms);
      this.timers.add(t);
      return t;
    }

    _clearTimers() {
      this.timers.forEach((t) => clearTimeout(t));
      this.timers.clear();
    }

    get active() {
      return this.items.size > 0;
    }

    _activity() {
      if (this.opts.onActivity) this.opts.onActivity(this.items.size > 0);
    }

    /* ------------------------------------------------------------ play */

    /**
     * @param wave {textStyle, emojiStyle, texts:[{text,emoji,personal}], emojis:[string]}
     */
    play(wave) {
      if (this.destroyed || !wave) return;
      if (this._clearT) this._finishClear();
      const speed = this.settings.appearance.speed;
      const t = this.settings.timing;
      const textDur = () => (U.rand(t.durationMinSec, t.durationMaxSec) * 1000) / speed;

      // emojis
      const emojis = wave.emojis || [];
      const hearts = wave.emojiStyle === 'rising-hearts';
      const full = this.settings.appearance.position === 'spread';
      const lane = this._lane();
      const { w, m } = this._size();
      // Full screen: shuffle the emojis into evenly spread columns across the
      // whole width (with jitter), so the screen fills like a reels reaction stream.
      const cols = U.shuffle(emojis.map((_, i) => i));
      const colW = (w - 2 * m) / Math.max(1, emojis.length);
      const origins = full
        ? [0, 1, 2].map(() => U.rand(m + 30, Math.max(m + 31, w - m - 60)))
        : [U.rand(lane[0] + 20, Math.max(lane[0] + 21, lane[1] - 40))];
      let at = hearts ? 150 : 0;
      if (wave.emojiStyle === 'angry-storm') {
        // Angry Storm: every reaction slams in big, scattered over the screen.
        emojis.slice(0, 8).forEach((e) => {
          this._later(() => this._spawnGiant(e, U.rand(0.45, 0.75)), at);
          at += U.rand(260, 520) / speed;
        });
      } else {
        emojis.forEach((e, i) => {
          const x = full && !hearts ? m + (cols[i] + U.rand(0.1, 0.9)) * colW : null;
          const origin = origins[i % origins.length];
          this._later(() => this._spawnEmoji(e, wave.emojiStyle, origin, x), at);
          at += hearts ? U.rand(90, 170) : (full ? U.rand(150, 380) : U.rand(240, 560)) / speed;
        });
      }
      // Giant angry reactions on top (Firm / Aggressive, or the option).
      (wave.giants || []).forEach((e, i) => {
        this._later(() => this._spawnGiant(e, 1), 450 + i * 650);
      });
      if (this.settings.general.intensity === 'aggressive') {
        this._later(() => this.flash(), 300);
        if ((wave.texts || []).length) this._later(() => this.flash(), 2600);
      }

      // texts
      const texts = wave.texts || [];
      let tAt = emojis.length ? U.rand(350, 800) : 80;
      texts.forEach((item, i) => {
        const dur = textDur();
        this._later(() => this._spawnText(item, wave.textStyle, dur, 0), tAt);
        tAt += wave.textStyle === 'gentle-fade' ? dur * 0.62 : U.rand(1100, 1800) / speed;
        if (wave.textStyle === 'particle') tAt -= 300;
        void i;
      });
      return { textsEndAt: tAt };
    }

    _track(node, kind, dur) {
      this.items.add(node);
      if (kind === 'text') this.textCount++;
      else this.emojiCount++;
      if (this.items.size === 1) this._activity();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        node.remove();
        this.items.delete(node);
        if (kind === 'text') this.textCount--;
        else this.emojiCount--;
        if (this.items.size === 0) this._activity();
      };
      node.addEventListener('animationend', (ev) => {
        if (ev.target === node) finish();
      });
      this._later(finish, dur + 1500); // safety net
      node._finish = finish;
      return finish;
    }

    /** Quick fade-out for a single item (dismiss / done / pop). */
    _dismiss(node, how) {
      if (!node || node._gone) return;
      node._gone = true;
      node.classList.add(how || 'gone');
      this._later(() => node._finish && node._finish(), 320);
    }

    /** Particle burst at layer coordinates (x, y). */
    _burst(x, y, opts) {
      if (this.reducedMotion()) return;
      opts = opts || {};
      const n = opts.count || 12;
      const box = el('div', 'burst');
      box.style.left = Math.round(x) + 'px';
      box.style.top = Math.round(y) + 'px';
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + U.rand(-0.25, 0.25);
        const d = U.rand(opts.min || 26, opts.max || 70);
        const p = el('span', 'p' + (i % 3 === 0 ? ' alt' : ''));
        p.style.setProperty('--tx', (Math.cos(a) * d).toFixed(1) + 'px');
        p.style.setProperty('--ty', (Math.sin(a) * d).toFixed(1) + 'px');
        p.style.setProperty('--s', U.rand(0.6, 1.3).toFixed(2));
        box.appendChild(p);
      }
      this.layer.appendChild(box);
      const t = setTimeout(() => box.remove(), 750);
      this.timers.add(t);
    }

    _centerOf(elm) {
      const r = elm.getBoundingClientRect();
      const L = this.layer.getBoundingClientRect();
      return { x: r.left - L.left + r.width / 2, y: r.top - L.top + r.height / 2 };
    }

    /** Make a reaction poppable (click / tap). */
    _poppable(node, target) {
      const ix = this.settings.interaction;
      if (!ix || !ix.interactive || !ix.popEmojis) return;
      target.classList.add('hit');
      target.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (node._gone) return;
        const c = this._centerOf(target);
        this._burst(c.x, c.y, { count: 14, max: 90 });
        this.sound('pop');
        this._dismiss(node, 'popped');
        if (this.opts.onItemAction) this.opts.onItemAction('pop', null);
      });
    }

    /** Giant angry reaction: slams in, shakes, then drops away. */
    _spawnGiant(token, factor) {
      if (this.destroyed || !token) return;
      if ([...this.items].filter((n) => n._giant).length >= MAX_GIANTS) return;
      const { w, h, m } = this._size();
      const sz = Math.round(Math.min(this.settings.emoji.giantSize * factor * U.rand(0.88, 1.12), Math.min(w, h) * 0.6));
      const art = this._media(token, sz);
      if (!art) return;
      const node = el('div', 'item s-giant');
      const g = el('span', 'giant');
      g.appendChild(art);
      node.appendChild(g);
      const x = U.rand(m, Math.max(m, w - sz - m));
      const y = U.rand(h * 0.1, Math.max(h * 0.1, h * 0.78 - sz));
      const dur = (U.rand(2.8, 3.6) * 1000) / this.settings.appearance.speed;
      node.style.left = Math.round(x) + 'px';
      node.style.top = Math.round(y) + 'px';
      node.style.setProperty('--dur', Math.round(dur) + 'ms');
      node.style.setProperty('--rot', U.rand(-16, 16).toFixed(0) + 'deg');
      node._giant = true;
      this.stage.appendChild(node);
      this._track(node, 'emoji', dur);
      this._poppable(node, g);
      this.sound('slam');
      if (this.settings.general.intensity === 'aggressive') this.flash();
    }

    _spawnText(item, style, dur, tries) {
      if (this.destroyed) return;
      const max = this.settings.timing.maxSimultaneous;
      if (this.textCount >= max) {
        if (tries < 24) this._later(() => this._spawnText(item, style, dur, tries + 1), 500);
        return;
      }
      const { w, h, m } = this._size();
      const dir = this.settings.appearance.direction;
      const node = el('div', 'item s-' + style + (item.personal ? ' personal' : ''));
      const sway = el('div', 'sway');
      const iconPx = Math.round(this.settings.appearance.fontSize * (style === 'gentle-fade' ? 1.7 : style === 'live-reaction' ? 1.3 : 1.35));
      const iconNode = this._media(item.emoji, iconPx);
      const bubble = el('div', 'bubble' + (iconNode ? '' : ' no-em') + (item.intention ? ' intention' : ''));
      if (iconNode) {
        const em = el('span', 'em');
        em.appendChild(iconNode);
        bubble.appendChild(em);
      }
      bubble.appendChild(el('span', 'tx', item.text));
      const ix = this.settings.interaction;
      if (ix && ix.interactive && ix.quickActions) {
        const acts = el('span', 'acts');
        const realMsg = item.id && !['fallback', 'nudge', 'intention'].includes(item.id);
        const mk = (k, glyph, title) => {
          const b = el('button', 'qa qa-' + k, glyph);
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.addEventListener('pointerdown', (e) => e.stopPropagation());
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const c = this._centerOf(b);
            if (k === 'fav') {
              b.classList.add('on');
              this._burst(c.x, c.y, { count: 8, max: 40 });
              this.sound('pop');
            } else if (k === 'done') {
              this._burst(c.x, c.y, { count: 14, max: 80 });
              this.sound('chime');
              this._dismiss(node);
            } else this._dismiss(node);
            if (this.opts.onItemAction) this.opts.onItemAction(k === 'fav' ? 'favorite' : k, item);
          });
          acts.appendChild(b);
        };
        if (realMsg) mk('fav', '♥', 'Favourite — show this more often');
        mk('done', '✓', "I'm on it");
        mk('hide', '✕', 'Dismiss');
        bubble.appendChild(acts);
        bubble.classList.add('hit');
      }
      sway.appendChild(bubble);
      node.appendChild(sway);
      node.style.setProperty('--dur', Math.round(dur) + 'ms');
      node.style.visibility = 'hidden';
      this.stage.appendChild(node);

      const iw = Math.min(node.offsetWidth, w - 2 * m);
      const ih = node.offsetHeight;
      const lane = this._lane();
      let x;
      let y;
      const xIn = (a, b) => U.rand(a, Math.max(a, b - iw));

      if (style === 'particle') {
        let best = null;
        for (let i = 0; i < 8; i++) {
          const cx = xIn(this.settings.appearance.position === 'spread' ? m : lane[0], lane[1]);
          const cy = U.rand(h * 0.14, Math.max(h * 0.14, h * 0.82 - ih));
          const free = ![...this.items].some((o) => {
            const r = o._rect;
            return r && cx < r.x + r.w + 12 && cx + iw + 12 > r.x && cy < r.y + r.h + 12 && cy + ih + 12 > r.y;
          });
          best = { x: cx, y: cy };
          if (free) break;
        }
        x = best.x;
        y = best.y;
        node.style.setProperty('--dx', U.rand(-14, 14).toFixed(1) + 'px');
        node.style.setProperty('--dy', (dir === 'down' ? 1 : -1) * U.rand(8, 22) + 'px');
      } else if (style === 'side-float') {
        const pos = this.settings.appearance.position;
        const fromLeft = pos === 'left' || ((pos === 'center' || pos === 'spread') && Math.random() < 0.5);
        x = fromLeft ? m : w - m - iw;
        node.classList.toggle('from-left', fromLeft);
        node.style.setProperty('--from', fromLeft ? '-1' : '1');
        let cy = 0;
        for (let i = 0; i < 8; i++) {
          cy = U.rand(h * 0.22, Math.max(h * 0.22, h * 0.78 - ih));
          const clash = [...this.items].some((o) => o._rect && Math.abs(o._rect.y - cy) < ih + 14 && o._side);
          if (!clash) break;
        }
        y = cy;
        node._side = true;
        node.style.setProperty('--drift', (dir === 'down' ? 1 : -1) * U.rand(4, 14) + 'px');
      } else if (style === 'gentle-fade') {
        const cx = (lane[0] + lane[1]) / 2 - iw / 2;
        x = U.clamp(cx + U.rand(-24, 24), m, w - m - iw);
        let base = dir === 'down' ? h * 0.16 : h * 0.66 - ih;
        const stacked = [...this.items].filter((o) => o._fade).length;
        base += (dir === 'down' ? 1 : -1) * stacked * (ih + 14);
        y = U.clamp(base, m, h - ih - m);
        node._fade = true;
      } else {
        // live-reaction / bubbles: rise (or fall) through the lane — or the whole screen
        const fullText = this.settings.appearance.position === 'spread';
        x = xIn(lane[0], lane[1]);
        const travel = h * (fullText ? U.rand(0.66, 0.86) : U.rand(0.42, 0.62));
        if (dir === 'down') {
          y = U.rand(m, m + h * 0.06);
          node.style.setProperty('--travel', travel.toFixed(0) + 'px');
        } else {
          y = h - ih - U.rand(m + 24, m + 24 + h * 0.08);
          node.style.setProperty('--travel', (-travel).toFixed(0) + 'px');
        }
        node.style.setProperty('--sway', U.rand(5, 14).toFixed(1) + 'px');
        node.style.setProperty('--swaydur', U.rand(1.6, 2.8).toFixed(2) + 's');
      }

      x = U.clamp(x, m, Math.max(m, w - m - iw));
      node.style.left = Math.round(x) + 'px';
      node.style.top = Math.round(y) + 'px';
      node._rect = { x, y, w: iw, h: ih };
      node.style.visibility = '';
      this._track(node, 'text', dur);
    }

    _spawnEmoji(emoji, style, origin, fixedX) {
      if (this.destroyed || this.emojiCount >= MAX_EMOJIS || !emoji) return;
      const { w, h, m } = this._size();
      const a = this.settings.appearance;
      const hearts = style === 'rising-hearts';
      const full = a.position === 'spread';
      const speed = a.speed * this.settings.emoji.speed;
      // Full screen travels the whole height, so it gets proportionally more time.
      const dur = ((hearts ? (full ? U.rand(3.6, 5.2) : U.rand(2.8, 4.2)) : full ? U.rand(6, 8.8) : U.rand(3.8, 5.8)) * 1000) / speed;
      const node = el('div', 'item s-' + (hearts ? 'rising-hearts' : 'floating-emojis'));
      const sway = el('div', 'sway');
      const v = this.settings.emoji.sizeVariety;
      const size = a.emojiSize * U.rand(1 - v * 0.45, 1 + v * 0.6);
      const art = this._media(emoji, Math.round(size));
      if (!art) return;
      const glyph = el('span', 'emoji');
      glyph.style.fontSize = size.toFixed(1) + 'px';
      glyph.appendChild(art);
      sway.appendChild(glyph);
      node.appendChild(sway);

      const lane = this._lane();
      let x = hearts ? origin + U.rand(-22, 22) : fixedX != null ? fixedX : U.rand(lane[0], Math.max(lane[0], lane[1] - size));
      x = U.clamp(x, 2, Math.max(2, w - size - 2));
      const travel = full
        ? h * (hearts ? U.rand(0.55, 0.8) : U.rand(0.95, 1.1)) + size
        : h * (hearts ? U.rand(0.3, 0.52) : U.rand(0.4, 0.72));
      let y;
      if (a.direction === 'down') {
        y = full ? -size * 0.6 : U.rand(m, m + 30);
        node.style.setProperty('--travel', travel.toFixed(0) + 'px');
      } else {
        // full screen: enter from just below the bottom edge, like reels reactions
        y = full ? h - size * 0.4 : h - size - U.rand(m + 10, m + 50);
        node.style.setProperty('--travel', (-travel).toFixed(0) + 'px');
      }
      node.style.left = Math.round(x) + 'px';
      node.style.top = Math.round(y) + 'px';
      node.style.setProperty('--dur', Math.round(dur) + 'ms');
      node.style.setProperty('--sway', U.rand(hearts ? 8 : 5, hearts ? 22 : 16).toFixed(1) + 'px');
      node.style.setProperty('--swaydur', U.rand(1.2, 2.3).toFixed(2) + 's');
      node.style.setProperty('--rot', U.rand(-28, 28).toFixed(0) + 'deg');
      node.style.setProperty('--dx', U.rand(-50, 50).toFixed(0) + 'px');
      this.stage.appendChild(node);
      this._track(node, 'emoji', dur);
      this._poppable(node, glyph);
    }

    /* ------------------------------------------------------------ teardown */

    /** Fade everything out gracefully and cancel pending spawns. */
    clear() {
      this._clearTimers();
      if (!this.items.size) return;
      this.stage.classList.add('clearing');
      this._clearT = setTimeout(() => this._finishClear(), 480);
    }

    _finishClear() {
      clearTimeout(this._clearT);
      this._clearT = null;
      this.items.forEach((n) => n.remove());
      this.items.clear();
      this.textCount = 0;
      this.emojiCount = 0;
      this.stage.classList.remove('clearing');
      this._activity();
    }

    destroy() {
      this.destroyed = true;
      clearTimeout(this._clearT);
      this._clearTimers();
      this.items.forEach((n) => n.remove());
      this.items.clear();
      if (this.mql && this.mql.removeEventListener) this.mql.removeEventListener('change', this._onMql);
      this.stage.remove();
    }
  }

  STILL.AnimationEngine = AnimationEngine;
})(typeof globalThis !== 'undefined' ? globalThis : self);
