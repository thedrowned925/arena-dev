'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arenaDesktop', Object.freeze({
  settings: () => ipcRenderer.invoke('settings:get'),
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  navigate: action => ipcRenderer.invoke('arena:nav', action),
  executeTool: (name, args) => ipcRenderer.invoke('local:tool', name, args),
  gitPull: () => ipcRenderer.invoke('local:git-pull'),
  copy: text => ipcRenderer.invoke('local:copy', text),
  onBrowserStatus: fn => {
    const handle = (_event, kind, payload) => { if (kind === 'browser') fn(payload); };
    ipcRenderer.on('arena-event', handle);
    return () => ipcRenderer.off('arena-event', handle);
  },
}));
