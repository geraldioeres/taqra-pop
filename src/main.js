const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULT_STATE = { width: 440, height: 320, pinned: true, opacity: 1 };

let win = null;
let tray = null;
let state = { ...DEFAULT_STATE };

function loadState() {
  try {
    state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) };
  } catch {
    state = { ...DEFAULT_STATE };
  }
  // Make sure the saved position is still on a connected display.
  if (state.x !== undefined && state.y !== undefined) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      state.x >= a.x - 50 && state.y >= a.y - 50 &&
      state.x < a.x + a.width - 50 && state.y < a.y + a.height - 50);
    if (!visible) { delete state.x; delete state.y; }
  }
  if (state.x === undefined) {
    const a = screen.getPrimaryDisplay().workArea;
    state.x = a.x + a.width - state.width - 24;
    state.y = a.y + a.height - state.height - 24;
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    if (!win.isMinimized()) Object.assign(state, win.getBounds());
    try { fs.writeFileSync(STATE_FILE(), JSON.stringify(state)); } catch { /* ignore */ }
  }, 300);
}

function applyPin() {
  // 'floating' keeps it above normal windows without fighting full-screen apps too hard.
  win.setAlwaysOnTop(state.pinned, 'floating');
  win.setVisibleOnAllWorkspaces(state.pinned, { visibleOnFullScreen: true });
}

function createWindow() {
  loadState();
  win = new BrowserWindow({
    x: state.x, y: state.y, width: state.width, height: state.height,
    minWidth: 260, minHeight: 120,
    frame: false,
    transparent: false,
    backgroundColor: '#12161c',
    skipTaskbar: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Taqra Pop',
    icon: makeIcon(64),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  applyPin();
  win.setOpacity(state.opacity);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('move', saveState);
  win.on('resize', saveState);
  win.on('closed', () => { win = null; });
  // Block navigation away from the app (e.g. dropped links).
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function send(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('command', cmd);
}

function toggleVisible() {
  if (!win) return createWindow();
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else { win.show(); win.focus(); }
}

// Draw a simple round tray/app icon in code so no binary assets are needed.
function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2, r = size / 2 - 0.5, inner = r * 0.62;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d > r) continue;
      // crescent: outer disc minus offset disc
      const d2 = Math.hypot(dx - size * 0.16, dy + size * 0.06);
      const moon = d < inner && d2 > inner * 0.82;
      const [R, G, B] = moon ? [0xf2, 0xd7, 0x8a] : [0x1f, 0x6f, 0x5c];
      buf[i] = B; buf[i + 1] = G; buf[i + 2] = R; buf[i + 3] = 255; // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(makeIcon(16));
  tray.setToolTip('Taqra Pop');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Show / Hide  (Ctrl+Alt+Q)', click: toggleVisible },
    { label: 'Next ayah  (Ctrl+Alt+→)', click: () => send('next') },
    { label: 'Previous ayah  (Ctrl+Alt+←)', click: () => send('prev') },
    { label: 'Play / Pause  (Ctrl+Alt+P)', click: () => send('play') },
    { type: 'separator' },
    {
      label: 'Always on top', type: 'checkbox', checked: state.pinned,
      click: (item) => setPinned(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', toggleVisible);
  tray.refreshMenu = () => tray.setContextMenu(menu());
}

function setPinned(pinned) {
  state.pinned = !!pinned;
  if (win) { applyPin(); send({ type: 'pinned', value: state.pinned }); }
  saveState();
  tray?.refreshMenu();
}

function registerShortcuts() {
  const map = {
    'CommandOrControl+Alt+Q': toggleVisible,
    'CommandOrControl+Alt+Right': () => send('next'),
    'CommandOrControl+Alt+Left': () => send('prev'),
    'CommandOrControl+Alt+P': () => send('play'),
  };
  for (const [accel, fn] of Object.entries(map)) {
    try { globalShortcut.register(accel, fn); } catch { /* taken by another app */ }
  }
}

ipcMain.handle('win:get', () => ({ pinned: state.pinned, opacity: state.opacity }));
ipcMain.on('win:pin', (_e, pinned) => setPinned(pinned));
ipcMain.on('win:opacity', (_e, v) => {
  state.opacity = Math.min(1, Math.max(0.3, Number(v) || 1));
  win?.setOpacity(state.opacity);
  saveState();
});
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:hide', () => win?.hide());
ipcMain.on('win:quit', () => app.quit());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    createWindow();
    createTray();
    registerShortcuts();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Keep running in the tray when the window is hidden; quit from tray or ✕ button.
  app.on('window-all-closed', () => app.quit());
}
