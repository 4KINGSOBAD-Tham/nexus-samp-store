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
  intents: [GatewayIntentBits.Guilds]
});

client.on('ready', async () => {
  const guild = client.guilds.cache.first();
  console.log(`\n🚀 กำลังติดตั้งระบบ Ticket ในเซิร์ฟเวอร์: "${guild.name}"...`);

  // ค้นหาห้อง #ขอความช่วยเหลือ-แจ้งปัญหา
  const supportChannel = guild.channels.cache.find(c => 
    c.name.includes('ขอความช่วยเหลือ') || c.name.includes('แจ้งปัญหา') || c.id === '1560559070308470839'
  );

  if (!supportChannel) {
    console.error('❌ ไม่พบห้องขอความช่วยเหลือ');
    process.exit(1);
  }

  // ล้างข้อความเดิมของบอทในห้องเพื่อความสะอาด
  try {
    const messages = await supportChannel.messages.fetch({ limit: 10 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    for (const msg of botMessages.values()) {
      await msg.delete().catch(() => {});
    }
  } catch (e) {
    // ignore
  }

  // สร้าง Ticket Embed
  const ticketEmbed = new EmbedBuilder()
    .setColor(0x06b6d4)
    .setTitle('🎫 ศูนย์ช่วยเหลือ & เปิดตั๋วติดต่อทีมงาน (Nexus Support)')
    .setDescription(
      'ยินดีต้อนรับสู่ศูนย์บริการลูกค้า **Nexus SAMP Store** 🛒\n\n' +
      'หากคุณพบปัญหาการใช้งาน, ต้องการสอบถามข้อมูล, ติดตามยอดเงิน หรือต้องการสั่งทำสคริปต์เฉพาะตัว\n\n' +
      '👇 **คลิกปุ่ม "📩 เปิดตั๋วติดต่อแอดมิน" ด้านล่างนี้เพื่อสร้างห้องคุยส่วนตัวได้เลยครับ**'
    )
    .addFields(
      {
        name: '⏰ เวลาให้บริการ',
        value: '`เปิดรับเรื่องตลอด 24 ชั่วโมง (ทีมงานจะรีบเข้ามาตอบกลับโดยเร็วที่สุด)`',
        inline: false
      },
      {
        name: '📌 สิ่งที่ควรเตรียมแจ้งในตั๋ว',
        value: '• รายละเอียดปัญหา หรือระบบที่ต้องการสั่งทำ\n• รูปภาพหรือคลิปตัวอย่างประกอบ (ถ้ามี)\n• สลิปการโอนเงิน (กรณีแจ้งยอดเติมเงิน)',
        inline: false
      }
    )
    .setImage('https://raw.githubusercontent.com/4KINGSOBAD-Tham/nexus-samp-store/main/public/assets/banner.jpg')
    .setFooter({ text: 'Nexus SAMP Store • 24/7 Support Ticket System' })
    .setTimestamp();

  // สร้างปุ่มเปิดตั๋ว
  const ticketRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_create_ticket')
      .setLabel('📩 เปิดตั๋วติดต่อแอดมิน (Create Ticket)')
      .setStyle(ButtonStyle.Primary)
  );

  await supportChannel.send({
    embeds: [ticketEmbed],
    components: [ticketRow]
  });

  console.log(`✅ ติดตั้งแผง Ticket สำเร็จในห้อง: #${supportChannel.name}`);
  process.exit(0);
});

client.login(botToken);
