'use strict';

const API = 'https://api.alquran.cloud/v1';
const ARABIC_EDITION = 'quran-uthmani';
const $ = (id) => document.getElementById(id);

// ---------- persisted settings & progress ----------
const DEFAULTS = {
  surah: 1, ayah: 1,
  translation: 'id.indonesian',
  reciter: 'ar.alafasy',
  speed: 1,
  arSize: 28, trSize: 14,
  theme: 'dark',
  autoNext: true,
  autoHide: false,
  repeat: 1,
  volume: 0.8,
  muted: false,
};
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
};
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
// JSON can't store Infinity (loop forever), so it's saved as -1.
if (settings.repeat === -1) settings.repeat = Infinity;
const saveSettings = () => store.set('settings', { ...settings, repeat: settings.repeat === Infinity ? -1 : settings.repeat });

// ---------- data loading with cache ----------
const memo = new Map();

function cacheKey(edition, surah) { return `q:${edition}:${surah}`; }

function cachePut(key, value) {
  if (store.set(key, value)) return;
  // Quota hit: drop cached surahs (keeps settings) and try once more.
  for (const k of Object.keys(localStorage)) if (k.startsWith('q:')) localStorage.removeItem(k);
  store.set(key, value);
}

/** Returns an array (index = ayah-1) for one edition of one surah. */
async function loadEdition(edition, surah) {
  const key = cacheKey(edition, surah);
  if (memo.has(key)) return memo.get(key);
  const cached = store.get(key, null);
  if (cached) { memo.set(key, cached); return cached; }

  const p = (async () => {
    const res = await fetch(`${API}/surah/${surah}/${edition}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 200) throw new Error(json.data || 'API error');
    const ayahs = json.data.ayahs;
    let rows;
    if (edition === ARABIC_EDITION) {
      rows = ayahs.map((a) => ({ t: cleanArabic(a.text, surah, a.numberInSurah), n: a.number, j: a.juz, p: a.page, s: !!a.sajda }));
    } else if (edition.startsWith('ar.')) {
      rows = ayahs.map((a) => a.audio); // reciter: just the audio URLs
    } else {
      rows = ayahs.map((a) => a.text);
    }
    cachePut(key, rows);
    return rows;
  })();
  memo.set(key, p);
  try { const rows = await p; memo.set(key, rows); return rows; }
  catch (e) { memo.delete(key); throw e; }
}

// The Uthmani text prefixes ayah 1 of most surahs with the Bismillah; split it off
// so it can be shown as a header instead of being part of the ayah.
const stripMarks = (s) => s.replace(/[^ء-غف-يٱ]/g, '');
const BISMILLAH_BARE = 'بسمٱللهٱلرحمنٱلرحيم';
function cleanArabic(text, surah, ayah) {
  text = text.replace(/^﻿/, '');
  if (ayah === 1 && surah !== 1 && surah !== 9) {
    const words = text.split(' ');
    if (stripMarks(words.slice(0, 4).join('')) === BISMILLAH_BARE) {
      return { bism: words.slice(0, 4).join(' '), rest: words.slice(4).join(' ') };
    }
  }
  return text;
}

// ---------- rendering ----------
const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const surahMeta = (n) => window.SURAHS[n - 1];

let renderToken = 0;
let current = null; // { surah, ayah, row, audioUrl }

async function show(surah, ayah, { autoplay = false } = {}) {
  const meta = surahMeta(surah);
  ayah = Math.max(1, Math.min(meta.ayahs, ayah));
  settings.surah = surah; settings.ayah = ayah; saveSettings();

  $('surahName').textContent = `${meta.n}. ${meta.en}`;
  $('surahName').title = `${meta.en} — ${meta.tr} (${meta.type}, ${meta.ayahs} ayahs)`;
  $('ayahRef').textContent = `${surah}:${ayah}`;

  const token = ++renderToken;
  const status = $('status');
  status.className = 'status';
  status.textContent = '';
  const loadingTimer = setTimeout(() => { if (token === renderToken) status.textContent = 'Loading…'; }, 200);

  try {
    const [ar, tr] = await Promise.all([
      loadEdition(ARABIC_EDITION, surah),
      settings.translation ? loadEdition(settings.translation, surah).catch(() => null) : null,
    ]);
    if (token !== renderToken) return;
    const row = ar[ayah - 1];
    current = { surah, ayah, row };

    const arEl = $('arabic');
    arEl.replaceChildren();
    const text = typeof row.t === 'string' ? row.t : row.t.rest;
    if (typeof row.t !== 'string') {
      const b = document.createElement('span');
      b.className = 'bismillah';
      b.textContent = row.t.bism;
      arEl.append(b);
    }
    arEl.append(text + ' ');
    const end = document.createElement('span');
    end.className = 'end';
    end.textContent = `﴿${toArabicDigits(ayah)}﴾`;
    arEl.append(end);
    if (row.s) {
      const sj = document.createElement('span');
      sj.className = 'end';
      sj.textContent = ' ۩';
      sj.title = 'Sajdah';
      arEl.append(sj);
    }

    $('translation').textContent = tr ? tr[ayah - 1] : '';
    $('ayahRef').textContent = `${surah}:${ayah} · Juz ${row.j} · p.${row.p}`;
    $('reader').scrollTop = 0;
    markRead(row.n);
    prefetchAround(surah, ayah);

    if (autoplay || audio.wantPlaying) playCurrent();
  } catch (e) {
    if (token !== renderToken) return;
    status.className = 'status error';
    status.textContent = `Couldn't load this surah (${e.message}). Check your internet connection — once loaded, surahs are cached for offline use.`;
  } finally {
    clearTimeout(loadingTimer);
    if (token === renderToken && !status.classList.contains('error')) status.textContent = '';
  }
}

function step(delta, opts) {
  let { surah, ayah } = settings;
  ayah += delta;
  if (ayah < 1) {
    if (surah === 1) return;
    surah -= 1; ayah = surahMeta(surah).ayahs;
  } else if (ayah > surahMeta(surah).ayahs) {
    if (surah === 114) return;
    surah += 1; ayah = 1;
  }
  return show(surah, ayah, opts);
}

function prefetchAround(surah, ayah) {
  const meta = surahMeta(surah);
  if (ayah >= meta.ayahs - 2 && surah < 114) {
    loadEdition(ARABIC_EDITION, surah + 1).catch(() => {});
    if (settings.translation) loadEdition(settings.translation, surah + 1).catch(() => {});
  }
}

// ---------- daily progress ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function markRead(globalNumber) {
  const log = store.get('today', { day: null, seen: [] });
  if (log.day !== todayKey()) { log.day = todayKey(); log.seen = []; }
  if (!log.seen.includes(globalNumber)) log.seen.push(globalNumber);
  store.set('today', log);
  $('today').textContent = `Today: ${log.seen.length} ayah${log.seen.length === 1 ? '' : 's'}`;
}

// ---------- audio ----------
const audio = new Audio();
audio.preload = 'auto';
audio.wantPlaying = false;
let repeatsLeft = 0;
const preloader = new Audio();
preloader.preload = 'auto';

// Reciters prefixed "everyayah:" come from everyayah.com, whose per-ayah files
// follow a fixed SSSAAA.mp3 pattern, so no API lookup is needed.
const EVERYAYAH = 'everyayah:';
const pad3 = (n) => String(n).padStart(3, '0');
async function audioUrlFor(surah, ayah) {
  if (settings.reciter.startsWith(EVERYAYAH)) {
    const folder = settings.reciter.slice(EVERYAYAH.length);
    return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
  }
  const urls = await loadEdition(settings.reciter, surah);
  return urls[ayah - 1];
}

// Slow down or speed up any reciter without changing the pitch. Loading a new
// file resets playbackRate to defaultPlaybackRate, so set both.
function applySpeed() {
  const rate = Number(settings.speed) || 1;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.preservesPitch = true;
}
applySpeed();

async function playCurrent() {
  if (!current) return;
  const { surah, ayah } = current;
  try {
    const url = await audioUrlFor(surah, ayah);
    if (!current || current.surah !== surah || current.ayah !== ayah) return;
    audio.wantPlaying = true;
    if (audio.src !== url) { audio.src = url; repeatsLeft = settings.repeat - 1; }
    await audio.play();
    preloadNextAudio(surah, ayah);
  } catch (e) {
    if (e.name === 'AbortError') return; // superseded by a newer play/pause
    audio.wantPlaying = false;
    $('status').className = 'status error';
    $('status').textContent = `Couldn't play audio (${e.message}).`;
  }
  updatePlayButton();
}

function pause() {
  audio.wantPlaying = false;
  audio.pause();
  updatePlayButton();
}

function togglePlay() {
  if (audio.wantPlaying && !audio.paused) pause();
  else playCurrent();
}

async function preloadNextAudio(surah, ayah) {
  let s = surah, a = ayah + 1;
  if (a > surahMeta(s).ayahs) { if (s === 114) return; s += 1; a = 1; }
  try { preloader.src = await audioUrlFor(s, a); } catch { /* ignore */ }
}

audio.addEventListener('ended', () => {
  if (repeatsLeft !== 0) {
    if (repeatsLeft > 0) repeatsLeft -= 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  if (settings.autoNext && !(settings.surah === 114 && settings.ayah === 6)) {
    step(1); // wantPlaying stays true, so show() continues playback
  } else {
    audio.wantPlaying = false;
    updatePlayButton();
  }
});
audio.addEventListener('play', updatePlayButton);
audio.addEventListener('pause', updatePlayButton);

function updatePlayButton() {
  const playing = !audio.paused;
  $('btnPlay').textContent = playing ? '❚❚' : '▶';
  $('btnPlay').title = playing ? 'Pause (Space)' : 'Play recitation (Space)';
}

// ---------- volume ----------
function applyVolume() {
  audio.volume = settings.volume;
  audio.muted = settings.muted;
  $('volume').value = settings.volume;
  const silent = settings.muted || settings.volume === 0;
  $('btnMute').textContent = silent ? '🔇' : settings.volume < 0.5 ? '🔉' : '🔊';
  $('btnMute').title = silent ? 'Unmute (M)' : 'Mute (M)';
  $('volume').title = `Volume ${Math.round(settings.volume * 100)}%`;
}
function toggleMute() {
  settings.muted = !settings.muted;
  // Unmuting at 0% would still be silent, so bring it back to a usable level.
  if (!settings.muted && settings.volume === 0) settings.volume = 0.5;
  saveSettings();
  applyVolume();
}
$('btnMute').addEventListener('click', toggleMute);
$('volume').addEventListener('input', (e) => {
  settings.volume = Number(e.target.value);
  settings.muted = false;
  saveSettings();
  applyVolume();
});
// Scroll the mouse wheel over the slider to nudge the volume.
$('volume').addEventListener('wheel', (e) => {
  e.preventDefault();
  settings.volume = Math.min(1, Math.max(0, Math.round((settings.volume + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
  settings.muted = false;
  saveSettings();
  applyVolume();
}, { passive: false });

const REPEATS = [1, 2, 3, 5, 10, Infinity];
function updateRepeatButton() {
  $('btnRepeat').textContent = settings.repeat === Infinity ? '×∞' : `×${settings.repeat}`;
  $('btnRepeat').title = `Recite each ayah ${settings.repeat === Infinity ? 'on loop' : settings.repeat + ' time(s)'} — click to change`;
}

// ---------- panels ----------
function openPanel(id, focus) {
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== id;
  document.body.classList.add('panel-open');
  if (id === 'jump') openJump(focus);
}
function closePanels() {
  for (const p of document.querySelectorAll('.panel')) p.hidden = true;
  document.body.classList.remove('panel-open');
}
const anyPanelOpen = () => [...document.querySelectorAll('.panel')].some((p) => !p.hidden);

let jumpSurah = 1;
function openJump(focus = 'surah') {
  jumpSurah = settings.surah;
  $('surahFilter').value = '';
  renderSurahList();
  $('ayahInput').value = settings.ayah;
  updateAyahMax();
  $('pageInput').value = current?.row.p ?? 1;
  updatePageStart();
  $('surahList').querySelector('.sel')?.scrollIntoView({ block: 'center' });
  if (focus === 'page') { $('pageInput').focus(); $('pageInput').select(); }
  else $('surahFilter').focus();
}

// ---------- go to page (Madani mushaf, 604 pages) ----------
function pageNumber() {
  const n = parseInt($('pageInput').value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(window.PAGES.length, n)) : null;
}
function updatePageStart() {
  const n = pageNumber();
  if (!n) { $('pageStart').textContent = ''; return; }
  const [s, a] = window.PAGES[n - 1];
  $('pageStart').textContent = `· starts ${surahMeta(s).en} ${s}:${a}`;
}
function goToPage() {
  const n = pageNumber();
  if (!n) { $('pageInput').focus(); return; }
  const [s, a] = window.PAGES[n - 1];
  closePanels();
  pause();
  show(s, a);
}
$('pageInput').addEventListener('input', updatePageStart);
$('pageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goToPage(); } });
$('btnGoPage').addEventListener('click', goToPage);
function renderSurahList() {
  const q = $('surahFilter').value.trim().toLowerCase().replace(/[-'\s]/g, '');
  const list = $('surahList');
  list.replaceChildren();
  for (const s of window.SURAHS) {
    const hay = `${s.n} ${s.en} ${s.tr}`.toLowerCase().replace(/[-'\s]/g, '');
    if (q && !hay.includes(q) && String(s.n) !== q) continue;
    const li = document.createElement('li');
    li.dataset.n = s.n;
    if (s.n === jumpSurah) li.className = 'sel';
    li.innerHTML = `<span class="num"></span><span class="en"></span><span class="muted tr"></span><span class="ar"></span>`;
    li.querySelector('.num').textContent = s.n;
    li.querySelector('.en').textContent = s.en;
    li.querySelector('.tr').textContent = s.tr;
    li.querySelector('.ar').textContent = s.ar.replace(/^سُورَةُ\s*/, '');
    list.append(li);
  }
}
function updateAyahMax() {
  const max = surahMeta(jumpSurah).ayahs;
  $('ayahInput').max = max;
  $('ayahMax').textContent = `of ${max} · ${surahMeta(jumpSurah).en}`;
}
function doJump() {
  const max = surahMeta(jumpSurah).ayahs;
  const a = Math.max(1, Math.min(max, parseInt($('ayahInput').value, 10) || 1));
  closePanels();
  pause();
  show(jumpSurah, a);
}

$('surahFilter').addEventListener('input', () => {
  renderSurahList();
  const first = $('surahList').firstElementChild;
  if (first && !$('surahList').querySelector('.sel')) { jumpSurah = +first.dataset.n; first.classList.add('sel'); updateAyahMax(); }
});
$('surahFilter').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('ayahInput').value = 1; $('ayahInput').select(); $('ayahInput').focus(); }
});
$('surahList').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  jumpSurah = +li.dataset.n;
  for (const el of $('surahList').children) el.classList.toggle('sel', el === li);
  $('ayahInput').value = 1;
  updateAyahMax();
});
$('surahList').addEventListener('dblclick', (e) => { if (e.target.closest('li')) doJump(); });
$('ayahInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJump(); });
$('btnGo').addEventListener('click', doJump);
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closePanels);

// ---------- settings wiring ----------
function applyAppearance() {
  document.body.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--ar-size', `${settings.arSize}px`);
  document.documentElement.style.setProperty('--tr-size', `${settings.trSize}px`);
  document.body.classList.toggle('autohide', settings.autoHide);
  document.body.classList.toggle('no-translation', !settings.translation);
}

function bindSetting(id, key, { parse = (v) => v, prop = 'value', onChange } = {}) {
  const el = $(id);
  el[prop] = settings[key];
  el.addEventListener('input', () => {
    settings[key] = parse(el[prop]);
    saveSettings();
    applyAppearance();
    onChange?.();
  });
}
bindSetting('optTranslation', 'translation', { onChange: () => show(settings.surah, settings.ayah) });
bindSetting('optReciter', 'reciter', {
  onChange: () => { const was = audio.wantPlaying; audio.pause(); audio.removeAttribute('src'); if (was) playCurrent(); },
});
bindSetting('optSpeed', 'speed', { parse: Number, onChange: applySpeed });
bindSetting('optArSize', 'arSize', { parse: Number });
bindSetting('optTrSize', 'trSize', { parse: Number });
bindSetting('optTheme', 'theme');
bindSetting('optAutoNext', 'autoNext', { prop: 'checked' });
bindSetting('optAutoHide', 'autoHide', { prop: 'checked' });

$('optOpacity').addEventListener('input', (e) => window.pop.setOpacity(Number(e.target.value)));

// ---------- window buttons ----------
let pinned = true;
function setPinUI(v) {
  pinned = v;
  $('btnPin').classList.toggle('off', !v);
  $('btnPin').title = v ? 'Always on top: ON (click to turn off)' : 'Always on top: OFF (click to turn on)';
}
$('btnPin').addEventListener('click', () => { setPinUI(!pinned); window.pop.setPinned(pinned); });
$('btnSettings').addEventListener('click', () => ($('settings').hidden ? openPanel('settings') : closePanels()));
$('btnMin').addEventListener('click', () => window.pop.minimize());
$('btnClose').addEventListener('click', () => window.pop.quit());
$('where').addEventListener('click', () => ($('jump').hidden ? openPanel('jump') : closePanels()));

$('btnPrev').addEventListener('click', () => step(-1));
$('btnNext').addEventListener('click', () => step(1));
$('btnPlay').addEventListener('click', togglePlay);
$('btnRepeat').addEventListener('click', () => {
  const i = REPEATS.indexOf(settings.repeat);
  settings.repeat = REPEATS[(i + 1) % REPEATS.length];
  saveSettings();
  repeatsLeft = settings.repeat === Infinity ? -1 : settings.repeat - 1;
  updateRepeatButton();
});

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyPanelOpen()) { closePanels(); return; }
  if (anyPanelOpen() || e.target.matches('input, select, textarea')) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': step(1); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': step(-1); break;
    case ' ': togglePlay(); break;
    case 'g': case 'G': openPanel('jump'); break;
    case 'p': case 'P': openPanel('jump', 'page'); break;
    case 'm': case 'M': toggleMute(); break;
    case 't': case 'T': document.body.classList.toggle('no-translation'); break;
    default: return;
  }
  e.preventDefault();
});

// Commands from global shortcuts / tray
window.pop.onCommand((cmd) => {
  if (cmd === 'next') step(1);
  else if (cmd === 'prev') step(-1);
  else if (cmd === 'play') togglePlay();
  else if (cmd && cmd.type === 'pinned') setPinUI(cmd.value);
});

// ---------- boot ----------
(async function init() {
  applyAppearance();
  updateRepeatButton();
  updatePlayButton();
  applyVolume();
  const w = await window.pop.getWindow();
  setPinUI(w.pinned);
  $('optOpacity').value = w.opacity;
  show(settings.surah, settings.ayah);
})();
