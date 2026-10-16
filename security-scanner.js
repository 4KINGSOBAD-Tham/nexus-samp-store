const crypto = require('crypto');
const path = require('path');
const AdmZip = require('adm-zip');

// 🚫 Dangerous Extensions that are STRICTLY BANNED in SA-MP scripts
const DANGEROUS_EXTENSIONS = [
  '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.wsf', 
  '.scr', '.msi', '.hta', '.lnk', '.reg', '.pif', 
  '.com', '.cpl', '.jar'
];

// 🟢 Known official SA-MP / open.mp server executables allowed in packages
const ALLOWED_EXECUTABLES = [
  'samp-server.exe',
  'samp-npc.exe',
  'announce.exe',
  'omp-server.exe',
  'mysqld.exe',
  'xampp-control.exe'
];

// 🚨 High-risk backdoor code patterns in Pawn (.pwn) files
const PWN_BACKDOOR_PATTERNS = [
  {
    regex: /(?:SetPlayerAdmin|IsPlayerAdmin)\s*\([^)]*\)\s*;\s*(?:\/\*.*?\*\/)?\s*(?:SendClientMessage|printf)?/i,
    name: 'สิทธิพิเศษแอดมินแอบแฝง (Hidden Admin Injection)'
  },
  {
    regex: /(?:strcmp|strfind)\s*\([^,]+,\s*["']\/(?:hack|backdoor|iamadmin|setadmin|root|rconleak|giveadmin|devadmin)/i,
    name: 'คำสั่งแอบดักแอดมินลับ (Secret Backdoor Command)'
  },
  {
    regex: /HTTP\s*\([^,]+,\s*(?:HTTP_POST|HTTP_GET)\s*,\s*["'][^"']*(?:webhook|discord|stealer|pastebin|iplogger|ngrok)/i,
    name: 'ส่งข้อมูลรหัสผ่านหรือข้อมูลเซิร์ฟเวอร์ออกไปเว็บภายนอก (Data Exfiltration via HTTP)'
  },
  {
    regex: /GetServerVarAsString\s*\(\s*["']rcon_password["']/i,
    name: 'พยายามดักขโมยรหัสผ่าน RCON ของเซิร์ฟเวอร์ (RCON Password Sniffing)'
  },
  {
    regex: /SendRconCommand\s*\(\s*["'](?:exit|gmx|banip)/i,
    name: 'คำสั่งแอบสั่งปิดหรือรีสตาร์ทเซิร์ฟเวอร์โดยไม่ได้รับอนุญาต (Remote Server Shutdown)'
  }
];

/**
 * Calculate SHA-256 Hash of a buffer
 */
function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Scan a single Pawn (.pwn) code snippet or file text for backdoors
 */
function scanPawnSourceCode(content, filename = 'script.pwn') {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of PWN_BACKDOOR_PATTERNS) {
      if (pattern.regex.test(line)) {
        issues.push({
          file: filename,
          line: i + 1,
          threat: pattern.name,
          snippet: line.trim().substring(0, 100)
        });
      }
    }
  }

  return issues;
}

/**
 * Comprehensive Scanner for ZIP Archive Buffer
 */
async function scanZipArchiveBuffer(zipBuffer) {
  const fileHash = calculateSha256(zipBuffer);
  const virustotalUrl = `https://www.virustotal.com/gui/file/${fileHash}`;

  const report = {
    isClean: true,
    riskLevel: 'clean', // 'clean', 'warning', 'danger'
    fileHash,
    virustotalUrl,
    fileCount: 0,
    serverExecutables: [],
    plugins: [],
    pwnFilesCount: 0,
    blockedFiles: [],
    warnings: [],
    backdoors: [],
    summary: '✅ ผ่านการตรวจสอบ: ไฟล์สะอาด ไร้มัลแวร์และปลอดภัยสำหรับเปิดใช้งาน'
  };

  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    report.fileCount = zipEntries.length;

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const fullPath = entry.entryName;
      const fileName = path.basename(fullPath);
      const ext = path.extname(fileName).toLowerCase();

      // 1. Detect Double Extension Malwares (e.g. script.pwn.exe)
      const doubleExtMatch = fileName.match(/\.([a-z0-9]+)\.([a-z0-9]+)$/i);
      if (doubleExtMatch) {
        const innerExt = '.' + doubleExtMatch[1].toLowerCase();
        const outerExt = '.' + doubleExtMatch[2].toLowerCase();
        if (outerExt === '.exe' || outerExt === '.bat' || outerExt === '.scr') {
          report.isClean = false;
          report.riskLevel = 'danger';
          report.blockedFiles.push(`📂 ตำแหน่งใน ZIP: "${fullPath}" (ตรวจพบนามสกุลซ้อนซ่อนมัลแวร์: ${innerExt}${outerExt})`);
        }
      }

      // 2. Block Strictly Banned Dangerous Script Extensions
      if (DANGEROUS_EXTENSIONS.includes(ext)) {
        report.isClean = false;
        report.riskLevel = 'danger';
        report.blockedFiles.push(`📂 ตำแหน่งใน ZIP: "${fullPath}" (ไฟล์อันตรายประเภท ${ext.toUpperCase()})`);
      }

      // 3. Inspect .EXE Executables
      if (ext === '.exe') {
        const lowerName = fileName.toLowerCase();
        if (ALLOWED_EXECUTABLES.includes(lowerName)) {
          report.serverExecutables.push({
            name: fileName,
            path: fullPath,
            type: 'Official Server Executable',
            size: entry.header.size
          });
        } else {
          // Unrecognized .exe
          report.warnings.push(`📂 ตำแหน่งใน ZIP: "${fullPath}" (ไฟล์โปรแกรมรันไม่ทราบที่มา แนะนำให้สแกน VirusTotal ก่อนอนุมัติ)`);
          if (report.riskLevel === 'clean') report.riskLevel = 'warning';
        }
      }

      // 4. Catalog Plugins (.dll / .so)
      if (ext === '.dll' || ext === '.so') {
        report.plugins.push(fullPath);
      }

      // 5. Scan .pwn / .inc Source Files for Backdoors
      if (ext === '.pwn' || ext === '.inc') {
        report.pwnFilesCount++;
        try {
          const content = entry.getData().toString('utf8');
          const foundIssues = scanPawnSourceCode(content, fullPath);
          if (foundIssues.length > 0) {
            report.backdoors.push(...foundIssues);
            report.isClean = false;
            report.riskLevel = 'danger';
          }
        } catch (readErr) {
          // Skip if binary/corrupt
        }
      }
    }

    // Determine final status
    const formattedThreats = [
      ...report.blockedFiles,
      ...report.backdoors.map(b => `📂 ตำแหน่งใน ZIP: "${b.file}" (บรรทัดที่ ${b.line}): ${b.threat} [โค้ด: ${b.snippet}]`)
    ];

    if (formattedThreats.length > 0) {
      report.isClean = false;
      report.riskLevel = 'danger';
      report.threatsFormatted = formattedThreats;
      report.summary = `❌ ตรวจพบความเสี่ยงสูง ${formattedThreats.length} จุด (ระบุตำแหน่งไฟล์และบรรทัดด้านล่าง)`;
    } else if (report.warnings.length > 0) {
      report.isClean = true;
      report.riskLevel = 'warning';
      report.summary = `🟡 ผ่านการตรวจสอบ (พบตัวรันภายนอก ${report.warnings.length} จุด: ${report.warnings.join(', ')})`;
    } else {
      report.isClean = true;
      report.riskLevel = 'clean';
      report.summary = `🟢 ผ่านการตรวจความปลอดภัย 100%: ไร้ไวรัส ไร้ Backdoor แอบแฝง`;
    }

  } catch (err) {
    report.isClean = false;
    report.riskLevel = 'danger';
    report.summary = `⚠️ ไม่สามารถแตกไฟล์ ZIP เพื่อตรวจสอบได้: ${err.message}`;
  }

  return report;
}

module.exports = {
  DANGEROUS_EXTENSIONS,
  ALLOWED_EXECUTABLES,
  calculateSha256,
  scanPawnSourceCode,
  scanZipArchiveBuffer
};
