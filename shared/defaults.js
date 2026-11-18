/*
 * STILL. — shared defaults & schema
 * Loaded as a classic script in every context (service worker via importScripts,
 * content scripts via manifest/registration, extension pages via <script>).
 * Everything hangs off a single global namespace: globalThis.STILL
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});

  STILL.SCHEMA_VERSION = 2;
  STILL.STORAGE_KEY = 'still.settings';

  /* ---------------------------------------------------------------- Sites */
  STILL.SITE_PRESETS = [
    { id: 'facebook', label: 'Facebook', domains: ['facebook.com'], glyph: 'f' },
    { id: 'youtube', label: 'YouTube', domains: ['youtube.com'], glyph: '▶' },
    { id: 'instagram', label: 'Instagram', domains: ['instagram.com'], glyph: '◎' },
    { id: 'reddit', label: 'Reddit', domains: ['reddit.com'], glyph: 'r' },
    { id: 'x', label: 'X (Twitter)', domains: ['x.com', 'twitter.com'], glyph: '𝕏' },
    { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com'], glyph: '♪' }
  ];

  /* ------------------------------------------------------- Animation styles */
  // kind: 'text' styles carry sentences, 'emoji' styles carry reactions.
  STILL.ANIMATION_STYLES = [
    { id: 'live-reaction', label: 'Live Reaction', kind: 'text', desc: 'Messages drift upward like live-stream reactions, each with a small emoji.' },
    { id: 'floating-emojis', label: 'Floating Emojis', kind: 'emoji', desc: 'Emojis rise slowly with a soft sway.' },
    { id: 'bubbles', label: 'Motivational Bubbles', kind: 'text', desc: 'Rounded bubbles that float up and gently pop in.' },
    { id: 'particle', label: 'Particle Messages', kind: 'text', desc: 'Short phrases appear at quiet spots and dissolve.' },
    { id: 'side-float', label: 'Side Float', kind: 'text', desc: 'Messages glide in from the edge of the screen.' },
    { id: 'gentle-fade', label: 'Gentle Fade', kind: 'text', desc: 'A single message fades in, rests, and fades away.' },
    { id: 'rising-hearts', label: 'Rising Hearts', kind: 'emoji', desc: 'Hearts, stars and sparkles rise in a little burst.' },
    { id: 'random-mix', label: 'Random Mix', kind: 'mix', desc: 'A natural mix of every style, never the same twice.' }
  ];

  STILL.HEART_EMOJIS = ['❤️', '💚', '✨', '⭐', '🌟', '💛', '🤍', '💫'];

  /* ---------------------------------------------------------------- Emojis */
  // Realistic 3D artwork: Microsoft Fluent Emoji (MIT) — see assets/emoji/LICENSE-fluentui-emoji.txt
  STILL.EMOJI_GROUPS = [
    { id: 'growth', label: 'Growth' },
    { id: 'energy', label: 'Energy' },
    { id: 'focus', label: 'Focus' },
    { id: 'win', label: 'Achievement' },
    { id: 'love', label: 'Love & calm' }
  ];
  STILL.EMOJI_SET = [
    ['🌱', 'seedling', 'Seedling', 'growth'], ['🌿', 'herb', 'Herb', 'growth'], ['🍀', 'clover', 'Lucky clover', 'growth'],
    ['🌻', 'sunflower', 'Sunflower', 'growth'], ['🪷', 'lotus', 'Lotus', 'growth'], ['🌈', 'rainbow', 'Rainbow', 'growth'],
    ['🏔️', 'mountain', 'Mountain', 'growth'],
    ['🔥', 'fire', 'Fire', 'energy'], ['⚡', 'voltage', 'Energy', 'energy'], ['🚀', 'rocket', 'Rocket', 'energy'],
    ['💪', 'biceps', 'Strength', 'energy'], ['☀️', 'sun', 'Sun', 'energy'], ['🌟', 'glowing-star', 'Glowing star', 'energy'],
    ['☕', 'coffee', 'Coffee', 'energy'], ['😎', 'muscle-face', 'Cool', 'energy'],
    ['🎯', 'target', 'Target', 'focus'], ['🧠', 'brain', 'Brain', 'focus'], ['📚', 'books', 'Books', 'focus'],
    ['💡', 'bulb', 'Idea', 'focus'], ['⏳', 'hourglass', 'Hourglass', 'focus'], ['✅', 'check', 'Done', 'focus'],
    ['🧘', 'yoga', 'Calm mind', 'focus'],
    ['🏆', 'trophy', 'Trophy', 'win'], ['🎓', 'grad', 'Graduation', 'win'], ['👑', 'crown', 'Crown', 'win'],
    ['💎', 'gem', 'Gem', 'win'], ['🥇', 'medal', 'Gold medal', 'win'], ['💯', 'hundred', '100', 'win'], ['🎉', 'party', 'Celebrate', 'win'],
    ['💚', 'green-heart', 'Green heart', 'love'], ['❤️', 'red-heart', 'Heart', 'love'], ['💛', 'yellow-heart', 'Yellow heart', 'love'],
    ['🤍', 'white-heart', 'White heart', 'love'], ['🕊️', 'dove', 'Dove', 'love'], ['✨', 'sparkles', 'Sparkles', 'love'],
    ['⭐', 'star', 'Star', 'love'], ['💫', 'dizzy', 'Shine', 'love'], ['🙏', 'pray', 'Gratitude', 'love'],
    ['🥰', 'hearts-face', 'Loved', 'love'], ['🤩', 'star-struck', 'Star-struck', 'love'], ['👏', 'clap', 'Applause', 'love'],
    ['👍', 'thumbs', 'Thumbs up', 'love']
  ].map(([char, slug, name, group]) => ({ char, slug, name, group, file: 'assets/emoji/' + slug + '.png' }));
  STILL.EMOJI_LIBRARY = STILL.EMOJI_SET.map((e) => e.char);
  STILL.EMOJI_FILES = Object.fromEntries(STILL.EMOJI_SET.map((e) => [e.char, e.file]));
  STILL.EMOJI_NAMES = Object.fromEntries(STILL.EMOJI_SET.map((e) => [e.char, e.name]));
  STILL.ASSETS_KEY = 'still.assets';
  STILL.STATS_KEY = 'still.stats';
  STILL.IMG_TOKEN = /^img:[a-z0-9-]{4,64}$/;

  /* ------------------------------------------------------------ Categories */
  STILL.CATEGORIES = [
    { id: 'motivation', label: 'Motivation' },
    { id: 'study', label: 'Study' },
    { id: 'career', label: 'Career' },
    { id: 'discipline', label: 'Discipline' },
    { id: 'goals', label: 'Personal Goals' },
    { id: 'positive', label: 'Positive Reminders' },
    { id: 'custom', label: 'Custom' }
  ];

  const seedMessages = [
    ['Remember why you started.', 'motivation'],
    ['Your future self is counting on you.', 'goals'],
    ['Small steps create big changes.', 'discipline'],
    ["Don't trade your dreams for endless scrolling.", 'discipline'],
    ['Your goals deserve your attention.', 'goals'],
    ['One hour of focused work can change your future.', 'career'],
    ['You are capable of more than you think.', 'positive'],
    ["Keep going. You're getting closer.", 'motivation'],
    ['Make today count.', 'motivation'],
    ['Your effort today is your strength tomorrow.', 'study']
  ];

  STILL.DEFAULT_MESSAGES = seedMessages.map(([text, category], i) => ({
    id: 'm-default-' + (i + 1),
    text,
    category,
    enabled: true,
    favorite: false,
    custom: false,
    collection: 'everyday'
  }));

  // Short focus nudges, mixed in sparingly (particle / fade styles).
  STILL.FOCUS_NUDGES = ['Breathe.', 'Still with you.', 'Back to it?', 'One tab at a time.', 'Eyes on the goal.', 'Gently, now.'];

  // The "slightly more noticeable" reminder. {minutes} is replaced as plain text.
  STILL.REMINDERS = [
    "You've been scrolling for a while. Maybe it's time to work on something meaningful?",
    'About {minutes} minutes here. Your goals are still waiting for you.',
    'A quick check-in: is this the best use of the next ten minutes?',
    "You've done enough scrolling for now. Your future self says thanks in advance."
  ];

  STILL.FOCUS_REMINDERS = [
    "You're in a focus session — {left} min to go. This can wait.",
    'Focus mode is on. {left} more minutes and you can come back guilt-free.',
    'Deep work in progress · {left} min left. You’ve got this.'
  ];
  STILL.BUDGET_REMINDERS = [
    'You planned {budget} minutes for {site} today — and you’ve used them. A good moment to wrap up?',
    "That's your {budget}-minute plan for {site}. Future you will appreciate a break."
  ];

  STILL.FALLBACK_MESSAGE = 'Your goals are still waiting for you.';

  /* ------------------------------------------------------ Appearance presets */
  STILL.APPEARANCE_PRESETS = {
    'minimal-white': { label: 'Minimal White', bubbleBg: '#ffffff', textColor: '#161a17', accent: '#2f6f4e', opacity: 0.96, shadow: true, font: 'sans' },
    'soft-green': { label: 'Soft Green', bubbleBg: '#eaf4ee', textColor: '#16392a', accent: '#2f6f4e', opacity: 0.96, shadow: true, font: 'sans' },
    midnight: { label: 'Midnight', bubbleBg: '#14171a', textColor: '#f3f5f2', accent: '#7cc49a', opacity: 0.92, shadow: true, font: 'sans' },
    transparent: { label: 'Transparent', bubbleBg: '#ffffff', textColor: '#161a17', accent: '#2f6f4e', opacity: 0.55, shadow: false, font: 'sans' },
    playful: { label: 'Playful', bubbleBg: '#fff4d6', textColor: '#3a2a12', accent: '#e0793b', opacity: 0.97, shadow: true, font: 'serif' },
    glass: { label: 'Frosted Glass', bubbleBg: '#ffffff', textColor: '#14201a', accent: '#2f6f4e', opacity: 0.62, shadow: true, font: 'sans', glass: true },
    aurora: { label: 'Aurora', bubbleBg: '#12312a', textColor: '#eafff4', accent: '#8be0b4', opacity: 0.9, shadow: true, font: 'serif' }
  };

  /* --------------------------------------------------- Frequency presets */
  // Convenience presets that write into the real timing fields.
  STILL.FREQUENCY_PRESETS = {
    calm: { label: 'Calm', intervalMin: 5, messagesPerWave: 1, emojisPerWave: 5 },
    balanced: { label: 'Balanced', intervalMin: 3, messagesPerWave: 2, emojisPerWave: 9 },
    lively: { label: 'Lively', intervalMin: 1.5, messagesPerWave: 3, emojisPerWave: 12 }
  };

  /* ------------------------------------------------------------- Limits */
  STILL.LIMITS = {
    messageMaxLength: 180,
    maxMessages: 500,
    maxSites: 100,
    maxCustomEmojis: 40,
    maxCollections: 20,
    maxImages: 60,
    imageBytes: 90 * 1024,
    collectionNameMax: 32
  };

  /* --------------------------------------------------------- Defaults */
  STILL.DEFAULT_SETTINGS = {
    schemaVersion: 2,
    onboarded: false,
    enabled: true,
    pausedUntil: 0,

    general: {
      showDock: true, // small "Hide / Pause" control that appears with a wave
      reduceMotion: 'system', // 'system' | 'always' | 'never'
      escalation: true, // gentle → slightly more noticeable over a long session
      contextMenu: true // right-click selected text → "Add to STILL."
    },

    // One-line intention for today; only shown on the day it was written.
    intention: { text: '', date: '', inWaves: true },

    // Active focus session (until = epoch ms). Shared live with every tab.
    focus: { until: 0, startedAt: 0, minutes: 25, label: '' },

    // Quiet hours: when enabled, STILL. only appears inside this window.
    schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },

    brand: { logo: null }, // user image id used as logo on the dock / check-in card

    sites: [], // [{ id, domain, label, enabled, preset }]

    animation: {
      styles: ['live-reaction', 'floating-emojis'],
      rotation: 'natural' // 'natural' (shuffled round-robin) | 'sequential'
    },

    emoji: {
      selected: ['🌱', '✨', '💚', '🎯', '🚀', '📚', '🌻', '🔥', '🏆', '💡'],
      realistic: true, // render emojis with bundled 3D artwork
      custom: [],
      emojiOnlyReactions: true, // allow waves made only of emojis
      emojisPerWave: 9,
      speed: 1 // emoji-specific speed multiplier
    },

    messages: {
      items: STILL.DEFAULT_MESSAGES,
      collections: [{ id: 'everyday', name: 'Everyday' }],
      activeCollection: 'all',
      rotation: 'random', // 'random' | 'sequential'
      preferCustom: true,
      categories: STILL.CATEGORIES.map((c) => c.id),
      focusNudges: true,
      noRepeatWindow: 4
    },

    timing: {
      initialDelayMin: 5,
      intervalMin: 3,
      messagesPerWave: 2,
      maxSimultaneous: 3,
      durationMinSec: 5,
      durationMaxSec: 7,
      frequency: 'balanced', // last applied preset (informational)
      pauseWhenInactive: true,
      sessionResetMin: 30, // a session restarts after this much time away from a site
      reminderAfterMin: 20, // first "noticeable" reminder
      reminderRepeatMin: 20
    },

    appearance: {
      preset: 'minimal-white',
      bubbleBg: '#ffffff',
      textColor: '#161a17',
      accent: '#2f6f4e',
      opacity: 0.96,
      radius: 18,
      fontSize: 14,
      maxWidth: 280,
      position: 'spread', // 'spread' (full screen) | 'right' | 'left' | 'center'
      direction: 'up', // 'up' | 'down'
      speed: 1, // global animation speed multiplier
      emojiSize: 30,
      shadow: true,
      glass: false, // frosted backdrop blur
      bubbleIcon: 'emoji', // 'emoji' | 'logo' | 'none'
      font: 'sans' // 'sans' | 'serif'
    }
  };

  STILL.todayKey = function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  STILL.clone = function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
