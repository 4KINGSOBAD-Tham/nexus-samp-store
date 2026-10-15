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

  // Seed products
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
    const insertProd = db.prepare(`
      INSERT INTO products (
        name, slug, category_slug, price, original_price, badge, samp_version,
        short_desc, description, features, requirements, code_snippet,
        image, file_url, sold_count, stock, rating, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProd.run(
      'Los Santos Roleplay 2026 [Full Gamemode]',
      'los-santos-roleplay-2026',
      'gamemode',
      590,
      890,
      'BEST SELLER',
      '0.3.7-R2 / open.mp',
      'โหมดเกม Roleplay ฉบับสมบูรณ์ มีระบบงานครบ ตำรวจ หมอ ช่าง รถ ปรับแต่งบ้าน และระบบเศรษฐกิจเสถียร 100%',
      'โหมดเกม Roleplay ที่ได้รับการพัฒนาและปรับปรุงประสิทธิภาพสูงสุดสำหรับ SA-MP 0.3.7 และ open.mp รองรับผู้เล่นพร้อมกันได้มากกว่า 200 คนโดยไม่กระตุก ใช้ฐานข้อมูล MySQL R41-4 มีระบบความปลอดภัยป้องกันการโจมตีและการดูดโค้ด พร้อมคู่มือการติดตั้งภาษาไทยทีละขั้นตอน',
      JSON.stringify([
        'ระบบอาชีพสมบูรณ์แบบ: ตำรวจ (LSPD), หมอ (EMS), ช่างยนต์ (Mechanic), แท็กซี่, พนักงานส่งของ',
        'ระบบบ้านและคอนโดมิเนียม: สามารถซื้อ-ขาย ตกแต่งเฟอร์นิเจอร์ภายในได้แบบอิสระ',
        'ระบบแต่งรถ & อู่ซ่อม: ปรับแต่งสี ชิ้นส่วน ไนตรัส และเกจวัดความเร็ว',
        'ระบบเศรษฐกิจแบบ Dynamic: ราคาสินค้าผันผวนตามการซื้อขายจริงในตลาด',
        'ระบบคลังข้อมูล MySQL R41-4 คลีนและโหลดข้อมูลรวดเร็ว',
        'ระบบ Log แอดมินบันทึกการกระทำทุกอย่าง ป้องกันการโกงและสวมรอย'
      ]),
      JSON.stringify([
        'SA-MP Server 0.3.7-R2 หรือ open.mp ล่าสุด',
        'MySQL Server (XAMPP / MariaDB / Linux MySQL)',
        'Plugins: streamer.dll/.so, sscanf2.dll/.so, mysql.dll/.so, crashdetect',
        'Pawn Compiler 3.10.10 หรือใหม่กว่า'
      ]),
      `// --- Los Santos Roleplay Config Snippet ---
#include <a_samp>
#include <a_mysql>
#include <sscanf2>
#include <streamer>

#define SERVER_NAME "Los Santos Life Roleplay"
#define MAX_INVENTORY_SLOTS 25
#define MYSQL_HOST "127.0.0.1"
#define MYSQL_USER "root"
#define MYSQL_PASSWORD ""
#define MYSQL_DATABASE "samp_roleplay"

public OnPlayerConnect(playerid)
{
    SetPlayerColor(playerid, 0xFFFFFFFF);
    CheckPlayerAccount(playerid);
    return 1;
}`,
      '/assets/roleplay.jpg',
      'https://github.com/samp-releases/roleplay-2026-v1.zip',
      128,
      999,
      4.9,
      1
    );

    insertProd.run(
      'Cyber Dynamic Inventory V3 [Custom Textdraw]',
      'cyber-dynamic-inventory-v3',
      'inventory-ui',
      290,
      450,
      'HOT',
      '0.3.7-R1/R2 & open.mp',
      'ระบบกระเป๋าช่องตารางแบบลากวาง ลุคล้ำยุคสไตล์ Cyberpunk มีช่องใส่ปืน เกราะ อาหาร น้ำหนักสมจริง',
      'ระบบกระเป๋าเก็บไอเทมรูปแบบ Textdraw คุณภาพสูง รองรับการคลิกด้วยเมาส์ ลากวาง (Drag & Drop) จัดการช่องเก็บของ มีระบบน้ำหนักความจุ (Weight Limit) รองรับการใช้งานอาวุธ กระสุน อาหาร และไอเทมคัสตอมได้ไม่จำกัด',
      JSON.stringify([
        'อินเตอร์เฟซ Textdraw คมชัดระดับ HD ปรับขนาดอัตโนมัติตามความละเอียดจอ',
        'ระบบลากวางและแยกจำนวนไอเทม (Split Stacks) สะดวกสบาย',
        'ช่องใส่อาวุธหลัก, ปืนพก, อาวุธประชิด, เกราะกันกระสุน และกระเป๋าเป้',
        'มีเสียงเอฟเฟกต์ (Sound FX) ในการเปิด-ปิด และหยิบจับไอเทม',
        'ซิงค์ข้อมูลกับฐานข้อมูล MySQL ทันที ป้องกันการปั๊มไอเทม 100%'
      ]),
      JSON.stringify([
        'SA-MP 0.3.7 ทุกเวอร์ชัน หรือ open.mp',
        'Streamer Plugin v2.9.5 ขึ้นไป',
        'Pawn Compiler 3.10+'
      ]),
      `// --- Inventory V3 Event Hook ---
public OnPlayerUseInventoryItem(playerid, itemid, slot)
{
    new itemName[32];
    GetItemData(itemid, ITEM_NAME, itemName);
    SendClientMessage(playerid, 0x00FF88FF, "คุณได้กดใช้งาน: %s", itemName);
    ApplyItemEffect(playerid, itemid);
    return 1;
}`,
      '/assets/inventory.jpg',
      'https://github.com/samp-releases/inventory-v3.zip',
      254,
      999,
      5.0,
      1
    );

    insertProd.run(
      'Los Santos Turf War & Gang Zone [Gang System]',
      'los-santos-turf-war-gang-zone',
      'turf-gang',
      350,
      500,
      'POPULAR',
      '0.3.7-R2 / open.mp',
      'ระบบชิงพื้นที่แก๊งค์ Grove Street vs Ballas แผนที่ยึดจุด Realtime พ่นสเปรย์ ชิงธง รับเงินปันผลประจำวัน',
      'ระบบชิงพื้นที่เขตอิทธิพลสำหรับเซิร์ฟเวอร์สาย Gangwar และ Roleplay แสดงพื้นที่แก๊งค์ด้วย GangZone บนแผนที่แบบ Realtime มีระบบพ่นสเปรย์ทับป้าย มีระบบนับคะแนน Killfeed สมาชิกแก๊งค์ และระบบตู้เซฟรับส่วนแบ่งส่วยประจำวัน',
      JSON.stringify([
        'แสดงโซนสีแก๊งค์บน Minimap และ Fullmap อัปเดตแบบ Realtime',
        'ระบบพ่นสเปรย์ยึดจุด (Spray Tagging) พร้อมเวลานับถอยหลัง',
        'ระบบชิงธง (Flag Capture) ในจุดยุทธศาสตร์สำคัญทั่วเมือง',
        'ตู้เซฟคลังอาวุธและเงินกองกลางของแต่ละแก๊งค์',
        'ระบบ Killfeed พิเศษแสดงชื่อแก๊งค์และปืนที่ใช้สังหาร'
      ]),
      JSON.stringify([
        'SA-MP 0.3.7-R2 / open.mp',
        'MySQL R41-4 หรือ SQLite',
        'Streamer Plugin'
      ]),
      `// --- Gang Turf War Hook ---
public OnPlayerEnterTurfZone(playerid, zoneid)
{
    new gangid = GetPlayerGang(playerid);
    if (IsZoneUnderAttack(zoneid)) {
        ShowTurfStatusHUD(playerid, zoneid);
    }
    return 1;
}`,
      '/assets/turf.jpg',
      'https://github.com/samp-releases/turf-war-v2.zip',
      89,
      999,
      4.8,
      1
    );

    insertProd.run(
      'SA-MP Defender Pro & Auto-Launcher [Protection]',
      'samp-defender-pro-launcher',
      'anticheat-launcher',
      450,
      750,
      'RECOMMENDED',
      '0.3.7 Client & Server',
      'โปรแกรมกันแฮกและตัวเปิดเกมอัตโนมัติ สแกนไฟล์ S0beit, Cleo, Aimbot, Speedhack พร้อมระบบแบน HWID ถาวร',
      'โซลูชันระบบความปลอดภัยที่ดีที่สุดสำหรับเซิร์ฟเวอร์ GTA SA-MP ประกอบด้วยโมดูลฝั่งเซิร์ฟเวอร์ตรวจจับความผิดปกติของ Packet และตัว Launcher ฝั่งผู้เล่นที่สแกนความถูกต้องของไฟล์เกม ป้องกันการดัดแปลงไฟล์ (.asi, .cleo, .dll) มีระบบแบน Hardware ID (HWID) ป้องกันการสลับไอดีมาป่วน',
      JSON.stringify([
        'ดักจับการยิงทะลุกำแพง, Aimbot, Silent Aim, Trigger Bot อย่างแม่นยำ',
        'บล็อกการใช้งาน S0beit และม็อดโกงยอดนิยมทุกชนิด',
        'ระบบ Launcher สแกน Hash ของไฟล์ GTA_SA.exe และ GTA3.img ก่อนเข้าเกม',
        'ระบบแบนรหัสเครื่อง HWID ไม่สามารถเปลี่ยน IP เพื่อหลบการแบนได้',
        'ระบบส่งบันทึกการกระทำผิดเข้า Discord Webhook อัตโนมัติ'
      ]),
      JSON.stringify([
        'SA-MP 0.3.7 Client & Server',
        'Windows Server / Linux Ubuntu',
        'รองรับ .NET Runtime สำหรับตัว Launcher'
      ]),
      `// --- Defender Server Protection Event ---
public OnDefenderCheatDetected(playerid, cheattype[], confidence)
{
    printf("[SECURITY] Player %s detected for %s (Confidence: %d%%)", 
        GetPlayerNameEx(playerid), cheattype, confidence);
    
    if (confidence >= 95) {
        Defender_HWID_Ban(playerid, cheattype);
    }
    return 1;
}`,
      '/assets/anticheat.jpg',
      'https://github.com/samp-releases/defender-pro.zip',
      195,
      999,
      5.0,
      1
    );

    insertProd.run(
      'Dynamic House & Business Real Estate V2',
      'dynamic-house-business-v2',
      'housing-biz',
      220,
      350,
      'NEW',
      '0.3.7-R2 / open.mp',
      'ระบบสร้างบ้านและธุรกิจแบบ In-game ตกแต่งภายในได้อิสระ มีระบบกุญแจ ตู้เซฟ และเก็บรายได้ธุรกิจ',
      'ระบบอสังหาริมทรัพย์ระดับพรีเมียม ช่วยให้แอดมินสร้างบ้านและธุรกิจได้ทันทีในเกมโดยไม่ต้องรีสตาร์ตเซิร์ฟเวอร์ ผู้เล่นสามารถซื้อบ้าน ล็อกประตู ซ่อนเงินและอาวุธในตู้เซฟ ตกแต่งเฟอร์นิเจอร์ และซื้อธุรกิจปั๊มน้ำมัน ร้านอาหารเพื่อรับรายได้ส่วนแบ่ง',
      JSON.stringify([
        'คำสั่งสร้างบ้านและธุรกิจแบบ In-game GUI ใช้งานง่าย',
        'ระบบตกแต่งเฟอร์นิเจอร์ภายในบ้านมากกว่า 200 ชิ้นแบบ 3D',
        'ระบบกุญแจบ้านและระบบแชร์กุญแจให้เพื่อนร่วมอยู่',
        'ตู้เซฟเก็บเงินสด อาวุธ และไอเทมส่วนตัวพร้อมรหัสผ่าน'
      ]),
      JSON.stringify([
        'Streamer Plugin v2.9+',
        'MySQL R41-4 หรือ SQLite'
      ]),
      `// --- House Purchase Hook ---
public OnPlayerBuyHouse(playerid, houseid)
{
    UpdateHouseOwner(houseid, GetPlayerAccountID(playerid));
    SendClientMessage(playerid, 0x00FF88FF, "ยินดีด้วย! คุณเป็นเจ้าของบ้านหลังนี้แล้ว");
    return 1;
}`,
      '/assets/roleplay.jpg',
      'https://github.com/samp-releases/housing-v2.zip',
      64,
      999,
      4.7,
      0
    );

    insertProd.run(
      'Drift & Cyber Speedometer HUD [Textdraw]',
      'drift-cyber-speedometer-hud',
      'inventory-ui',
      150,
      250,
      'SALE',
      '0.3.7 & open.mp',
      'ไมล์วัดความเร็วรถยนต์ Textdraw แอนิเมชั่นเข็มวัด เกจวัดน้ำมัน สภาพเครื่องยนต์ และระบบวัดแต้มดริฟท์',
      'ไมล์รถยนต์สไตล์สปอร์ตล้ำยุค แสดงผลความเร็ว (KM/H หรือ MPH), ระดับน้ำมันคงเหลือ, อุณหภูมิและสภาพเครื่องยนต์, ไฟหน้า, เกียร์, และมีระบบคำนวณแต้ม Drift Angle พร้อมเสียงประกอบสุดเร้าใจ',
      JSON.stringify([
        'เข็มวัดความเร็วแบบ Animated Textdraw นุ่มนวลไม่กระตุก',
        'แสดงสถานะน้ำมัน ไฟเลี้ยว ไฟหน้า ล็อกประตูเครื่องยนต์',
        'ระบบสะสมคะแนน Drift Point แลกเงินรางวัลในเกม',
        'รองรับยานพาหนะทุกประเภท ทั้งรถยนต์ มอเตอร์ไซค์ และเรือ'
      ]),
      JSON.stringify(['SA-MP 0.3.7 ทุกรุ่น']),
      `// --- Speedometer Update Tick ---
public UpdateSpeedometer(playerid)
{
    new Float:speed = GetVehicleSpeed(GetPlayerVehicleID(playerid));
    PlayerTextDrawSetString(playerid, SpeedoText[playerid], sprintf("%.0f KM/H", speed));
    return 1;
}`,
      '/assets/inventory.jpg',
      'https://github.com/samp-releases/speedo-hud.zip',
      172,
      999,
      4.9,
      0
    );

    insertProd.run(
      'Miner & Lumberjack Dynamic Jobs [Work System]',
      'miner-lumberjack-jobs',
      'jobs-system',
      190,
      290,
      'UPDATE',
      '0.3.7-R2 / open.mp',
      'ระบบงานขุดแร่และตัดไม้ จุดเกิดแร่แบบสุ่ม แอนิเมชั่นสมจริง นำแร่ไปหลอมและขายในตลาดกลางสร้างรายได้',
      'ระบบอาชีพเสริมยอดนิยมสำหรับเซิร์ฟเวอร์ Roleplay มีระบบสุ่มเกิดของก้อนแร่และต้นไม้ทั่วแผนที่ ผู้เล่นต้องซื้ออุปกรณ์ขุดแร่/ขวานตัดไม้ มีแถบมินิเกมกดตามจังหวะเพื่อรับของพิเศษ นำของที่ได้ไปหลอมเป็นแท่งโลหะเพื่อขายให้ผู้เล่นคนอื่นหรือส่งโรงงาน',
      JSON.stringify([
        'มินิเกมกดปุ่มตามจังหวะ (Skill Check Bar) เพิ่มความสนุกในการทำงาน',
        'ระบบสุ่มเกิดของแร่ทอง แร่เงิน แร่เหล็ก และเพชรหายาก',
        'โรงงานหลอมแร่และตลาดกลางรับซื้อสินค้าปรับราคาขึ้นลง',
        'มีระบบเลเวลความชำนาญ (Job Experience) ขุดได้เร็วขึ้นตามเลเวล'
      ]),
      JSON.stringify(['Streamer Plugin', 'Pawn 3.10+']),
      `// --- Mining Skill Check ---
public OnPlayerMineRock(playerid, rockid)
{
    StartSkillCheckBar(playerid, "MINING_ROCK", 5000);
    return 1;
}`,
      '/assets/turf.jpg',
      'https://github.com/samp-releases/jobs-pack.zip',
      94,
      999,
      4.8,
      0
    );

    insertProd.run(
      'Discord Bot & SAMP Server Sync Control',
      'discord-bot-samp-sync',
      'anticheat-launcher',
      280,
      390,
      'SPECIAL',
      'All Versions',
      'บอท Discord เชื่อมต่อข้อมูลเซิร์ฟเวอร์ SAMP ตรวจสอบผู้เล่นออนไลน์ สั่งเตะ/แบนผ่าน Discord และระบบแจ้งเตือน Log',
      'บอท Discord ภาษา Node.js สำหรับเซิร์ฟเวอร์ GTA SAMP เชื่อมต่อกับเซิร์ฟเวอร์ผ่าน RCON / UDP Query หรือฐานข้อมูล MySQL แสดงสถานะเซิร์ฟเวอร์แบบ Realtime บน Discord Status มีคำสั่ง Slash Command จัดการเซิร์ฟเวอร์ เช่น /kick, /ban, /announce, /serverinfo และระบบแจ้งเตือนแอดมิน Log อัตโนมัติ',
      JSON.stringify([
        'สถานะเซิร์ฟเวอร์ Realtime บน Discord Bot Presence',
        'คำสั่ง Slash Command: /players, /stats, /kick, /ban, /restart',
        'ระบบแจ้งเตือน Log การฆ่ากัน, การเติมเงิน, การกดรีพอร์ตเข้าช่องแอดมิน',
        'ระบบยืนยันตัวตน Discord เข้ากับไอดีในเกม (Account Verification)'
      ]),
      JSON.stringify(['Node.js v18+', 'Discord Bot Token']),
      `// --- Discord Bot Slash Command Handler ---
client.on('interactionCreate', async interaction => {
    if (interaction.commandName === 'serverinfo') {
        const query = await sampQuery({ host: '127.0.0.1', port: 7777 });
        await interaction.reply({ embeds: [buildServerEmbed(query)] });
    }
});`,
      '/assets/anticheat.jpg',
      'https://github.com/samp-releases/discord-bot.zip',
      112,
      999,
      5.0,
      0
    );
  }
}

module.exports = {
  db,
  initDatabase
};
