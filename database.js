require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!DATABASE_URL;

let sqliteDb = null;
let pgPool = null;

if (isPostgres) {
  console.log('🌐 Database: Connected to Supabase Cloud PostgreSQL!');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('📁 Database: Running with local SQLite (store.db)');
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'store.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('foreign_keys = ON');
  } catch (err) {
    console.warn('⚠️ SQLite module could not load:', err.message);
  }
}

function toPgSql(sql) {
  let converted = sql;
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+site_settings/i.test(converted)) {
    converted = 'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value';
  }
  let i = 1;
  converted = converted.replace(/\?/g, () => '$' + (i++));
  if (/^\s*INSERT\s+INTO\b/i.test(converted) && !converted.includes('RETURNING') && !converted.includes('ON CONFLICT')) {
    converted += ' RETURNING id';
  }
  return converted;
}

const db = {
  isPostgres,
  async all(sql, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(toPgSql(sql), params);
      return res.rows;
    } else {
      return sqliteDb.prepare(sql).all(...params);
    }
  },
  async get(sql, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(toPgSql(sql), params);
      return res.rows[0];
    } else {
      return sqliteDb.prepare(sql).get(...params);
    }
  },
  async run(sql, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(toPgSql(sql), params);
      return { lastInsertRowid: res.rows[0]?.id || 0, changes: res.rowCount };
    } else {
      return sqliteDb.prepare(sql).run(...params);
    }
  },
  prepare(sql) {
    if (sqliteDb) return sqliteDb.prepare(sql);
    return {
      all: (...params) => db.all(sql, params),
      get: (...params) => db.get(sql, params),
      run: (...params) => db.run(sql, params)
    };
  },
  exec(sql) {
    if (isPostgres) {
      return pgPool.query(sql);
    } else {
      return sqliteDb.exec(sql);
    }
  }
};

async function initDatabase() {
  if (isPostgres) {
    // Already migrated via init_supabase.js
    console.log('✅ Supabase Cloud Database is active and verified.');
    return;
  }

  // SQLite Local Tables Initialization
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0.00,
      seller_balance REAL DEFAULT 0.00,
      avatar TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category_slug TEXT NOT NULL,
      price REAL NOT NULL,
      original_price REAL,
      badge TEXT,
      samp_version TEXT,
      short_desc TEXT,
      description TEXT,
      features TEXT,
      requirements TEXT,
      code_snippet TEXT,
      image TEXT,
      file_url TEXT,
      sold_count INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 999,
      rating REAL DEFAULT 5.0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'approved',
      reject_reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      seller_id INTEGER DEFAULT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      admin_fee REAL DEFAULT 0.00,
      seller_earnings REAL DEFAULT 0.00,
      license_key TEXT NOT NULL,
      server_ip TEXT DEFAULT '',
      hwid_resets_left INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      bonus REAL DEFAULT 0,
      method TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hwid_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      old_ip TEXT,
      new_ip TEXT,
      reset_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      method TEXT,
      endpoint TEXT,
      threat_type TEXT,
      details TEXT,
      action_taken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default settings for SQLite
  const checkSetting = sqliteDb.prepare('SELECT value FROM site_settings WHERE key = ?');
  const insertSetting = sqliteDb.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)');

  const defaultSettings = {
    store_name: 'Nexus SAMP Store',
    store_tagline: 'ศูนย์รวมสคริปต์และระบบ GTA SA-MP คุณภาพสูง จัดส่งอัตโนมัติ 24 ชม.',
    promptpay_number: '0816302510',
    promptpay_name: 'NEXUS SAMP STORE',
    bank_name: 'ธนาคารไทยพาณิชย์ (SCB)',
    bank_account: '5632881610',
    bank_account_name: 'ธาม สุวรรณรัตน์',
    discord_link: 'https://discord.gg/NzcJ5CT4ru',
    facebook_link: 'https://facebook.com/nexussamp',
    youtube_link: 'https://youtube.com/@nexussamp',
    announcement: '🔥 ยินดีต้อนรับสู่ Nexus SAMP Store! เติมเงินครบ 500 บาท รับโบนัส 10% ฟรีทันที',
    slipok_branch_id: '78673',
    slipok_api_key: 'SLIPOKK5AUD56'
  };

  for (const [key, val] of Object.entries(defaultSettings)) {
    if (!checkSetting.get(key)) {
      insertSetting.run(key, val);
    }
  }
}

module.exports = {
  db,
  initDatabase,
  isPostgres
};
