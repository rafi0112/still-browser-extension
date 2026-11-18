/*
 * STILL. — wave scheduler (service worker).
 *
 * Decides, from a site's session and the user's timing settings, whether a wave is
 * due and what "stage" of gentle escalation it belongs to:
 *
 *   before initial delay  → nothing
 *   1st wave              → 'gentle'   (a few floating reactions)
 *   2nd wave              → 'sentence' (one motivational sentence)
 *   later waves           → 'normal'   (configured messages + emojis)
 *   after reminderAfter   → 'reminder' (a slightly more noticeable check-in card,
 *                                       repeated at most every reminderRepeat min)
 *
 * With escalation turned off every wave is 'normal' and reminders never appear.
 * Because the decision is made centrally and the session is shared, two tabs of
 * the same site can never both fire the same wave.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  const MIN = 60 * 1000;

  const scheduler = {
    isPaused(settings, now) {
      return settings.pausedUntil > (now || Date.now());
    },

    /** Returns { due:boolean, msUntilDue:number, stage?:string } without mutating. */
    /** Timing actually in force: focus sessions check in sooner and twice as often. */
    effectiveTiming(settings) {
      const t = Object.assign({}, settings.timing);
      if (STILL.utils.focusActive(settings)) {
        t.initialDelayMin = Math.min(t.initialDelayMin, 0.5);
        t.intervalMin = Math.max(0.5, t.intervalMin / 2);
      }
      return t;
    },

    evaluate(settings, s) {
      const t = this.effectiveTiming(settings);
      if (!settings.enabled || !settings.onboarded) return { due: false, msUntilDue: 5 * MIN };
      if (this.isPaused(settings)) return { due: false, msUntilDue: Math.max(1000, settings.pausedUntil - Date.now()) };
      if (!STILL.utils.focusActive(settings) && !STILL.utils.inSchedule(settings)) return { due: false, msUntilDue: MIN };

      const nextAt = s.waves === 0 ? t.initialDelayMin * MIN : s.lastWaveActiveMs + t.intervalMin * MIN;
      const remaining = nextAt - s.activeMs;
      if (remaining > 0) return { due: false, msUntilDue: remaining };

      let stage = 'normal';
      if (settings.general.escalation) {
        if (s.waves === 0) stage = 'gentle';
        else if (s.waves === 1) stage = 'sentence';
        const reminderDue =
          s.activeMs >= t.reminderAfterMin * MIN &&
          (s.lastReminderActiveMs == null || s.activeMs - s.lastReminderActiveMs >= t.reminderRepeatMin * MIN);
        if (reminderDue) stage = 'reminder';
      }
      return { due: true, msUntilDue: t.intervalMin * MIN, stage };
    },

    /** Mutates the session to record that a wave was shown and returns the wave. */
    commit(settings, s, stage, extra) {
      s.waves += 1;
      s.lastWaveActiveMs = s.activeMs;
      if (stage === 'reminder' && !(extra && extra.reminderKind && extra.reminderKind !== 'time')) s.lastReminderActiveMs = s.activeMs;
      const wave = STILL.messageEngine.buildWave(
        settings,
        s.rotation,
        Object.assign({ stage, minutes: s.activeMs / MIN }, extra || {})
      );
      s.rotation = wave.state;
      delete wave.state;
      return wave;
    }
  };

  STILL.scheduler = scheduler;
})(typeof globalThis !== 'undefined' ? globalThis : self);
