require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { db, initDatabase } = require('./database');
const { generatePromptPayQR, generateBankQR } = require('./promptpay');
const multer = require('multer');
const discord = require('./discord');

// Start Discord Bot if Bot Token is available
if (process.env.DISCORD_BOT_TOKEN) {
  try {
    require('./bot');
  } catch (botErr) {
    console.warn('⚠️ [Discord Bot] Failed to initialize:', botErr.message);
  }
}

// Strict Image File Filter
const allowedImageTypes = [
  'image/jpeg', 'image/jpg', 'image/pjpeg',
  'image/png', 'image/x-png',
  'image/webp',
  'image/gif',
  'application/octet-stream'
];
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isMimeOk = allowedImageTypes.includes(mime);
  const isExtOk = allowedExtensions.includes(ext);

  if (isMimeOk || isExtOk) {
    cb(null, true);
  } else {
    cb(new Error('ประเภทไฟล์ไม่ถูกต้อง! อนุญาตเฉพาะรูปภาพ (JPG, PNG, WEBP, GIF) เท่านั้น'));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

// Directory for product image attachments (cache)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadProductCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

// Helper to convert uploaded product image into persistent Base64 and write to disk
function getProductImageData(file, fallback = '/assets/roleplay.jpg') {
  if (!file || !file.buffer) return fallback;

  const ext = path.extname(file.originalname).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  const filename = 'cover-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safeExt;

  // Try writing to local disk cache
  try {
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  } catch (err) {
    console.warn('⚠️ Could not write file to local disk:', err.message);
  }

  // Detect proper MIME
  let mime = file.mimetype;
  if (!mime || mime === 'application/octet-stream') {
    if (safeExt === '.png') mime = 'image/png';
    else if (safeExt === '.webp') mime = 'image/webp';
    else if (safeExt === '.gif') mime = 'image/gif';
    else mime = 'image/jpeg';
  }

  // Convert to Base64 data URI to guarantee 100% persistence in Cloud DB (never lost on Render restart)
  return `data:${mime};base64,${file.buffer.toString('base64')}`;
}

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'samp-rank1-secret-key-2026';

// ----------------------------------------------------
// 🛡️ NEXUS FULL-SPECTRUM SECURITY ENGINE (ระดับเต็มกราฟ)
// ----------------------------------------------------

// 1. Remove identifying server headers
app.disable('x-powered-by');

// 2. HTTP Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// 3. Security Threat Logging Helper
async function logSecurityThreat(ip, method, endpoint, threatType, details, action = 'BLOCKED') {
  try {
    await db.run(`
      INSERT INTO security_logs (ip, method, endpoint, threat_type, details, action_taken)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ip || 'unknown', method || 'GET', endpoint || '/', threatType, String(details).substring(0, 500), action]);

    if (threatType !== 'RATE_LIMIT_EXCEEDED') {
      discord.notifySecurityAlert({ ip, method, endpoint, threat_type: threatType, details });
    }
  } catch (err) {
    console.error('Failed to log security incident:', err.message);
  }
}

// 4. Rate Limiting: General API & Anti-DDoS
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    logSecurityThreat(ip, req.method, req.originalUrl, 'RATE_LIMIT_EXCEEDED', '150 req/min limit reached');
    res.status(429).json({
      success: false,
      message: 'คำขอถี่เกินไป เพื่อความปลอดภัย กรุณารอสักครู่ (Nexus Rate Limit Triggered)'
    });
  }
});

// 5. Rate Limiting: Brute Force Login & Register Protection
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    logSecurityThreat(ip, req.method, req.originalUrl, 'AUTH_BRUTE_FORCE', 'Multiple failed login/register attempts');
    res.status(429).json({
      success: false,
      message: 'มีการพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 5 นาทีเพื่อความปลอดภัยของบัญชี'
    });
  }
});

// 6. Rate Limiting: Slip Verification Anti-Flood
const slipLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    logSecurityThreat(ip, req.method, req.originalUrl, 'SLIP_SPAM_FLOOD', 'Excessive slip verification requests');
    res.status(429).json({
      success: false,
      message: 'ส่งตรวจสอบสลิปถี่เกินไป กรุณารอ 2 นาทีก่อนทำรายการใหม่'
    });
  }
});

// 7. Nexus Shield Web Application Firewall (WAF)
function nexusShieldWAF(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const ua = req.headers['user-agent'] || '';
  const url = req.originalUrl || req.url;

  // Scanner Bot Blocker
  const botScannerRegex = /(sqlmap|nikto|dirbuster|gobuster|wpscan|masscan|zgrab|acunetix|nessus|nmap|havij|arachni|openvas|hydra|medusa|shodan|censys)/i;
  if (botScannerRegex.test(ua)) {
    logSecurityThreat(ip, req.method, url, 'VULNERABILITY_SCANNER', `User-Agent: ${ua}`);
    return res.status(403).json({
      success: false,
      message: '⛔ ACCESS DENIED: Scanner bot blocked by Nexus Shield WAF'
    });
  }

  // Common Exploit Probe Paths Blocker
  const probePaths = [
    /\.env/i, /\.git/i, /\.svn/i, /\.aws/i, /\.docker/i,
    /wp-admin/i, /wp-login/i, /xmlrpc\.php/i,
    /phpmyadmin/i, /pma/i, /shell\.php/i, /eval-stdin\.php/i,
    /\.ds_store/i, /actuator/i, /config\.json/i, /web\.config/i
  ];
  for (const pattern of probePaths) {
    if (pattern.test(url)) {
      logSecurityThreat(ip, req.method, url, 'PROBE_EXPLOIT_PATH', `Probe target: ${url}`);
      return res.status(403).json({
        success: false,
        message: '⛔ ACCESS DENIED: Probe detected and blocked by Nexus Shield WAF'
      });
    }
  }

  // Path Traversal Blocker
  const pathTraversalRegex = /(\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|win\.ini|\/etc\/passwd|\/etc\/shadow)/i;
  if (pathTraversalRegex.test(url)) {
    logSecurityThreat(ip, req.method, url, 'PATH_TRAVERSAL', `Target URL: ${url}`);
    return res.status(400).json({
      success: false,
      message: '⛔ ACCESS DENIED: Path traversal attempt detected'
    });
  }

  // SQL Injection in Query Strings
  const sqlInjectionPattern = /(\b(UNION(\s+ALL)?\s+SELECT|SELECT\s+.*\s+FROM|INSERT\s+INTO|DROP\s+TABLE|ALTER\s+TABLE|DELETE\s+FROM)\b|--|\/\*|\*\/)/i;
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  if (queryString && sqlInjectionPattern.test(decodeURIComponent(queryString))) {
    logSecurityThreat(ip, req.method, url, 'SQL_INJECTION_QUERY', `Query: ${queryString}`);
    return res.status(400).json({
      success: false,
      message: '⛔ ACCESS DENIED: SQL injection pattern detected'
    });
  }

  // Payload XSS Stripping
  if (req.body && typeof req.body === 'object') {
    sanitizePayload(req.body);
  }

  next();
}

function sanitizePayload(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/onload\s*=/gi, '')
        .replace(/onerror\s*=/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizePayload(obj[key]);
    }
  }
}

// Concurrency slip lock set
const activeSlipLocks = new Set();

// Global Middleware Chain
app.use(nexusShieldWAF);
app.use('/api/', generalLimiter);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth Helper Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
    }
    try {
      // Fetch fresh user data from DB
      const freshUser = await db.get('SELECT id, username, email, role, balance, COALESCE(seller_balance, 0) as seller_balance, avatar FROM users WHERE id = ?', [user.id]);
      if (!freshUser) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' });
      }
      req.user = freshUser;
      next();
    } catch (e) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าถึงได้' });
  }
}

// ----------------------------------------------------
// Public APIs
// ----------------------------------------------------

// Site Settings
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.all('SELECT key, value FROM site_settings');
    const settings = {};
    (rows || []).forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Live Stats
app.get('/api/stats', async (req, res) => {
  try {
    const userRow = await db.get('SELECT COUNT(*) as count FROM users');
    const prodRow = await db.get('SELECT COUNT(*) as count FROM products');
    const orderRow = await db.get('SELECT COUNT(*) as count FROM orders');
    const salesRow = await db.get('SELECT COALESCE(SUM(price), 0) as total FROM orders');

    const userCount = Number(userRow?.count || 0);
    const prodCount = Number(prodRow?.count || 0);
    const orderCount = Number(orderRow?.count || 0);
    const totalSales = Number(salesRow?.total || 0);

    res.json({
      success: true,
      stats: {
        users: userCount + 1400,
        products: prodCount,
        orders: orderCount + 2850,
        totalSales: totalSales + 45000,
        satisfaction: '99.8%'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM categories ORDER BY id ASC');
    for (const cat of categories) {
      const c = await db.get('SELECT COUNT(*) as count FROM products WHERE category_slug = ?', [cat.slug]);
      cat.product_count = Number(c?.count || 0);
    }
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Products List
// Products List (Approved Marketplace & Official Store)
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, sort, featured } = req.query;
    let query = `
      SELECT p.*, COALESCE(u.username, 'Nexus Official') as seller_name
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE (p.status = 'approved' OR p.status IS NULL)
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND p.category_slug = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.name LIKE ? OR p.short_desc LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (featured === '1') {
      query += ' AND p.is_featured = 1';
    }

    // Sort order
    if (sort === 'price_asc') {
      query += ' ORDER BY p.price ASC';
    } else if (sort === 'price_desc') {
      query += ' ORDER BY p.price DESC';
    } else if (sort === 'popular') {
      query += ' ORDER BY p.sold_count DESC';
    } else {
      query += ' ORDER BY p.id DESC';
    }

    const products = await db.all(query, params);

    // Parse JSON fields
    (products || []).forEach(p => {
      try { p.features = JSON.parse(p.features || '[]'); } catch (e) { p.features = []; }
      try { p.requirements = JSON.parse(p.requirements || '[]'); } catch (e) { p.requirements = []; }
    });

    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single Product Detail
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let product;
    if (isNaN(id)) {
      product = await db.get(`
        SELECT p.*, COALESCE(u.username, 'Nexus Official') as seller_name
        FROM products p
        LEFT JOIN users u ON p.seller_id = u.id
        WHERE p.slug = ? AND (p.status = 'approved' OR p.status IS NULL)
      `, [id]);
    } else {
      product = await db.get(`
        SELECT p.*, COALESCE(u.username, 'Nexus Official') as seller_name
        FROM products p
        LEFT JOIN users u ON p.seller_id = u.id
        WHERE p.id = ? AND (p.status = 'approved' OR p.status IS NULL)
      `, [Number(id)]);
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้าที่ระบุ หรือสินค้านี้อยู่ระหว่างการตรวจสอบ' });
    }

    try { product.features = JSON.parse(product.features || '[]'); } catch (e) { product.features = []; }
    try { product.requirements = JSON.parse(product.requirements || '[]'); } catch (e) { product.requirements = []; }

    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fixes & Guides
app.get('/api/fixes', (req, res) => {
  const fixes = [
    {
      id: 1,
      title: 'วิธีแก้ข้อผิดพลาด pawncc: error 017: undefined symbol',
      category: 'Pawn Compiler',
      description: 'เกิดจากยังไม่ได้ Include ไฟล์ Library หรือสคริปต์เรียกใช้ตัวแปร/ฟังก์ชันที่ไม่มีอยู่ในไฟล์ Header',
      solution: '1. ตรวจสอบว่าได้วางไฟล์ .inc ในโฟลเดอร์ pawno/include แล้วหรือยัง\n2. เพิ่ม #include <ชื่อไฟล์> ด้านบนสุดของ GameMode/Filterscript\n3. ใช้ Pawn Compiler เวอร์ชัน 3.10.10 ขึ้นไปในการคอมไพล์'
    },
    {
      id: 2,
      title: 'วิธีติดตั้ง MySQL Plugin R41-4 และเชื่อมต่อเซิร์ฟเวอร์',
      category: 'Database / MySQL',
      description: 'เซิร์ฟเวอร์แจ้งเตือน Failed to load mysql.dll หรือ Connection lost to MySQL server',
      solution: '1. โหลด Microsoft Visual C++ 2015-2022 Redistributable (x86) มาติดตั้งบน Windows\n2. นำ mysql.dll วางในโฟลเดอร์ plugins และระบุใน server.cfg บรรทัด plugins mysql.dll\n3. สร้าง Database ใน phpMyAdmin และ Import ไฟล์ .sql ที่ได้รับไป\n4. ตรวจสอบ Host (127.0.0.1), User, Password ในไฟล์ config'
    },
    {
      id: 3,
      title: 'วิธีตั้งค่าและเปิดใช้งาน Streamer Plugin v2.9.5',
      category: 'Server Optimization',
      description: 'อ็อบเจ็กต์ แมพ หรือ 3D Text ไม่แสดงผลในเกม หรือหลุดขอบแผนที่',
      solution: '1. นำ streamer.dll วางไว้ใน plugins\n2. ระบุ streamer.dll ต่อท้าย plugins อื่นใน server.cfg\n3. ใน Pawno ใช้ CreateDynamicObject แทน CreateObject สำหรับแมพขนาดใหญ่'
    },
    {
      id: 4,
      title: 'วิธีกดรีเซ็ต IP / HWID เมื่อย้ายโฮสติ้งเซิร์ฟเวอร์',
      category: 'License & Security',
      description: 'ย้ายเซิร์ฟเวอร์ไปเครื่องใหม่แล้วขึ้นแจ้งเตือน License Error: Unauthorized IP',
      solution: '1. เข้าสู่ระบบเว็บร้านค้า และไปที่เมนู "รีเซ็ต HWID"\n2. เลือกรายการระบบที่ต้องการย้าย\n3. ใส่ IP เครื่องเซิร์ฟเวอร์ใหม่ พร้อมพอร์ต (เช่น 103.20.205.12:7777)\n4. กดปุ่มยืนยัน ระบบจะอัปเดต IP ให้ทันทีใน 5 วินาที'
    }
  ];
  res.json({ success: true, fixes });
});

// ----------------------------------------------------
// Authentication APIs
// ----------------------------------------------------

// Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }

    if (username.length < 3) {
      return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้ต้องมีความยาวอย่างน้อย 3 ตัวอักษร' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
    }

    // Check existing
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรืออีเมลนี้มีอยู่ในระบบแล้ว' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db.run(`
      INSERT INTO users (username, email, password_hash, role, balance, avatar)
      VALUES (?, ?, ?, 'user', 0.00, '👤')
    `, [username, email, passwordHash]);

    const user = {
      id: result.lastInsertRowid,
      username,
      email,
      role: 'user',
      balance: 0.00,
      avatar: '👤'
    };

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ร้านค้า!',
      token,
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!user) {
      return res.status(400).json({ success: false, message: 'ไม่พบชื่อผู้ใช้หรืออีเมลนี้ในระบบ' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' });
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      balance: Number(user.balance || 0),
      avatar: user.avatar
    };

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ!',
      token,
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ----------------------------------------------------
// Topup & Wallet APIs
// ----------------------------------------------------

// Generate SCB Bank QR
app.post('/api/topup/bank-qr', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'จำนวนเงินไม่ถูกต้อง' });
    }

    // Get SCB Bank settings
    const bankNameSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['bank_name']);
    const bankAccountSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['bank_account']);
    const bankAccountNameSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['bank_account_name']);

    const bankName = (bankNameSetting && bankNameSetting.value) || 'ธนาคารไทยพาณิชย์ (SCB)';
    const bankAccount = (bankAccountSetting && bankAccountSetting.value) || '5632881610';
    const accountName = (bankAccountNameSetting && bankAccountNameSetting.value) || 'ธาม สุวรรณรัตน์';

    // Bonus promotion: >= 500 get 10% bonus, >= 1000 get 15% bonus
    let bonus = 0;
    if (numAmount >= 1000) {
      bonus = Math.round(numAmount * 0.15);
    } else if (numAmount >= 500) {
      bonus = Math.round(numAmount * 0.10);
    }

    const promptpayNumberSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['promptpay_number']);
    const target = (promptpayNumberSetting && promptpayNumberSetting.value) || '0816302510';

    // Generate SCB Bank QR (accepted by all Thai mobile banking apps)
    const qrResult = await generateBankQR(target, numAmount);
    const refCode = 'SCB-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    res.json({
      success: true,
      qrDataUrl: qrResult.qrDataUrl,
      amount: numAmount,
      bonus,
      totalCredit: numAmount + bonus,
      bankName,
      bankAccount,
      bankAccountFormatted: '563-2-88161-0',
      accountName,
      refCode,
      expiresInSeconds: 300 // 5 minutes timer
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Backward compatibility alias for promptpay-qr
app.post('/api/topup/promptpay-qr', authenticateToken, (req, res, next) => {
  req.url = '/api/topup/bank-qr';
  app.handle(req, res, next);
});

// Automated Slip Verification (SlipOK API)
app.post('/api/topup/verify-slip', authenticateToken, slipLimiter, upload.single('slip'), async (req, res) => {
  const userLock = `user_${req.user.id}`;
  if (activeSlipLocks.has(userLock)) {
    return res.status(429).json({ success: false, message: 'ระบบกำลังดำเนินการตรวจสอบสลิปก่อนหน้านี้ของคุณอยู่ กรุณารอสักครู่' });
  }
  activeSlipLocks.add(userLock);

  let transRefLock = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์รูปภาพสลิปโอนเงิน' });
    }

    const { amount, bonus, refCode } = req.body;
    const expectedAmount = Number(amount) || 0;

    // Get SlipOK configuration from database settings
    const branchSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['slipok_branch_id']);
    const keySetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['slipok_api_key']);
    let rawBranchId = (branchSetting && branchSetting.value) ? branchSetting.value.trim() : '';
    const apiKey = (keySetting && keySetting.value) ? keySetting.value.trim() : '';

    // Smart clean branchId (extract trailing ID if user pasted full API URL)
    let branchId = rawBranchId;
    if (branchId.includes('/')) {
      const parts = branchId.split('/').filter(Boolean);
      branchId = parts[parts.length - 1];
    }

    if (!branchId || !apiKey) {
      return res.status(400).json({
        success: false,
        needsConfig: true,
        message: 'ระบบตรวจสลิปยังไม่ได้ตั้งค่า SlipOK API Key ในหลังบ้าน (กรุณาให้แอดมินเข้าไปกรอก Branch ID และ API Key ในแผงแอดมิน เพื่อเปิดระบบตรวจสลิปอัตโนมัติ)'
      });
    }

    // Call SlipOK API
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
    formData.append('files', blob, req.file.originalname || 'slip.jpg');
    if (expectedAmount > 0) {
      formData.append('amount', String(expectedAmount));
    }
    formData.append('log', 'true');

    const slipokRes = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
      method: 'POST',
      headers: {
        'x-authorization': apiKey
      },
      body: formData
    });

    const slipData = await slipokRes.json();

    if (!slipokRes.ok || !slipData.success) {
      return res.status(400).json({
        success: false,
        message: slipData.message || 'ไม่สามารถตรวจสอบสลิปได้ หรือสลิปไม่ถูกต้อง'
      });
    }

    // Check duplicate transRef
    const transRef = (slipData.data && slipData.data.transRef) || ('SLIP-' + Date.now());
    transRefLock = `trans_${transRef}`;
    if (activeSlipLocks.has(transRefLock)) {
      return res.status(400).json({ success: false, message: 'สลิปนี้กำลังอยู่ในกระบวนการบันทึกยอดเงิน กรุณาอย่าส่งซ้ำ' });
    }
    activeSlipLocks.add(transRefLock);

    const existing = await db.get('SELECT id FROM topups WHERE ref_code = ?', [transRef]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'สลิปนี้ถูกใช้งานไปแล้ว ไม่สามารถนำมาใช้ซ้ำได้!' });
    }

    const actualAmount = Number(slipData.data.amount) || expectedAmount;

    if (expectedAmount > 0 && actualAmount < expectedAmount) {
      return res.status(400).json({
        success: false,
        message: `ยอดเงินในสลิป (${actualAmount} บาท) ไม่ตรงกับยอดที่เลือก (${expectedAmount} บาท)`
      });
    }

    // Calculate bonus promotion
    let finalBonus = 0;
    if (actualAmount >= 1000) {
      finalBonus = Math.round(actualAmount * 0.15);
    } else if (actualAmount >= 500) {
      finalBonus = Math.round(actualAmount * 0.10);
    }

    const totalToAdd = actualAmount + finalBonus;

    // Record topup and credit user balance
    await db.run(`
      INSERT INTO topups (ref_code, user_id, amount, bonus, method, status)
      VALUES (?, ?, ?, ?, 'promptpay_slip', 'completed')
    `, [transRef, req.user.id, actualAmount, finalBonus]);

    await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [totalToAdd, req.user.id]);

    const updatedUser = await db.get('SELECT id, username, email, role, balance, avatar FROM users WHERE id = ?', [req.user.id]);

    await discord.notifyTopup({
      username: updatedUser.username,
      amount: actualAmount,
      bonus: finalBonus,
      method: 'PromptPay / SCB (สแกนสลิปจริง)',
      reference: transRef,
      new_balance: updatedUser.balance
    }).catch(e => console.warn('Discord topup notify error:', e.message));

    const mainWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    const topupWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_topup']);
    const webhookToUse = (topupWebhook && topupWebhook.value) || (mainWebhook && mainWebhook.value) || '';

    res.json({
      success: true,
      message: `ตรวจสลิปผ่านฉลุย! ได้รับเครดิตจำนวน ${totalToAdd.toLocaleString()} บาท (ยอดโอน ${actualAmount} บาท + โบนัส ${finalBonus} บาท)`,
      newBalance: Number(updatedUser.balance || 0),
      user: updatedUser,
      transRef,
      webhookUrl: webhookToUse,
      topupInfo: {
        username: updatedUser.username,
        amount: actualAmount,
        bonus: finalBonus,
        reference: transRef,
        new_balance: updatedUser.balance
      }
    });
  } catch (err) {
    console.error('Slip verification error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป: ' + err.message });
  } finally {
    activeSlipLocks.delete(userLock);
    if (transRefLock) activeSlipLocks.delete(transRefLock);
  }
});

// TrueMoney Angpao Voucher Topup
app.post('/api/topup/truemoney', authenticateToken, async (req, res) => {
  try {
    const { voucherUrl } = req.body;

    if (!voucherUrl) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกลิงก์ซองของขวัญ TrueMoney' });
    }

    // Validate link format
    const match = voucherUrl.match(/v=([a-zA-Z0-9]+)/);
    if (!match && !voucherUrl.includes('gift.truemoney.com')) {
      return res.status(400).json({ success: false, message: 'รูปแบบลิงก์ซองของขวัญไม่ถูกต้อง' });
    }

    const voucherCode = match ? match[1] : voucherUrl.trim();
    const refCode = 'TM-' + voucherCode.substring(0, 8).toUpperCase();

    // Check duplicate
    const existing = await db.get('SELECT id FROM topups WHERE ref_code = ?', [refCode]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'ซองของขวัญนี้ถูกใช้งานไปแล้ว' });
    }

    // TrueMoney voucher requires recipient phone number and real TrueMoney API
    const tmPhoneSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['truemoney_phone']);
    const tmPhone = tmPhoneSetting ? tmPhoneSetting.value.trim() : '';

    if (!tmPhone) {
      return res.status(400).json({
        success: false,
        message: 'ระบบรับซองของขวัญ TrueMoney อยู่ระหว่างการบำรุงรักษา กรุณาเลือกเติมผ่านช่องทาง "พร้อมเพย์ (PromptPay QR)" เพื่อความรวดเร็วและปลอดภัย หรือติดต่อแอดมินทาง Discord'
      });
    }

    // If phone is configured, process via official TrueMoney gift voucher redeem endpoint
    return res.status(400).json({
      success: false,
      message: 'กรุณาใช้ช่องทาง พร้อมเพย์ QR สแกนสลิปเพื่อเติมเงินอัตโนมัติ'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Topup History
app.get('/api/topup/history', authenticateToken, async (req, res) => {
  try {
    const history = await db.all('SELECT * FROM topups WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Orders & Checkout APIs
// ----------------------------------------------------

// Checkout / Buy Product
app.post('/api/orders/checkout', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุสินค้าที่ต้องการสั่งซื้อ' });
    }

    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้าในระบบ' });
    }

    // Check user balance
    const user = await db.get('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    const currentBalance = Number(user.balance || 0);
    const prodPrice = Number(product.price);

    if (currentBalance < prodPrice) {
      const needed = prodPrice - currentBalance;
      return res.status(400).json({
        success: false,
        message: `ยอดเงินในกระเป๋าไม่เพียงพอ (ขาดอีก ${needed.toLocaleString()} บาท) กรุณาเติมเงินก่อนสั่งซื้อ`,
        requireTopup: true,
        needed
      });
    }

    // Generate unique license key and order code
    const keyPart = crypto.randomBytes(6).toString('hex').toUpperCase();
    const licenseKey = `SAMP-${keyPart.substring(0, 4)}-${keyPart.substring(4, 8)}-${keyPart.substring(8, 12)}`;
    const orderCode = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);

    // Deduct balance
    await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [prodPrice, req.user.id]);

    // Increase sold count
    await db.run('UPDATE products SET sold_count = sold_count + 1 WHERE id = ?', [productId]);

    // Marketplace Revenue Share: 20% to Admin, 80% to Seller
    let adminFee = prodPrice;
    let sellerEarnings = 0;
    const sellerId = product.seller_id || null;
    let sellerUsername = null;

    if (sellerId && sellerId !== req.user.id) {
      adminFee = Math.round(prodPrice * 0.20 * 100) / 100; // 20%
      sellerEarnings = Math.round((prodPrice - adminFee) * 100) / 100; // 80%
      // Credit seller's withdrawable balance
      await db.run('UPDATE users SET seller_balance = COALESCE(seller_balance, 0) + ? WHERE id = ?', [sellerEarnings, sellerId]);
      const seller = await db.get('SELECT username FROM users WHERE id = ?', [sellerId]);
      if (seller) sellerUsername = seller.username;
    }

    // Insert order
    const result = await db.run(`
      INSERT INTO orders (order_code, user_id, seller_id, product_id, product_name, price, admin_fee, seller_earnings, license_key, server_ip, hwid_resets_left)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 3)
    `, [orderCode, req.user.id, sellerId, product.id, product.name, prodPrice, adminFee, sellerEarnings, licenseKey]);

    const updatedUser = await db.get('SELECT id, username, email, role, balance, avatar FROM users WHERE id = ?', [req.user.id]);

    await discord.notifyOrder({
      product_name: product.name,
      username: req.user.username,
      price: prodPrice,
      samp_version: product.samp_version,
      license_key: licenseKey,
      seller_name: sellerUsername,
      seller_earnings: sellerEarnings,
      admin_fee: adminFee
    }).catch(e => console.warn('Discord order notify error:', e.message));

    const mainWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    const ordersWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_orders']);
    const webhookToUse = (ordersWebhook && ordersWebhook.value) || (mainWebhook && mainWebhook.value) || '';

    res.json({
      success: true,
      message: `สั่งซื้อระบบ ${product.name} สำเร็จ! ไฟล์พร้อมดาวน์โหลดและรับ License Key ทันที`,
      order: {
        id: result.lastInsertRowid,
        order_code: orderCode,
        product_name: product.name,
        price: prodPrice,
        license_key: licenseKey,
        file_url: product.file_url,
        hwid_resets_left: 3,
        seller_name: sellerUsername,
        seller_earnings: sellerEarnings,
        admin_fee: adminFee
      },
      newBalance: Number(updatedUser.balance || 0),
      user: updatedUser,
      webhookUrl: webhookToUse
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// User's Purchased Inventory & Licenses
app.get('/api/user/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.all(`
      SELECT o.*, p.image, p.samp_version, p.file_url, p.short_desc
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ?
      ORDER BY o.id DESC
    `, [req.user.id]);

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Bind Server IP to License Key
app.post('/api/user/bind-ip', authenticateToken, async (req, res) => {
  try {
    const { orderId, serverIp } = req.body;

    if (!orderId || !serverIp) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกไอพีเซิร์ฟเวอร์ที่ต้องการผูก' });
    }

    const order = await db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.user.id]);
    if (!order) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการคำสั่งซื้อของคุณ' });
    }

    // Clean IP format (e.g. 103.20.205.12:7777 or 127.0.0.1)
    const cleanedIp = serverIp.trim();

    await db.run('UPDATE orders SET server_ip = ? WHERE id = ?', [cleanedIp, orderId]);

    res.json({
      success: true,
      message: `ผูกไอพีเซิร์ฟเวอร์ (${cleanedIp}) กับ License Key สำเร็จแล้ว!`,
      serverIp: cleanedIp
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reset HWID / IP Lock (Rank1Shop Signature Feature!)
app.post('/api/user/reset-hwid', authenticateToken, async (req, res) => {
  try {
    const { orderId, newServerIp } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายการคำสั่งซื้อ' });
    }

    const order = await db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.user.id]);
    if (!order) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการคำสั่งซื้อของคุณ' });
    }

    if (order.hwid_resets_left <= 0) {
      return res.status(400).json({
        success: false,
        message: 'คุณใช้โควตารีเซ็ต HWID ครบ 3 ครั้งแล้ว กรุณาติดต่อแอดมินทาง Discord เพื่อขอเพิ่มโควตา'
      });
    }

    const oldIp = order.server_ip || 'ยังไม่ได้ผูก IP';
    const newIp = (newServerIp || '').trim();

    await db.run(`
      UPDATE orders 
      SET server_ip = ?, hwid_resets_left = hwid_resets_left - 1
      WHERE id = ?
    `, [newIp, orderId]);

    await db.run(`
      INSERT INTO hwid_logs (order_id, user_id, old_ip, new_ip)
      VALUES (?, ?, ?, ?)
    `, [orderId, req.user.id, oldIp, newIp]);

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);

    res.json({
      success: true,
      message: `รีเซ็ต IP / HWID เรียบร้อยแล้ว! (คงเหลือโควตา ${updatedOrder.hwid_resets_left} ครั้ง)`,
      hwid_resets_left: updatedOrder.hwid_resets_left,
      server_ip: updatedOrder.server_ip
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 🛒 CREATOR MARKETPLACE & SELLER WITHDRAWAL APIs
// ----------------------------------------------------

// Submit Product for Review (Creator ฝากขายสคริปต์)
app.post('/api/seller/products', authenticateToken, uploadProductCover.single('imageFile'), async (req, res) => {
  try {
    const {
      name, category_slug, price, original_price, samp_version,
      short_desc, description, features, requirements, code_snippet,
      image, file_url
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อสคริปต์และราคาให้ครบถ้วน' });
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุราคาที่ถูกต้อง (มากกว่า 0 บาท)' });
    }

    if (!file_url && !req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุลิงก์ดาวน์โหลดไฟล์สคริปต์ (เช่น Google Drive, GitHub หรือ MediaFire)' });
    }

    let finalImage = '/assets/roleplay.jpg';
    if (req.file) {
      finalImage = getProductImageData(req.file);
    } else if (image) {
      finalImage = image;
    }

    const finalCat = category_slug || 'script';
    const finalSlug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'script') + '-' + Date.now().toString(36);

    const result = await db.run(`
      INSERT INTO products (
        seller_id, name, slug, category_slug, price, original_price, badge, samp_version,
        short_desc, description, features, requirements, code_snippet,
        image, file_url, is_featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'CREATOR', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
    `, [
      req.user.id,
      name,
      finalSlug,
      finalCat,
      numPrice,
      original_price ? Number(original_price) : null,
      samp_version || '0.3.7-R2',
      short_desc || '',
      description || '',
      typeof features === 'string' ? features : JSON.stringify(features || []),
      typeof requirements === 'string' ? requirements : JSON.stringify(requirements || []),
      code_snippet || '',
      finalImage,
      file_url || 'https://github.com/samp-releases/demo-package.zip'
    ]);

    await discord.notifyCreatorSubmission({
      name,
      creator_name: req.user.username,
      price: numPrice,
      file_url: file_url || 'https://github.com/samp-releases/demo-package.zip'
    }).catch(e => console.warn('Discord creator notify error:', e.message));

    const mainWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    const creatorWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_creator']);
    const webhookToUse = (creatorWebhook && creatorWebhook.value) || (mainWebhook && mainWebhook.value) || '';

    res.json({
      success: true,
      message: 'ส่งสคริปต์เข้าสู่ระบบฝากขายเรียบร้อยแล้ว! แอดมินจะทำการตรวจสอบความปลอดภัยก่อนอนุมัติขึ้นหน้าร้าน',
      id: result.lastInsertRowid,
      webhookUrl: webhookToUse,
      creatorInfo: {
        name,
        creator_name: req.user.username,
        price: numPrice,
        file_url: file_url || 'https://github.com/samp-releases/demo-package.zip'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Seller Dashboard & Earnings
app.get('/api/seller/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT balance, COALESCE(seller_balance, 0) as seller_balance FROM users WHERE id = ?', [req.user.id]);
    const sellerBalance = Number(user?.seller_balance || 0);

    const salesStats = await db.get(`
      SELECT COUNT(*) as total_orders, COALESCE(SUM(seller_earnings), 0) as total_earned
      FROM orders
      WHERE seller_id = ?
    `, [req.user.id]);

    const myProducts = await db.all('SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC', [req.user.id]);
    const withdrawals = await db.all('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20', [req.user.id]);

    res.json({
      success: true,
      seller: {
        sellerBalance,
        totalOrders: Number(salesStats?.total_orders || 0),
        totalEarned: Number(salesStats?.total_earned || 0),
        productsCount: myProducts.length,
        myProducts,
        withdrawals
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Request Withdrawal (แจ้งถอนเงินพ้อยรายได้)
app.post('/api/seller/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุจำนวนเงินที่ต้องการถอนให้ถูกต้อง' });
    }

    if (!bank_name || !account_number || !account_name) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลธนาคาร/พร้อมเพย์ เลขบัญชี และชื่อบัญชีให้ครบถ้วน' });
    }

    if (numAmount < 50) {
      return res.status(400).json({ success: false, message: 'ยอดถอนขั้นต่ำคือ 50 บาท' });
    }

    const user = await db.get('SELECT COALESCE(seller_balance, 0) as seller_balance FROM users WHERE id = ?', [req.user.id]);
    const currentSellerBalance = Number(user?.seller_balance || 0);

    if (currentSellerBalance < numAmount) {
      return res.status(400).json({
        success: false,
        message: `ยอดเงินที่ถอนได้ไม่เพียงพอ (คุณมี ฿${currentSellerBalance.toLocaleString()} บาท ต้องการถอน ฿${numAmount.toLocaleString()} บาท)`
      });
    }

    // Deduct seller balance
    await db.run('UPDATE users SET seller_balance = seller_balance - ? WHERE id = ?', [numAmount, req.user.id]);

    // Record withdrawal request
    const result = await db.run(`
      INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [req.user.id, numAmount, bank_name.trim(), account_number.trim(), account_name.trim()]);

    const updatedUser = await db.get('SELECT COALESCE(seller_balance, 0) as seller_balance FROM users WHERE id = ?', [req.user.id]);

    await discord.notifyWithdrawalRequest({
      username: req.user.username,
      amount: numAmount,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      account_name: account_name.trim()
    }).catch(e => console.warn('Discord withdrawal notify error:', e.message));

    const mainWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    const withdrawWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_withdraw']);
    const webhookToUse = (withdrawWebhook && withdrawWebhook.value) || (mainWebhook && mainWebhook.value) || '';

    res.json({
      success: true,
      message: `ส่งคำขอถอนเงิน ฿${numAmount.toLocaleString()} เรียบร้อยแล้ว! แอดมินจะตรวจสอบและโอนเงินเข้าบัญชีของคุณโดยเร็วที่สุด`,
      withdrawalId: result.lastInsertRowid,
      newSellerBalance: Number(updatedUser.seller_balance || 0),
      webhookUrl: webhookToUse,
      withdrawalInfo: {
        username: req.user.username,
        amount: numAmount,
        bank_name: bank_name.trim(),
        account_number: account_number.trim(),
        account_name: account_name.trim()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Get Pending Products for Review
app.get('/api/admin/marketplace/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const products = await db.all(`
      SELECT p.*, u.username as seller_name, u.email as seller_email
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.status = 'pending'
      ORDER BY p.id ASC
    `);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Review Product (Approve or Reject)
app.post('/api/admin/marketplace/review/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, reject_reason } = req.body;
    const productId = req.params.id;

    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ success: false, message: 'ไม่พบสคริปต์ที่ระบุ' });
    }

    if (action === 'approve') {
      await db.run("UPDATE products SET status = 'approved', reject_reason = '' WHERE id = ?", [productId]);
      res.json({ success: true, message: `อนุมัติสคริปต์ "${product.name}" ขึ้นวางจำหน่ายหน้าร้านเรียบร้อยแล้ว!` });
    } else {
      const reason = reject_reason || 'ไม่ผ่านเกณฑ์การตรวจสอบความปลอดภัยของทีมงาน';
      await db.run("UPDATE products SET status = 'rejected', reject_reason = ? WHERE id = ?", [reason, productId]);
      res.json({ success: true, message: `ปฏิเสธสคริปต์ "${product.name}" เรียบร้อยแล้ว (เหตุผล: ${reason})` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Get all withdrawal requests
app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const withdrawals = await db.all(`
      SELECT w.*, u.username, u.email
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ORDER BY CASE WHEN w.status = 'pending' THEN 0 ELSE 1 END, w.id DESC
    `);
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Action on Withdrawal (Complete payout or Reject with refund)
app.post('/api/admin/withdrawals/:id/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, admin_note } = req.body;
    const withdrawalId = req.params.id;

    const withdrawal = await db.get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการคำขอถอนเงิน' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'รายการนี้ได้รับการดำเนินการไปแล้ว' });
    }

    if (action === 'complete') {
      await db.run(`
        UPDATE withdrawals
        SET status = 'completed', admin_note = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [admin_note || 'โอนเงินเรียบร้อยแล้ว', withdrawalId]);
      res.json({ success: true, message: `ยืนยันการโอนเงินจำนวน ฿${Number(withdrawal.amount).toLocaleString()} ให้คุณ ${withdrawal.account_name} เรียบร้อยแล้ว!` });
    } else {
      // Refund money back to user's seller_balance
      await db.run('UPDATE users SET seller_balance = COALESCE(seller_balance, 0) + ? WHERE id = ?', [withdrawal.amount, withdrawal.user_id]);
      await db.run(`
        UPDATE withdrawals
        SET status = 'rejected', admin_note = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [admin_note || 'ข้อมูลบัญชีไม่ถูกต้อง หรือไม่สามารถโอนได้ (คืนเงินเข้ากระเป๋าเรียบร้อย)', withdrawalId]);
      res.json({ success: true, message: `ปฏิเสธคำขอและคืนเงิน ฿${Number(withdrawal.amount).toLocaleString()} เข้ากระเป๋าผู้ขายเรียบร้อยแล้ว` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Admin APIs (Management Dashboard)
// ----------------------------------------------------

// Admin Dashboard Summary
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userRow = await db.get('SELECT COUNT(*) as count FROM users');
    const prodRow = await db.get('SELECT COUNT(*) as count FROM products');
    const orderRow = await db.get('SELECT COUNT(*) as count FROM orders');
    const revRow = await db.get('SELECT COALESCE(SUM(price), 0) as sum FROM orders');
    const topupRow = await db.get('SELECT COALESCE(SUM(amount), 0) as sum FROM topups');

    const totalUsers = Number(userRow?.count || 0);
    const totalProducts = Number(prodRow?.count || 0);
    const totalOrders = Number(orderRow?.count || 0);
    const totalRevenue = Number(revRow?.sum || 0);
    const totalTopup = Number(topupRow?.sum || 0);

    const recentOrders = await db.all(`
      SELECT o.*, u.username
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.id DESC
      LIMIT 10
    `);

    const topSelling = await db.all(`
      SELECT id, name, price, sold_count, image
      FROM products
      ORDER BY sold_count DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      dashboard: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        totalTopup,
        recentOrders,
        topSelling
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Products CRUD
app.get('/api/admin/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const products = await db.all('SELECT * FROM products ORDER BY id DESC');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/products', authenticateToken, requireAdmin, uploadProductCover.single('imageFile'), async (req, res) => {
  try {
    const {
      name, slug, category_slug, price, original_price, badge, samp_version,
      short_desc, description, features, requirements, code_snippet,
      image, file_url, is_featured
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อสคริปต์และราคาให้ครบถ้วน' });
    }

    let finalImage = '/assets/roleplay.jpg';
    if (req.file) {
      finalImage = getProductImageData(req.file);
    } else if (image) {
      finalImage = image;
    }

    const finalCat = category_slug || 'script';
    const finalSlug = slug || (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString(36));

    const result = await db.run(`
      INSERT INTO products (
        name, slug, category_slug, price, original_price, badge, samp_version,
        short_desc, description, features, requirements, code_snippet,
        image, file_url, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      finalSlug,
      finalCat,
      Number(price),
      original_price ? Number(original_price) : null,
      badge || 'NEW',
      samp_version || '0.3.7-R2',
      short_desc || '',
      description || '',
      typeof features === 'string' ? features : JSON.stringify(features || []),
      typeof requirements === 'string' ? requirements : JSON.stringify(requirements || []),
      code_snippet || '',
      finalImage,
      file_url || 'https://github.com/samp-releases/demo-package.zip',
      is_featured ? 1 : 0
    ]);

    res.json({ success: true, message: 'เพิ่มสคริปต์ใหม่เรียบร้อยแล้ว!', id: result.lastInsertRowid, image: finalImage });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/products/:id', authenticateToken, requireAdmin, uploadProductCover.single('imageFile'), async (req, res) => {
  try {
    const id = req.params.id;
    const {
      name, category_slug, price, original_price, badge, samp_version,
      short_desc, description, features, requirements, code_snippet,
      image, file_url, is_featured
    } = req.body;

    const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }

    let finalImage = existing.image;
    if (req.file) {
      finalImage = getProductImageData(req.file, existing.image);
    } else if (image) {
      finalImage = image;
    }

    const finalCat = category_slug || existing.category_slug || 'script';

    await db.run(`
      UPDATE products SET
        name = ?, category_slug = ?, price = ?, original_price = ?,
        badge = ?, samp_version = ?, short_desc = ?, description = ?,
        features = ?, requirements = ?, code_snippet = ?, image = ?,
        file_url = ?, is_featured = ?
      WHERE id = ?
    `, [
      name || existing.name,
      finalCat,
      price ? Number(price) : existing.price,
      original_price !== undefined ? (original_price ? Number(original_price) : null) : existing.original_price,
      badge || existing.badge,
      samp_version || existing.samp_version,
      short_desc !== undefined ? short_desc : existing.short_desc,
      description !== undefined ? description : existing.description,
      features ? (typeof features === 'string' ? features : JSON.stringify(features)) : existing.features,
      requirements ? (typeof requirements === 'string' ? requirements : JSON.stringify(requirements)) : existing.requirements,
      code_snippet !== undefined ? code_snippet : existing.code_snippet,
      finalImage,
      file_url || existing.file_url,
      is_featured !== undefined ? (is_featured ? 1 : 0) : existing.is_featured,
      id
    ]);

    res.json({ success: true, message: 'อัปเดตข้อมูลสินค้าเรียบร้อย!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'ลบสินค้าเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Users List and Balance Adjust
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, email, role, balance, avatar, created_at FROM users ORDER BY id DESC');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/users/:id/balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount, action } = req.body; // action: 'add' or 'set'
    const numAmount = Number(amount);
    const userId = req.params.id;

    if (isNaN(numAmount)) {
      return res.status(400).json({ success: false, message: 'จำนวนเงินไม่ถูกต้อง' });
    }

    if (action === 'set') {
      await db.run('UPDATE users SET balance = ? WHERE id = ?', [numAmount, userId]);
    } else {
      await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [numAmount, userId]);
    }

    const updated = await db.get('SELECT id, username, email, role, balance FROM users WHERE id = ?', [userId]);
    res.json({ success: true, message: `ปรับยอดเงินของ ${updated.username} สำเร็จ เป็น ฿${Number(updated.balance).toLocaleString()}`, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Settings Update
app.post('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' });
    }

    for (const [key, val] of Object.entries(settings)) {
      await db.run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)', [key, String(val)]);
    }

    res.json({ success: true, message: 'บันทึกการตั้งค่าร้านค้าเรียบร้อยแล้ว!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 🤖 Discord Integration & Webhook Endpoints
// ----------------------------------------------------
app.get('/api/admin/discord/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const mainWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    const ordersWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_orders']);
    const topupWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_topup']);
    const creatorWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_creator']);
    const withdrawWebhook = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_withdraw']);
    const inviteUrl = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_invite_url']);

    res.json({
      success: true,
      settings: {
        mainWebhook: mainWebhook?.value || '',
        ordersWebhook: ordersWebhook?.value || '',
        topupWebhook: topupWebhook?.value || '',
        creatorWebhook: creatorWebhook?.value || '',
        withdrawWebhook: withdrawWebhook?.value || '',
        inviteUrl: inviteUrl?.value || 'https://discord.gg/NzcJ5CT4ru'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/discord/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { mainWebhook, ordersWebhook, topupWebhook, creatorWebhook, withdrawWebhook, inviteUrl } = req.body;

    const upsertSetting = async (key, value) => {
      if (db.isPostgres) {
        await db.run('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value || '']);
      } else {
        await db.run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)', [key, value || '']);
      }
    };

    if (mainWebhook !== undefined) await upsertSetting('discord_webhook_main', mainWebhook);
    if (ordersWebhook !== undefined) await upsertSetting('discord_webhook_orders', ordersWebhook);
    if (topupWebhook !== undefined) await upsertSetting('discord_webhook_topup', topupWebhook);
    if (creatorWebhook !== undefined) await upsertSetting('discord_webhook_creator', creatorWebhook);
    if (withdrawWebhook !== undefined) await upsertSetting('discord_webhook_withdraw', withdrawWebhook);
    if (inviteUrl !== undefined) await upsertSetting('discord_invite_url', inviteUrl);

    res.json({ success: true, message: 'บันทึกการตั้งค่า Discord เรียบร้อยแล้ว!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/discord/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    let urlToTest = webhookUrl;
    if (!urlToTest) {
      const saved = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
      urlToTest = saved?.value;
    }

    if (!urlToTest || !urlToTest.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกหรือบันทึก Discord Webhook URL ก่อนกดทดสอบ' });
    }

    const result = await discord.sendTestNotification(urlToTest.trim());
    if (result.success) {
      res.json({ success: true, message: 'ยิงข้อความทดสอบเข้า Discord สำเร็จ! ลองเปิดดูในห้องดิสคอร์ดของคุณได้เลยครับ 🎉' });
    } else {
      res.status(400).json({ success: false, message: 'ส่งไม่สำเร็จ: ' + (result.message || 'โปรดตรวจสอบความถูกต้องของ Webhook URL') });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/discord/invite', async (req, res) => {
  try {
    const invite = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_invite_url']);
    res.json({ success: true, url: invite?.value || 'https://discord.gg/NzcJ5CT4ru' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 🛡️ Admin Security Center APIs (Live Monitoring & Logs)
// ----------------------------------------------------
app.get('/api/admin/security/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalBlockedRow = await db.get('SELECT COUNT(*) as count FROM security_logs');
    const scannerCountRow = await db.get("SELECT COUNT(*) as count FROM security_logs WHERE threat_type = 'VULNERABILITY_SCANNER'");
    const probeCountRow = await db.get("SELECT COUNT(*) as count FROM security_logs WHERE threat_type = 'PROBE_EXPLOIT_PATH'");
    const rateLimitCountRow = await db.get("SELECT COUNT(*) as count FROM security_logs WHERE threat_type = 'RATE_LIMIT_EXCEEDED' OR threat_type = 'AUTH_BRUTE_FORCE' OR threat_type = 'SLIP_SPAM_FLOOD'");

    const totalBlocked = Number(totalBlockedRow?.count || 0);
    const scannerCount = Number(scannerCountRow?.count || 0);
    const probeCount = Number(probeCountRow?.count || 0);
    const rateLimitCount = Number(rateLimitCountRow?.count || 0);

    const recentLogs = await db.all('SELECT * FROM security_logs ORDER BY id DESC LIMIT 25');

    res.json({
      success: true,
      stats: {
        totalBlocked,
        scannerCount,
        probeCount,
        rateLimitCount,
        firewallStatus: 'ACTIVE_FULL_SHIELD',
        modules: [
          { name: 'Nexus Shield WAF (Firewall)', status: 'ACTIVE', desc: 'ตรวจจับและบล็อก Bot, Scanner, SQLi, LFI อัตโนมัติ' },
          { name: 'Anti-DDoS & Rate Limiter', status: 'ACTIVE', desc: 'จำกัดปริมาณคำขอ 150 ครั้ง/นาที ต่อ 1 IP' },
          { name: 'Brute-Force Protection', status: 'ACTIVE', desc: 'จำกัดการสุ่มรหัสผ่านล็อกอินสูงสุด 10 ครั้ง/5 นาที' },
          { name: 'Slip Double-Spend Anti-Race Lock', status: 'ACTIVE', desc: 'บล็อกการส่งสลิปซ้ำซ้อนหรือยิงสลิปพร้อมกัน' },
          { name: 'Helmet HTTP Security Headers', status: 'ACTIVE', desc: 'ป้องกัน Clickjacking, MIME-Sniffing, XSS' },
          { name: 'Anti-Inspect / Anti-Devtools', status: 'ACTIVE', desc: 'บล็อก F12, คลิกขวา, View Source ป้องกันการขโมยโค้ด' }
        ],
        recentLogs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/security/clear-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM security_logs');
    res.json({ success: true, message: 'ล้างประวัติการสกัดกั้นเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Handle Multer and API errors as JSON
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || (err && err.message)) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

// SPA Fallback middleware for Express 5
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Nexus SAMP Store is RUNNING!`);
  console.log(`🌐 Local URL:  http://localhost:${PORT}`);
  console.log(`📱 Mobile Wi-Fi URL: http://192.168.1.114:${PORT}`);
  console.log(`🔑 Admin Login: admin / admin1234`);
  console.log(`🎮 Demo User: player1 / 123456`);
  console.log(`===============================================`);
});
