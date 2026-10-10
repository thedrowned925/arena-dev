'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { Settings } = require('./config.cjs');
const { schemas, approvals, executeTool, output } = require('./tools.cjs');
const { LocalAgent, manualPrompt, parseManualResponse } = require('./agent.cjs');
let win, settings, agent, running = null, manualTask = '', manualResults = [];
function send(kind, payload) { if (win && !win.isDestroyed()) win.webContents.send('agent-event', kind, payload); }
async function invokeTool(name, args = {}, signal) {
  if (!schemas.some(s => s.function.name === name)) throw new Error('Bilinmeyen araç: ' + name);
  if (!settings.public().workspace) throw new Error('Önce çalışma klasörü seç.');
  if (signal?.aborted) throw new Error('Durduruldu.');
  if (approvals.has(name)) {
    const detail = JSON.stringify(args, null, 2).slice(0, 1600);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', title: 'İşlem onayı: ' + name,
      message: 'Arena Dev bilgisayarında işlem yapmak istiyor.',
      detail: name + '\n\n' + detail + '\n\nShell komutları çalışma klasörüyle sınırlı değildir.',
      buttons: ['Reddet', 'Bir kez izin ver'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (response !== 1) return { text: 'Kullanıcı işlemi reddetti.' };
  }
  if (signal?.aborted) throw new Error('Durduruldu.');
  try {
    return await executeTool(name, args, { workspace: settings.public().workspace, userData: app.getPath('userData'), signal });
  } catch (error) {
    return { text: 'Araç hatası: ' + String(error.message || error) };
  }
}
function guarded(handler) {
  return async (_event, ...args) => {
    try { return { ok: true, value: await handler(...args) }; }
    catch (error) { return { ok: false, error: String(error.message || error) }; }
  };
}
function register() {
  ipcMain.handle('state', guarded(() => settings.public()));
  ipcMain.handle('choose-workspace', guarded(async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return settings.public();
    return settings.update({ workspace: result.filePaths[0] });
  }));
  ipcMain.handle('set-model', guarded(model => settings.update({ model })));
  ipcMain.handle('open-arena', guarded(() => shell.openExternal('https://arena.ai/')));
  ipcMain.handle('reset', guarded(() => { if (running) throw new Error('Önce ajanı durdur.'); agent.reset(); manualResults = []; manualTask = ''; return true; }));
  ipcMain.handle('stop', guarded(() => { running?.abort(); return true; }));
  ipcMain.handle('send', guarded(async task => {
    if (running) throw new Error('Ajan hâlihazırda çalışıyor.');
    if (!settings.public().workspace) throw new Error('Önce çalışma klasörü seç.');
    const controller = new AbortController();
    running = controller;
    send('status', 'Çalışıyor');
    try { await agent.run(String(task), settings.public().model, controller.signal); }
    finally { running = null; send('status', 'Hazır'); }
    return true;
  }));
  ipcMain.handle('manual-prompt', guarded(task => {
    if (!settings.public().workspace) throw new Error('Önce çalışma klasörü seç.');
    if (String(task).trim() !== manualTask) { manualResults = []; manualTask = String(task).trim(); }
    if (!manualTask) throw new Error('Önce bir görev yaz.');
    return manualPrompt(manualTask, manualResults);
  }));
  ipcMain.handle('manual-response', guarded(async response => {
    if (!manualTask) throw new Error('Önce Arena istemini oluştur.');
    if (running) throw new Error('Ajan çalışırken elle yanıt işlenemez.');
    const parsed = parseManualResponse(String(response));
    const batch = [];
    for (const call of parsed.calls) {
      const result = await invokeTool(call.name, call.arguments);
      const item = { tool: call.name, arguments: call.arguments, result: output(result.text, 10000) };
      batch.push(item);
      if (result.imageBase64) item.note = 'Görsel otomatik olarak Arena web sitesine gönderilmez.';
      send('tool', { name: call.name, args: call.arguments, result: item.result });
    }
    manualResults.push(...batch);
    manualResults = manualResults.slice(-30);
    if (parsed.message) send('assistant', parsed.message);
    return { results: batch, nextPrompt: manualPrompt(manualTask, manualResults), done: parsed.calls.length === 0 };
  }));
}
app.whenReady().then(() => {
  settings = new Settings(app.getPath('userData'));
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 920, minHeight: 650,
    backgroundColor: '#0c1018', title: 'Arena Dev',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  agent = new LocalAgent(invokeTool, send);
  register();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
