'use strict';
const { schemas, output } = require('./tools.cjs');
const SYSTEM = [
  'You are Arena Dev, a local coding and desktop assistant.',
  'Speak Turkish unless asked otherwise. Be accurate.',
  'Never claim a tool was executed until its result is returned.',
  'Use only paths inside the approved workspace for file operations.',
  'Shell commands execute with host user privileges, NOT in a sandbox.',
  'Every write, command, screenshot, click, or type must be approved.',
  'Do not take destructive actions without explicit instruction.',
  'Work incrementally and verify results.',
].join('\n');
function parseArgs(args) {
  if (args == null) return {};
  if (typeof args === 'string') return JSON.parse(args);
  if (typeof args !== 'object' || Array.isArray(args)) throw new Error('Araç argümanları nesne olmalı.');
  return args;
}
function stripFence(text) {
  const mark = String.fromCharCode(96).repeat(3);
  let s = String(text).trim();
  if (s.startsWith(mark)) s = s.replace(new RegExp('^' + mark + '(?:json)?\\s*', 'i'), '');
  if (s.endsWith(mark)) s = s.slice(0, -3).trim();
  return s;
}
function manualPrompt(task, results = []) {
  return [
    SYSTEM,
    'MANUAL Arena bridge mode. Do not pretend you have live access to PC.',
    'Respond using ONLY JSON, not Markdown, with this shape:',
    '{"message":"Türkçe açıklama","tool_calls":[{"name":"read_file","arguments":{"path":"README.md"}}]}',
    'Request 0–6 tool_calls. When finished, return an empty tool_calls array.',
    'Only choose from these tool definitions:',
    JSON.stringify(schemas),
    'USER TASK:',
    task,
    'PREVIOUS TOOL RESULTS:',
    output(JSON.stringify(results), 30000),
  ].join('\n\n');
}
function parseManualResponse(text) {
  const parsed = JSON.parse(stripFence(text));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON nesnesi gerekli.');
  const calls = parsed.tool_calls || [];
  if (!Array.isArray(calls) || calls.length > 6) throw new Error('En fazla 6 araç çağrısı olabilir.');
  for (const c of calls) {
    if (!c || typeof c.name !== 'string' || !schemas.some(s => s.function.name === c.name)) throw new Error('Tanımsız araç çağrısı.');
    parseArgs(c.arguments);
  }
  return { message: String(parsed.message || ''), calls };
}
class LocalAgent {
  constructor(invokeTool, emit) { this.invokeTool = invokeTool; this.emit = emit; this.reset(); }
  reset() { this.history = [{ role: 'system', content: SYSTEM }]; }
  async run(task, model, signal) {
    if (!task || !task.trim()) throw new Error('Görev boş olamaz.');
    this.history.push({ role: 'user', content: task.trim().slice(0, 20000) });
    for (let step = 0; step < 12; step++) {
      if (signal?.aborted) throw new Error('Durduruldu.');
      this.emit('status', 'Ollama yanıtı alınıyor…');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(), 120000);
      let message;
      try {
        const res = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: this.history, tools: schemas, stream: false, options: { temperature: 0.2 } }),
          signal: controller.signal,
        });
        const body = await res.text();
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + output(body, 800));
        message = JSON.parse(body).message;
      } catch (error) {
        throw new Error('Ollama yanıtı başarısız: ' + error.message);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      if (!message || typeof message !== 'object') throw new Error('Model yanıtı geçersiz.');
      this.history.push(message);
      if (message.content) this.emit('assistant', String(message.content));
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (!calls.length) { if (!message.content) this.emit('assistant', 'Model boş yanıt verdi.'); return; }
      for (const call of calls.slice(0, 8)) {
        if (signal?.aborted) throw new Error('Durduruldu.');
        const name = call.function?.name;
        const args = parseArgs(call.function?.arguments);
        const result = await this.invokeTool(name, args, signal);
        const content = output(result.text, 12000);
        const toolMessage = { role: 'tool', tool_name: name, content };
        if (result.imageBase64) toolMessage.images = [result.imageBase64];
        this.history.push(toolMessage);
        this.emit('tool', { name, args, result: content });
      }
      if (this.history.length > 80) this.history.splice(1, this.history.length - 70);
    }
    this.emit('assistant', '12 adımlık sınır doldu. Devam etmek için yeni bir istek gönder.');
  }
}
module.exports = { LocalAgent, manualPrompt, parseManualResponse, parseArgs };
