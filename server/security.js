const crypto = require('node:crypto');
const db = require('./db');
const COOKIE = 'kronix_admin';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function safeEqual(a, b) {
 const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
 return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function parseCookies(header = '') {
 const cookies = {};
 for (const item of String(header).split(';')) {
  const parts = item.trim().split(/=(.*)/s);
  if (parts.length < 2 || !parts[0]) continue;
  try { cookies[parts[0]] = decodeURIComponent(parts[1]); } catch (_) {}
 }
 return cookies;
}
function createSession(res) {
 const token = crypto.randomBytes(32).toString('hex');
 const csrf = crypto.randomBytes(32).toString('hex');
 const expires = Date.now() + 8 * 60 * 60 * 1000;
 db.prepare('INSERT INTO sessions(token_hash, csrf_token, expires_at) VALUES(?,?,?)').run(sha(token), csrf, expires);
 res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000, path: '/' });
 return csrf;
}
function requireAdmin(req, res, next) {
 const token = parseCookies(req.headers.cookie)[COOKIE];
 if (!token) return res.status(401).json({ error: 'Autenticação necessária.' });
 const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(sha(token), Date.now());
 if (!session) return res.status(401).json({ error: 'Sessão expirada.' });
 if (req.method !== 'GET' && req.method !== 'HEAD') {
   const origin = req.get('origin');
   const host = req.get('host');
   if (origin) {
     try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Origem não autorizada.' }); }
     catch (_) { return res.status(403).json({ error: 'Origem inválida.' }); }
   }
   if (!safeEqual(req.headers['x-csrf-token'] || '', session.csrf_token)) return res.status(403).json({ error: 'Token de segurança inválido. Atualize o painel.' });
 }
 req.adminSession = session; next();
}
function destroySession(req, res) {
 const token = parseCookies(req.headers.cookie)[COOKIE];
 if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
 res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
}
module.exports = { createSession, requireAdmin, destroySession, safeEqual };
