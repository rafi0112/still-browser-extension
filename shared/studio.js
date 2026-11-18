/*
 * STILL. — Studio: turn any picture into a reaction, a bubble icon or your logo.
 * Images never leave the device: they are cropped/resized on a <canvas> here and
 * stored as small PNG/WebP data URLs in chrome.storage.local.
 */
(function (root) {
  'use strict';
  const STILL = (root.STILL = root.STILL || {});
  const U = STILL.utils;
  const ui = STILL.ui;
  const h = ui.h;

  const OUT = 160; // stored size (px)
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
  const MAX_FILE = 8 * 1024 * 1024;

  function shapePath(ctx, shape, size, inset) {
    const i = inset || 0;
    const s = size - i * 2;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(size / 2, size / 2, s / 2, 0, Math.PI * 2);
    else if (shape === 'rounded') ctx.roundRect(i, i, s, s, s * 0.24);
    else ctx.rect(i, i, s, s);
  }

  /** Make near-white pixels transparent (great for logos on white backgrounds). */
  function removeWhite(bitmap) {
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const min = Math.min(d[p], d[p + 1], d[p + 2]);
      if (min > 245) d[p + 3] = 0;
      else if (min > 215) d[p + 3] = Math.round(d[p + 3] * ((245 - min) / 30));
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function render(ctx, size, st) {
    ctx.clearRect(0, 0, size, size);
    const src = st.cleaned || st.bitmap;
    if (!src) return;
    const shape = st.shape;
    const inset = st.sticker && shape !== 'original' ? size * 0.045 : 0;
    ctx.save();
    if (shape !== 'original') {
      shapePath(ctx, shape, size, inset);
      if (st.bg !== 'none') {
        ctx.fillStyle = st.bg;
        ctx.fill();
      }
      ctx.clip();
    } else if (st.bg !== 'none') {
      ctx.fillStyle = st.bg;
      ctx.fillRect(0, 0, size, size);
    }
    const w = src.width;
    const hgt = src.height;
    const base = shape === 'original' ? Math.min(size / w, size / hgt) : Math.max(size / w, size / hgt);
    const sc = base * st.zoom;
    const dw = w * sc;
    const dh = hgt * sc;
    const x = (size - dw) / 2 + st.panX * size;
    const y = (size - dh) / 2 + st.panY * size;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, x, y, dw, dh);
    ctx.restore();
    if (st.sticker && shape !== 'original') {
      shapePath(ctx, shape, size, inset);
      ctx.lineWidth = size * 0.05;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }

  function exportData(st) {
    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    render(c.getContext('2d'), OUT, st);
    let data = c.toDataURL('image/png');
    const limit = STILL.LIMITS.imageBytes * 1.37;
    if (data.length > limit) data = c.toDataURL('image/webp', 0.88);
    if (data.length > limit) data = c.toDataURL('image/webp', 0.7);
    return data;
  }

  function niceName(file) {
    return U.cleanText((file && file.name ? file.name.replace(/\.[a-z0-9]+$/i, '') : '') || 'My image', 24) || 'My image';
  }

  /* ================================================================
   * Editor modal
   * ================================================================ */
  function openEditor(model, opts) {
    opts = opts || {};
    const st = { bitmap: null, cleaned: null, shape: 'circle', zoom: 1, panX: 0, panY: 0, bg: 'none', sticker: true, white: false, name: 'My image' };
    const PREV = 280;
    const canvas = h('canvas', { width: String(PREV * 2), height: String(PREV * 2), class: 'st-canvas', 'aria-label': 'Image preview' });
    canvas.style.width = canvas.style.height = PREV + 'px';
    const ctx = canvas.getContext('2d');
    const draw = () => render(ctx, PREV * 2, st);

    const drop = h(
      'label',
      { class: 'st-drop' },
      ui.icon('image', 'lg'),
      h('b', { text: 'Drop an image here' }),
      h('span', { class: 'muted small', text: 'or click to browse · paste with Ctrl+V' }),
      h('span', { class: 'muted small', text: 'PNG, JPG, WebP, GIF · up to 8 MB' })
    );
    const file = h('input', { type: 'file', accept: ACCEPT.join(','), hidden: true });
    drop.appendChild(file);
    const stage = h('div', { class: 'st-stage' }, canvas, drop);
    const err = h('div', { class: 'field-error', role: 'alert' });

    async function loadFile(f) {
      err.textContent = '';
      if (!f) return;
      if (!ACCEPT.includes(f.type)) return (err.textContent = 'Please choose a PNG, JPG, WebP or GIF image.');
      if (f.size > MAX_FILE) return (err.textContent = 'That image is larger than 8 MB.');
      try {
        st.bitmap = await createImageBitmap(f);
      } catch (e) {
        return (err.textContent = 'That image could not be opened.');
      }
      st.cleaned = st.white ? removeWhite(st.bitmap) : null;
      st.zoom = 1;
      st.panX = st.panY = 0;
      zoom.setValue(1);
      if (nameIn.value === 'My image' || !nameIn.value) nameIn.value = niceName(f);
      stage.classList.add('has-image');
      saveBtn.disabled = false;
      draw();
    }
    file.addEventListener('change', () => loadFile(file.files && file.files[0]));
    stage.addEventListener('dragover', (e) => {
      e.preventDefault();
      stage.classList.add('over');
    });
    stage.addEventListener('dragleave', () => stage.classList.remove('over'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      stage.classList.remove('over');
      loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    const onPaste = (e) => {
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        loadFile(item.getAsFile());
      }
    };
    document.addEventListener('paste', onPaste);

    // drag to reposition
    let dragging = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!st.bitmap) return;
      dragging = { x: e.clientX, y: e.clientY, px: st.panX, py: st.panY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      st.panX = U.clamp(dragging.px + (e.clientX - dragging.x) / PREV, -1, 1);
      st.panY = U.clamp(dragging.py + (e.clientY - dragging.y) / PREV, -1, 1);
      draw();
    });
    canvas.addEventListener('pointerup', () => (dragging = null));
    canvas.addEventListener('wheel', (e) => {
      if (!st.bitmap) return;
      e.preventDefault();
      st.zoom = U.clamp(st.zoom * (e.deltaY < 0 ? 1.08 : 0.93), 0.5, 4);
      zoom.setValue(st.zoom);
      draw();
    });

    const shape = ui.segmented({
      label: 'Shape',
      value: st.shape,
      options: [
        { value: 'circle', label: 'Circle' },
        { value: 'rounded', label: 'Rounded' },
        { value: 'square', label: 'Square' },
        { value: 'original', label: 'Original' }
      ],
      onChange: (v) => {
        st.shape = v;
        draw();
      }
    });
    const zoom = ui.slider({ min: 0.5, max: 4, step: 0.05, value: 1, label: 'Zoom', debounce: 0, format: (v) => Math.round(v * 100) + '%', onInput: (v) => ((st.zoom = v), draw()) });
    const bg = ui.segmented({
      label: 'Background',
      value: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: '#ffffff', label: 'White' },
        { value: '#e6f2ea', label: 'Mint' },
        { value: '#fff1d6', label: 'Sun' },
        { value: '#16201b', label: 'Ink' }
      ],
      onChange: (v) => {
        st.bg = v;
        draw();
      }
    });
    const sticker = ui.toggle({ checked: true, small: true, label: 'Sticker outline', onChange: (v) => ((st.sticker = v), draw()) });
    const white = ui.toggle({
      checked: false,
      small: true,
      label: 'Remove white background',
      onChange: (v) => {
        st.white = v;
        st.cleaned = v && st.bitmap ? removeWhite(st.bitmap) : null;
        draw();
      }
    });
    const nameIn = h('input', { class: 'input', value: 'My image', maxlength: '24', 'aria-label': 'Image name' });
    const asReaction = ui.toggle({ checked: opts.asReaction !== false, small: true, label: 'Use as reaction' });
    const asLogo = ui.toggle({ checked: !!opts.asLogo, small: true, label: 'Use as my logo' });

    const row = (label, ctrl) => h('div', { class: 'st-row' }, h('span', { class: 'st-label', text: label }), ctrl);
    const saveBtn = h('button', { class: 'btn green', type: 'button', disabled: true }, ui.icon('check', 'sm'), 'Save to Studio');
    const cancel = h('button', { class: 'btn ghost', type: 'button' }, 'Cancel');

    const modal = h(
      'div',
      { class: 'st-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add your own image' },
      h(
        'div',
        { class: 'st-card' },
        h(
          'div',
          { class: 'st-head' },
          h('div', null, h('div', { class: 'eyebrow', text: 'Studio' }), h('h2', { class: 'display', text: 'Make it yours' })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, ui.icon('x'))
        ),
        h(
          'div',
          { class: 'st-body' },
          h('div', null, stage, h('div', { class: 'muted small', style: { textAlign: 'center', marginTop: '8px' }, text: 'Drag to reposition · scroll to zoom' }), err),
          h(
            'div',
            { class: 'st-controls' },
            row('Shape', shape),
            row('Zoom', zoom),
            row('Background', bg),
            row('Sticker outline', sticker),
            row('Remove white background', white),
            row('Name', nameIn),
            h('div', { class: 'st-sep' }),
            row('Float up as a reaction', asReaction),
            row('Use as my logo', asLogo)
          )
        ),
        h('div', { class: 'st-foot' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => file.click() }, ui.icon('upload', 'sm'), 'Choose another image'), h('div', { class: 'grow' }), cancel, saveBtn)
      )
    );

    function close() {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
      modal.classList.add('out');
      setTimeout(() => modal.remove(), 220);
    }
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (e) => e.target === modal && close());
    cancel.addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
      if (!st.bitmap) return;
      saveBtn.disabled = true;
      const asset = { id: U.uid('img').toLowerCase(), name: U.cleanText(nameIn.value, 24) || 'My image', data: exportData(st), createdAt: Date.now() };
      try {
        await STILL.media.save(asset);
      } catch (e) {
        saveBtn.disabled = false;
        err.textContent = e.message === 'limit' ? 'Your Studio is full (' + STILL.LIMITS.maxImages + ' images). Remove one first.' : 'Not enough storage space for this image.';
        return;
      }
      const reaction = asReaction.input.checked;
      const logo = asLogo.input.checked;
      await model.update((d) => {
        if (reaction && !d.emoji.selected.includes('img:' + asset.id)) d.emoji.selected.push('img:' + asset.id);
        if (logo) d.brand.logo = asset.id;
      });
      ui.toast(reaction ? 'Added — it will float up with your reminders' : 'Saved to your Studio', 'sparkles');
      close();
      if (opts.onSaved) opts.onSaved(asset);
    });

    document.body.appendChild(modal);
    if (opts.file) loadFile(opts.file);
    return { close };
  }

  /* ================================================================
   * Studio page section
   * ================================================================ */
  function component(model) {
    const wrap = h('div', { class: 'stack', style: { gap: '22px' } });
    const gallery = h('div', { class: 'st-gallery' });
    const meter = h('span', { class: 'muted small' });
    let items = [];

    const hero = h(
      'button',
      { type: 'button', class: 'st-hero', onclick: () => openEditor(model, { asReaction: true }) },
      h('span', { class: 'st-hero-icon' }, ui.icon('upload2', 'lg')),
      h(
        'span',
        { class: 'grow', style: { textAlign: 'left' } },
        h('b', { text: 'Add your own image' }),
        h('span', { class: 'muted', text: 'A photo of who you do it for, your dream company’s logo, your university crest, a sticker you love. Drop it here, paste it, or browse.' })
      ),
      h('span', { class: 'btn primary' }, ui.icon('plus', 'sm'), 'Upload')
    );
    hero.addEventListener('dragover', (e) => {
      e.preventDefault();
      hero.classList.add('over');
    });
    hero.addEventListener('dragleave', () => hero.classList.remove('over'));
    hero.addEventListener('drop', (e) => {
      e.preventDefault();
      hero.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openEditor(model, { asReaction: true, file: f });
    });
    const onPaste = (e) => {
      if (document.querySelector('.st-modal')) return;
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        openEditor(model, { asReaction: true, file: item.getAsFile() });
      }
    };
    document.addEventListener('paste', onPaste);
    model.onDispose(() => document.removeEventListener('paste', onPaste));

    function render() {
      ui.empty(gallery);
      const s = model.settings;
      meter.textContent = items.length + ' of ' + STILL.LIMITS.maxImages + ' images';
      if (!items.length) {
        gallery.appendChild(h('div', { class: 'list-empty', style: { gridColumn: '1 / -1' }, text: 'Your Studio is empty. Images you add appear here and can float up as reactions or become your logo.' }));
        return;
      }
      items.forEach((a) => {
        const tok = 'img:' + a.id;
        const isReaction = s.emoji.selected.includes(tok);
        const isLogo = s.brand.logo === a.id;
        const chip = (label, on, fn) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: fn }, on ? ui.icon('check', 'sm') : null, label);
        gallery.appendChild(
          h(
            'div',
            { class: 'st-item' + (isLogo ? ' is-logo' : '') },
            h('div', { class: 'st-thumb' }, h('img', { src: a.data, alt: a.name, draggable: 'false' }), isLogo ? h('span', { class: 'tag green st-badge', text: 'Logo' }) : null),
            h(
              'div',
              { class: 'st-meta' },
              h('div', { class: 'st-name', text: a.name }),
              h(
                'div',
                { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
                chip('Reaction', isReaction, () =>
                  model.update((d) => {
                    const set = new Set(d.emoji.selected);
                    set.has(tok) ? set.delete(tok) : set.add(tok);
                    d.emoji.selected = Array.from(set);
                  })
                ),
                chip('Logo', isLogo, () => model.update((d) => void (d.brand.logo = isLogo ? null : a.id)))
              )
            ),
            h(
              'div',
              { class: 'st-actions' },
              h(
                'button',
                {
                  class: 'icon-btn',
                  type: 'button',
                  title: 'Rename',
                  'aria-label': 'Rename ' + a.name,
                  onclick: async () => {
                    const name = U.cleanText(prompt('Name this image', a.name) || '', 24);
                    if (name) await STILL.media.save(Object.assign({}, a, { name }));
                  }
                },
                ui.icon('edit')
              ),
              h(
                'button',
                {
                  class: 'icon-btn danger',
                  type: 'button',
                  title: 'Delete',
                  'aria-label': 'Delete ' + a.name,
                  onclick: async () => {
                    if (!confirm('Delete “' + a.name + '” from your Studio?')) return;
                    await STILL.media.remove(a.id);
                    await model.update((d) => {
                      d.emoji.selected = d.emoji.selected.filter((x) => x !== tok);
                      if (d.brand.logo === a.id) d.brand.logo = null;
                    });
                  }
                },
                ui.icon('trash')
              )
            )
          )
        );
      });
    }

    const refresh = () =>
      STILL.media.list().then((list) => {
        items = list;
        render();
      });
    refresh();
    model.onDispose(STILL.media.onChange(refresh));
    model.subscribe((n, p) => {
      if (JSON.stringify(n.emoji.selected) !== JSON.stringify(p.emoji.selected) || n.brand.logo !== p.brand.logo) render();
    });

    const logoPreview = h('div', { class: 'st-logo-preview' });
    const paintLogo = () => {
      ui.empty(logoPreview);
      const s = model.settings;
      const a = s.brand.logo && STILL.media.get(s.brand.logo);
      logoPreview.append(
        a ? h('img', { src: a.data, alt: '' }) : h('span', { class: 'logo', style: { fontSize: '15px' } }, 'STILL', h('i', { text: '.' })),
        h('span', { class: 'muted small', text: a ? 'Your logo appears on the quick controls and check-in cards.' : 'No logo yet — STILL.’s wordmark is used.' })
      );
    };
    paintLogo();
    model.subscribe(paintLogo);
    model.onDispose(STILL.media.onChange(paintLogo));

    wrap.append(
      hero,
      h('div', null, h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('div', { class: 'eyebrow', text: 'Your images' }), meter), gallery),
      h(
        'div',
        null,
        h('div', { class: 'eyebrow', style: { marginBottom: '10px' }, text: 'Where they appear' }),
        h(
          'div',
          { class: 'card pad', style: { paddingTop: '4px', paddingBottom: '4px' } },
          ui.field('Your logo', null, logoPreview),
          ui.field(
            'Bubble icon',
            'Shown beside every message.',
            ui.bind(model, 'appearance.bubbleIcon', ui.segmented, {
              label: 'Bubble icon',
              options: [
                { value: 'emoji', label: 'Reactions' },
                { value: 'logo', label: 'My logo' },
                { value: 'none', label: 'None' }
              ]
            })
          ),
          ui.field('Realistic 3D emojis', 'Use the bundled 3D artwork for standard emojis.', ui.bind(model, 'emoji.realistic', ui.toggle, { label: 'Realistic emojis' }))
        )
      )
    );
    return wrap;
  }

  STILL.studio = { openEditor, component };
})(typeof globalThis !== 'undefined' ? globalThis : self);
