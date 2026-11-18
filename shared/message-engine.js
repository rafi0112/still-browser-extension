/*
 * STILL. — message selection engine.
 * Pure functions: given settings + rotation state, decide what a "wave" contains.
 * Used by the service worker (real waves, so rotation is shared by every tab of a
 * site) and by onboarding / options / popup previews (ephemeral state).
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;

  const TEXT_STYLES = STILL.ANIMATION_STYLES.filter((s) => s.kind === 'text').map((s) => s.id);
  const EMOJI_STYLES = STILL.ANIMATION_STYLES.filter((s) => s.kind === 'emoji').map((s) => s.id);

  function freshState() {
    return { recent: [], seq: 0, textOrder: [], emojiOrder: [], lastText: null, lastEmoji: null, reminderIdx: -1 };
  }

  /** Messages eligible right now, respecting enabled flags, categories and the active collection. */
  function messagePool(settings) {
    const m = settings.messages;
    const cats = new Set(m.categories);
    return m.items.filter(
      (it) =>
        it.enabled &&
        cats.has(it.category) &&
        (m.activeCollection === 'all' || it.collection === m.activeCollection)
    );
  }

  function allEmojis(settings) {
    return settings.emoji.selected.slice();
  }

  /** Rotate through a list of styles without immediate repeats. */
  function nextFromOrder(candidates, orderKey, lastKey, state, mode) {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let order = (state[orderKey] || []).filter((s) => candidates.includes(s));
    if (!order.length) {
      order = mode === 'sequential' ? candidates.slice() : U.shuffle(candidates);
      if (mode !== 'sequential' && order[0] === state[lastKey] && order.length > 1) order.push(order.shift());
    }
    const next = order.shift();
    state[orderKey] = order;
    state[lastKey] = next;
    return next;
  }

  function chooseStyles(settings, state) {
    const sel = settings.animation.styles;
    const mode = settings.animation.rotation;
    if (sel.includes('random-mix')) {
      const t = U.pick(TEXT_STYLES.filter((s) => s !== state.lastText)) || 'live-reaction';
      const e = U.pick(EMOJI_STYLES);
      state.lastText = t;
      state.lastEmoji = e;
      return { textStyle: t, emojiStyle: e };
    }
    const tc = sel.filter((s) => TEXT_STYLES.includes(s));
    const ec = sel.filter((s) => EMOJI_STYLES.includes(s));
    return {
      textStyle: nextFromOrder(tc, 'textOrder', 'lastText', state, mode) || 'live-reaction',
      emojiStyle: nextFromOrder(ec, 'emojiOrder', 'lastEmoji', state, mode) || 'floating-emojis'
    };
  }

  function weightOf(item, settings) {
    let w = 1;
    if (settings.messages.preferCustom && item.custom) w *= 3;
    if (item.favorite) w *= 2;
    return w;
  }

  function weightedPick(items, settings) {
    const total = items.reduce((s, it) => s + weightOf(it, settings), 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= weightOf(it, settings);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function pickMessages(settings, state, count) {
    const out = [];
    if (count <= 0) return out;
    const pool = messagePool(settings);
    if (!pool.length) {
      out.push({ id: 'fallback', text: STILL.FALLBACK_MESSAGE, custom: false, favorite: false });
      return out;
    }
    const windowSize = Math.min(settings.messages.noRepeatWindow, Math.max(0, pool.length - 1));
    for (let i = 0; i < count && out.length < pool.length; i++) {
      let item;
      if (settings.messages.rotation === 'sequential') {
        item = pool[state.seq % pool.length];
        state.seq = (state.seq + 1) % 100000;
      } else {
        const recent = new Set(state.recent.slice(-windowSize));
        out.forEach((o) => recent.add(o.id));
        let candidates = pool.filter((p) => !recent.has(p.id));
        if (!candidates.length) candidates = pool.filter((p) => !out.some((o) => o.id === p.id));
        if (!candidates.length) break;
        item = weightedPick(candidates, settings);
      }
      out.push(item);
      state.recent.push(item.id);
      if (state.recent.length > 40) state.recent = state.recent.slice(-40);
    }
    return out;
  }

  /**
   * Build a wave.
   * opts.stage: 'gentle' | 'sentence' | 'normal' | 'reminder' | 'preview'
   * opts.minutes: minutes spent on the site (for reminder text)
   */
  function buildWave(settings, prevState, opts) {
    opts = opts || {};
    const state = Object.assign(freshState(), prevState ? STILL.clone(prevState) : {});
    const stage = opts.stage || 'normal';
    const { textStyle, emojiStyle } = chooseStyles(settings, state);

    let emojiPool = allEmojis(settings);
    if (emojiStyle === 'rising-hearts') emojiPool = STILL.HEART_EMOJIS.concat(emojiPool.slice(0, 4));
    let emojiCount = emojiPool.length ? settings.emoji.emojisPerWave : 0;

    let textCount;
    if (stage === 'gentle') textCount = settings.emoji.emojiOnlyReactions && emojiCount > 0 ? 0 : 1;
    else if (stage === 'sentence') textCount = Math.min(1, Math.max(1, settings.timing.messagesPerWave));
    else textCount = settings.timing.messagesPerWave;

    if (textCount === 0 && !settings.emoji.emojiOnlyReactions) textCount = 1;
    if (textCount === 0 && emojiCount === 0) textCount = 1;
    if (stage === 'gentle' && emojiCount > 0) emojiCount = Math.max(3, Math.ceil(emojiCount * 0.7));

    const picked = pickMessages(settings, state, textCount);
    const icon = () => {
      const mode = settings.appearance.bubbleIcon;
      if (mode === 'none') return '';
      if (mode === 'logo' && settings.brand.logo) return 'img:' + settings.brand.logo;
      const own = allEmojis(settings);
      return own.length ? U.pick(own) : emojiPool.length ? U.pick(emojiPool) : '';
    };
    const texts = picked.map((m) => ({
      id: m.id,
      text: m.text,
      emoji: icon(),
      personal: !!(m.custom || m.favorite)
    }));

    // Today's intention takes the lead now and then (always on the 'sentence' stage).
    const intention = U.intentionToday(settings);
    if (intention && settings.intention.inWaves && texts.length && stage !== 'gentle' && (stage === 'sentence' || Math.random() < 0.4)) {
      texts[0] = { id: 'intention', text: 'Today: ' + intention, emoji: texts[0].emoji, personal: true, intention: true };
    }

    // Sprinkle a short focus nudge occasionally (never replacing a personal message).
    if (settings.messages.focusNudges && texts.length >= 2 && Math.random() < 0.3) {
      const idx = texts.findIndex((t, i) => i > 0 && !t.personal);
      if (idx > 0) texts[idx] = { id: 'nudge', text: U.pick(STILL.FOCUS_NUDGES), emoji: texts[idx].emoji, personal: false, nudge: true };
    }

    const emojis = [];
    // Shuffled deck: every selected reaction appears before any one repeats.
    let deck = [];
    for (let i = 0; i < emojiCount; i++) {
      if (!deck.length) deck = U.shuffle(emojiPool);
      emojis.push(deck.pop());
    }

    let reminder = null;
    if (stage === 'reminder') {
      const kind = opts.reminderKind || 'time';
      let text;
      if (kind === 'focus') {
        const left = Math.max(1, Math.round(opts.focusLeftMin || 1));
        text = U.pick(STILL.FOCUS_REMINDERS).replace('{left}', String(left));
      } else if (kind === 'budget') {
        text = U.pick(STILL.BUDGET_REMINDERS).replace('{budget}', String(opts.budgetMin || '')).replace('{site}', opts.site || 'this site');
      } else {
        let idx = Math.floor(Math.random() * STILL.REMINDERS.length);
        if (idx === state.reminderIdx) idx = (idx + 1) % STILL.REMINDERS.length;
        state.reminderIdx = idx;
        const minutes = Math.max(1, Math.round(opts.minutes || settings.timing.reminderAfterMin));
        text = STILL.REMINDERS[idx].replace('{minutes}', String(minutes));
      }
      reminder = { text, kind, sub: intention ? 'Today: ' + intention : '' };
    }

    return { textStyle, emojiStyle, texts, emojis, reminder, stage, state };
  }

  STILL.messageEngine = { freshState, messagePool, buildWave, TEXT_STYLES, EMOJI_STYLES };
})(typeof globalThis !== 'undefined' ? globalThis : self);
