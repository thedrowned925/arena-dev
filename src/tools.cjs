'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { verifiedWorkspace, resolveApproved } = require('./security.cjs');

function output(value, max = 14000) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) + '\n[Çıktı kısaltıldı]' : s;
}
const ignored = new Set(['.git', '.venv', 'node_modules', 'dist', '.next', 'build']);
const schemas = [
  { type: 'function', function: { name: 'list_files', description: 'List one directory within the approved workspace', parameters: { type: 'object', properties: { directory: { type: 'string', description: 'Relative path; default "."' } } } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a UTF-8 text file from approved workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'search_files', description: 'Find filenames or lines containing a query, within workspace', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a UTF-8 file inside workspace; requires approval', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'run_command', description: 'Execute a shell command on the real machine; not sandboxed; requires approval', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'desktop_screenshot', description: 'Capture primary screen as PNG for vision-capable model; requires approval; Windows only', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'desktop_click', description: 'Click screen at absolute physical pixel coordinates; requires approval; Windows only', parameters: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' } }, required: ['x', 'y'] } } },
  { type: 'function', function: { name: 'desktop_type', description: 'Type text into focused app; requires approval; Windows only', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
];
const approvals = new Set(['write_file', 'run_command', 'desktop_screenshot', 'desktop_click', 'desktop_type']);
async function processRun(exe, args, ctx, env = {}, timeout = 30000) {
  return await new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: ctx.workspace, windowsHide: true, env: { ...process.env, ...env }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = (error, code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve({ code, stdout: output(stdout), stderr: output(stderr) });
    };
    child.stdout.on('data', d => stdout = output(stdout + String(d)));
    child.stderr.on('data', d => stderr = output(stderr + String(d)));
    child.on('close', code => finish(null, code));
    child.on('error', err => finish(err));
    const abort = () => { child.kill(); finish(new Error('İşlem iptal edildi.')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Komut zaman aşımına uğradı.')); }, timeout);
    if (ctx.signal?.aborted) abort();
    else ctx.signal?.addEventListener('abort', abort, { once: true });
  });
}
function win() {
  if (process.platform !== 'win32') throw new Error('Masaüstü otomasyonu Windows gerektiriyor.');
}
function powershell(script, ctx, env = {}, timeout = 30000) {
  win();
  return processRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], ctx, env, timeout);
}
async function executeTool(name, args = {}, ctx) {
  if (!schemas.some(s => s.function.name === name)) throw new Error('Bilinmeyen araç: ' + name);
  const workspace = verifiedWorkspace(ctx.workspace);
  if (name === 'list_files') {
    const dir = resolveApproved(workspace, args.directory || '.');
    if (!fs.statSync(dir).isDirectory()) throw new Error('Klasör değil.');
    return { text: fs.readdirSync(dir, { withFileTypes: true }).slice(0, 120).map(e => {
      const type = e.isDirectory() ? '[DIR]' : e.isSymbolicLink() ? '[LINK]' : '[FILE]';
      return type + ' ' + path.relative(workspace, path.join(dir, e.name));
    }).join('\n') || '(boş klasör)' };
  }
  if (name === 'read_file') {
    const file = resolveApproved(workspace, args.path);
    if (!fs.statSync(file).isFile()) throw new Error('Dosya değil.');
    if (fs.statSync(file).size > 120000) throw new Error('120 KB dosya sınırı.');
    const bytes = fs.readFileSync(file);
    if (bytes.includes(0)) throw new Error('İkili dosya metin olarak okunamaz.');
    return { text: output(bytes.toString('utf8'), 120000) };
  }
  if (name === 'write_file') {
    if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 120000) throw new Error('120 KB içerik sınırı.');
    const file = resolveApproved(workspace, args.path, false);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    resolveApproved(workspace, args.path, false);
    fs.writeFileSync(file, args.content, 'utf8');
    return { text: 'Kaydedildi: ' + path.relative(workspace, file) };
  }
  if (name === 'search_files') {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 100) throw new Error('Arama ifadesi geçersiz.');
    const queue = [workspace], found = []; let visited = 0;
    while (queue.length && visited < 500 && found.length < 40) {
      const dir = queue.shift();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(e.name) || e.isSymbolicLink()) continue;
        const file = path.join(dir, e.name);
        if (e.isDirectory()) { queue.push(file); continue; }
        if (!e.isFile()) continue;
        visited++;
        const rel = path.relative(workspace, file);
        if (rel.toLowerCase().includes(args.query.toLowerCase())) { found.push(rel + ' [isim]'); continue; }
        try {
          if (fs.statSync(file).size > 90000) continue;
          const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
          const index = lines.findIndex(line => line.toLowerCase().includes(args.query.toLowerCase()));
          if (index !== -1) found.push(rel + ':' + (index + 1));
        } catch {}
        if (visited >= 500 || found.length >= 40) break;
      }
    }
    return { text: found.join('\n') || 'Eşleşme yok.', scanned: visited };
  }
  if (name === 'run_command') {
    if (typeof args.command !== 'string' || !args.command.trim() || args.command.length > 2000) throw new Error('Geçersiz komut.');
    const result = process.platform === 'win32'
      ? await powershell(args.command, ctx, {}, 45000)
      : await processRun('/bin/sh', ['-c', args.command], ctx, {}, 45000);
    return { text: 'Exit: ' + result.code + '\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr };
  }
  if (name === 'desktop_click') {
    if (![args.x, args.y].every(v => Number.isInteger(v) && v >= 0 && v <= 20000)) throw new Error('Geçersiz koordinat.');
    const script = [
      '$ErrorActionPreference="Stop"',
      'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class ArenaMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }\'',
      '[ArenaMouse]::SetCursorPos([int]$env:ARENA_X,[int]$env:ARENA_Y) | Out-Null',
      'Start-Sleep -Milliseconds 100',
      '[ArenaMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)',
      '[ArenaMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)'
    ].join('\n');
    const r = await powershell(script, ctx, { ARENA_X: String(args.x), ARENA_Y: String(args.y) });
    if (r.code !== 0) throw new Error(r.stderr);
    return { text: 'Tıklandı: ' + args.x + ', ' + args.y };
  }
  if (name === 'desktop_type') {
    if (typeof args.text !== 'string' || !args.text || args.text.length > 1500) throw new Error('Metin 1–1500 karakter olmalı.');
    // Uses clipboard for reliable Unicode text entry; previous clipboard contents are restored.
    const script = [
      '$ErrorActionPreference="Stop"',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$saved=$null',
      'try { $saved=[System.Windows.Forms.Clipboard]::GetDataObject() } catch {}',
      'try {',
      ' $t=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ARENA_TEXT_BASE64))',
      ' [System.Windows.Forms.Clipboard]::SetText($t)',
      ' [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ' Start-Sleep -Milliseconds 300',
      '} finally { if($null -ne $saved){ try { [System.Windows.Forms.Clipboard]::SetDataObject($saved,$true) } catch {} } }'
    ].join('\n');
    const r = await powershell(script, ctx, { ARENA_TEXT_BASE64: Buffer.from(args.text).toString('base64') });
    if (r.code !== 0) throw new Error(r.stderr);
    return { text: 'Metin aktif pencereye gönderildi (' + args.text.length + ' karakter).' };
  }
  if (name === 'desktop_screenshot') {
    win();
    const crypto = require('node:crypto');
    const target = path.join(ctx.userData, 'arena-shot-' + crypto.randomUUID() + '.png');
    const script = [
      '$ErrorActionPreference="Stop"',
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '$w=[Math]::Min(1280,$b.Width)',
      '$h=[int]($b.Height*$w/$b.Width)',
      '$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height)',
      '$g=[System.Drawing.Graphics]::FromImage($bmp)',
      '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)',
      '$small=New-Object System.Drawing.Bitmap($w,$h)',
      '$g2=[System.Drawing.Graphics]::FromImage($small)',
      '$g2.DrawImage($bmp,0,0,$w,$h)',
      '$small.Save($env:ARENA_SCREEN_PATH,[System.Drawing.Imaging.ImageFormat]::Png)',
      '$g2.Dispose();$g.Dispose();$small.Dispose();$bmp.Dispose()'
    ].join('\n');
    try {
      const r = await powershell(script, ctx, { ARENA_SCREEN_PATH: target }, 30000);
      if (r.code !== 0) throw new Error(r.stderr || 'Ekran yakalanamadı.');
      const image = fs.readFileSync(target);
      if (image.byteLength > 5_000_000) throw new Error('5 MB görüntü sınırı aşıldı.');
      return { text: 'Ekran görüntüsü yerel panelde gösteriliyor.', imageBase64: image.toString('base64') };
    } finally { try { fs.unlinkSync(target); } catch {} }
  }
  throw new Error('Araç uygulanamadı.');
}
module.exports = { executeTool, schemas, approvals, output };
