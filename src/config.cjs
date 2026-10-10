'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifiedWorkspace } = require('./security.cjs');
class Settings {
  constructor(userData) {
    this.file = path.join(userData, 'settings.json');
    this.data = { workspace: '', model: 'qwen2.5-coder:7b' };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof saved.workspace === 'string') this.data.workspace = saved.workspace;
      if (typeof saved.model === 'string') this.data.model = saved.model;
    } catch {}
  }
  public() { return { ...this.data, ollamaUrl: 'http://127.0.0.1:11434', arenaUrl: 'https://arena.ai/' }; }
  update(patch) {
    if (Object.hasOwn(patch, 'workspace')) this.data.workspace = patch.workspace ? verifiedWorkspace(patch.workspace) : '';
    if (Object.hasOwn(patch, 'model')) {
      const model = String(patch.model || '').trim();
      if (!/^[a-zA-Z0-9_.:/-]{2,120}$/.test(model)) throw new Error('Model adı geçersiz.');
      this.data.model = model;
    }
    this.save();
    return this.public();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }
}
module.exports = { Settings };
