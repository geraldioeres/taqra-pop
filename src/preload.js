const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pop', {
  getWindow: () => ipcRenderer.invoke('win:get'),
  setPinned: (v) => ipcRenderer.send('win:pin', v),
  setOpacity: (v) => ipcRenderer.send('win:opacity', v),
  minimize: () => ipcRenderer.send('win:minimize'),
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('win:quit'),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
});
