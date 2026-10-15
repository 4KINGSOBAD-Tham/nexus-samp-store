const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'store.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0.00,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      license_key TEXT NOT NULL,
      server_ip TEXT DEFAULT '',
      hwid_resets_left INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
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
  `);

  // Seed default settings
  const checkSetting = db.prepare('SELECT value FROM site_settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)');

  const defaultSettings = {
    store_name: 'Nexus SAMP Store',
    store_tagline: 'ศูนย์รวมสคริปต์และระบบ GTA SA-MP คุณภาพสูง จัดส่งอัตโนมัติ 24 ชม.',
    promptpay_number: '0816302510',
    promptpay_name: 'NEXUS SAMP STORE',
    discord_link: 'https://discord.gg/samp-thailand',
    facebook_link: 'https://facebook.com/nexussamp',
    youtube_link: 'https://youtube.com/@nexussamp',
    announcement: '🔥 ยินดีต้อนรับสู่ Nexus SAMP Store! เติมเงินครบ 500 บาท รับโบนัส 10% ฟรีทันที',
    slipok_branch_id: '',
    slipok_api_key: ''
  };

  for (const [key, val] of Object.entries(defaultSettings)) {
    if (!checkSetting.get(key)) {
      insertSetting.run(key, val);
    }
  }

  // Seed users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const adminPass = bcrypt.hashSync('admin1234', 10);
    const playerPass = bcrypt.hashSync('123456', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, balance, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('admin', 'admin@rank1samp.com', adminPass, 'admin', 5000.00, '👑');
    insertUser.run('player1', 'player1@gmail.com', playerPass, 'user', 500.00, '🎮');
  }

  // Seed categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare(`
      INSERT INTO categories (name, slug, icon, description)
      VALUES (?, ?, ?, ?)
    `);

    insertCat.run('โหมดเกมเต็มระบบ (Gamemodes)', 'gamemode', '🎮', 'โหมดเกม Roleplay, Gangwar, TDM พร้อมเปิดเซิร์ฟเวอร์ได้ทันที');
    insertCat.run('กระเป๋า & UI Textdraw', 'inventory-ui', '🎒', 'ระบบกระเป๋าช่องตาราง, หลอดเลือด, ไมล์รถ, เมนู UI สวยล้ำสมัย');
    insertCat.run('ระบบแก๊งค์ & ยึดจุด (Turf)', 'turf-gang', '⚔️', 'ระบบชิงพื้นที่แก๊งค์, พ่นสเปรย์, ยึดธง, สถิติ Killfeed เฉพาะ');
    insertCat.run('ระบบกันแฮก & Launcher', 'anticheat-launcher', '🛡️', 'ตัวป้องกัน S0beit, Cleo Hack, แบน HWID และตัวเปิดเกมอัตโนมัติ');
    insertCat.run('ระบบงาน & เศรษฐกิจ (Jobs)', 'jobs-system', '💼', 'งานขุดแร่, ตัดไม้, ขนส่ง, แท็กซี่, ระบบตลาดกลาง');
    insertCat.run('ระบบบ้าน & ธุรกิจ (Housing)', 'housing-biz', '🏠', 'ระบบสร้างบ้าน, ตกแต่งภายใน, ธุรกิจปั๊มน้ำมัน และร้านค้า');
  }

  // Products table is kept clean for real products added by admin
}

module.exports = {
  db,
  initDatabase
};
