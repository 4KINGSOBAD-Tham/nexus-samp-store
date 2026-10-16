const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = 'postgresql://postgres.tprndjdrwejsaphcllct:Thamsuwannarat@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function initSupabase() {
  console.log('🚀 Connecting to Supabase Cloud Database...');

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      balance NUMERIC(12, 2) DEFAULT 0.00,
      avatar TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      icon TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      category_slug VARCHAR(255) NOT NULL DEFAULT 'script',
      price NUMERIC(12, 2) NOT NULL,
      original_price NUMERIC(12, 2),
      badge VARCHAR(50),
      samp_version VARCHAR(100),
      short_desc TEXT,
      description TEXT,
      features TEXT,
      requirements TEXT,
      code_snippet TEXT,
      image TEXT,
      file_url TEXT,
      sold_count INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 999,
      rating NUMERIC(3, 1) DEFAULT 5.0,
      is_featured INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      license_key VARCHAR(255) NOT NULL,
      server_ip VARCHAR(255) DEFAULT '',
      hwid_resets_left INTEGER DEFAULT 3,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topups (
      id SERIAL PRIMARY KEY,
      ref_code VARCHAR(255) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      bonus NUMERIC(12, 2) DEFAULT 0,
      method VARCHAR(100) NOT NULL,
      status VARCHAR(50) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hwid_logs (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      old_ip VARCHAR(255),
      new_ip VARCHAR(255),
      reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id SERIAL PRIMARY KEY,
      ip VARCHAR(100),
      method VARCHAR(20),
      endpoint TEXT,
      threat_type VARCHAR(100),
      details TEXT,
      action_taken VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ Tables created successfully in Supabase!');

  // Seed default admin account
  const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
  if (adminCheck.rows.length === 0) {
    const adminHash = bcrypt.hashSync('admin1234', 10);
    await pool.query(
      'INSERT INTO users (username, email, password_hash, role, balance, avatar) VALUES ($1, $2, $3, $4, $5, $6)',
      ['admin', 'admin@nexussamp.com', adminHash, 'admin', 9999.00, '👑']
    );
    console.log('👑 Seeded Admin account (admin / admin1234)');
  }

  // Seed settings (SCB Bank + SlipOK)
  const settings = {
    store_name: 'Nexus SAMP Store',
    store_tagline: 'ศูนย์รวมสคริปต์และระบบ GTA SA-MP คุณภาพสูง จัดส่งอัตโนมัติ 24 ชม.',
    promptpay_number: '0816302510',
    promptpay_name: 'NEXUS SAMP STORE',
    bank_name: 'ธนาคารไทยพาณิชย์ (SCB)',
    bank_account: '5632881610',
    bank_account_name: 'ธาม สุวรรณรัตน์',
    discord_link: 'https://discord.gg/jcgjfZvP97',
    slipok_branch_id: '78673',
    slipok_api_key: 'SLIPOKK5AUD56'
  };

  for (const [key, val] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, val]
    );
  }
  console.log('💳 Seeded site settings (SCB 5632881610 and SlipOK)!');

  // Verify
  const userCount = await pool.query('SELECT count(*) FROM users');
  console.log('👥 Total users in Supabase:', userCount.rows[0].count);

  await pool.end();
}

initSupabase().catch(err => {
  console.error('❌ Migration error:', err);
  pool.end();
});
