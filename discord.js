const { db } = require('./database');

// Colors in Decimal for Discord Embeds
const COLORS = {
  ORDER: 0x10b981,      // Emerald Green
  TOPUP: 0x06b6d4,      // Cyan Blue
  CREATOR_NEW: 0xf59e0b,// Amber / Gold
  WITHDRAW: 0xec4899,   // Rose Pink
  SECURITY: 0xef4444,   // Crimson Red
  INFO: 0x6366f1        // Indigo
};

/**
 * Get configured Webhook URL for a specific event
 */
async function getWebhookUrl(type) {
  try {
    // 1. Check specific webhook first
    const specificKey = `discord_webhook_${type}`;
    const specificSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', [specificKey]);
    if (specificSetting && specificSetting.value && specificSetting.value.startsWith('http')) {
      return specificSetting.value.trim();
    }

    // 2. Fallback to main webhook
    const mainSetting = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_webhook_main']);
    if (mainSetting && mainSetting.value && mainSetting.value.startsWith('http')) {
      return mainSetting.value.trim();
    }

    // 3. Fallback to process.env
    return process.env.DISCORD_WEBHOOK_URL || null;
  } catch (err) {
    console.error('Error fetching Discord webhook URL:', err.message);
    return null;
  }
}

/**
 * Core function to send raw payload to Discord Webhook
 */
async function sendToDiscord(webhookUrl, payload) {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return { success: false, message: 'Webhook URL ไม่ถูกต้องหรือยังไม่ได้ตั้งค่า' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status === 204 || response.ok) {
      return { success: true };
    } else {
      const errText = await response.text();
      console.warn('⚠️ Discord Webhook response error:', response.status, errText);
      return { success: false, message: `Discord error: ${response.statusText}` };
    }
  } catch (err) {
    console.warn('⚠️ Failed to send Discord Webhook:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * 🛒 1. Notify on Product Purchase (Order)
 */
async function notifyOrder(orderData) {
  const url = await getWebhookUrl('orders');
  if (!url) return;

  const payload = {
    username: 'Nexus Store Bot',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '📦 มีรายการสั่งซื้อใหม่เข้ามา! (New Order)',
      color: COLORS.ORDER,
      description: `มีลูกค้าสั่งซื้อสคริปต์ **${orderData.product_name}** สำเร็จแล้ว!`,
      fields: [
        { name: '👤 ผู้ซื้อ', value: `\`${orderData.username}\``, inline: true },
        { name: '💰 ยอดชำระ', value: `**฿${Number(orderData.price).toLocaleString()} บาท**`, inline: true },
        { name: '🎮 SA-MP เวอร์ชัน', value: orderData.samp_version || '0.3.7', inline: true },
        { name: '🔑 License Key', value: `\`${orderData.license_key}\``, inline: false },
        { name: '⚡ สถานะการส่งมอบ', value: '✅ จัดส่งไฟล์ดาวน์โหลดอัตโนมัติ 24 ชม. เรียบร้อย', inline: false }
      ],
      footer: { text: 'Nexus SAMP Store • Automated Delivery System' },
      timestamp: new Date().toISOString()
    }]
  };

  sendToDiscord(url, payload);
}

/**
 * 💰 2. Notify on Topup (PromptPay / TrueMoney)
 */
async function notifyTopup(topupData) {
  const url = await getWebhookUrl('topup');
  if (!url) return;

  const bonusText = topupData.bonus > 0 ? ` (+โบนัส ฿${topupData.bonus})` : '';

  const payload = {
    username: 'Nexus Store Bot',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '💳 การเติมเงินสำเร็จ (Topup Success)',
      color: COLORS.TOPUP,
      description: `ผู้ใช้ **${topupData.username}** เติมพอยท์เข้าสู่ระบบเรียบร้อยแล้ว`,
      fields: [
        { name: '👤 สมาชิก', value: `\`${topupData.username}\``, inline: true },
        { name: '💵 ยอดเงิน', value: `**฿${Number(topupData.amount).toLocaleString()} บาท**${bonusText}`, inline: true },
        { name: '🏦 ช่องทาง', value: topupData.method || 'PromptPay SCB', inline: true },
        { name: '🧾 รหัสอ้างอิง', value: `\`${topupData.reference || '-'}\``, inline: true },
        { name: '💰 ยอดเงินคงเหลือล่าสุด', value: `**฿${Number(topupData.new_balance || 0).toLocaleString()}**`, inline: true }
      ],
      footer: { text: 'Nexus SAMP Store • Payment Gateway' },
      timestamp: new Date().toISOString()
    }]
  };

  sendToDiscord(url, payload);
}

/**
 * 📝 3. Notify on Creator Script Submission (Pending Approval)
 */
async function notifyCreatorSubmission(scriptData) {
  const url = await getWebhookUrl('creator');
  if (!url) return;

  const payload = {
    username: 'Nexus Creator Bot',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '💼 สมาชิกส่งสคริปต์มาฝากขายใหม่ (Pending Review)',
      color: COLORS.CREATOR_NEW,
      description: `มีสมาชิกส่งสคริปต์มาลงหน้าร้าน **กรุณาตรวจสอบความปลอดภัยของไฟล์ก่อนอนุมัติ**`,
      fields: [
        { name: '📦 ชื่อสคริปต์', value: `**${scriptData.name}**`, inline: false },
        { name: '👤 ผู้ส่งขาย', value: `\`${scriptData.creator_name || 'Member'}\``, inline: true },
        { name: '💵 ราคาที่ตั้งขาย', value: `**฿${Number(scriptData.price).toLocaleString()} บาท** (ผู้ขายได้รับ 80%)`, inline: true },
        { name: '📁 ลิงก์ตรวจสอบไฟล์', value: `[คลิกเพื่อดาวน์โหลดไฟล์ไปตรวจสอบ](${scriptData.file_url})`, inline: false }
      ],
      footer: { text: 'Nexus Marketplace • Creator Hub' },
      timestamp: new Date().toISOString()
    }]
  };

  sendToDiscord(url, payload);
}

/**
 * 💸 4. Notify on Creator Withdrawal Request
 */
async function notifyWithdrawalRequest(withdrawData) {
  const url = await getWebhookUrl('creator');
  if (!url) return;

  const payload = {
    username: 'Nexus Payout Bot',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '💸 มีคำขอแจ้งถอนเงินสดใหม่ (Withdrawal Request)',
      color: COLORS.WITHDRAW,
      description: `ผู้ขายขอถอนเงินรายได้ กรุณาดำเนินการโอนเงินเข้าบัญชีตามข้อมูลด้านล่าง:`,
      fields: [
        { name: '👤 ผู้ขอถอน', value: `\`${withdrawData.username}\``, inline: true },
        { name: '💰 จำนวนเงินที่ถอน', value: `**฿${Number(withdrawData.amount).toLocaleString()} บาท**`, inline: true },
        { name: '🏦 ธนาคาร / บริการ', value: withdrawData.bank_name, inline: true },
        { name: '💳 เลขที่บัญชี / พร้อมเพย์', value: `\`${withdrawData.account_number}\``, inline: true },
        { name: '📝 ชื่อบัญชี', value: `**${withdrawData.account_name}**`, inline: true },
        { name: '⏳ สถานะ', value: '🟡 รอแอดมินโอนเงินและกดยืนยัน', inline: false }
      ],
      footer: { text: 'Nexus Marketplace • Seller Payout System' },
      timestamp: new Date().toISOString()
    }]
  };

  sendToDiscord(url, payload);
}

/**
 * 🛡️ 5. Notify on Nexus Shield Threat Blocked
 */
async function notifySecurityAlert(threatData) {
  const url = await getWebhookUrl('security');
  if (!url) return;

  const payload = {
    username: 'Nexus Shield WAF',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '🚨 Nexus Shield: สกัดกั้นภัยคุกคามสำเร็จ (Threat Blocked)',
      color: COLORS.SECURITY,
      description: `ระบบตรวจจับและระงับการพยายามโจมตีเซิร์ฟเวอร์เรียบร้อยแล้ว`,
      fields: [
        { name: '🛡️ ประเภทภัยคุกคาม', value: `\`${threatData.threat_type || 'Malicious Request'}\``, inline: true },
        { name: '🌐 IP ผู้โจมตี', value: `\`${threatData.ip || 'Unknown'}\``, inline: true },
        { name: '🎯 ปลายทางที่พยายามเข้าถึง', value: `\`${threatData.endpoint || '/'}\``, inline: false },
        { name: '⚡ การจัดการ', value: '⛔ บล็อกการเชื่อมต่อและบันทึก IP ลงบัญชีดำชั่วคราว', inline: false }
      ],
      footer: { text: 'Nexus Shield WAF • 24/7 Server Defense' },
      timestamp: new Date().toISOString()
    }]
  };

  sendToDiscord(url, payload);
}

/**
 * 🔔 6. Test Webhook Connectivity
 */
async function sendTestNotification(webhookUrl) {
  const payload = {
    username: 'Nexus Store Bot',
    avatar_url: 'https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/logo.jpg',
    embeds: [{
      title: '🎉 เชื่อมต่อ Discord Webhook สำเร็จแล้ว!',
      color: COLORS.INFO,
      description: 'ระบบร้านค้า **Nexus SAMP Store** เชื่อมต่อกับ Discord Server ของคุณเรียบร้อยแล้ว ต่อจากนี้เมื่อมีคนซื้อของ, เติมเงิน หรือแจ้งถอนเงิน ข้อความจะแจ้งเตือนเข้ามาที่ห้องนี้แบบเรียลไทม์ครับ!',
      fields: [
        { name: '🌐 เว็บไซต์ร้านค้า', value: '[nexus-samp-store.onrender.com](https://nexus-samp-store-6f88.onrender.com)', inline: true },
        { name: '⚡ สถานะระบบ', value: '🟢 พร้อมใช้งาน 100%', inline: true }
      ],
      footer: { text: 'Nexus SAMP Store • Discord Integration' },
      timestamp: new Date().toISOString()
    }]
  };

  return sendToDiscord(webhookUrl, payload);
}

module.exports = {
  notifyOrder,
  notifyTopup,
  notifyCreatorSubmission,
  notifyWithdrawalRequest,
  notifySecurityAlert,
  sendTestNotification
};
