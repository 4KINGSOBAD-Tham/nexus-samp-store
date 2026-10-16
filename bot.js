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

const botToken = process.env.DISCORD_BOT_TOKEN;

if (!botToken) {
  console.log('ℹ️ [Discord Bot] ไม่พบ DISCORD_BOT_TOKEN ใน .env (บอทต้อนรับจะยังไม่เริ่มทำงานจนกว่าจะใส่ Token)');
}

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
  console.log(`🤖 [Discord Bot] เข้าสู่ระบบสำเร็จในชื่อ: ${client.user.tag}`);
  
  // Set rich presence status
  client.user.setPresence({
    activities: [{ 
      name: '🛒 GTA SA-MP Scripts | 24/7 Auto Store', 
      type: ActivityType.Watching 
    }],
    status: 'online'
  });

  // Ensure Welcome Channel exists on all connected guilds
  for (const guild of client.guilds.cache.values()) {
    try {
      await ensureWelcomeChannel(guild);
    } catch (e) {
      console.warn(`[Discord Bot] Failed to check welcome channel in guild ${guild.name}:`, e.message);
    }
  }
});

/**
 * Ensure channel #👋┃ยินดีต้อนรับ exists in the guild
 */
async function ensureWelcomeChannel(guild) {
  let welcomeChannel = guild.channels.cache.find(c => 
    c.name.includes('ยินดีต้อนรับ') || c.name.toLowerCase().includes('welcome')
  );

  if (!welcomeChannel) {
    // Try to find the INFO category
    const infoCat = guild.channels.cache.find(c => 
      c.type === ChannelType.GuildCategory && (c.name.includes('INFO') || c.name.includes('ข้อมูลร้านค้า'))
    );

    try {
      welcomeChannel = await guild.channels.create({
        name: '👋┃ยินดีต้อนรับ',
        type: ChannelType.GuildText,
        parent: infoCat ? infoCat.id : null,
        position: 0,
        topic: 'ห้องต้อนรับสมาชิกใหม่เข้าสู่ Nexus SAMP Store'
      });
      console.log(`[Discord Bot] สร้างห้องต้อนรับใหม่: #${welcomeChannel.name} ในเซิร์ฟเวอร์ "${guild.name}" สำเร็จ!`);
    } catch (err) {
      console.warn('[Discord Bot] ไม่สามารถสร้างห้องต้อนรับอัตโนมัติได้:', err.message);
    }
  }

  return welcomeChannel;
}

// ----------------------------------------------------
// Event: Guild Member Add (New member joined)
// ----------------------------------------------------
client.on('guildMemberAdd', async (member) => {
  console.log(`👋 [Discord Bot] มีสมาชิกใหม่เข้าร่วม: ${member.user.tag} (ID: ${member.id})`);

  const guild = member.guild;

  // 1. 👑 Auto-Role: Assign "👤 สมาชิก (Member)" role
  try {
    const memberRole = guild.roles.cache.find(r => 
      r.name.includes('สมาชิก') || r.name.toLowerCase().includes('member')
    );
    if (memberRole) {
      await member.roles.add(memberRole);
      console.log(`  ✅ มอบยศ "${memberRole.name}" ให้ ${member.user.tag} สำเร็จ!`);
    } else {
      console.log('  ⚠️ ไม่พบยศ "👤 สมาชิก (Member)" ในเซิร์ฟเวอร์');
    }
  } catch (roleErr) {
    console.warn(`  ⚠️ มอบยศอัตโนมัติไม่สำเร็จ (อาจเกิดจากลำดับยศของบอทอยู่ต่ำกว่า):`, roleErr.message);
  }

  // 2. 🎯 Find Target Channel for Welcome Message
  let welcomeChannel = guild.channels.cache.find(c => 
    c.name.includes('ยินดีต้อนรับ') || c.name.toLowerCase().includes('welcome')
  );

  if (!welcomeChannel) {
    // Fallback to General chat channel
    welcomeChannel = guild.channels.cache.find(c => 
      c.name.includes('พูดคุยทั่วไป') || c.name.toLowerCase().includes('general')
    ) || guild.systemChannel;
  }

  // 3. 🎨 Build Welcome Embed
  const storeUrl = 'https://nexus-samp-store-6f88.onrender.com';
  const memberAvatar = member.user.displayAvatarURL({ dynamic: true, size: 256 });
  const rulesChannel = guild.channels.cache.find(c => c.name.includes('กฎระเบียบ'));
  const chatChannel = guild.channels.cache.find(c => c.name.includes('พูดคุยทั่วไป'));

  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x06b6d4) // Cyan Neon
    .setTitle(`🎉 ยินดีต้อนรับสู่ ${guild.name}!`)
    .setDescription(`สวัสดีคุณ <@${member.id}> เข้าสู่คอมมูนิตี้ร้านค้าสคริปต์อย่างเป็นทางการ!\nเราพร้อมส่งมอบระบบ GTA SA-MP คุณภาพสูง จัดส่งอัตโนมัติ 24 ชั่วโมง`)
    .setThumbnail(memberAvatar)
    .addFields(
      { name: '👤 ชื่อผู้ใช้', value: `\`${member.user.tag}\``, inline: true },
      { name: '🔢 สมาชิกลำดับที่', value: `**#${guild.memberCount}**`, inline: true },
      { name: '👑 ยศที่ได้รับ', value: `\`👤 สมาชิก (Member)\``, inline: true },
      { 
        name: '📜 แนะนำเบื้องต้น', 
        value: `• อ่านข้อตกลงและนโยบายที่ ${rulesChannel ? `<#${rulesChannel.id}>` : 'ห้องกฎระเบียบ'}\n• แลกเปลี่ยนความรู้หรือพูดคุยที่ ${chatChannel ? `<#${chatChannel.id}>` : 'ห้องพูดคุยทั่วไป'}\n• เลือกดูระบบสคริปต์ทั้งหมดได้ทางหน้าเว็บร้านค้า`, 
        inline: false 
      }
    )
    .setImage('https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/hero-banner.jpg')
    .setFooter({ 
      text: `${guild.name} • ยินดีต้อนรับสมาชิกทุกท่าน`, 
      iconURL: guild.iconURL({ dynamic: true }) || undefined 
    })
    .setTimestamp();

  // Action Buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🌐 เข้าสู่หน้าร้านค้า')
      .setStyle(ButtonStyle.Link)
      .setURL(storeUrl),
    new ButtonBuilder()
      .setLabel('💬 พูดคุยในเซิร์ฟเวอร์')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guild.id}/${chatChannel ? chatChannel.id : welcomeChannel?.id}`)
  );

  // Send to Channel
  if (welcomeChannel) {
    try {
      await welcomeChannel.send({
        content: `👋 ยินดีต้อนรับ <@${member.id}> เข้าสู่เซิร์ฟเวอร์ครับ!`,
        embeds: [welcomeEmbed],
        components: [row]
      });
      console.log(`  🎉 ส่งการ์ดต้อนรับเข้าห้อง #${welcomeChannel.name} เรียบร้อยแล้ว!`);
    } catch (msgErr) {
      console.warn(`  ⚠️ ไม่สามารถส่งข้อความเข้าห้อง #${welcomeChannel.name} ได้:`, msgErr.message);
    }
  }

  // 4. 📩 Send Direct Message (DM) to User
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981) // Emerald Green
      .setTitle(`🎮 ยินดีต้อนรับสู่ ${guild.name}!`)
      .setDescription(`ขอบคุณที่เข้าร่วมเซิร์ฟเวอร์ดิสคอร์ดของเราครับ!\nหากคุณกำลังมองหาระบบเซิร์ฟเวอร์ SA-MP, Gamemode คุณภาพสูง หรือระบบป้องกันแอนตี้ชีท สามารถเข้าชมหน้าร้านค้าออนไลน์ได้ตลอด 24 ชม.`)
      .addFields(
        { name: '🌐 ลิงก์หน้าร้าน', value: storeUrl },
        { name: '🎫 แจ้งปัญหา / สอบถาม', value: 'สามารถเปิดทิคเก็ตหรือแท็กติดต่อแอดมินในเซิร์ฟเวอร์ได้เลยครับ' }
      )
      .setFooter({ text: 'ขอให้สนุกกับการสร้างเซิร์ฟเวอร์ SA-MP!' });

    await member.send({ embeds: [dmEmbed] });
    console.log(`  📩 ส่งข้อความทักทาย DM ไปยัง ${member.user.tag} สำเร็จ!`);
  } catch (dmErr) {
    // Users often have DMs closed from server members, this is normal
    console.log(`  ℹ️ ไม่สามารถส่ง DM หา ${member.user.tag} ได้ (ผู้ใช้อาจปิดรับข้อความส่วนตัว)`);
  }
});

// Start Bot function
function startBot() {
  if (!botToken) {
    return;
  }
  client.login(botToken).catch(err => {
    console.error('❌ [Discord Bot] เข้าสู่ระบบล้มเหลว:', err.message);
  });
}

// Auto start if token exists
if (botToken) {
  startBot();
}

module.exports = {
  client,
  startBot
};
