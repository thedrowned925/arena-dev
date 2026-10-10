'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifiedWorkspace, resolveApproved } = require('../src/security.cjs');
const { executeTool, approvals, schemas } = require('../src/tools.cjs');
const { Settings } = require('../src/config.cjs');

test('paths outside workspace are rejected', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ws-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(verifiedWorkspace(root), fs.realpathSync.native(root));
  assert.throws(() => resolveApproved(root, '../outside', false), /dışına/);
});

test('symlink/junction outside workspace is rejected', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ws-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-out-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  });
  try { fs.symlinkSync(elsewhere, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch { t.skip('symlink permissions unavailable'); return; }
  assert.throws(() => resolveApproved(root, 'escape/new.txt', false), /dışına/);
});

test('local file tools work', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ws-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ctx = { workspace: root };
  const saved = await executeTool('write_file', { path: 'sub/hello.txt', content: 'Merhaba test' }, ctx);
  assert.match(saved.text, /Kaydedildi/);
  const read = await executeTool('read_file', { path: 'sub/hello.txt' }, ctx);
  assert.equal(read.text, 'Merhaba test');
  const listed = await executeTool('list_files', { directory: 'sub' }, ctx);
  assert.match(listed.text, /hello.txt/);
  const searched = await executeTool('search_files', { query: 'Merhaba test' }, ctx);
  assert.match(searched.text, /hello.txt/);
  await assert.rejects(executeTool('write_file', { path: '../escape.txt', content: '' }, ctx), /dışına/);
});

test('write, shell and desktop operations are approval gated', () => {
  for (const tool of ['write_file','run_command','desktop_screenshot','desktop_click','desktop_type'])
    assert.equal(approvals.has(tool), true, tool);
  assert.equal(schemas.length, new Set(schemas.map(s => s.function.name)).size);
});

test('settings do not need model or API credentials', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-setup-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settings = new Settings(home).public();
  assert.equal(settings.arenaUrl, 'https://arena.ai/agent');
  assert.equal(Object.hasOwn(settings, 'model'), false);
  assert.equal(Object.hasOwn(settings, 'apiKey'), false);
});
