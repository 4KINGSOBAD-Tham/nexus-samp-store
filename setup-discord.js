/**
 * Nexus SAMP Store - Discord Auto-Setup Tool
 * รันสคริปต์นี้เพื่อสร้างห้อง, หมวดหมู่, สิทธิ์ (Roles) และ Webhook เข้าเซิร์ฟเวอร์ Discord อัตโนมัติในคลิกเดียว!
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Supabase client (if configured)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const isSupabaseConfigured = supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder');
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

const dbPath = path.join(__dirname, 'store.db');
const localDb = new sqlite3.Database(dbPath);

async function saveSetting(key, value) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
    } catch (e) {
      console.warn('Supabase upsert warning:', e.message);
    }
  }
  return new Promise((resolve) => {
    localDb.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value],
      () => resolve()
    );
  });
}

// Discord REST API helper
async function discordApi(endpoint, token, method = 'GET', body = null) {
  const url = `https://discord.com/api/v10${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(`Discord API Error [${res.status}]: ${errorMsg}`);
  }
  return data;
}

// Server Structure Template
const BLUEPRINT = {
  roles: [
    { name: '👑 ผู้ดูแลระบบ (Owner/Admin)', color: 0xF43F5E, hoist: true, mentionable: true },
    { name: '💻 นักพัฒนาสคริปต์ (Creator)', color: 0x10B981, hoist: true, mentionable: true },
    { name: '💎 ลูกค้า VIP (Customer)', color: 0x06B6D4, hoist: true, mentionable: true },
    { name: '👤 สมาชิก (Member)', color: 0x94A3B8, hoist: false, mentionable: false }
  ],
  categories: [
    {
      name: '📢 ┃ ข้อมูลร้านค้า (INFO)',
      channels: [
        { name: '📢┃ข่าวสาร-อัปเดต', type: 0, topic: 'ข่าวสารและประกาศอัปเดตสคริปต์ใหม่ล่าสุดจาก Nexus SAMP Store' },
        { name: '📜┃กฎระเบียบร้าน', type: 0, topic: 'ข้อตกลงและนโยบายการใช้งานสคริปต์' },
        { name: '⭐┃รีวิวลูกค้า', type: 0, topic: 'รีวิวความประทับใจและผลงานจากผู้ใช้งานจริง' }
      ]
    },
    {
      name: '🛒 ┃ แจ้งเตือนสโตร์ (STORE ALERTS)',
      channels: [
        { name: '🔔┃แจ้งเตือนคำสั่งซื้อ', type: 0, topic: 'การแจ้งเตือนคำสั่งซื้อสคริปต์แบบ Real-time', isWebhookTarget: true },
        { name: '💰┃แจ้งเติมเงินสำเร็จ', type: 0, topic: 'ประวัติการเติมเงินและยืนยันสลิปผ่านระบบ SlipOK' }
      ]
    },
    {
      name: '💼 ┃ พื้นที่นักพัฒนา (CREATOR ZONE)',
      channels: [
        { name: '📝┃สคริปต์รอตรวจสอบ', type: 0, topic: 'แจ้งเตือนสคริปต์จาก Creator ที่รอแอดมินอนุมัติ' },
        { name: '💸┃คำขอถอนเงิน', type: 0, topic: 'แจ้งเตือนคำขอถอนเงินรายได้จากผู้ขายสคริปต์' }
      ]
    },
    {
      name: '🛡️ ┃ ระบบความปลอดภัย (SECURITY)',
      channels: [
        { name: '🚨┃nexus-shield-waf', type: 0, topic: 'ระบบดักจับและบล็อกสแกนเนอร์/แฮกเกอร์แบบ Real-time' }
      ]
    },
    {
      name: '🎫 ┃ ซัพพอร์ตและพูดคุย (COMMUNITY)',
      channels: [
        { name: '💬┃ห้องพูดคุยทั่วไป', type: 0, topic: 'พูดคุยแลกเปลี่ยนเรื่องระบบ SA-MP และสคริปต์ Pawn' },
        { name: '🎫┃ขอความช่วยเหลือ-แจ้งปัญหา', type: 0, topic: 'แจ้งปัญหาการใช้งานสคริปต์หรือสอบถามทีมงาน' }
      ]
    }
  ]
};

async function main() {
  console.log('====================================================');
  console.log('  🚀 NEXUS SAMP STORE - DISCORD AUTO SETUP TOOL     ');
  console.log('  เครื่องมือสร้างห้อง, บทบาท และเชื่อมต่อเว็บฮุกอัตโนมัติ  ');
  console.log('====================================================\n');

  try {
    let botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      console.log('💡 วิธีเอา Bot Token:');
      console.log('  1. ไปที่ https://discord.com/developers/applications');
      console.log('  2. สร้าง New Application -> ไปที่แท็บ "Bot" -> กด "Reset Token" แล้วคัดลอกมา');
      console.log('----------------------------------------------------');
      botToken = (await question('🔑 กรุณาวาง Discord Bot Token ของคุณ: ')).trim();
    }

    if (!botToken) {
      console.log('❌ ต้องระบุ Bot Token เพื่อดำเนินการต่อ');
      rl.close();
      return;
    }

    console.log('\n🔍 กำลังตรวจสอบ Bot Token...');
    const botUser = await discordApi('/users/@me', botToken);
    console.log(`✅ เชื่อมต่อบอทสำเร็จ: ${botUser.username}#${botUser.discriminator} (ID: ${botUser.id})\n`);

    console.log('💡 วิธีเอา Server ID (Guild ID):');
    console.log('  1. ใน Discord ไปที่ User Settings -> Advanced -> เปิด "Developer Mode"');
    console.log('  2. คลิกขวาที่ไอคอนเซิร์ฟเวอร์ดิสคอร์ดของคุณ -> กด "Copy Server ID"');
    console.log('----------------------------------------------------');
    const guildId = (await question('🏰 กรุณาวาง Server ID (Guild ID) ของเซิร์ฟเวอร์ที่คุณเชิญบอทเข้าแล้ว: ')).trim();

    if (!guildId) {
      console.log('❌ ต้องระบุ Server ID');
      rl.close();
      return;
    }

    console.log('\n🔍 กำลังดึงข้อมูลเซิร์ฟเวอร์...');
    const guild = await discordApi(`/guilds/${guildId}`, botToken);
    console.log(`✅ พบเซิร์ฟเวอร์: "${guild.name}" (สมาชิก: ${guild.approximate_member_count || 'N/A'})\n`);

    const confirm = await question(`⚠️ ยืนยันการสร้างหมวดหมู่, ห้อง และ Webhook เข้าเซิร์ฟเวอร์ "${guild.name}" หรือไม่? (y/n): `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('ยกเลิกการทำงาน');
      rl.close();
      return;
    }

    console.log('\n🛠️ กำลังเริ่มสร้างสิทธิ์ (Roles)...');
    for (const r of BLUEPRINT.roles) {
      try {
        await discordApi(`/guilds/${guildId}/roles`, botToken, 'POST', {
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable
        });
        console.log(`  + สร้าง Role: ${r.name}`);
      } catch (err) {
        console.log(`  - ข้าม Role ${r.name}: ${err.message}`);
      }
    }

    console.log('\n📁 กำลังสร้างหมวดหมู่และห้องแชต (Categories & Channels)...');
    let primaryWebhookUrl = null;
    let inviteChannelId = null;

    for (const cat of BLUEPRINT.categories) {
      // 1. Create Category (type 4 = GUILD_CATEGORY)
      console.log(`\n📂 หมวดหมู่: ${cat.name}`);
      let catChannel = null;
      try {
        catChannel = await discordApi(`/guilds/${guildId}/channels`, botToken, 'POST', {
          name: cat.name,
          type: 4
        });
      } catch (err) {
        console.log(`  ❌ สร้างหมวดหมู่ไม่สำเร็จ: ${err.message}`);
      }

      const parentId = catChannel ? catChannel.id : null;

      // 2. Create Channels inside category
      for (const ch of cat.channels) {
        try {
          const newCh = await discordApi(`/guilds/${guildId}/channels`, botToken, 'POST', {
            name: ch.name,
            type: ch.type || 0, // 0 = GUILD_TEXT
            parent_id: parentId,
            topic: ch.topic || ''
          });
          console.log(`  ✅ สร้างห้อง: #${ch.name}`);

          if (!inviteChannelId) {
            inviteChannelId = newCh.id;
          }

          // If target for webhook, create webhook!
          if (ch.isWebhookTarget && !primaryWebhookUrl) {
            console.log(`  🤖 กำลังสร้าง Webhook อัตโนมัติในห้อง #${ch.name}...`);
            try {
              const hook = await discordApi(`/channels/${newCh.id}/webhooks`, botToken, 'POST', {
                name: 'Nexus Store Notifier'
              });
              primaryWebhookUrl = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
              console.log(`  🎉 สร้าง Webhook สำเร็จแล้ว!`);
            } catch (hookErr) {
              console.log(`  ⚠️ ไม่สามารถสร้าง Webhook ได้: ${hookErr.message}`);
            }
          }
        } catch (chErr) {
          console.log(`  ❌ ไม่สามารถสร้างห้อง #${ch.name}: ${chErr.message}`);
        }
      }
    }

    // Create Instant Invite Link
    let inviteUrl = null;
    if (inviteChannelId) {
      try {
        const inv = await discordApi(`/channels/${inviteChannelId}/invites`, botToken, 'POST', {
          max_age: 0, // unlimited
          max_uses: 0 // unlimited
        });
        inviteUrl = `https://discord.gg/${inv.code}`;
        console.log(`\n🔗 สร้างลิงก์เชิญเซิร์ฟเวอร์แบบถาวรสำเร็จ: ${inviteUrl}`);
      } catch (invErr) {
        console.log(`\n⚠️ ไม่สามารถสร้าง invite link อัตโนมัติได้: ${invErr.message}`);
      }
    }

    // Auto-save to Store Database
    if (primaryWebhookUrl) {
      console.log('\n💾 กำลังบันทึกการตั้งค่า Webhook เข้าฐานข้อมูลร้านค้าของคุณ...');
      await saveSetting('discord_webhook_main', primaryWebhookUrl);
      if (inviteUrl) {
        await saveSetting('discord_invite_url', inviteUrl);
      }
      console.log('✅ บันทึกเข้าเว็บร้านค้าเรียบร้อยแล้ว! ระบบแจ้งเตือนจะเริ่มทำงานทันที');
    }

    console.log('\n====================================================');
    console.log('  🎉 ตั้งค่าเซิร์ฟเวอร์ DISCORD เสร็จสมบูรณ์แล้ว!    ');
    console.log('====================================================');
    if (primaryWebhookUrl) {
      console.log(`📌 Discord Webhook URL:`);
      console.log(`   ${primaryWebhookUrl}\n`);
    }
    if (inviteUrl) {
      console.log(`📌 Invite Link:`);
      console.log(`   ${inviteUrl}\n`);
    }
    console.log('คุณสามารถเปิดหน้าร้านค้าของคุณแล้วทดสอบซื้อสคริปต์หรือเติมเงิน');
    console.log('ข้อความจะแจ้งเตือนเด้งเข้าห้องใน Discord ของคุณแบบ Real-time ทันทีครับ!\n');

  } catch (err) {
    console.error('\n❌ เกิดข้อผิดพลาด:', err.message);
  } finally {
    rl.close();
    localDb.close();
  }
}

main();
