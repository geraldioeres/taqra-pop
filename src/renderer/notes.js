'use strict';
// Mistake notes: highlight words you got wrong, review them, and drill them.
// Loaded before app.js and started from its init() through setupNotes().

const MISTAKE_TYPES = [
  { id: 'makhraj', label: 'Makhraj', hint: 'Letter articulation' },
  { id: 'tajwid', label: 'Tajwid', hint: 'Ghunnah, idgham, qalqalah…' },
  { id: 'mad', label: 'Mad', hint: 'Elongation too long or short' },
  { id: 'harakat', label: 'Harakat', hint: 'Wrong vowel' },
  { id: 'hafalan', label: 'Hafalan', hint: 'Forgot, skipped or swapped a word' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];
const mistakeLabel = (id) => MISTAKE_TYPES.find((t) => t.id === id)?.label ?? 'Other';

let mistakes = [];
let editor = null;
const practice = { on: false, type: '', surah: 0 };

const ayahOrder = (surah, ayah) => surah * 1000 + ayah;
const byQuranOrder = (a, b) => a.surah - b.surah || a.ayah - b.ayah || a.words[0] - b.words[0];
const mistakesIn = (surah, ayah) => mistakes.filter((n) => n.surah === surah && n.ayah === ayah);

function newNoteId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer = null;
function toast(message, isError = false) {
  const t = $('toast');
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 3500);
}

async function persistMistakes() {
  const result = await window.pop.saveNotes(mistakes);
  if (!result.ok) toast(`Couldn't save your notes (${result.error}).`, true);
  return result.ok;
}

function afterMistakesChanged() {
  applyMistakes();
  if (!$('notesPanel').hidden) renderNotesPanel();
}

// ---------- highlights on the current ayah ----------
function applyMistakes() {
  const words = $('arabic').querySelectorAll('.word');
  const here = current ? mistakesIn(current.surah, current.ayah) : [];
  for (const word of words) {
    word.classList.remove('mistake', 'mistake-fixed');
    delete word.dataset.mistake;
    word.removeAttribute('title');
    const on = here.filter((n) => n.words.includes(Number(word.dataset.w)));
    if (!on.length) continue;
    const open = on.filter((n) => !n.fixed);
    word.classList.add(open.length ? 'mistake' : 'mistake-fixed');
    word.dataset.mistake = (open[0] ?? on[0]).type;
    word.title = on
      .map((n) => `${mistakeLabel(n.type)}${n.fixed ? ' (fixed)' : ''}${n.note ? `: ${n.note}` : ''}`)
      .join('\n');
  }
  const openCount = here.filter((n) => !n.fixed).length;
  $('notesBadge').hidden = openCount === 0;
  $('notesBadge').textContent = openCount;
  $('btnNotes').title = openCount
    ? `Mistake notes (N): ${openCount} open on this ayah`
    : 'Mistake notes (N)';
  updatePracticeBar();
}

/** The words a right-click applies to: the dragged selection, or just that word. */
function wordsForContextMenu(clicked) {
  const selection = window.getSelection();
  if (selection.isCollapsed || !selection.rangeCount) return [clicked];
  const range = selection.getRangeAt(0);
  const selected = [...$('arabic').querySelectorAll('.word')].filter((word) => {
    const r = document.createRange();
    r.selectNodeContents(word);
    return range.compareBoundaryPoints(Range.START_TO_END, r) > 0
      && range.compareBoundaryPoints(Range.END_TO_START, r) < 0;
  });
  return selected.includes(clicked) ? selected : [clicked];
}

function onWordContextMenu(e) {
  e.preventDefault();
  const word = e.target.closest('.word');
  if (!word || !current) return;
  const wordEls = wordsForContextMenu(word);
  const words = wordEls.map((w) => Number(w.dataset.w)).sort((a, b) => a - b);
  const text = [...wordEls]
    .sort((a, b) => Number(a.dataset.w) - Number(b.dataset.w))
    .map((w) => w.textContent)
    .join(' ');
  const existing = mistakesIn(current.surah, current.ayah).filter((n) => n.words.some((w) => words.includes(w)));
  const pick = words.length === 1
    ? (existing.find((n) => !n.fixed) ?? existing[0])
    : existing.find((n) => n.words.length === words.length && n.words.every((w) => words.includes(w)));
  window.getSelection().removeAllRanges();
  openEditor({ surah: current.surah, ayah: current.ayah, words, text, noteId: pick?.id });
}

// ---------- editor ----------
function openEditor({ surah, ayah, words, text, noteId = null, returnTo = null }) {
  editor = { surah, ayah, baseWords: words, baseText: text, returnTo };
  loadEditorNote(noteId);
  openPanel('noteEditor');
  $('editorNote').focus();
}

function loadEditorNote(noteId) {
  const note = noteId ? mistakes.find((n) => n.id === noteId) : null;
  Object.assign(editor, {
    noteId: note?.id ?? null,
    words: note?.words ?? editor.baseWords,
    text: note?.text ?? editor.baseText,
    type: note?.type ?? settings.lastMistakeType,
    confirmDelete: false,
  });
  $('editorNote').value = note?.note ?? '';
  $('editorFixed').checked = note?.fixed ?? false;
  renderEditor();
}

function renderEditor() {
  const meta = surahMeta(editor.surah);
  $('editorTitle').textContent = `${editor.noteId ? 'Edit mistake' : 'New mistake'} · ${meta.en} ${editor.surah}:${editor.ayah}`;
  $('editorWords').textContent = editor.text;

  const tabs = $('editorTabs');
  tabs.replaceChildren();
  const overlapping = mistakesIn(editor.surah, editor.ayah)
    .filter((n) => n.words.some((w) => editor.baseWords.includes(w)));
  tabs.hidden = overlapping.length === 0;
  for (const n of overlapping) {
    const b = el('button', 'chip', `${mistakeLabel(n.type)}${n.fixed ? ' ✓' : ''}`);
    b.type = 'button';
    b.dataset.mistake = n.type;
    b.setAttribute('aria-pressed', String(n.id === editor.noteId));
    b.addEventListener('click', () => loadEditorNote(n.id));
    tabs.append(b);
  }
  const add = el('button', 'chip', '+ New');
  add.type = 'button';
  add.setAttribute('aria-pressed', String(!editor.noteId));
  add.addEventListener('click', () => loadEditorNote(null));
  tabs.append(add);

  for (const b of $('editorTypes').children) {
    b.setAttribute('aria-pressed', String(b.dataset.mistake === editor.type));
  }
  $('editorFixedRow').hidden = !editor.noteId;
  $('btnNoteDelete').hidden = !editor.noteId;
  $('btnNoteDelete').textContent = editor.confirmDelete ? 'Confirm delete' : 'Delete';
}

function closeEditor() {
  const back = editor?.returnTo;
  editor = null;
  if (back === 'notes') openPanel('notesPanel');
  else closePanels();
}

async function saveEditor() {
  if (!editor) return;
  const now = Date.now();
  const fields = { type: editor.type, note: $('editorNote').value.trim(), updatedAt: now };
  const existing = editor.noteId && mistakes.find((n) => n.id === editor.noteId);
  if (existing) {
    Object.assign(existing, fields, { fixed: $('editorFixed').checked });
  } else {
    const note = {
      id: newNoteId(), surah: editor.surah, ayah: editor.ayah, words: editor.words,
      text: editor.text, fixed: false, createdAt: now, ...fields,
    };
    mistakes.push(note);
    editor.noteId = note.id; // a retry after a failed save updates this note
  }
  settings.lastMistakeType = editor.type;
  saveSettings();
  const saved = await persistMistakes();
  afterMistakesChanged();
  if (saved) closeEditor();
  else if (editor) renderEditor();
}

async function deleteFromEditor() {
  if (!editor?.noteId) return;
  if (!editor.confirmDelete) {
    editor.confirmDelete = true;
    renderEditor();
    return;
  }
  mistakes = mistakes.filter((n) => n.id !== editor.noteId);
  const saved = await persistMistakes();
  afterMistakesChanged();
  if (saved) {
    toast('Mistake deleted.');
    closeEditor();
  }
}

// ---------- notes panel ----------
function filteredForPanel() {
  const type = $('notesType').value;
  const surah = Number($('notesSurah').value);
  const status = $('notesStatus').value;
  return mistakes
    .filter((n) => (!type || n.type === type)
      && (!surah || n.surah === surah)
      && (status === 'all' || n.fixed === (status === 'fixed')))
    .sort(byQuranOrder);
}

function renderSurahFilter() {
  const select = $('notesSurah');
  const keep = select.value;
  const surahs = [...new Set(mistakes.map((n) => n.surah))].sort((a, b) => a - b);
  select.replaceChildren(new Option('All surahs', '0'));
  for (const s of surahs) select.append(new Option(`${s}. ${surahMeta(s).en}`, String(s)));
  select.value = surahs.includes(Number(keep)) ? keep : '0';
}

function renderNotesPanel() {
  renderSurahFilter();
  const open = mistakes.filter((n) => !n.fixed).length;
  $('notesSummary').textContent = `${open} open · ${mistakes.length - open} fixed`;

  const list = $('notesList');
  list.replaceChildren();
  const rows = filteredForPanel();
  $('notesEmpty').hidden = rows.length > 0;
  $('notesEmpty').textContent = mistakes.length
    ? 'Nothing matches these filters.'
    : 'No mistakes yet. Right-click a word while reciting to add one.';

  for (const n of rows) {
    const li = el('li', n.fixed ? 'note-row is-fixed' : 'note-row');
    li.dataset.mistake = n.type;

    const jump = el('button', 'note-jump');
    jump.type = 'button';
    jump.title = 'Go to this ayah';
    const head = el('span', 'note-head');
    head.append(
      el('span', 'type-dot'),
      el('strong', '', mistakeLabel(n.type)),
      el('span', 'muted', `${surahMeta(n.surah).en} ${n.surah}:${n.ayah}`),
    );
    const words = el('span', 'note-words', n.text);
    words.dir = 'rtl';
    words.lang = 'ar';
    jump.append(head, words);
    if (n.note) {
      const body = el('span', 'note-body', n.note);
      body.dir = 'auto';
      jump.append(body);
    }
    jump.addEventListener('click', () => {
      closePanels();
      pause();
      show(n.surah, n.ayah);
    });

    const actions = el('span', 'note-actions');
    const fix = el('button', 'icon', n.fixed ? '↺' : '✓');
    fix.type = 'button';
    fix.title = n.fixed ? 'Mark as not fixed' : 'Mark as fixed';
    fix.setAttribute('aria-label', fix.title);
    fix.addEventListener('click', async () => {
      n.fixed = !n.fixed;
      n.updatedAt = Date.now();
      await persistMistakes();
      afterMistakesChanged();
    });
    const edit = el('button', 'icon', '✎');
    edit.type = 'button';
    edit.title = 'Edit';
    edit.setAttribute('aria-label', 'Edit');
    edit.addEventListener('click', () => openEditor({
      surah: n.surah, ayah: n.ayah, words: n.words, text: n.text, noteId: n.id, returnTo: 'notes',
    }));
    actions.append(fix, edit);
    li.append(jump, actions);
    list.append(li);
  }

  const stops = practiceStops($('notesType').value, Number($('notesSurah').value));
  $('btnPractice').disabled = stops.length === 0;
  $('btnPractice').textContent = stops.length
    ? `Practice ${stops.length} ayah${stops.length === 1 ? '' : 's'}`
    : 'Practice';
  $('btnPractice').title = 'Go through only the ayahs with open mistakes, using the filters above';
}

async function exportMistakes() {
  const result = await window.pop.exportNotes();
  if (result.canceled) return;
  if (result.ok) toast(`Exported ${result.count} note${result.count === 1 ? '' : 's'}.`);
  else toast(`Couldn't export (${result.error}).`, true);
}

/** Merges an imported file. Nothing is removed; the newer copy of a note wins. */
async function importMistakes() {
  const result = await window.pop.importNotes();
  if (result.canceled) return;
  if (!result.ok) { toast(`Couldn't import (${result.error}).`, true); return; }
  let added = 0, updated = 0, skipped = result.skipped;
  for (const note of result.notes) {
    if (note.ayah > surahMeta(note.surah).ayahs) { skipped += 1; continue; }
    const i = mistakes.findIndex((n) => n.id === note.id);
    if (i === -1) { mistakes.push(note); added += 1; }
    else if (note.updatedAt > mistakes[i].updatedAt) { mistakes[i] = note; updated += 1; }
  }
  const saved = await persistMistakes();
  afterMistakesChanged();
  if (saved) toast(`Imported: ${added} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}.`);
}

// ---------- practice mode ----------
function practiceStops(type = practice.type, surah = practice.surah) {
  const seen = new Map();
  for (const n of mistakes) {
    if (n.fixed || (type && n.type !== type) || (surah && n.surah !== surah)) continue;
    seen.set(ayahOrder(n.surah, n.ayah), { surah: n.surah, ayah: n.ayah });
  }
  return [...seen.keys()].sort((a, b) => a - b).map((k) => ({ ...seen.get(k), key: k }));
}

function startPractice() {
  practice.type = $('notesType').value;
  practice.surah = Number($('notesSurah').value);
  const stops = practiceStops();
  if (!stops.length) return;
  practice.on = true;
  closePanels();
  pause();
  show(stops[0].surah, stops[0].ayah);
  updatePracticeBar();
}

function exitPractice() {
  practice.on = false;
  updatePracticeBar();
}

/** Next/previous ayah with an open mistake, wrapping around at the ends. */
function practiceStep(delta, opts) {
  const stops = practiceStops();
  if (!stops.length) { exitPractice(); return undefined; }
  const here = ayahOrder(settings.surah, settings.ayah);
  const target = delta > 0
    ? (stops.find((s) => s.key > here) ?? stops[0])
    : ([...stops].reverse().find((s) => s.key < here) ?? stops[stops.length - 1]);
  return show(target.surah, target.ayah, opts);
}

function isLastPracticeStop() {
  const stops = practiceStops();
  return !stops.length || stops[stops.length - 1].key <= ayahOrder(settings.surah, settings.ayah);
}

function updatePracticeBar() {
  const bar = $('practiceBar');
  if (!practice.on) { bar.hidden = true; return; }
  const stops = practiceStops();
  if (!stops.length) {
    practice.on = false;
    bar.hidden = true;
    toast('All mistakes in this practice are fixed.');
    return;
  }
  bar.hidden = false;
  const i = stops.findIndex((s) => s.key === ayahOrder(settings.surah, settings.ayah));
  const scope = practice.type ? ` · ${mistakeLabel(practice.type)}` : '';
  $('practiceLabel').textContent = i >= 0
    ? `Practice${scope} · ${i + 1} of ${stops.length}`
    : `Practice${scope} · ${stops.length} left`;
}

// ---------- startup ----------
async function setupNotes() {
  for (const t of MISTAKE_TYPES) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.dataset.mistake = t.id;
    chip.title = t.hint;
    chip.append(el('span', 'type-dot'), t.label);
    chip.addEventListener('click', () => { editor.type = t.id; renderEditor(); });
    $('editorTypes').append(chip);
    $('notesType').append(new Option(t.label, t.id));
  }

  $('arabic').addEventListener('contextmenu', onWordContextMenu);
  $('btnNotes').addEventListener('click', () => ($('notesPanel').hidden ? openPanel('notesPanel') : closePanels()));
  $('btnEditorClose').addEventListener('click', closeEditor);
  $('btnNoteCancel').addEventListener('click', closeEditor);
  $('btnNoteSave').addEventListener('click', saveEditor);
  $('btnNoteDelete').addEventListener('click', deleteFromEditor);
  $('editorNote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveEditor(); }
  });
  for (const id of ['notesType', 'notesSurah', 'notesStatus']) {
    $(id).addEventListener('input', renderNotesPanel);
  }
  $('btnPractice').addEventListener('click', startPractice);
  $('btnExportNotes').addEventListener('click', exportMistakes);
  $('btnImportNotes').addEventListener('click', importMistakes);
  $('btnPracticeExit').addEventListener('click', exitPractice);

  const result = await window.pop.loadNotes();
  mistakes = result.notes;
  if (!result.ok) toast(`Couldn't load your notes (${result.error}).`, true);
  else if (result.warning) toast('Your notes file was damaged. A copy was kept in the app data folder.', true);
}
