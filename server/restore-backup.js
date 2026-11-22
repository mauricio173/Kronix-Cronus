// Uso: node server/restore-backup.js caminho/para/kronix-AAAA.sqlite
// Pare o servidor antes de executar. O banco atual é copiado antes da restauração.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const source = process.argv[2];
if (!source) { console.error('Informe o caminho do arquivo SQLite de backup.'); process.exit(2); }
const backup = path.resolve(source);
if (!fs.existsSync(backup) || !fs.statSync(backup).isFile()) { console.error('Arquivo de backup não encontrado.'); process.exit(2); }
const check = new Database(backup, { readonly: true, fileMustExist: true });
const integrity = check.pragma('integrity_check', { simple: true });
const hasOrders = check.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'").get();
check.close();
if (integrity !== 'ok' || !hasOrders) { console.error('Backup inválido: falha de integridade ou tabela orders ausente.'); process.exit(3); }
const target = path.join(__dirname, 'db', 'kronix.sqlite');
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
if (fs.existsSync(target)) {
  const previous = `${target}.before-restore-${stamp}`;
  for (const suffix of ['', '-wal', '-shm']) { try { fs.copyFileSync(target + suffix, previous + suffix); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
}
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(target + suffix); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
fs.copyFileSync(backup, target);
console.log('Restauração concluída. Cópia anterior preservada ao lado do banco. Reinicie o servidor e confira os pedidos.');
