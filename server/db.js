const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const dir = path.join(__dirname, 'db');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'kronix.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
 unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL, total INTEGER NOT NULL,
 customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, platform TEXT, notes TEXT,
 postal_code TEXT NOT NULL, street TEXT NOT NULL, street_number TEXT NOT NULL,
 complement TEXT, neighborhood TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, consent_at TEXT NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'awaiting_payment',
 supplier TEXT, supplier_order_id TEXT, tracking_code TEXT, rejection_reason TEXT,
 approved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, action TEXT NOT NULL,
 actor TEXT NOT NULL DEFAULT 'admin', details TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_settings (
 supplier TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'disabled',
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id TEXT NOT NULL,
 supplier TEXT NOT NULL,
 supplier_url TEXT NOT NULL,
 supplier_item_id TEXT NOT NULL,
 supplier_title TEXT,
 supplier_cost INTEGER,
 status TEXT NOT NULL DEFAULT 'pending_review',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(supplier, supplier_item_id)
);
`);
// Valores separados para auditoria do preço apresentado no checkout.
const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
for (const [column, definition] of [
 ['product_subtotal', 'INTEGER NOT NULL DEFAULT 0'],
 ['supplier_freight', 'INTEGER NOT NULL DEFAULT 0'],
 ['import_tax', 'INTEGER NOT NULL DEFAULT 0'],
 ['icms_tax', 'INTEGER NOT NULL DEFAULT 0'],
 ['tax_rate', 'INTEGER NOT NULL DEFAULT 17'],
 ['is_test', 'INTEGER NOT NULL DEFAULT 0'],
 ['payment_provider', 'TEXT'],
 ['payment_id', 'TEXT'],
 ['payment_qr_code', 'TEXT'],
 ['payment_qr_base64', 'TEXT'],
 ['payment_ticket_url', 'TEXT'],
 ['payment_expires_at', 'TEXT'], ['payment_receipt_url', 'TEXT']
]) {
 if (!orderColumns.includes(column)) db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
}
// Compatibilidade: pedidos antigos mantêm o total histórico e recebem o subtotal de produto.
db.exec('UPDATE orders SET product_subtotal = unit_price * quantity WHERE product_subtotal = 0');
const supplierColumns = db.prepare('PRAGMA table_info(supplier_products)').all().map(c => c.name);
for (const [column, definition] of [
 ['estimated_delivery_days', 'INTEGER'], ['conditions', 'TEXT'], ['availability_status', "TEXT NOT NULL DEFAULT 'unknown'"]
]) if (!supplierColumns.includes(column)) db.exec(`ALTER TABLE supplier_products ADD COLUMN ${column} ${definition}`);
const orderExtraColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
for (const [column, definition] of [
 ['supplier_receipt_url', 'TEXT'], ['expected_delivery_date', 'TEXT'], ['delivered_at', 'TEXT'], ['store_order_placed', 'INTEGER NOT NULL DEFAULT 0'], ['supplier_order_placed', 'INTEGER NOT NULL DEFAULT 0']
]) if (!orderExtraColumns.includes(column)) db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
db.exec("UPDATE orders SET store_order_placed=1 WHERE status IN ('supplier_ordered','shipped','delivered') AND store_order_placed=0");
db.exec("UPDATE orders SET supplier_order_placed=1 WHERE status IN ('supplier_ordered','shipped','delivered') AND supplier_order_placed=0");
for (const supplier of ['shopee', 'aliexpress', 'mercadolivre', 'other']) {
 db.prepare('INSERT OR IGNORE INTO supplier_settings (supplier, mode, updated_at) VALUES (?, ?, ?)')
   .run(supplier, 'disabled', new Date().toISOString());
}
// Vinculação inicial solicitada para teste. O produto ainda precisa ser conferido
// visualmente pelo administrador antes de ser considerado validado.
db.prepare(`INSERT OR IGNORE INTO supplier_products
 (product_id,supplier,supplier_url,supplier_item_id,supplier_title,supplier_cost,status,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?, ?,?)`).run(
 'cronus-zen','shopee',
 'https://shopee.com.br/product/1730095792/58204316213',
 '1730095792-58204316213',
 'Produto Shopee — aguardando conferência',
 null,'pending_review',new Date().toISOString(),new Date().toISOString()
);


// Evolução segura: trilhas financeiras, idempotência, bloqueio persistente e backup.
db.exec(`
CREATE TABLE IF NOT EXISTS login_attempts (
  identity TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL,
  event_key TEXT NOT NULL, order_id TEXT, payment_id TEXT,
  event_status TEXT, amount INTEGER, payload_json TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received', received_at TEXT NOT NULL,
  processed_at TEXT, error TEXT, UNIQUE(provider,event_key)
);
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL,
  provider TEXT NOT NULL, payment_id TEXT, amount INTEGER NOT NULL,
  status TEXT NOT NULL, provider_response TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL,
  old_status TEXT, new_status TEXT, old_payment_status TEXT,
  new_payment_status TEXT, changed_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS supplier_cost_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_product_id INTEGER NOT NULL,
  old_cost INTEGER, new_cost INTEGER, note TEXT, changed_at TEXT NOT NULL,
  FOREIGN KEY(supplier_product_id) REFERENCES supplier_products(id)
);
CREATE TABLE IF NOT EXISTS backup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT NOT NULL,
  size_bytes INTEGER, status TEXT NOT NULL, details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id,received_at);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_log(order_id,id);
CREATE TRIGGER IF NOT EXISTS trg_order_status_history
AFTER UPDATE OF status,payment_status ON orders
WHEN OLD.status != NEW.status OR OLD.payment_status != NEW.payment_status
BEGIN
 INSERT INTO order_status_history(order_id,old_status,new_status,old_payment_status,new_payment_status,changed_at)
 VALUES(NEW.id,OLD.status,NEW.status,OLD.payment_status,NEW.payment_status,NEW.updated_at);
END;
`);

module.exports = db;
