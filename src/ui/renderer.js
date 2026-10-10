'use strict';
const $ = id => document.getElementById(id);
const presets = {
  list_files: { directory: '.' },
  read_file: { path: 'README.md' },
  search_files: { query: 'TODO' },
  write_file: { path: 'notes.txt', content: 'Merhaba Arena Dev!' },
  run_command: { command: 'git status' },
  desktop_screenshot: {},
  desktop_click: { x: 500, y: 350 },
  desktop_type: { text: 'Merhaba!' },
};
let lastResult = '';
let busy = false;
let toastTimer;
function notify(text) {
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5500);
}
function resultOrThrow(r) {
  if (!r || !r.ok) throw new Error(r?.error || 'İşlem başarısız.');
  return r.data;
}
async function act(fn) {
  if (busy) return;
  busy = true;
  $('execute').disabled = true;
  $('gitPull').disabled = true;
  try { return await fn(); }
  catch (error) { notify(error.message); }
  finally { busy = false; $('execute').disabled = false; $('gitPull').disabled = false; }
}
function showResult(result) {
  lastResult = String(result.text || '');
  $('output').textContent = lastResult || '(Boş sonuç)';
  if (result.imageDataUrl) {
    $('screenshot').src = result.imageDataUrl;
    $('screenshot').hidden = false;
  } else {
    $('screenshot').hidden = true;
    $('screenshot').removeAttribute('src');
  }
}
function applySettings(data) {
  $('workspace').textContent = data.workspace || 'Klasör seçilmedi';
  $('workspace').title = data.workspace || '';
}
$('toolName').addEventListener('change', () => {
  $('toolArgs').value = JSON.stringify(presets[$('toolName').value] || {}, null, 2);
});
$('chooseWorkspace').addEventListener('click', () => act(async () => {
  applySettings(resultOrThrow(await window.arenaDesktop.selectWorkspace()));
}));
$('execute').addEventListener('click', () => act(async () => {
  let args;
  try { args = JSON.parse($('toolArgs').value); }
  catch { throw new Error('Geçerli JSON argümanları gir.'); }
  showResult(resultOrThrow(await window.arenaDesktop.executeTool($('toolName').value, args)));
}));
$('gitPull').addEventListener('click', () => act(async () => {
  showResult(resultOrThrow(await window.arenaDesktop.gitPull()));
}));
$('copy').addEventListener('click', () => act(async () => {
  if (!lastResult) throw new Error('Henüz kopyalanacak sonuç yok.');
  resultOrThrow(await window.arenaDesktop.copy(lastResult));
  notify('Araç sonucu kopyalandı. İstersen Arena sohbetine yapıştır.');
}));
for (const [button, command] of Object.entries({
  home: 'home', agent: 'agent', back: 'back', forward: 'forward', reload: 'reload', external: 'external',
})) {
  $(button).addEventListener('click', async () => {
    try { resultOrThrow(await window.arenaDesktop.navigate(command)); }
    catch (error) { notify(error.message); }
  });
}
window.arenaDesktop.onBrowserStatus(message => { $('browserStatus').textContent = message; });
act(async () => applySettings(resultOrThrow(await window.arenaDesktop.settings())));
