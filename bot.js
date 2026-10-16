require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  try { dns.setDefaultResultOrder('ipv4first'); } catch(e) {}
}
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
let botDiagnostics = {
  tokenSource: 'none',
  tokenPrefix: null,
  loginAttempted: false,
  loginSuccess: false,
  readyEventFired: false,
  error: null
};

const onReady = async () => {
  botDiagnostics.readyEventFired = true;
  console.log(`🤖 [Discord Bot] Nexus Store Bot ออนไลน์แล้ว! (${client.user.tag})`);
  
  // Set Rich Status
  client.user.setPresence({
    activities: [{ 
      name: '🛒 GTA SA-MP Scripts | 24/7 Store', 
      type: ActivityType.Watching 
    }],
    status: 'online'
  });
};

client.once('ready', onReady);
client.once('clientReady', onReady);

client.on('error', (err) => {
  botDiagnostics.error = 'client_error: ' + err.message;
  console.error('[Discord Bot Client Error]', err);
});

client.on('shardError', (err, shardId) => {
  botDiagnostics.error = `shard_${shardId}_error: ` + err.message;
  console.error(`[Discord Bot Shard ${shardId} Error]`, err);
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

  // ----------------------------------------------------
  // 🎫 ระบบเปิดตั๋ว (Create Ticket)
  // ----------------------------------------------------
  if (interaction.customId === 'btn_create_ticket') {
    try {
      const guild = interaction.guild;
      const member = interaction.member;

      // ตรวจสอบว่ามีห้องตั๋วเปิดค้างไว้อยู่แล้วหรือไม่
      const existingChannel = guild.channels.cache.find(ch => 
        ch.name === `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` ||
        (ch.topic && ch.topic === `ticket_owner_${member.id}`)
      );

      if (existingChannel) {
        return await interaction.reply({
          content: `⚠️ คุณมีห้องตั๋วที่เปิดค้างไว้อยู่แล้วครับ: <#${existingChannel.id}> กรุณาใช้ห้องเดิมก่อนเปิดใหม่ครับ`,
          ephemeral: true
        });
      }

      // ค้นหายศ Admin เพื่อให้สิทธิ์เห็นห้องตั๋ว
      const adminRole = guild.roles.cache.find(r => 
        r.name.includes('ผู้ดูแลระบบ') || r.name.toLowerCase().includes('admin') || r.name.toLowerCase().includes('owner')
      );

      // ค้นหาหมวดหมู่ "ซัพพอร์ตและพูดคุย" หรือหมวดหมู่ตั๋ว
      let category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && (c.name.includes('ซัพพอร์ต') || c.name.includes('COMMUNITY') || c.name.includes('TICKET'))
      );

      // สร้างห้องข้อความส่วนตัวเฉพาะสมาชิกและแอดมิน
      const cleanUsername = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'member';
      const ticketChannel = await guild.channels.create({
        name: `ticket-${cleanUsername}`,
        type: ChannelType.GuildText,
        parent: category ? category.id : null,
        topic: `ticket_owner_${member.id}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.EmbedLinks
            ]
          },
          ...(adminRole ? [{
            id: adminRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels
            ]
          }] : []),
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageChannels
            ]
          }
        ]
      });

      // ส่งข้อความต้อนรับและปุ่มปิดตั๋วในห้องใหม่
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle(`🎫 ยินดีต้อนรับสู่ห้องตั๋วช่วยเหลือ | Ticket`)
        .setDescription(`สวัสดีครับ <@${member.id}> ยินดีต้อนรับสู่ห้องตั๋วติดต่อทีมงาน **Nexus SAMP Store**!\n\n📌 **กรุณาพิมพ์รายละเอียดทิ้งไว้ได้เลยครับ:**\n• ปัญหาการใช้งาน หรือระบบที่พบปัญหา\n• ปัญหาการเติมเงิน / ชำระเงิน (แนบรูปสลิป)\n• สั่งทำหรือสอบถามเกี่ยวกับสคริปต์ส่วนตัว\n\nทีมงาน ${adminRole ? `<@&${adminRole.id}>` : 'แอดมิน'} จะรีบเข้ามาตอบกลับและดูแลให้โดยเร็วที่สุดครับ!`)
        .setFooter({ text: 'Nexus Support System • กดปุ่มด้านล่างเพื่อปิดตั๋วเมื่อเสร็จสิ้น' })
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_close_ticket')
          .setLabel('🔒 ปิดห้องตั๋ว (Close Ticket)')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `👋 สวัสดีครับ <@${member.id}> ${adminRole ? `<@&${adminRole.id}>` : ''}`,
        embeds: [welcomeEmbed],
        components: [closeRow]
      });

      await interaction.reply({
        content: `✅ เปิดห้องตั๋วเรียบร้อยแล้วครับ: <#${ticketChannel.id}> (คลิกเข้าไปพูดคุยได้เลย)`,
        ephemeral: true
      });

      console.log(`[Discord Bot] 🎫 สร้างห้องตั๋ว ${ticketChannel.name} ให้กับ ${member.user.tag}`);

    } catch (err) {
      console.error('[Discord Bot] Error creating ticket:', err);
      if (!interaction.replied) {
        await interaction.reply({
          content: '⚠️ เกิดข้อผิดพลาดในการเปิดห้องตั๋ว: ' + err.message,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }

  // ----------------------------------------------------
  // 🔒 ระบบปิดตั๋ว (Close Ticket)
  // ----------------------------------------------------
  if (interaction.customId === 'btn_close_ticket') {
    try {
      const channel = interaction.channel;
      if (!channel.name.startsWith('ticket-')) {
        return await interaction.reply({
          content: '⚠️ ปุ่มนี้ใช้งานได้เฉพาะในห้องตั๋วเท่านั้นครับ',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `🔒 **ห้องตั๋วนี้กำลังจะถูกปิดและลบภายใน 5 วินาที...**\nขอบคุณที่ใช้บริการ **Nexus SAMP Store** ครับ!`
      });

      console.log(`[Discord Bot] 🔒 ปิดห้องตั๋ว ${channel.name} โดย ${interaction.user.tag}`);

      setTimeout(async () => {
        await channel.delete().catch(e => console.warn('Could not delete ticket channel:', e.message));
      }, 5000);

    } catch (err) {
      console.error('[Discord Bot] Error closing ticket:', err);
    }
  }
});

// ----------------------------------------------------
// Event: Guild Member Add (คนเข้าเซิร์ฟเวอร์ใหม่)
// ----------------------------------------------------
client.on('guildMemberAdd', async (member) => {
  console.log(`👋 [Discord Bot] มีสมาชิกใหม่เข้าเซิร์ฟเวอร์: ${member.user.tag} (ID: ${member.id})`);

  const guild = member.guild;

  // 1. ส่งข้อความต้อนรับลงห้อง #👋┃ยินดีต้อนรับ
  try {
    const welcomeChannel = guild.channels.cache.find(c => 
      c.name.includes('ยินดีต้อนรับ') || c.name.includes('welcome')
    );

    const verifyChannel = guild.channels.cache.find(c => 
      c.name.includes('ยืนยันตัวตน') || c.name.includes('verify')
    );

    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle(`🎉 ยินดีต้อนรับสู่ ${guild.name}!`)
        .setDescription(
          `สวัสดีคุณ <@${member.id}> (\`${member.user.tag}\`) ยินดีต้อนรับเข้าสู่คอมมูนิตี้ **Nexus SAMP Store** อย่างเป็นทางการครับ! 🎮✨\n\n` +
          `📌 **เริ่มต้นใช้งาน:**\n` +
          `• กรุณาไปที่ห้อง ${verifyChannel ? `<#${verifyChannel.id}>` : '`#✅┃ยืนยันตัวตน`'} เพื่อกดปุ่มรับยศสมาชิก\n` +
          `• ชมเว็บสโตร์สคริปต์ได้ที่: https://nexus-samp-store-6f88.onrender.com\n` +
          `• ติดต่อทีมงานได้ที่ห้อง <#1560559070308470839>`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields({
          name: '👥 ลำดับสมาชิก',
          value: `คุณเป็นสมาชิกคนที่ **#${guild.memberCount}** ของเรา`,
          inline: true
        })
        .setImage('https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/banner.jpg')
        .setFooter({ text: 'Nexus SAMP Store • 24/7 Automated Delivery' })
        .setTimestamp();

      await welcomeChannel.send({
        content: `👋 ยินดีต้อนรับคุณ <@${member.id}> เข้าสู่เซิร์ฟเวอร์ครับ!`,
        embeds: [welcomeEmbed]
      });
    }
  } catch (err) {
    console.error('[Discord Bot] Error sending welcome message:', err);
  }

  // 2. ส่ง DM แนะนำแบบส่วนตัว
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`🎮 ยินดีต้อนรับสู่ ${guild.name}!`)
      .setDescription(`สวัสดีคุณ **${member.user.username}** ขอบคุณที่เข้าร่วมเซิร์ฟเวอร์ดิสคอร์ดของเราครับ!\n\n📌 **เริ่มต้นใช้งาน:**\nกรุณาไปที่ห้อง **\`#✅┃ยืนยันตัวตน\`** แล้วกดปุ่มสีเขียว **"ยืนยันตัวตน"** เพื่อรับยศสมาชิกและปลดล็อกห้องทั้งหมดในร้านค้านะครับ 🎉\n\n🌐 เว็บไซต์ร้านค้า: https://nexus-samp-store-6f88.onrender.com`)
      .setFooter({ text: 'Nexus SAMP Store • 24/7 Automated Delivery' });

    await member.send({ embeds: [dmEmbed] });
  } catch (e) {
    // ผู้ใช้ปิด DM เป็นเรื่องปกติ
  }
});

// ----------------------------------------------------
// Event: Guild Member Remove (คนออกจากเซิร์ฟเวอร์)
// ----------------------------------------------------
client.on('guildMemberRemove', async (member) => {
  console.log(`🚪 [Discord Bot] มีสมาชิกออกจากเซิร์ฟเวอร์: ${member.user.tag} (ID: ${member.id})`);

  const guild = member.guild;

  // ส่งแจ้งเตือนลงห้อง #🚪┃สมาชิกออก
  try {
    const leaveChannel = guild.channels.cache.find(c => 
      c.name.includes('สมาชิกออก') || c.name.includes('leave') || c.name.includes('goodbye')
    );

    if (leaveChannel) {
      const leaveEmbed = new EmbedBuilder()
        .setColor(0xf43f5e)
        .setTitle('🚪 สมาชิกออกจากเซิร์ฟเวอร์')
        .setDescription(`**${member.user.tag}** (<@${member.id}>) ได้ออกจากเซิร์ฟเวอร์ไปแล้ว`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields({
          name: '👥 สมาชิกคงเหลือ',
          value: `เหลือสมาชิกทั้งหมด **${guild.memberCount}** คน`,
          inline: true
        })
        .setFooter({ text: 'Nexus SAMP Store • Member Activity Log' })
        .setTimestamp();

      await leaveChannel.send({ embeds: [leaveEmbed] });
    }
  } catch (err) {
    console.error('[Discord Bot] Error sending leave message:', err);
  }
});

// Start Bot function
async function startBot() {
  try {
    let token = process.env.DISCORD_BOT_TOKEN;
    if (token) {
      botDiagnostics.tokenSource = 'env';
    } else {
      const saved = await db.get('SELECT value FROM site_settings WHERE key = ?', ['discord_bot_token']);
      if (saved && saved.value) {
        token = saved.value.trim();
        botDiagnostics.tokenSource = 'database';
      }
    }

    if (!token) {
      botDiagnostics.error = 'No bot token found in env or database';
      console.log('ℹ️ [Discord Bot] ไม่พบ Bot Token ทั้งใน .env และฐานข้อมูล');
      return;
    }

    botDiagnostics.tokenPrefix = token.substring(0, 10);
    botDiagnostics.loginAttempted = true;

    console.log(`[Discord Bot] กำลังเชื่อมต่อ Discord Gateway... (Token prefix: ${token.substring(0, 10)}...)`);
    client.login(token).then(() => {
      botDiagnostics.loginSuccess = true;
      console.log('[Discord Bot] client.login สำเร็จ กำลังรอ Event Ready...');
    }).catch(err => {
      botDiagnostics.error = err.message;
      console.error('❌ [Discord Bot] เข้าสู่ระบบล้มเหลว:', err.message);
    });
  } catch (err) {
    botDiagnostics.error = err.message;
    console.warn('⚠️ [Discord Bot] Error in startBot:', err.message);
  }
}

startBot();

module.exports = {
  client,
  startBot,
  botDiagnostics
};
