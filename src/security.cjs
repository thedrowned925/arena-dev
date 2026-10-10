'use strict';
const fs = require('node:fs');
const path = require('node:path');

function isWithin(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}
function verifiedWorkspace(root) {
  if (!root || typeof root !== 'string') throw new Error('Önce geçerli bir çalışma klasörü seçin.');
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory())
    throw new Error('Çalışma klasörü bulunamadı.');
  return fs.realpathSync.native(absolute);
}
function resolveApproved(workspace, requested = '.', mustExist = true) {
  const root = verifiedWorkspace(workspace);
  if (typeof requested !== 'string' || !requested.trim() || requested.includes('\0'))
    throw new Error('Geçersiz dosya yolu.');
  const target = path.resolve(root, requested);
  if (!isWithin(root, target)) throw new Error('İzin verilen klasörün dışına erişim reddedildi.');
  let cursor = target;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('Dosya yolu çözümlenemedi.');
    cursor = parent;
  }
  const realAncestor = fs.realpathSync.native(cursor);
  if (!isWithin(root, realAncestor))
    throw new Error('Sembolik bağlantı çalışma klasörü dışına çıkıyor.');
  if (mustExist && !fs.existsSync(target)) throw new Error('Dosya veya klasör bulunamadı.');
  if (mustExist) {
    const actual = fs.realpathSync.native(target);
    if (!isWithin(root, actual)) throw new Error('Çalışma klasörü dışına erişim reddedildi.');
    return actual;
  }
  return target;
}
module.exports = { isWithin, verifiedWorkspace, resolveApproved };
