'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifiedWorkspace } = require('./security.cjs');

const API_BASE = 'https://api.preview.arena.ai';
const DEFAULT = Object.freeze({ workspace: '', model: 'claude-sonnet-4-6' });

class Settings {
  constructor(userData, safeStorage) {
    this.file = path.join(userData, 'settings.json');
    this.safeStorage = safeStorage;
    this.sessionKey = '';
    this.data = { ...DEFAULT };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof parsed.workspace === 'string') this.data.workspace = parsed.workspace;
      if (typeof parsed.model === 'string') this.data.model = parsed.model;
      if (typeof parsed.encryptedKey === 'string') this.data.encryptedKey = parsed.encryptedKey;
    } catch { /* First launch or invalid settings. */ }
  }
  public() {
    return {
      workspace: this.data.workspace,
      model: this.data.model,
      apiBase: API_BASE,
      hasKey: Boolean(this.apiKey()),
      encryptedStorage: Boolean(this.safeStorage?.isEncryptionAvailable()),
    };
  }
  apiKey() {
    if (process.env.ARENA_API_KEY) return process.env.ARENA_API_KEY.trim();
    if (this.sessionKey) return this.sessionKey;
    if (this.data.encryptedKey && this.safeStorage?.isEncryptionAvailable()) {
      try { return this.safeStorage.decryptString(Buffer.from(this.data.encryptedKey, 'base64')); }
      catch { return ''; }
    }
    return '';
  }
  update(patch) {
    if (Object.hasOwn(patch, 'workspace')) {
      this.data.workspace = patch.workspace ? verifiedWorkspace(patch.workspace) : '';
    }
    if (Object.hasOwn(patch, 'model')) {
      const model = String(patch.model || '').trim();
      if (!/^[\w./:-]{2,120}$/.test(model)) throw new Error('Model adı geçersiz.');
      this.data.model = model;
    }
    this.save();
    return this.public();
  }
  setKey(key) {
    if (typeof key !== 'string' || key.length > 512) throw new Error('API anahtarı geçersiz.');
    this.sessionKey = key.trim();
    delete this.data.encryptedKey;
    if (this.sessionKey && this.safeStorage?.isEncryptionAvailable()) {
      this.data.encryptedKey = this.safeStorage.encryptString(this.sessionKey).toString('base64');
      this.sessionKey = '';
    }
    this.save();
    return this.public();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }
}
module.exports = { Settings, API_BASE };
