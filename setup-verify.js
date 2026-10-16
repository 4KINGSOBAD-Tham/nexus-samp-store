require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionsBitField, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

const botToken = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.on('ready', async () => {
  const guild = client.guilds.cache.first();
  console.log(`\n🚀 กำลังตั้งค่าระบบยืนยันตัวตนในเซิร์ฟเวอร์: "${guild.name}"...`);

  const everyoneRole = guild.roles.everyone;
  const memberRole = guild.roles.cache.find(r => r.name.includes('สมาชิก'));
  const adminRole = guild.roles.cache.find(r => r.name.includes('ผู้ดูแลระบบ'));

  if (!memberRole) {
    console.error('❌ ไม่พบยศ "👤 สมาชิก (Member)" ในเซิร์ฟเวอร์');
    process.exit(1);
  }

  // 1. ตรวจสอบหรือสร้างห้องยืนยันตัวตน #✅┃ยืนยันตัวตน
  let verifyChannel = guild.channels.cache.find(c => c.name.includes('ยืนยันตัวตน') || c.name.includes('verify'));
  if (!verifyChannel) {
    verifyChannel = await guild.channels.create({
      name: '✅┃ยืนยันตัวตน',
      type: ChannelType.GuildText,
      position: 0,
      topic: 'กดปุ่มด้านล่างเพื่อรับยศและปลดล็อกห้องทั้งหมดในเซิร์ฟเวอร์',
      permissionOverwrites: [
        {
          id: everyoneRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [PermissionsBitField.Flags.SendMessages]
        },
        {
          id: memberRole.id,
          deny: [PermissionsBitField.Flags.ViewChannel] // ซ่อนห้องนี้เมื่อได้ยศสมาชิกแล้ว
        }
      ]
    });
    console.log(`  ✅ สร้างห้อง: #${verifyChannel.name}`);
  } else {
    await verifyChannel.permissionOverwrites.set([
      {
        id: everyoneRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
        deny: [PermissionsBitField.Flags.SendMessages]
      },
      {
        id: memberRole.id,
        deny: [PermissionsBitField.Flags.ViewChannel] // ซ่อนห้องนี้เมื่อได้ยศสมาชิกแล้ว
      }
    ]);
    console.log(`  ✅ อัปเดตสิทธิ์ห้อง: #${verifyChannel.name}`);
  }

  // 2. ล็อกหมวดหมู่หลัก ให้ @everyone มองไม่เห็น (แต่ยศ "สมาชิก" มองเห็น)
  const categoriesToLock = ['ข้อมูลร้านค้า', 'แจ้งเตือนสโตร์', 'ซัพพอร์ตและพูดคุย'];
  for (const catName of categoriesToLock) {
    const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes(catName));
    if (cat) {
      await cat.permissionOverwrites.set([
        {
          id: everyoneRole.id,
          deny: [PermissionsBitField.Flags.ViewChannel] // คนยังไม่กดยืนยัน จะไม่เห็นห้องเลย!
        },
        {
          id: memberRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory] // สมาชิกมองเห็น
        }
      ]);
      console.log(`  🔒 ล็อกหมวดหมู่สำหรับคนยังไม่ยืนยันตัวตน: "${cat.name}"`);
    }
  }

  // 3. ส่งกล่องข้อความยืนยันตัวตน (Verification Embed)
  const messages = await verifyChannel.messages.fetch({ limit: 10 });
  if (messages.size > 0) {
    await verifyChannel.bulkDelete(messages).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x10B981) // Emerald Green
    .setTitle('🛡️ ยืนยันตัวตนเข้าสู่เซิร์ฟเวอร์ Nexus SAMP Store')
    .setDescription('ยินดีต้อนรับทุกท่านเข้าสู่คอมมูนิตี้และร้านค้าสคริปต์ **Nexus SAMP Store** อย่างเป็นทางการ!\n\nโปรดกดปุ่ม **"✅ ยืนยันตัวตน / รับยศปลดล็อกห้อง"** สีเขียวด้านล่างนี้ เพื่อรับยศสมาชิกและปลดล็อกการเข้าถึงห้องทั้งหมดในเซิร์ฟเวอร์ครับ 🎉')
    .addFields(
      { 
        name: '📜 กฎระเบียบเบื้องต้น', 
        value: '• โปรดสุภาพและให้เกียรติสมาชิกท่านอื่น\n• ห้ามสแปมข้อความหรือส่งลิงก์ไวรัส/โฆษณาโดยไม่ได้รับอนุญาต\n• สอบถามหรือแจ้งปัญหาสคริปต์ได้ที่ห้องซัพพอร์ต', 
        inline: false 
      },
      { 
        name: '🛒 เว็บไซต์ร้านค้าออนไลน์', 
        value: '[คลิกเพื่อเข้าสู่หน้าร้านค้า](https://nexus-samp-store-6f88.onrender.com)', 
        inline: false 
      }
    )
    .setImage('https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/hero-banner.jpg')
    .setFooter({ text: 'Nexus SAMP Store • Automated Verification System' })
    .setTimestamp();

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_verify_member')
      .setLabel('✅ ยืนยันตัวตน / รับยศปลดล็อกห้อง')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('🌐 เยี่ยมชมร้านค้า')
      .setStyle(ButtonStyle.Link)
      .setURL('https://nexus-samp-store-6f88.onrender.com')
  );

  await verifyChannel.send({
    embeds: [embed],
    components: [buttonRow]
  });

  console.log(`\n🎉 ตั้งค่าระบบยืนยันตัวตนเสร็จสมบูรณ์ 100%!`);
  process.exit(0);
});

client.login(botToken);
