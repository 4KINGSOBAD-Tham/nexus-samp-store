require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionsBitField 
} = require('discord.js');

const botToken = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.on('ready', async () => {
  const guild = client.guilds.cache.first();
  console.log(`\n🚀 กำลังสร้างห้องคนเข้า-ออก แยกกันที่ด้านบน ในเซิร์ฟเวอร์: "${guild.name}"...`);

  const everyoneRole = guild.roles.everyone;

  // ค้นหาหมวดหมู่ "ข้อมูลร้านค้า" หรือหมวดหมู่บนสุด
  let infoCategory = guild.channels.cache.find(c => 
    c.type === ChannelType.GuildCategory && (c.name.includes('ข้อมูลร้านค้า') || c.name.includes('INFO'))
  );

  // 1. สร้างห้องคนเข้า: #👋┃ยินดีต้อนรับ
  let joinChannel = guild.channels.cache.find(c => c.name.includes('ยินดีต้อนรับ') || c.name.includes('welcome'));
  if (!joinChannel) {
    joinChannel = await guild.channels.create({
      name: '👋┃ยินดีต้อนรับ',
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : null,
      position: 1,
      topic: 'ยินดีต้อนรับสมาชิกใหม่เข้าสู่ Nexus SAMP Store',
      permissionOverwrites: [
        {
          id: everyoneRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [PermissionsBitField.Flags.SendMessages]
        }
      ]
    });
    console.log(`  ✅ สร้างห้องคนเข้า: #${joinChannel.name}`);
  } else {
    console.log(`  ℹ️ มีห้องคนเข้าอยู่แล้ว: #${joinChannel.name}`);
  }

  // 2. สร้างห้องคนออก: #🚪┃สมาชิกออก
  let leaveChannel = guild.channels.cache.find(c => c.name.includes('สมาชิกออก') || c.name.includes('leave') || c.name.includes('goodbye'));
  if (!leaveChannel) {
    leaveChannel = await guild.channels.create({
      name: '🚪┃สมาชิกออก',
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : null,
      position: 2,
      topic: 'บันทึกประวัติสมาชิกที่ออกจากเซิร์ฟเวอร์',
      permissionOverwrites: [
        {
          id: everyoneRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [PermissionsBitField.Flags.SendMessages]
        }
      ]
    });
    console.log(`  ✅ สร้างห้องคนออก: #${leaveChannel.name}`);
  } else {
    console.log(`  ℹ️ มีห้องคนออกอยู่แล้ว: #${leaveChannel.name}`);
  }

  console.log(`\n✨ ติดตั้งห้องคนเข้าและคนออกแยกกันเรียบร้อยแล้ว!`);
  process.exit(0);
});

client.login(botToken);
