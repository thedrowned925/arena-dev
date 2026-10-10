'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const kinds = ['status', 'assistant', 'tool'];
contextBridge.exposeInMainWorld('arenaDev', {
  state: () => ipcRenderer.invoke('state'),
  chooseWorkspace: () => ipcRenderer.invoke('choose-workspace'),
  setModel: model => ipcRenderer.invoke('set-model', model),
  send: text => ipcRenderer.invoke('send', text),
  stop: () => ipcRenderer.invoke('stop'),
  reset: () => ipcRenderer.invoke('reset'),
  manualPrompt: task => ipcRenderer.invoke('manual-prompt', task),
  manualResponse: text => ipcRenderer.invoke('manual-response', text),
  openArena: () => ipcRenderer.invoke('open-arena'),
  onEvent: callback => {
    const handler = (_event, kind, payload) => { if (kinds.includes(kind)) callback(kind, payload); };
    ipcRenderer.on('agent-event', handler);
    return () => ipcRenderer.removeListener('agent-event', handler);
  },
});
