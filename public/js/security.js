/**
 * 🛡️ NEXUS SHIELD CLIENT SECURITY ENGINE
 * Full-spectrum Anti-Inspect, Anti-DevTools & Anti-Tampering Protection
 */

(function () {
  'use strict';

  // Security Toast Notification HUD
  function showShieldNotice(message) {
    let hud = document.getElementById('nexusShieldHud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'nexusShieldHud';
      hud.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
        border: 1px solid rgba(244, 63, 94, 0.55);
        color: #fff;
        padding: 12px 18px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 0.88rem;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(244, 63, 94, 0.35);
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateY(20px);
        opacity: 0;
        pointer-events: none;
      `;
      document.body.appendChild(hud);
    }

    hud.innerHTML = `
      <span style="font-size: 1.25rem;">🛡️</span>
      <div>
        <div style="color: #f43f5e; font-size: 0.76rem; letter-spacing: 0.5px; text-transform: uppercase;">NEXUS SHIELD DEFENSE</div>
        <div style="color: #f1f5f9; font-size: 0.84rem; margin-top: 1px;">${message}</div>
      </div>
    `;

    hud.style.transform = 'translateY(0)';
    hud.style.opacity = '1';

    if (window._shieldTimeout) clearTimeout(window._shieldTimeout);
    window._shieldTimeout = setTimeout(() => {
      hud.style.transform = 'translateY(20px)';
      hud.style.opacity = '0';
    }, 2800);
  }

  // 1. Anti Right-Click (Context Menu)
  document.addEventListener('contextmenu', (e) => {
    // Allow context menu only on inputs or textareas for paste/cut convenience
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    e.preventDefault();
    showShieldNotice('ปิดการใช้งานคลิกขวา เพื่อความปลอดภัยของระบบและลิขสิทธิ์สคริปต์');
  }, false);

  // 2. Anti Key Combinations (F12, Inspect, View Source, Save)
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = e.key ? e.key.toUpperCase() : '';
    const code = e.keyCode;

    // F12 (DevTools)
    if (code === 123 || key === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      showShieldNotice('ระบบป้องกัน F12 (DevTools Inspector) เปิดใช้งานอยู่');
      return false;
    }

    // Ctrl + Shift + I (Inspect)
    // Ctrl + Shift + J (Console)
    // Ctrl + Shift + C (Element Inspector)
    if (isCtrl && isShift && (key === 'I' || key === 'J' || key === 'C' || code === 73 || code === 74 || code === 67)) {
      e.preventDefault();
      e.stopPropagation();
      showShieldNotice('ระบบป้องกันการเปิด Inspect / Console ถูกบล็อก');
      return false;
    }

    // Ctrl + U (View Page Source)
    if (isCtrl && (key === 'U' || code === 85)) {
      e.preventDefault();
      e.stopPropagation();
      showShieldNotice('ปิดการเข้าถึงซอร์สโค้ดหน้าเว็บ (View Source Disabled)');
      return false;
    }

    // Ctrl + S (Save Webpage)
    if (isCtrl && (key === 'S' || code === 83)) {
      e.preventDefault();
      e.stopPropagation();
      showShieldNotice('ปิดการบันทึกหน้าเว็บออฟไลน์ (Save Webpage Disabled)');
      return false;
    }
  }, false);

  // 3. Prevent dragging images to desktop / downloads
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  }, false);

  // 4. Console Security Warning
  try {
    const style1 = 'color: #06b6d4; font-size: 24px; font-weight: 900; background: #0f172a; padding: 6px 14px; border-radius: 6px; border-left: 5px solid #06b6d4;';
    const style2 = 'color: #f43f5e; font-size: 14px; font-weight: bold; margin-top: 4px;';
    const style3 = 'color: #94a3b8; font-size: 12px;';

    console.log('%c🛡️ NEXUS SHIELD SECURITY SYSTEM', style1);
    console.log('%c⛔ คำเตือนด้านความปลอดภัยระดับสูงสุด (Full-Spectrum WAF & Anti-Tamper Active)', style2);
    console.log('%cหน้าร้านและระบบคำสั่งซื้อนี้มีระบบตรวจจับการดัดแปลงข้อมูล การโจมตี หรือพยายามขโมยสิทธิ์แบบเรียลไทม์\nการกระทำที่ผิดปกติจะถูกส่งบันทึก IP ไปยังแผงแอดมินทันที', style3);
  } catch (err) {}

  // Expose HUD notice trigger if needed
  window.nexusShieldNotice = showShieldNotice;
})();
