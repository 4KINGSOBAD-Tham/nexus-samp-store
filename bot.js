require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActivityType,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { db } = require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ----------------------------------------------------
// Event: Client Ready
// ----------------------------------------------------
client.once('ready', async () => {
  console.log(`🤖 [Discord Bot] Nexus Store Bot ออนไลน์แล้ว! (${client.user.tag})`);
  
  // Set Rich Status
  client.user.setPresence({
    activities: [{ 
      name: '🛒 GTA SA-MP Scripts | 24/7 Store', 
      type: ActivityType.Watching 
    }],
    status: 'online'
  });
});

// ----------------------------------------------------
// Event: Button Click (Interaction) - ระบบกดรับยศปลดล็อกห้อง
// ----------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'btn_verify_member') {
    try {
      const guild = interaction.guild;
      const member = interaction.member;

      // ค้นหายศ "👤 สมาชิก (Member)"
      const memberRole = guild.roles.cache.find(r => 
        r.name.includes('สมาชิก') || r.name.toLowerCase().includes('member')
      );

      if (!memberRole) {
        return await interaction.reply({
          content: '⚠️ เกิดข้อผิดพลาด: ไม่พบยศ "สมาชิก" ในระบบ กรุณาติดต่อแอดมินครับ',
          ephemeral: true
        });
      }

      // เช็คว่ามียศอยู่แล้วหรือไม่
      if (member.roles.cache.has(memberRole.id)) {
        return await interaction.reply({
          content: 'ℹ️ คุณมียศ **สมาชิก** และปลดล็อกห้องทั้งหมดเรียบร้อยแล้วครับ! เพลิดเพลินกับการเลือกซื้อสคริปต์ได้เลย 🎮',
          ephemeral: true
        });
      }

      // มอบยศสมาชิก
      await member.roles.add(memberRole);
      console.log(`[Discord Bot] ✅ มอบยศสมาชิกให้ ${member.user.tag} (ผ่านการกดยืนยันตัวตน)`);

      // ตอบกลับแบบส่วนตัว (เห็นแค่คนที่กดคนเดียว)
      await interaction.reply({
        content: `🎉 **ยืนยันตัวตนสำเร็จ!**\nยินดีต้อนรับคุณ <@${member.id}> สู่ **Nexus SAMP Store** อย่างเป็นทางการ!\nคุณได้รับยศ \`${memberRole.name}\` และปลดล็อกห้องทั้งหมดในเซิร์ฟเวอร์เรียบร้อยแล้วครับ 🛒✨`,
        ephemeral: true
      });

    } catch (err) {
      console.error('[Discord Bot] Error handling verify button:', err);
      if (!interaction.replied) {
        await interaction.reply({
          content: '⚠️ เกิดข้อผิดพลาดในการมอบยศ: ' + err.message,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

// ----------------------------------------------------
// Event: Guild Member Add (คนเข้าเซิร์ฟเวอร์ใหม่)
// ----------------------------------------------------
client.on('guildMemberAdd', async (member) => {
  console.log(`👋 [Discord Bot] มีสมาชิกใหม่เข้าเซิร์ฟเวอร์: ${member.user.tag} (ID: ${member.id})`);

  // ส่ง DM แนะนำให้ไปกดยืนยันตัวตนที่ห้อง #ยืนยันตัวตน
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`🎮 ยินดีต้อนรับสู่ ${member.guild.name}!`)
      .setDescription(`สวัสดีคุณ **${member.user.username}** ขอบคุณที่เข้าร่วมเซิร์ฟเวอร์ดิสคอร์ดของเราครับ!\n\n📌 **เริ่มต้นใช้งาน:**\nกรุณาไปที่ห้อง **\`#✅┃ยืนยันตัวตน\`** แล้วกดปุ่มสีเขียว **"ยืนยันตัวตน"** เพื่อรับยศสมาชิกและปลดล็อกห้องทั้งหมดในร้านค้านะครับ 🎉\n\n🌐 เว็บไซต์ร้านค้า: https://nexus-samp-store-6f88.onrender.com`)
      .setFooter({ text: 'Nexus SAMP Store • 24/7 Automated Delivery' });

    await member.send({ embeds: [dmEmbed] });
  } catch (e) {
    // ผู้ใช้ปิด DM เป็นเรื่องปกติ
  }
});

// Start Bot function
async function startBot() {
  try {
    let token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      const saved = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_bot_token']);
      if (saved && saved.value) {
        token = saved.value.trim();
      }
    }

    if (!token) {
      console.log('ℹ️ [Discord Bot] ไม่พบ Bot Token ทั้งใน .env และฐานข้อมูล');
      return;
    }

    client.login(token).catch(err => {
      console.error('❌ [Discord Bot] เข้าสู่ระบบล้มเหลว:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ [Discord Bot] Error in startBot:', err.message);
  }
}

startBot();

module.exports = {
  client,
  startBot
};
