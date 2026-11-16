/* Core utilities: DOM helpers, storage, native bridge, dialogs, menus, toasts. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
const fmtDate = (ts) => { const d = new Date(ts); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- native bridge */
const Native = (window.Android && typeof window.Android.platform === 'function') ? window.Android : null;
const nativeCallbacks = {};
let nativeSeq = 0;
window.__nativeCb = (id, res) => {
  const f = nativeCallbacks[id];
  if (!f) return;
  const keep = f(res);
  if (!keep) delete nativeCallbacks[id];
};
function nativeCb(fn) { const id = 'cb' + (++nativeSeq); nativeCallbacks[id] = fn; return id; }

/* ---------------------------------------------------------------- storage */
/* Web-Version (iPad/Safari, window.FOS_WEB): Dateien liegen in IndexedDB statt im kleinen localStorage
 * (Safari erlaubt dort nur ca. 5 MB). Beim Start wird alles in einen Zwischenspeicher geladen, damit
 * Store weiterhin synchron arbeitet; jedes Schreiben geht sofort zusätzlich in IndexedDB.
 * Die Android-App (Native) und die Chrome-Tests sind davon nicht betroffen. */
const WebDB = {
  on: !Native && !!window.FOS_WEB && typeof indexedDB !== 'undefined',
  db: null, cache: new Map(), failed: false,
  init() {
    if (!WebDB.on) return Promise.resolve();
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('fos-binder', 1); } catch (e) { WebDB.on = false; return resolve(); }
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onerror = () => { console.error(req.error); WebDB.on = false; resolve(); };
      req.onsuccess = () => {
        WebDB.db = req.result;
        const tx = WebDB.db.transaction('files', 'readonly'), st = tx.objectStore('files');
        const cur = st.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { WebDB.cache.set(c.key, c.value); c.continue(); } };
        tx.oncomplete = () => {
          // einmalige Übernahme älterer Daten aus localStorage (falls die Seite vorher ohne IndexedDB lief)
          if (!WebDB.cache.size) {
            try { Object.keys(localStorage).filter((k) => k.startsWith('fos:')).forEach((k) => WebDB.put(k.slice(4), localStorage.getItem(k))); } catch (e) { /* ignore */ }
          }
          try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
          resolve();
        };
        tx.onerror = () => { console.error(tx.error); resolve(); };
      };
    });
  },
  put(name, txt) {
    WebDB.cache.set(name, txt);
    try {
      const tx = WebDB.db.transaction('files', 'readwrite');
      tx.objectStore('files').put(txt, name);
      tx.onerror = () => { console.error(tx.error); if (!WebDB.failed) { WebDB.failed = true; toast('Speichern fehlgeschlagen – bitte Backup sichern!', 6000); } };
    } catch (e) { console.error(e); return false; }
    return true;
  },
  del(name) {
    WebDB.cache.delete(name);
    try { WebDB.db.transaction('files', 'readwrite').objectStore('files').delete(name); } catch (e) { console.error(e); }
    return true;
  }
};

const Store = {
  read(name) {
    let txt = null;
    if (Native) txt = Native.read(name);
    else if (WebDB.on) txt = WebDB.cache.has(name) ? WebDB.cache.get(name) : null;
    else { try { txt = localStorage.getItem('fos:' + name); } catch (e) { txt = null; } }
    if (txt == null) return null;
    try { return JSON.parse(txt); } catch (e) {
      console.warn('corrupt file, trying backup', name);
      const bak = Native ? Native.readBackup(name) : null;
      try { return bak ? JSON.parse(bak) : null; } catch (e2) { return null; }
    }
  },
  write(name, obj) {
    const s = JSON.stringify(obj);
    if (Native) return Native.write(name, s);
    if (WebDB.on) return WebDB.put(name, s);
    try { localStorage.setItem('fos:' + name, s); return true; } catch (e) { console.error(e); return false; }
  },
  remove(name) {
    if (Native) return Native.remove(name);
    if (WebDB.on) return WebDB.del(name);
    localStorage.removeItem('fos:' + name);
    return true;
  },
  list() {
    if (Native) return JSON.parse(Native.list());
    if (WebDB.on) return [...WebDB.cache.keys()];
    return Object.keys(localStorage).filter((k) => k.startsWith('fos:')).map((k) => k.slice(4));
  }
};

/* ---------------------------------------------------------------- UI helpers */
function toast(msg, ms = 2600) {
  $$('.toast').forEach((t) => t.remove());
  const t = html(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

let busyEl = null;
function busy(msg) {
  if (msg === false) { if (busyEl) busyEl.remove(); busyEl = null; return; }
  if (!busyEl) { busyEl = html('<div class="busy"><div class="spinner"></div><div class="msg"></div></div>'); document.body.appendChild(busyEl); }
  $('.msg', busyEl).textContent = msg || 'Bitte warten …';
}

const Overlays = []; // stack of {close}
function pushOverlay(o) { Overlays.push(o); }
function popOverlay(o) { const i = Overlays.indexOf(o); if (i >= 0) Overlays.splice(i, 1); }
function closeTopOverlay() { const o = Overlays[Overlays.length - 1]; if (o) { o.close(); return true; } return false; }

/** Generic modal dialog. body: html string; buttons: [{label, cls, value}] → resolves value */
function dialog({ title, body = '', buttons = [{ label: 'OK', cls: 'primary', value: true }], onOpen, wide }) {
  return new Promise((resolve) => {
    const scrim = html(`<div class="scrim"><div class="dialog" ${wide ? 'style="width:min(640px,100%)"' : ''}><h2>${esc(title)}</h2><div class="dbody">${body}</div><div class="row"></div></div></div>`);
    const row = $('.row', scrim);
    const ov = { close: () => finish(undefined) };
    function finish(v) {
      if (!scrim.isConnected) return;
      scrim.remove();
      popOverlay(ov);
      resolve(v);
    }
    buttons.forEach((b) => {
      const btn = html(`<button class="btn ${b.cls || ''}">${esc(b.label)}</button>`);
      btn.onclick = () => {
        if (b.validate && !b.validate(scrim)) return;
        finish(typeof b.value === 'function' ? b.value(scrim) : b.value);
      };
      row.appendChild(btn);
    });
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) finish(undefined); });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = $('.btn.primary', row); if (p) p.click(); }
    });
    document.body.appendChild(scrim);
    pushOverlay(ov);
    if (onOpen) onOpen(scrim);
    const first = $('input[autofocus], input[type=text]', scrim);
    if (first) setTimeout(() => { first.focus(); first.select && first.select(); }, 60);
  });
}

async function prompt2(title, value = '', label = 'Name') {
  const v = await dialog({
    title,
    body: `<div class="field"><label>${esc(label)}</label><input type="text" id="pv" value="${esc(value)}" autofocus></div>`,
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'OK', cls: 'primary', value: (s) => $('#pv', s).value.trim() }]
  });
  return v || null;
}

async function confirm2(title, text, okLabel = 'Löschen', danger = true) {
  return !!(await dialog({
    title, body: `<p>${esc(text)}</p>`,
    buttons: [{ label: 'Abbrechen', value: false }, { label: okLabel, cls: danger ? 'primary danger-bg' : 'primary', value: true }]
  }));
}

/** Popover menu anchored at element. items: [{label, icon, action, danger}] | '-' | {section} */
function menu(anchor, items) {
  $$('.menu-pop').forEach((m) => m.remove());
  const pop = html('<div class="menu-pop"></div>');
  const ov = { close: () => close() };
  function close() { pop.remove(); document.removeEventListener('pointerdown', outside, true); popOverlay(ov); }
  function outside(e) { if (!pop.contains(e.target)) { close(); e.stopPropagation(); e.preventDefault(); } }
  items.forEach((it) => {
    if (!it) return;
    if (it === '-') { pop.appendChild(html('<hr>')); return; }
    if (it.section) { pop.appendChild(html(`<div class="mlabel">${esc(it.section)}</div>`)); return; }
    const b = html(`<button class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.check ? '<span class="spacer"></span>' + icon('check') : ''}</button>`);
    b.onclick = () => { close(); it.action && it.action(); };
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.right - pw, y = r.bottom + 6;
  if (x < 8) x = Math.min(r.left, window.innerWidth - pw - 8);
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 6);
  pop.style.left = Math.max(8, x) + 'px';
  pop.style.top = y + 'px';
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  pushOverlay(ov);
  return pop;
}

/* ---------------------------------------------------------------- files (images) */
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.onchange = () => { resolve(inp.files && inp.files[0] ? inp.files[0] : null); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}

function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Downscale image to max side and re-encode (JPEG unless transparency likely). */
async function prepareImage(dataUrl, maxSide = 1800) {
  const img = await loadImage(dataUrl);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
  const isPng = dataUrl.startsWith('data:image/png');
  if (s === 1 && dataUrl.length < 1.2e6) return { src: dataUrl, w, h };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!isPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.drawImage(img, 0, 0, w, h);
  const src = isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
  return { src: src.length < dataUrl.length || s < 1 ? src : dataUrl, w, h };
}

/* ---------------------------------------------------------------- export helpers */
function saveTextFile(filename, mime, text) {
  return new Promise((resolve) => {
    if (Native) {
      Native.saveAs(filename, mime, text, nativeCb((r) => resolve(r)));
    } else {
      if (window.FOS_WEB && navigator.canShare && typeof File !== 'undefined') {
        try {
          const f = new File([text], filename, { type: mime });
          if (navigator.canShare({ files: [f] })) {
            navigator.share({ files: [f], title: filename }).then(() => resolve({ ok: true }), (err) => {
              if (err && err.name === 'AbortError') resolve({ ok: false, cancelled: true }); else downloadBlob();
            });
            return;
          }
        } catch (e) { /* weiter mit Download */ }
      }
      downloadBlob();
    }
    function downloadBlob() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: mime }));
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      resolve({ ok: true });
    }
  });
}

function openTextFile(mime) {
  return new Promise((resolve) => {
    if (Native) {
      Native.openText(mime, nativeCb((r) => resolve(r)));
    } else {
      pickFile(mime === 'application/json' ? '.json,application/json' : '*/*').then(async (f) => {
        if (!f) return resolve({ ok: false, cancelled: true });
        resolve({ ok: true, text: await f.text() });
      });
    }
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'Export';
