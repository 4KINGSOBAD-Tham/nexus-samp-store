const QRCode = require('qrcode');

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTag(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePromptPayPayload(target, amount = null) {
  // Clean phone number or national ID
  const cleaned = target.replace(/[^0-9]/g, '');
  let targetType = '01'; // 01 for mobile, 02 for citizen ID
  let formattedTarget = cleaned;

  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    // Mobile number: convert 0812345678 to 0066812345678
    formattedTarget = '0066' + cleaned.substring(1);
    targetType = '01';
  } else if (cleaned.length === 13) {
    // National ID
    targetType = '02';
  }

  const subTag = formatTag(targetType, formattedTarget);
  const tag29 = formatTag('00', 'A000000677010111') + subTag;

  let payload = '';
  payload += formatTag('00', '01'); // Version
  payload += formatTag('01', amount ? '12' : '11'); // 11=Static, 12=Dynamic
  payload += formatTag('29', tag29); // Merchant Account
  payload += formatTag('53', '764'); // THB Currency
  if (amount && Number(amount) > 0) {
    payload += formatTag('54', Number(amount).toFixed(2));
  }
  payload += formatTag('58', 'TH'); // Country code

  // Add CRC tag
  const partial = payload + '6304';
  const checksum = crc16(partial);
  return partial + checksum;
}

async function generatePromptPayQR(target, amount = null) {
  const payload = generatePromptPayPayload(target, amount);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 2,
    width: 320,
    color: {
      dark: '#00263e',
      light: '#ffffff'
    }
  });
  return {
    payload,
    qrDataUrl
  };
}

function generateBankQRPayload(bankCode = '014', accountNo = '5632881610', amount = null) {
  const cleanedAcc = accountNo.replace(/[^0-9]/g, '');
  const cleanedBank = String(bankCode).padStart(3, '0');
  const targetValue = cleanedBank + cleanedAcc;
  const subTag = formatTag('04', targetValue);
  const tag29 = formatTag('00', 'A000000677010111') + subTag;

  let payload = '';
  payload += formatTag('00', '01'); // Version
  payload += formatTag('01', amount ? '12' : '11');
  payload += formatTag('29', tag29);
  payload += formatTag('53', '764');
  if (amount && Number(amount) > 0) {
    payload += formatTag('54', Number(amount).toFixed(2));
  }
  payload += formatTag('58', 'TH');

  const partial = payload + '6304';
  const checksum = crc16(partial);
  return partial + checksum;
}

async function generateBankQR(target = '0816302510', amount = null) {
  // Use universal Thai QR Payment standard accepted by all Thai mobile banking apps (SCB, K-Bank, Krungthai, etc.)
  const payload = generatePromptPayPayload(target, amount);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 2,
    width: 320,
    color: {
      dark: '#2A1747',
      light: '#ffffff'
    }
  });
  return {
    payload,
    qrDataUrl
  };
}

module.exports = {
  generatePromptPayPayload,
  generatePromptPayQR,
  generateBankQRPayload,
  generateBankQR
};
