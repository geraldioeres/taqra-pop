// Reads, writes and validates the mistake notes file. No Electron imports, so
// it stays easy to test on its own.
const fs = require('fs');

const TYPES = new Set(['makhraj', 'tajwid', 'mad', 'harakat', 'hafalan', 'other']);
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_NOTES = 20000;

const validTime = (v) => (Number.isFinite(v) && v > 0 ? v : null);

/** Returns a clean copy of one note, or null if it can't be used. */
function sanitizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, surah, ayah } = raw;
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) return null;
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > 286) return null;
  if (!Array.isArray(raw.words)) return null;
  const words = [...new Set(raw.words)]
    .filter((w) => Number.isInteger(w) && w >= 0 && w < 300)
    .sort((a, b) => a - b);
  if (!words.length) return null;
  const now = Date.now();
  const createdAt = validTime(raw.createdAt) ?? now;
  return {
    id, surah, ayah, words,
    text: typeof raw.text === 'string' ? raw.text.slice(0, 1000) : '',
    type: TYPES.has(raw.type) ? raw.type : 'other',
    note: typeof raw.note === 'string' ? raw.note.slice(0, 2000) : '',
    fixed: raw.fixed === true,
    createdAt,
    updatedAt: validTime(raw.updatedAt) ?? createdAt,
  };
}

function sanitizeNotes(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list.slice(0, MAX_NOTES) : []) {
    const note = sanitizeNote(raw);
    if (!note || seen.has(note.id)) continue;
    seen.add(note.id);
    out.push(note);
  }
  return out;
}

const serialize = (notes) => JSON.stringify(
  { app: 'taqra-pop', version: 1, savedAt: new Date().toISOString(), notes: sanitizeNotes(notes) },
  null,
  2,
);

/** Parses a notes file's text. Throws if it isn't a Taqra Pop notes file. */
function parseNotesFile(text) {
  const data = JSON.parse(text.replace(/^﻿/, ''));
  if (!data || data.app !== 'taqra-pop' || !Array.isArray(data.notes)) {
    throw new Error('not a Taqra Pop notes file');
  }
  const notes = sanitizeNotes(data.notes);
  return { notes, skipped: data.notes.length - notes.length };
}

/** Loads saved notes. A damaged file is kept aside instead of being overwritten. */
function readNotes(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { notes: [] };
    throw e;
  }
  try {
    return { notes: parseNotesFile(text).notes };
  } catch {
    const aside = `${file}.damaged-${Date.now()}`;
    fs.renameSync(file, aside);
    return { notes: [], warning: aside };
  }
}

/** Writes to a temp file first, so a crash can't leave a half-written file. */
function writeNotes(file, notes) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, serialize(notes));
  fs.renameSync(tmp, file);
}

function readImportFile(file) {
  if (fs.statSync(file).size > MAX_IMPORT_BYTES) throw new Error('file is too large');
  return parseNotesFile(fs.readFileSync(file, 'utf8'));
}

module.exports = { sanitizeNotes, serialize, parseNotesFile, readNotes, writeNotes, readImportFile };
