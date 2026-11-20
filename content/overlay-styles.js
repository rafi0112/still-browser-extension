/*
 * STILL. — overlay stylesheet.
 * Shipped as a JS string so it can be injected into a closed Shadow DOM on any
 * website without exposing a web-accessible resource (which would let pages
 * fingerprint the extension). The same sheet powers the in-extension previews.
 * Only transform + opacity are animated (compositor-friendly, no layout work).
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  STILL.OVERLAY_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.layer {
  position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  contain: strict;
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  --emoji-font: "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif;
}

.item {
  position: absolute; left: 0; top: 0;
  pointer-events: none;
  will-change: transform, opacity;
  opacity: 0;
  animation-duration: var(--dur);
  animation-fill-mode: both;
  animation-delay: 0ms;
  z-index: 2;
}
.item.s-floating-emojis, .item.s-rising-hearts { z-index: 1; }
.sway { will-change: transform; }


/* ------------------------------------------------------------ bubbles */
.bubble {
  display: inline-flex; align-items: center; gap: 9px;
  max-width: var(--maxw);
  padding: 7px 14px 7px 7px;
  background: var(--bg);
  color: var(--fg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-size: var(--fs);
  line-height: var(--lh, 1.38);
  font-weight: var(--fw, 500);
  letter-spacing: var(--ls, 0px);
  text-transform: var(--tt, none);
  white-space: normal;
  overflow-wrap: anywhere;
}
.bubble .em {
  flex: none;
  width: calc(var(--fs) * 2); height: calc(var(--fs) * 2);
  display: grid; place-items: center;
  border-radius: 999px;
  background: var(--accent-soft);
  font-family: var(--emoji-font);
  font-size: calc(var(--fs) * 1.1);
  line-height: 1;
}
.bubble.no-em { padding-left: 14px; }
.bubble .em .emoji-img { display: block; }
.bubble .em .emoji-txt { line-height: 1; }
.s-live-reaction .bubble .em .emoji-img { width: calc(var(--fs) * 1.3) !important; height: calc(var(--fs) * 1.3) !important; }
.bubble.intention { box-shadow: var(--shadow), inset 0 0 0 1.5px var(--accent); }
.bubble.intention .tx { font-weight: 600; }
.layer.glass .bubble, .layer.glass .reminder, .layer.glass .dock, .layer.glass .breath {
  -webkit-backdrop-filter: blur(16px) saturate(1.7); backdrop-filter: blur(16px) saturate(1.7);
}
.emoji .emoji-img { display: block; filter: drop-shadow(0 4px 6px rgba(0,0,0,.18)); }
.emoji .emoji-txt { display: block; }
.personal .bubble { box-shadow: var(--shadow), inset 0 0 0 1px var(--accent-line); }
.personal .bubble .tx::after {
  content: ""; display: inline-block; width: 5px; height: 5px; margin-left: 7px;
  border-radius: 99px; background: var(--accent); vertical-align: 2px;
}

/* Live reaction */
.s-live-reaction { animation-name: still-rise; animation-timing-function: cubic-bezier(.3,.1,.35,1); }
.s-live-reaction .sway { animation: still-sway var(--swaydur) ease-in-out infinite alternate; }

/* Motivational bubbles */
.s-bubbles { animation-name: still-pop-rise; animation-timing-function: cubic-bezier(.25,.1,.3,1); }
.s-bubbles .sway { animation: still-sway var(--swaydur) ease-in-out infinite alternate; }
.s-bubbles .bubble {
  padding: 11px 17px; border-radius: max(var(--radius), 20px);
  font-size: calc(var(--fs) * 1.04);
  position: relative;
}
.s-bubbles .bubble::before, .s-bubbles .bubble::after {
  content: ""; position: absolute; background: var(--bg); border-radius: 99px; box-shadow: var(--shadow-sm);
}
.s-bubbles .bubble::before { width: 9px; height: 9px; left: 18px; bottom: -11px; }
.s-bubbles .bubble::after { width: 5px; height: 5px; left: 12px; bottom: -19px; }
.s-bubbles .bubble .em { width: auto; height: auto; background: none; font-size: calc(var(--fs) * 1.15); }

/* Particle messages */
.s-particle { animation-name: still-particle; animation-timing-function: cubic-bezier(.4,0,.2,1); }
.s-particle .bubble {
  padding: 5px 11px; gap: 6px;
  font-size: calc(var(--fs) * 0.9);
  border-radius: 999px;
  background: var(--bg-soft);
  box-shadow: var(--shadow-sm);
}
.s-particle .bubble .em { width: auto; height: auto; background: none; font-size: calc(var(--fs) * 0.95); }

/* Side float */
.s-side-float { animation-name: still-side; animation-timing-function: cubic-bezier(.22,.8,.3,1); }
.s-side-float .bubble {
  padding: 10px 16px 10px 12px; border-radius: var(--radius);
  border-left: 3px solid var(--accent);
}
.s-side-float.from-left .bubble { border-left: 0; border-right: 3px solid var(--accent); }
.s-side-float .bubble .em { background: none; width: auto; height: auto; font-size: calc(var(--fs) * 1.2); }

/* Gentle fade */
.s-gentle-fade { animation-name: still-fade; animation-timing-function: ease-in-out; }
.s-gentle-fade .bubble {
  flex-direction: column; gap: 6px; text-align: center;
  padding: 14px 22px 15px;
  font-family: var(--display);
  font-size: calc(var(--fs) * 1.14);
  font-weight: 500;
  line-height: 1.32;
  border-radius: max(var(--radius), 14px);
}
.s-gentle-fade .bubble .em { width: auto; height: auto; background: none; font-size: calc(var(--fs) * 1.35); }

/* ------------------------------------------------------------ emojis */
.emoji {
  display: block;
  font-family: var(--emoji-font);
  font-size: var(--esize);
  line-height: 1;
  user-select: none;
}
.emoji .emoji-txt { filter: drop-shadow(0 2px 3px rgba(0,0,0,.12)); }
.brand-logo { display: inline-flex; align-items: center; gap: 6px; }
.brand-logo .emoji-img { border-radius: 6px; display: block; }
.s-floating-emojis { animation-name: still-emoji-rise; animation-timing-function: cubic-bezier(.33,.0,.4,1); }
.layer.full .s-floating-emojis { animation-name: still-emoji-stream; animation-timing-function: linear; }
.s-floating-emojis .sway { animation: still-sway var(--swaydur) ease-in-out infinite alternate; }
.s-rising-hearts { animation-name: still-heart-rise; animation-timing-function: cubic-bezier(.2,.6,.35,1); }
.s-rising-hearts .sway { animation: still-sway var(--swaydur) ease-in-out infinite alternate; }

/* ------------------------------------------------------------ keyframes */
@keyframes still-sway {
  from { transform: translate3d(calc(var(--sway) * -1), 0, 0); }
  to   { transform: translate3d(var(--sway), 0, 0); }
}
@keyframes still-rise {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(.88); }
  9%   { opacity: 1; transform: translate3d(0, calc(var(--travel) * .08), 0) scale(1); }
  70%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(0, var(--travel), 0) scale(.97); }
}
@keyframes still-pop-rise {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(.6); }
  6%   { opacity: 1; transform: translate3d(0, calc(var(--travel) * .04), 0) scale(1.05); }
  11%  { transform: translate3d(0, calc(var(--travel) * .08), 0) scale(1); }
  74%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(0, var(--travel), 0) scale(.96); }
}
@keyframes still-particle {
  0%   { opacity: 0; transform: translate3d(0, 8px, 0) scale(.92); }
  18%  { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
  78%  { opacity: 1; transform: translate3d(var(--dx), var(--dy), 0) scale(1); }
  100% { opacity: 0; transform: translate3d(calc(var(--dx) * 1.5), calc(var(--dy) * 1.5), 0) scale(.96); }
}
@keyframes still-side {
  0%   { opacity: 0; transform: translate3d(calc(var(--from) * 70px), 0, 0); }
  16%  { opacity: 1; transform: translate3d(0, 0, 0); }
  80%  { opacity: 1; transform: translate3d(calc(var(--from) * -10px), calc(var(--drift) * .6), 0); }
  100% { opacity: 0; transform: translate3d(calc(var(--from) * -30px), var(--drift), 0); }
}
@keyframes still-fade {
  0%   { opacity: 0; transform: translate3d(0, 10px, 0); }
  20%  { opacity: 1; transform: translate3d(0, 0, 0); }
  80%  { opacity: 1; transform: translate3d(0, -4px, 0); }
  100% { opacity: 0; transform: translate3d(0, -12px, 0); }
}
@keyframes still-emoji-rise {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(.3) rotate(0deg); }
  8%   { opacity: 1; transform: translate3d(0, calc(var(--travel) * .05), 0) scale(1.14) rotate(0deg); }
  14%  { transform: translate3d(0, calc(var(--travel) * .1), 0) scale(1); }
  70%  { opacity: .95; }
  100% { opacity: 0; transform: translate3d(0, var(--travel), 0) scale(.85) rotate(var(--rot)); }
}
@keyframes still-emoji-stream {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(.5) rotate(0deg); }
  6%   { opacity: 1; transform: translate3d(0, calc(var(--travel) * .05), 0) scale(1.08) rotate(0deg); }
  12%  { transform: translate3d(0, calc(var(--travel) * .11), 0) scale(1); }
  82%  { opacity: .95; }
  100% { opacity: 0; transform: translate3d(0, var(--travel), 0) scale(.9) rotate(var(--rot)); }
}
@keyframes still-heart-rise {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(.2); }
  10%  { opacity: 1; transform: translate3d(calc(var(--dx) * .3), calc(var(--travel) * .08), 0) scale(1.2); }
  18%  { transform: translate3d(calc(var(--dx) * .5), calc(var(--travel) * .15), 0) scale(1); }
  65%  { opacity: .9; }
  100% { opacity: 0; transform: translate3d(var(--dx), var(--travel), 0) scale(.7) rotate(var(--rot)); }
}
@keyframes still-rm-fade {
  0% { opacity: 0; } 18% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; }
}

/* reduced motion: opacity only, no travel or sway */
.rm .item { animation-name: still-rm-fade !important; animation-timing-function: ease-in-out !important; }
.rm .sway { animation: none !important; }

/* fast clear (Hide button / pause) */
.stage { position: absolute; inset: 0; transition: opacity .45s ease; }
.stage.clearing { opacity: 0; }

/* ------------------------------------------------------------ dock */
.dock {
  position: absolute; bottom: 14px;
  display: flex; align-items: center; gap: 2px;
  padding: 4px;
  background: var(--bg-solid);
  color: var(--fg);
  border-radius: 999px;
  box-shadow: var(--shadow);
  font: 500 12px/1 var(--font);
  opacity: 0; transform: translate3d(0, 6px, 0);
  visibility: hidden;
  transition: opacity .35s ease, transform .35s ease, visibility 0s linear .35s;
  pointer-events: auto;
  z-index: 6;
}
.dock.show { opacity: 1; transform: none; visibility: visible; transition: opacity .35s ease, transform .35s ease, visibility 0s; }
.dock .brand { padding: 0 8px 0 9px; font-family: var(--display); font-weight: 600; font-size: 13px; letter-spacing: .02em; }
.dock .brand i { font-style: normal; color: var(--accent); }
.btn {
  all: unset; cursor: pointer;
  padding: 7px 11px; border-radius: 999px;
  font: 500 12px/1 var(--font); color: var(--fg);
  transition: background .2s ease;
}
.btn:hover { background: var(--accent-soft); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.btn.primary { background: var(--accent); color: var(--on-accent); }
.btn.primary:hover { background: var(--accent); filter: brightness(1.07); }

/* ------------------------------------------------------------ reminder card */
.reminder {
  position: absolute; bottom: 62px;
  width: min(340px, calc(100% - 32px));
  padding: 16px 18px 14px;
  background: var(--bg-solid);
  color: var(--fg);
  border-radius: max(var(--radius), 16px);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 18px 48px -12px rgba(0,0,0,.28);
  pointer-events: auto;
  z-index: 5;
  animation: still-reminder-in .7s cubic-bezier(.2,.8,.3,1) both;
}
.reminder.out { animation: still-reminder-out .45s ease both; }
.reminder .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font: 600 11px/1 var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.reminder .head .dot { width: 6px; height: 6px; border-radius: 99px; background: var(--accent); }
.reminder .msg { font-family: var(--display); font-size: 17px; line-height: 1.38; letter-spacing: -0.005em; margin: 0 0 14px; }
.reminder .sub { margin: -6px 0 14px; padding: 8px 10px; border-radius: 10px; background: var(--accent-soft); font: 600 12.5px/1.35 var(--font); }
.reminder .head .emoji-img { border-radius: 5px; }
.reminder.kind-focus .head { color: var(--accent); }

/* ------------------------------------------------------------ breathing */
.breath {
  position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%);
  width: min(320px, calc(100% - 32px)); padding: 20px 20px 16px; text-align: center;
  background: var(--bg-solid); color: var(--fg); border-radius: 24px; pointer-events: auto; z-index: 7;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 24px 60px -16px rgba(0,0,0,.32);
  animation: still-reminder-in .7s cubic-bezier(.2,.8,.3,1) both;
}
.breath.out { animation: still-reminder-out .45s ease both; }
.breath .orb-wrap { position: relative; width: 150px; height: 150px; margin: 4px auto 12px; display: grid; place-items: center; }
.breath .orb {
  width: 150px; height: 150px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.9), transparent 45%), var(--accent);
  opacity: .9; transform: scale(.42);
  animation: still-breathe 12s ease-in-out infinite;
  box-shadow: 0 0 0 10px var(--accent-soft), 0 0 0 22px var(--accent-soft);
}
.breath .ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px dashed var(--accent-line); }
@keyframes still-breathe {
  0% { transform: scale(.42); }
  33% { transform: scale(1); }      /* in 4s */
  50% { transform: scale(1); }      /* hold 2s */
  100% { transform: scale(.42); }   /* out 6s */
}
.rm .breath .orb { animation: still-breathe-rm 12s ease-in-out infinite; transform: scale(.75); }
@keyframes still-breathe-rm { 0%,100% { opacity: .35; } 33%,50% { opacity: 1; } }
.breath .phase { font-family: var(--display); font-size: 22px; letter-spacing: -0.01em; }
.breath .count { font: 500 12px/1 var(--font); color: var(--muted); margin-top: 6px; }
.breath .actions { display: flex; justify-content: center; margin-top: 12px; }
.reminder .actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.reminder .btn { padding: 8px 13px; background: var(--accent-soft); }
.reminder .btn.primary { background: var(--accent); }
@keyframes still-reminder-in {
  from { opacity: 0; transform: translate3d(0, 16px, 0) scale(.98); }
  to   { opacity: 1; transform: none; }
}
@keyframes still-reminder-out { to { opacity: 0; transform: translate3d(0, 10px, 0); } }
.rm .reminder, .rm .reminder.out { animation-name: still-rm-in; }
@keyframes still-rm-in { from { opacity: 0; } to { opacity: 1; } }
.rm .reminder.out { animation: still-rm-out .3s ease both; }

/* ============================================================ v1.2 */

/* ---------- premium interactions ---------- */
.layer.int .hit { pointer-events: auto; cursor: pointer; }
.layer.hp .item:hover, .layer.hp .item:hover .sway, .layer.hp .item:focus-within, .layer.hp .item:focus-within .sway { animation-play-state: paused !important; }
.layer.int .bubble.hit { transition: transform .2s ease, box-shadow .2s ease; }
.layer.int .bubble.hit:hover { transform: scale(1.035); box-shadow: var(--shadow), 0 0 0 2px var(--accent-line); }
.bubble .acts {
  display: inline-flex; gap: 3px; margin-left: 2px; flex: none;
  max-width: 0; overflow: hidden; opacity: 0;
  transition: max-width .25s ease, opacity .2s ease;
}
.bubble:hover .acts, .bubble:focus-within .acts { max-width: 120px; opacity: 1; }
.qa {
  all: unset; cursor: pointer; width: 24px; height: 24px; border-radius: 99px;
  display: grid; place-items: center; font: 700 12px/1 var(--font); color: var(--fg);
  background: var(--accent-soft); transition: background .15s ease, transform .15s ease;
}
.qa:hover { background: var(--accent); color: var(--on-accent); transform: scale(1.1); }
.qa:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.qa-fav.on { background: #ff4f6d; color: #fff; }
.s-gentle-fade .bubble .acts, .s-particle .bubble .acts { display: none; }

.emoji.hit { transition: transform .15s ease; }
.emoji.hit:hover { transform: scale(1.18); }
.item.gone > .sway { opacity: 0; transition: opacity .28s ease; }
.item.gone .bubble { transform: scale(.88); transition: transform .28s ease; }
.item.popped .emoji, .item.popped .giant { transform: scale(1.6); opacity: 0; transition: transform .22s ease-out, opacity .22s ease-out; }

.burst { position: absolute; width: 0; height: 0; pointer-events: none; z-index: 8; }
.burst .p {
  position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 99px;
  background: var(--accent); transform: translate(0, 0) scale(var(--s));
  animation: still-burst .62s cubic-bezier(.2,.7,.3,1) forwards;
}
.burst .p.alt { background: #ffd23f; border-radius: 2px; }
@keyframes still-burst {
  0% { opacity: 1; transform: translate(0, 0) scale(var(--s)); }
  100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0); }
}

/* ---------- giant angry reactions ---------- */
.item.s-giant { animation-name: still-slam; animation-timing-function: ease-out; z-index: 1; }
.giant { display: block; line-height: 1; }
.giant .emoji-img { display: block; filter: drop-shadow(0 14px 20px rgba(0,0,0,.28)); }
.giant .emoji-txt { display: block; font-family: var(--emoji-font); font-size: var(--esize); }
.giant.hit:hover { filter: brightness(1.08); }
@keyframes still-slam {
  0%   { opacity: 0; transform: scale(2.3) rotate(var(--rot)); }
  9%   { opacity: 1; transform: scale(.9) rotate(0deg); }
  13%  { transform: scale(1.08); }
  17%  { transform: scale(1); }
  21%  { transform: translate3d(-7px, 0, 0) rotate(-5deg); }
  25%  { transform: translate3d(7px, 0, 0) rotate(5deg); }
  29%  { transform: translate3d(-6px, 0, 0) rotate(-4deg); }
  33%  { transform: translate3d(5px, 0, 0) rotate(3deg); }
  37%  { transform: translate3d(-3px, 0, 0) rotate(-1deg); }
  41%  { transform: translate3d(0, 0, 0) rotate(0deg); }
  82%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: translate3d(0, 34px, 0) scale(.82); }
}

/* ---------- aggressive intensity ---------- */
.vignette {
  position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 0;
  background: radial-gradient(ellipse at center, rgba(255,40,30,0) 52%, rgba(255,40,30,.34) 100%);
}
.vignette.on { animation: still-vig 1.15s ease-out; }
@keyframes still-vig { 0% { opacity: 0; } 18% { opacity: 1; } 100% { opacity: 0; } }
.layer.aggr .item.s-live-reaction .bubble, .layer.aggr .item.s-bubbles .bubble, .layer.aggr .item.s-side-float .bubble {
  animation: still-jolt .55s ease-out both;
  box-shadow: var(--shadow), inset 0 0 0 1.5px rgba(255,60,45,.55);
}
.layer.firm .item.s-live-reaction .bubble, .layer.firm .item.s-bubbles .bubble { animation: still-jolt-soft .45s ease-out both; }
@keyframes still-jolt { 0%,100% { transform: none; } 20% { transform: translateX(-5px) rotate(-1.5deg); } 40% { transform: translateX(5px) rotate(1.5deg); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
@keyframes still-jolt-soft { 0%,100% { transform: none; } 30% { transform: translateX(-3px); } 60% { transform: translateX(3px); } }

/* tough check-in: centred, bigger, shaking, red */
.reminder.tough {
  left: 50% !important; right: auto !important; margin-left: 0 !important; top: 50%; bottom: auto !important;
  width: min(460px, calc(100% - 32px)); padding: 26px 26px 20px; text-align: center;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 2px rgba(255,60,45,.6), 0 30px 80px -20px rgba(0,0,0,.55);
  animation: still-tough-in .6s cubic-bezier(.2,.8,.3,1) both;
}
.reminder.tough.out { animation: still-tough-out .4s ease both; }
.reminder.tough .head { justify-content: center; color: #ff5a45; }
.reminder.tough .big { display: grid; place-items: center; margin: -4px 0 8px; }
.reminder.tough .big .emoji-img { filter: drop-shadow(0 10px 16px rgba(0,0,0,.3)); animation: still-wobble 1.4s ease-in-out .6s infinite; }
.reminder.tough .msg { font-family: var(--font); font-weight: 800; font-size: 22px; line-height: 1.25; text-transform: uppercase; letter-spacing: .01em; }
.reminder.tough .actions { justify-content: center; }
.reminder.tough .btn.primary { background: #ff4b3a; color: #fff; }
@keyframes still-tough-in {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.7); }
  55% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
  65% { transform: translate(calc(-50% - 8px), -50%) rotate(-1.5deg); }
  75% { transform: translate(calc(-50% + 8px), -50%) rotate(1.5deg); }
  85% { transform: translate(calc(-50% - 4px), -50%); }
  100% { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes still-tough-out { to { opacity: 0; transform: translate(-50%, -46%) scale(.96); } }
@keyframes still-wobble { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-7deg) scale(1.05); } 75% { transform: rotate(7deg) scale(1.05); } }

.rm .s-giant { animation-name: still-rm-fade !important; }
.rm .vignette.on, .rm .burst .p { animation: none; opacity: 0; }
.layer.rm.aggr .bubble, .rm .reminder.tough .big .emoji-img { animation: none !important; }
.rm .reminder.tough { animation: still-rm-in .3s ease both; }
@keyframes still-rm-out { to { opacity: 0; } }
`;
})(typeof globalThis !== 'undefined' ? globalThis : self);
