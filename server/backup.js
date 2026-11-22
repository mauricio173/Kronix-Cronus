const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const directory = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, 'backups'));
const keep = Math.max(3, Math.min(90, Number(process.env.BACKUP_RETENTION_DAYS || 14)));
let running = false;
async function createBackup(reason = 'scheduled') {
  if (running) throw new Error('Já existe um backup em andamento.');
  running = true;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `kronix-${stamp}.sqlite`;
  const target = path.join(directory, name);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    await db.backup(target);
    const stat = fs.statSync(target);
    db.prepare('INSERT INTO backup_history(file_name,size_bytes,status,details,created_at) VALUES(?,?,?,?,?)')
      .run(name, stat.size, 'success', reason, new Date().toISOString());
    const cutoff = Date.now() - keep * 86400000;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^kronix-.*\.sqlite$/.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    }
    return { fileName: name, sizeBytes: stat.size };
  } catch (error) {
    try { db.prepare('INSERT INTO backup_history(file_name,status,details,created_at) VALUES(?,?,?,?)').run(name, 'error', String(error.message).slice(0,300), new Date().toISOString()); } catch (_) {}
    throw error;
  } finally { running = false; }
}
function start() {
  const interval = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24)) * 3600000;
  setTimeout(() => createBackup('startup').catch(err => console.error('Backup inicial:', err.message)), 15000).unref();
  setInterval(() => createBackup('scheduled').catch(err => console.error('Backup agendado:', err.message)), interval).unref();
}
module.exports = { createBackup, start };
