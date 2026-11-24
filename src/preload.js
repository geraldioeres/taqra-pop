const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pop', {
  getWindow: () => ipcRenderer.invoke('win:get'),
  setPinned: (v) => ipcRenderer.send('win:pin', v),
  setOpacity: (v) => ipcRenderer.send('win:opacity', v),
  minimize: () => ipcRenderer.send('win:minimize'),
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('win:quit'),
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (notes) => ipcRenderer.invoke('notes:save', notes),
  exportNotes: () => ipcRenderer.invoke('notes:export'),
  importNotes: () => ipcRenderer.invoke('notes:import'),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
});
