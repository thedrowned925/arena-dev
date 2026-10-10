'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifiedWorkspace } = require('./security.cjs');

class Settings {
  constructor(userData) {
    this.file = path.join(userData, 'settings.json');
    this.data = { workspace: '' };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof parsed.workspace === 'string') this.data.workspace = parsed.workspace;
    } catch { /* First launch */ }
  }
  public() {
    return { workspace: this.data.workspace, arenaUrl: 'https://arena.ai/agent' };
  }
  updateWorkspace(workspace) {
    this.data.workspace = verifiedWorkspace(workspace);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    return this.public();
  }
}
module.exports = { Settings };
