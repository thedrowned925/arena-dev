'use strict';
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, clipboard } = require('electron');
const { Settings } = require('./config.cjs');
const { schemas, approvals, executeTool, output } = require('./tools.cjs');

const SIDEBAR_WIDTH = 352;
const HEADER_HEIGHT = 62;
const ARENA_HOME = 'https://arena.ai/';
const ARENA_AGENT = 'https://arena.ai/agent';
let win, arenaView, settings;
const toolNames = new Set(schemas.map(entry => entry.function.name));

function event(name, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('arena-event', name, payload);
}
function protectedHandler(fn) {
  return async (_ev, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (error) { return { ok: false, error: String(error?.message || error) }; }
  };
}
function locateWebView() {
  if (!win || win.isDestroyed() || !arenaView) return;
  const [width, height] = win.getContentSize();
  arenaView.setBounds({
    x: SIDEBAR_WIDTH,
    y: HEADER_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height: Math.max(0, height - HEADER_HEIGHT),
  });
}
async function approve(name, args) {
  const details = JSON.stringify(args, null, 2).slice(0, 2200);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Arena Dev — Yerel işlem onayı',
    message: 'Bu komut bilgisayarında çalıştırılacak.',
    detail: name + '\n\n' + details + '\n\nShell komutları çalışma klasörüyle sınırlandırılamaz. Kaynakları ve işlemi doğrula.',
    buttons: ['Vazgeç', 'Bir defa izin ver'],
    defaultId: 0, cancelId: 0, noLink: true,
  });
  return response === 1;
}
async function runTool(name, args) {
  if (typeof name !== 'string' || !toolNames.has(name)) throw new Error('Desteklenmeyen araç.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('JSON nesnesi gerekli.');
  if (!settings.public().workspace) throw new Error('Önce çalışma alanı seçmelisin.');
  if (approvals.has(name) && !await approve(name, args)) return { text: 'İşlem kullanıcı tarafından iptal edildi.' };
  return executeTool(name, args, {
    workspace: settings.public().workspace,
    userData: app.getPath('userData'),
  });
}
function registerIpc() {
  ipcMain.handle('settings:get', protectedHandler(() => settings.public()));
  ipcMain.handle('workspace:select', protectedHandler(async () => {
    const response = await dialog.showOpenDialog(win, {
      title: 'Çalışma klasörü seç',
      properties: ['openDirectory'],
    });
    if (response.canceled || !response.filePaths.length) return settings.public();
    return settings.updateWorkspace(response.filePaths[0]);
  }));
  ipcMain.handle('arena:nav', protectedHandler(async action => {
    switch (action) {
      case 'home': await arenaView.webContents.loadURL(ARENA_HOME); break;
      case 'agent': await arenaView.webContents.loadURL(ARENA_AGENT); break;
      case 'back': if (arenaView.webContents.navigationHistory.canGoBack()) arenaView.webContents.navigationHistory.goBack(); break;
      case 'forward': if (arenaView.webContents.navigationHistory.canGoForward()) arenaView.webContents.navigationHistory.goForward(); break;
      case 'reload': arenaView.webContents.reload(); break;
      case 'external': await shell.openExternal(ARENA_AGENT); break;
      default: throw new Error('Geçersiz gezinme işlemi.');
    }
    return true;
  }));
  ipcMain.handle('local:tool', protectedHandler(async (name, args) => {
    const result = await runTool(name, args);
    const { imageBase64, ...rest } = result;
    return { ...rest, imageDataUrl: imageBase64 ? 'data:image/png;base64,' + imageBase64 : null };
  }));
  ipcMain.handle('local:git-pull', protectedHandler(async () => {
    return await runTool('run_command', { command: 'git pull --ff-only' });
  }));
  ipcMain.handle('local:copy', protectedHandler(async value => {
    if (typeof value !== 'string' || value.length > 100000) throw new Error('Kopyalama sınırı aşıldı.');
    clipboard.writeText(value);
    return true;
  }));
}
function createWindow() {
  win = new BrowserWindow({
    width: 1340, height: 860, minWidth: 970, minHeight: 650,
    title: 'Arena Dev — Arena-powered workspace',
    backgroundColor: '#0e111a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Fully isolated remote browser. No preload, scripts, capture hooks or IPC are injected.
  // Arena receives user input directly in its own site. Local tools are deliberately manual.
  arenaView = new WebContentsView({
    webPreferences: {
      partition: 'persist:arena',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.contentView.addChildView(arenaView);
  locateWebView();
  win.on('resize', locateWebView);
  arenaView.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
  arenaView.webContents.on('will-navigate', (e, url) => {
    try { if (new URL(url).protocol !== 'https:') e.preventDefault(); }
    catch { e.preventDefault(); }
  });
  arenaView.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  arenaView.webContents.on('did-start-loading', () => event('browser', 'Arena yükleniyor…'));
  arenaView.webContents.on('did-stop-loading', () => event('browser', 'Arena sekmesi hazır'));
  arenaView.webContents.on('did-fail-load', (_ev, code, description, url) => {
    if (code !== -3) event('browser', 'Arena açılamadı: ' + description + ' (' + code + ')');
  });
  arenaView.webContents.loadURL(ARENA_AGENT).catch(error => event('browser', 'Yükleme hatası: ' + error.message));
}
app.whenReady().then(() => {
  settings = new Settings(app.getPath('userData'));
  registerIpc();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
