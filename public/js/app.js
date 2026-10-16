/**
 * Nexus SAMP Store - Frontend Application
 * Clean, modern e-commerce logic with full Admin Script Management (Add & Delete)
 */

const state = {
  user: null,
  token: localStorage.getItem('samp_token') || null,
  products: [],
  categories: [],
  currentCategory: 'all',
  searchQuery: '',
  sortBy: 'latest'
};

// API Helper
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, { ...options, headers });
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' };
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : '⚠️'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// View Navigation Switcher
function switchView(viewName) {
  if (viewName === 'home') viewName = 'store';

  document.querySelectorAll('.app-view').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.style.display = 'block';
  }

  const activeLink = document.querySelector(`.nav-link[data-view="${viewName}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'orders') {
    loadUserOrders();
  } else if (viewName === 'topup') {
    loadTopupHistory();
  } else if (viewName === 'creator') {
    loadCreatorDashboard();
  } else if (viewName === 'admin') {
    loadAdminProducts();
    loadAdminMarketplacePending();
    loadAdminWithdrawals();
    loadSecurityDashboard();
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupTopup();
  setupAdminForm();
  setupCreatorMarketplace();

  await checkAuth();
  await loadProducts();

  const hash = window.location.hash.replace('#', '') || 'store';
  switchView(hash);
});

// Setup Navigation Events
function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const view = btn.getAttribute('data-view');
      window.location.hash = view;
      switchView(view);
    });
  });
}

// ----------------------------------------------------
// Authentication System
// ----------------------------------------------------
async function checkAuth() {
  if (!state.token) {
    renderUserNav();
    return;
  }

  const res = await api('/api/auth/me');
  if (res.success && res.user) {
    state.user = res.user;
    renderUserNav();
  } else {
    state.token = null;
    state.user = null;
    localStorage.removeItem('samp_token');
    renderUserNav();
  }
}

function renderUserNav() {
  const navAuth = document.getElementById('navAuth');
  const adminLink = document.getElementById('navAdminLink');
  const creatorLink = document.getElementById('navCreatorLink');
  if (!navAuth) return;

  // Show/Hide Admin Nav Button
  if (state.user && state.user.role === 'admin') {
    if (adminLink) adminLink.style.display = 'flex';
  } else {
    if (adminLink) adminLink.style.display = 'none';
  }

  // Show/Hide Creator Nav Button
  if (state.user) {
    if (creatorLink) creatorLink.style.display = 'flex';
  } else {
    if (creatorLink) creatorLink.style.display = 'none';
  }

  if (state.user) {
    navAuth.innerHTML = `
      <div class="user-badge" id="userMenuToggle">
        <div class="user-avatar-circle">${state.user.role === 'admin' ? '👑' : '👤'}</div>
        <div>
          <div class="user-name">${state.user.username}</div>
          <div class="user-balance-pill">฿ ${Number(state.user.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
          ${Number(state.user.seller_balance || 0) > 0 ? `
            <div style="font-size: 0.72rem; color: var(--accent-emerald); font-weight: 700; margin-top: 1px;">
              รายได้: ฿${Number(state.user.seller_balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          ` : ''}
        </div>
        <div class="user-dropdown" id="userDropdown">
          <a class="dropdown-item" href="#topup" data-view="topup">💳 เติมเงิน</a>
          <a class="dropdown-item" href="#orders" data-view="orders">📦 สคริปต์ของฉัน</a>
          <a class="dropdown-item" href="#creator" data-view="creator" style="color: var(--accent-emerald);">💼 ฝากขายสคริปต์ (Creator)</a>
          ${state.user.role === 'admin' ? `
            <a class="dropdown-item" href="#admin" data-view="admin" style="color: var(--accent-rose); font-weight: 600;">
              👑 จัดการสคริปต์ (Admin)
            </a>
          ` : ''}
          <div style="height: 1px; background: var(--border-subtle); margin: 3px 0;"></div>
          <a class="dropdown-item" href="#" id="logoutBtn" style="color: var(--accent-rose);">🚪 ออกจากระบบ</a>
        </div>
      </div>
    `;

    const toggle = document.getElementById('userMenuToggle');
    const dropdown = document.getElementById('userDropdown');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      if (dropdown) dropdown.style.display = 'none';
    });

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });

    navAuth.querySelectorAll('[data-view]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const v = link.getAttribute('data-view');
        window.location.hash = v;
        switchView(v);
      });
    });

  } else {
    navAuth.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="openAuthModal('register')">สมัครสมาชิก</button>
      <button class="btn btn-primary btn-sm" onclick="openAuthModal('login')">เข้าสู่ระบบ</button>
    `;
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('samp_token');
  renderUserNav();
  showToast('ออกจากระบบเรียบร้อยแล้ว');
  switchView('store');
}

// Auth Forms
function setupModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  const authTabLogin = document.getElementById('authTabLogin');
  const authTabRegister = document.getElementById('authTabRegister');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');

  if (authTabLogin && authTabRegister) {
    authTabLogin.addEventListener('click', () => {
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
      authTabLogin.classList.remove('btn-secondary');
      authTabLogin.classList.add('btn-primary');
      authTabRegister.classList.remove('btn-primary');
      authTabRegister.classList.add('btn-secondary');
    });

    authTabRegister.addEventListener('click', () => {
      formLogin.style.display = 'none';
      formRegister.style.display = 'block';
      authTabRegister.classList.remove('btn-secondary');
      authTabRegister.classList.add('btn-primary');
      authTabLogin.classList.remove('btn-primary');
      authTabLogin.classList.add('btn-secondary');
    });
  }

  // Handle Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;

      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (res.success) {
        state.token = res.token;
        state.user = res.user;
        localStorage.setItem('samp_token', res.token);
        renderUserNav();
        closeModal('authModal');
        showToast(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับคุณ ${res.user.username}`);
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // Handle Register
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('regUsername').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;

      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      });

      if (res.success) {
        state.token = res.token;
        state.user = res.user;
        localStorage.setItem('samp_token', res.token);
        renderUserNav();
        closeModal('authModal');
        showToast(res.message);
      } else {
        showToast(res.message, 'error');
      }
    });
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openAuthModal(mode = 'login') {
  openModal('authModal');
  if (mode === 'register') {
    document.getElementById('authTabRegister').click();
  } else {
    document.getElementById('authTabLogin').click();
  }
}

// ----------------------------------------------------
// Store & Products System
// ----------------------------------------------------
async function loadProducts() {
  let url = `/api/products?sort=${state.sortBy}`;
  if (state.searchQuery) {
    url += `&search=${encodeURIComponent(state.searchQuery)}`;
  }

  const res = await api(url);
  if (res.success) {
    state.products = res.products;
    renderProducts();

    const countStat = document.getElementById('statProdCount');
    if (countStat) countStat.textContent = state.products.length;
  }
}

function renderProducts() {
  const grid = document.getElementById('storeProductsGrid');
  if (!grid) return;

  if (state.products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4.5rem 1.5rem; background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); margin-top: 1rem;">
        <div style="font-size: 2.8rem; margin-bottom: 0.75rem;">📦</div>
        <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 0.4rem;">ยังไม่มีสคริปต์ในร้าน</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 420px; margin: 0 auto 1.25rem;">
          แอดมินสามารถเข้าสู่ระบบด้วยไอดีแอดมิน แล้วกดปุ่ม <b>"เพิ่มสคริปต์ใหม่"</b> เพื่อเริ่มลงขายระบบจริงได้ทันที
        </p>
        <button class="btn btn-primary" onclick="openAddProductModal()">➕ เพิ่มสคริปต์ใหม่</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.products.map(p => `
    <div class="product-card">
      <div class="product-card-thumb-wrap">
        <img class="product-card-thumb" src="${p.image || '/assets/roleplay.jpg'}" alt="${p.name}" loading="lazy">
        <div class="product-badge-pill">${p.samp_version || '0.3.7'}</div>
      </div>
      <div class="product-card-body">
        <h3 class="product-card-title">${escapeHtml(p.name)}</h3>
        <div style="font-size: 0.78rem; color: var(--accent-cyan); margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.3rem;">
          <span>👤 ผู้สร้าง:</span> <b style="color: #fff;">${escapeHtml(p.seller_name || 'Nexus Official')}</b>
        </div>
        <p class="product-card-desc">${escapeHtml(p.short_desc || '')}</p>
        <div class="product-card-footer">
          <div class="product-price-box">
            <strong>฿${p.price.toLocaleString()}</strong>
            <small>THB</small>
          </div>
          <div class="product-card-btns">
            <button class="btn btn-secondary btn-sm" onclick="viewProductDetail(${p.id})">รายละเอียด</button>
            <button class="btn btn-primary btn-sm" onclick="quickBuyProduct(${p.id})">ซื้อทันที</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ----------------------------------------------------
// Product Detail Modal
// ----------------------------------------------------
async function viewProductDetail(productId) {
  const res = await api(`/api/products/${productId}`);
  if (!res.success || !res.product) {
    showToast('ไม่สามารถโหลดข้อมูลสคริปต์ได้', 'error');
    return;
  }

  const p = res.product;
  const modalBody = document.getElementById('productDetailBody');
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div class="product-modal-grid">
      <div>
        <img src="${p.image}" style="width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--border-medium);" alt="${p.name}">
        <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; font-size: 0.8rem; color: var(--text-dim);">
          <span>SA-MP: <b style="color: var(--accent-cyan);">${p.samp_version}</b></span> • 
          <span>ยอดขาย: <b style="color: #fff;">${p.sold_count} ชิ้น</b></span>
        </div>
      </div>
      <div>
        <h2 style="font-size: 1.35rem; margin: 0.25rem 0 0.5rem; color: #fff;">${p.name}</h2>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem; line-height: 1.5;">${p.description || p.short_desc}</p>
        
        <div style="font-size: 1.8rem; font-family: var(--font-mono); color: #fff; margin-bottom: 1rem;">
          ฿${p.price.toLocaleString()} <span style="font-size: 0.85rem; color: var(--text-dim);">THB</span>
        </div>

        <button class="btn btn-primary btn-lg" style="width: 100%;" onclick="quickBuyProduct(${p.id})">
          สั่งซื้อระบบนี้ทันที (รับไฟล์อัตโนมัติ)
        </button>
      </div>
    </div>

    <div>
      <h4 style="color: #fff; font-size: 0.95rem; margin-bottom: 0.5rem;">คุณสมบัติของระบบ (Features)</h4>
      <ul style="margin-left: 1.25rem; color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem;">
        ${(p.features || []).map(f => `<li style="margin-bottom: 0.35rem;">${f}</li>`).join('')}
      </ul>

      ${p.code_snippet ? `
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.35rem;">ตัวอย่างโค้ด / Code Preview</div>
        <pre class="code-box"><code>${escapeHtml(p.code_snippet)}</code></pre>
      ` : ''}
    </div>
  `;

  openModal('productDetailModal');
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ----------------------------------------------------
// Instant Checkout & Purchase
// ----------------------------------------------------
async function quickBuyProduct(productId) {
  if (!state.user) {
    showToast('กรุณาเข้าสู่ระบบก่อนสั่งซื้อสินค้า', 'error');
    openAuthModal('login');
    return;
  }

  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  if (state.user.balance < p.price) {
    const diff = p.price - state.user.balance;
    if (confirm(`ยอดเงินคงเหลือไม่พอ (ขาดอีก ฿${diff.toLocaleString()})\nต้องการไปยังหน้าเติมเงินหรือไม่?`)) {
      window.location.hash = 'topup';
      switchView('topup');
      closeModal('productDetailModal');
    }
    return;
  }

  if (!confirm(`ยืนยันการสั่งซื้อ: "${p.name}" ในราคา ฿${p.price.toLocaleString()}?`)) {
    return;
  }

  const res = await api('/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ productId })
  });

  if (res.success) {
    state.user.balance = res.newBalance;
    renderUserNav();
    closeModal('productDetailModal');
    renderPurchaseSuccessModal(res.order);
  } else {
    showToast(res.message, 'error');
  }
}

function renderPurchaseSuccessModal(order) {
  const modalBody = document.getElementById('purchaseSuccessBody');
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.25rem;">
      <div style="font-size: 2.8rem; margin-bottom: 0.4rem;">🎉</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin-bottom: 0.35rem;">สั่งซื้อสำเร็จเรียบร้อย!</h3>
      <p style="color: var(--text-muted); font-size: 0.88rem;">คุณสามารถกดดาวน์โหลดไฟล์สคริปต์ไปใช้งานได้ทันที</p>
    </div>

    <div style="background: var(--bg-input); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1.25rem; text-align: center;">
      <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.25rem;">รหัสคำสั่งซื้อ: <b>${order.order_code}</b></div>
      <div style="font-size: 1.15rem; font-weight: 700; color: #fff;">${order.product_name}</div>
    </div>

    <div style="display: flex; gap: 0.75rem;">
      <a href="${order.file_url}" target="_blank" class="btn btn-primary btn-lg" style="flex: 1;">
        📥 ดาวน์โหลดไฟล์ (.ZIP)
      </a>
      <button class="btn btn-secondary btn-lg" onclick="closeModal('purchaseSuccessModal'); switchView('orders');">
        ดูสคริปต์ของฉัน
      </button>
    </div>
  `;

  openModal('purchaseSuccessModal');
}

// ----------------------------------------------------
// Topup System (PromptPay & TrueMoney)
// ----------------------------------------------------
function setupTopup() {
  const tabPromptPay = document.getElementById('tabPromptPay');
  const tabTrueMoney = document.getElementById('tabTrueMoney');
  const stagePromptPay = document.getElementById('stagePromptPay');
  const stageTrueMoney = document.getElementById('stageTrueMoney');

  if (tabPromptPay && tabTrueMoney) {
    tabPromptPay.addEventListener('click', () => {
      tabPromptPay.classList.add('active');
      tabTrueMoney.classList.remove('active');
      stagePromptPay.style.display = 'block';
      stageTrueMoney.style.display = 'none';
    });

    tabTrueMoney.addEventListener('click', () => {
      tabTrueMoney.classList.add('active');
      tabPromptPay.classList.remove('active');
      stageTrueMoney.style.display = 'block';
      stagePromptPay.style.display = 'none';
    });
  }

  // Quick Amount Chips
  document.querySelectorAll('.amount-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.amount-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const val = chip.getAttribute('data-amount');
      const input = document.getElementById('customAmountInput');
      if (input) input.value = val;
    });
  });

  // PromptPay QR Generation
  const btnGenQR = document.getElementById('btnGenPromptPayQR');
  if (btnGenQR) {
    btnGenQR.addEventListener('click', async () => {
      if (!state.user) {
        showToast('กรุณาเข้าสู่ระบบก่อนเติมเงิน', 'error');
        openAuthModal('login');
        return;
      }

      const input = document.getElementById('customAmountInput');
      const amount = Number(input.value);

      if (!amount || amount < 10) {
        showToast('จำนวนเงินขั้นต่ำ 10 บาท', 'error');
        return;
      }

      btnGenQR.disabled = true;
      btnGenQR.textContent = 'กำลังสร้าง QR...';

      const res = await api('/api/topup/promptpay-qr', {
        method: 'POST',
        body: JSON.stringify({ amount })
      });

      btnGenQR.disabled = false;
      btnGenQR.textContent = 'ดูเลขบัญชีสำหรับโอนเงิน';

      if (res.success) {
        renderPromptPayQR(res);
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // TrueMoney
  const btnRedeemTM = document.getElementById('btnRedeemTrueMoney');
  if (btnRedeemTM) {
    btnRedeemTM.addEventListener('click', async () => {
      if (!state.user) {
        showToast('กรุณาเข้าสู่ระบบก่อนเติมเงิน', 'error');
        openAuthModal('login');
        return;
      }

      const voucherInput = document.getElementById('truemoneyVoucherInput');
      const voucherUrl = voucherInput.value.trim();

      if (!voucherUrl) {
        showToast('กรุณากรอกลิงก์ซองของขวัญ', 'error');
        return;
      }

      btnRedeemTM.disabled = true;
      btnRedeemTM.textContent = 'กำลังตรวจสอบ...';

      const res = await api('/api/topup/truemoney', {
        method: 'POST',
        body: JSON.stringify({ voucherUrl })
      });

      btnRedeemTM.disabled = false;
      btnRedeemTM.textContent = 'ยืนยันรับซองของขวัญ';

      if (res.success) {
        state.user.balance = res.newBalance;
        renderUserNav();
        voucherInput.value = '';
        showToast(res.message);
        loadTopupHistory();
      } else {
        showToast(res.message, 'error');
      }
    });
  }
}

function renderPromptPayQR(data) {
  const container = document.getElementById('promptPayQRContainer');
  if (!container) return;

  const scbAcc = data.bankAccount || '5632881610';
  const scbAccFormatted = data.bankAccountFormatted || '563-2-88161-0';
  const scbName = data.accountName || 'ธาม สุวรรณรัตน์';

  container.style.display = 'block';
  container.innerHTML = `
    <div class="qr-display-box" style="max-width: 440px; margin: 1.5rem auto 0; text-align: center;">
      <!-- SCB VIP Bank Card -->
      <div style="background: linear-gradient(135deg, #4E2A84 0%, #220e3d 100%); border: 1px solid rgba(167, 139, 250, 0.45); border-radius: var(--radius-md); padding: 1.35rem; text-align: left; margin-bottom: 1.25rem; box-shadow: 0 10px 25px rgba(78, 42, 132, 0.4); position: relative; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #4E2A84; font-size: 0.92rem; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">
              SCB
            </div>
            <div>
              <div style="font-weight: 800; color: #fff; font-size: 1.05rem; letter-spacing: 0.2px;">ธนาคารไทยพาณิชย์</div>
              <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.75);">Siam Commercial Bank</div>
            </div>
          </div>
          <span style="background: rgba(255,255,255,0.2); color: #fff; font-size: 0.72rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 999px;">
            บัญชีทางการของร้าน
          </span>
        </div>

        <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin: 0.75rem 0;">
          <div style="font-size: 0.75rem; color: rgba(255,255,255,0.75); text-transform: uppercase;">
            เลขที่บัญชีสำหรับโอนเงิน:
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.25rem;">
            <div style="font-size: 1.55rem; font-weight: 900; font-family: var(--font-mono); color: #fff; letter-spacing: 2px;">
              ${scbAccFormatted}
            </div>
            <button type="button" class="btn btn-sm" id="btnCopyScbAcc" style="background: #fff; color: #4E2A84; font-weight: 800; padding: 0.45rem 0.9rem; font-size: 0.82rem; border-radius: 6px; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
              📋 คัดลอกเลข
            </button>
          </div>
        </div>

        <div style="font-size: 0.9rem; color: rgba(255,255,255,0.95); border-top: 1px solid rgba(255,255,255,0.15); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span>ชื่อบัญชี: <b style="color: #fff; font-size: 0.95rem;">${scbName}</b></span>
          <span style="font-size: 0.75rem; color: #fff; background: rgba(0,0,0,0.3); padding: 0.25rem 0.6rem; border-radius: 4px;">ธ.ไทยพาณิชย์</span>
        </div>
      </div>

      <!-- Amount Highlight -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem; margin-bottom: 1rem;">
        <div style="font-size: 0.82rem; color: var(--text-dim);">ยอดเงินที่ต้องโอนเข้าบัญชี:</div>
        <div style="font-size: 1.5rem; font-family: var(--font-mono); font-weight: 800; color: var(--accent-emerald); margin-top: 0.2rem;">
          ฿${data.amount.toLocaleString()}
          ${data.bonus > 0 ? `<span style="font-size: 0.88rem; color: var(--accent-cyan); font-weight: 500;">(+แถมโบนัส ฿${data.bonus})</span>` : ''}
        </div>
      </div>

      <!-- Quick Steps -->
      <div style="background: rgba(78, 42, 132, 0.12); border: 1px solid rgba(167, 139, 250, 0.25); border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
        <b style="color: #fff;">💡 วิธีเติมเงินง่ายๆ:</b><br>
        1. กดปุ่ม <b>"คัดลอกเลข"</b> ด้านบน แล้วเปิดแอปธนาคารของคุณเพื่อโอนเงิน<br>
        2. บันทึกรูปสลิปการโอนเงิน<br>
        3. นำรูปสลิปมาแนบในช่องด้านล่าง แล้วกดยืนยัน เงินเข้าทันที!
      </div>

      <!-- Slip File Upload Section -->
      <div style="width: 100%; background: var(--bg-input); border: 1px dashed var(--border-medium); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <label class="form-label" style="font-size: 0.82rem; color: #fff; display: block; margin-bottom: 0.35rem;">
          📎 แนบรูปสลิปโอนเงิน (สลิปโอนเข้าไทยพาณิชย์ 5632881610):
        </label>
        <input type="file" id="topupSlipFileInput" accept="image/*" class="form-control" style="padding: 0.45rem; font-size: 0.82rem;">
        <div id="slipPreviewWrap" style="display: none; margin-top: 0.75rem; text-align: center;">
          <img id="slipPreviewImg" style="max-width: 150px; border-radius: 4px; border: 1px solid var(--border-medium);">
        </div>
      </div>

      <button class="btn btn-primary btn-lg" style="width: 100%;" id="btnVerifySlip">
        🔍 ตรวจสอบสลิปและเติมเงินอัตโนมัติ
      </button>
    </div>
  `;

  // Copy account button listener
  const btnCopy = document.getElementById('btnCopyScbAcc');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(scbAcc).then(() => {
        btnCopy.textContent = '✅ คัดลอกแล้ว!';
        setTimeout(() => { btnCopy.textContent = '📋 คัดลอกเลข'; }, 2000);
      });
    });
  }

  // Image preview handler
  const fileInput = document.getElementById('topupSlipFileInput');
  const previewWrap = document.getElementById('slipPreviewWrap');
  const previewImg = document.getElementById('slipPreviewImg');

  if (fileInput && previewWrap && previewImg) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        previewWrap.style.display = 'none';
      }
    });
  }

  // Automated Slip Verification Click Handler
  document.getElementById('btnVerifySlip').addEventListener('click', async () => {
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) {
      showToast('กรุณาเลือกไฟล์รูปสลิปโอนเงินก่อนกดยืนยัน', 'error');
      return;
    }

    const verifyBtn = document.getElementById('btnVerifySlip');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'กำลังสแกนและตรวจสอบสลิปกับธนาคาร...';

    const formData = new FormData();
    formData.append('slip', file);
    formData.append('amount', String(data.amount));
    formData.append('refCode', data.refCode);

    try {
      const res = await fetch('/api/topup/verify-slip', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`
        },
        body: formData
      });

      const result = await res.json();
      verifyBtn.disabled = false;
      verifyBtn.textContent = '🔍 ตรวจสอบสลิปและเติมเงินอัตโนมัติ';

      if (result.success) {
        state.user.balance = result.newBalance;
        renderUserNav();
        container.style.display = 'none';
        showToast(result.message);
        loadTopupHistory();
      } else {
        showToast(result.message, 'error');
      }
    } catch (err) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = '🔍 ตรวจสอบสลิปและเติมเงินอัตโนมัติ';
      showToast('เกิดข้อผิดพลาดในการส่งข้อมูลสลิป', 'error');
    }
  });

  container.scrollIntoView({ behavior: 'smooth' });
}

async function loadTopupHistory() {
  if (!state.user) return;
  const res = await api('/api/topup/history');
  const tbody = document.getElementById('topupHistoryTbody');
  if (!tbody) return;

  if (res.success && res.history.length > 0) {
    tbody.innerHTML = res.history.map(item => `
      <tr>
        <td><code>${item.ref_code}</code></td>
        <td>${item.method === 'promptpay' ? 'พร้อมเพย์' : 'TrueMoney'}</td>
        <td style="color: var(--accent-emerald); font-weight: 700;">฿${item.amount.toLocaleString()}</td>
        <td>+฿${item.bonus.toLocaleString()}</td>
        <td><span style="color: var(--accent-emerald); font-size: 0.8rem;">สำเร็จ</span></td>
        <td style="color: var(--text-dim); font-size: 0.8rem;">${new Date(item.created_at).toLocaleDateString('th-TH')}</td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">ยังไม่มีประวัติการเติมเงิน</td></tr>`;
  }
}

// ----------------------------------------------------
// My Orders & Downloads View
// ----------------------------------------------------
async function loadUserOrders() {
  const container = document.getElementById('ordersContainer');
  if (!container) return;

  if (!state.user) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-dim);">
        <h3>กรุณาเข้าสู่ระบบเพื่อดูสคริปต์ของคุณ</h3>
        <button class="btn btn-primary" style="margin-top: 1rem;" onclick="openAuthModal('login')">เข้าสู่ระบบ</button>
      </div>
    `;
    return;
  }

  const res = await api('/api/user/orders');

  if (res.success && res.orders.length > 0) {
    container.innerHTML = `
      <div class="orders-list">
        ${res.orders.map(order => `
          <div class="order-item-card">
            <div class="order-item-left">
              <img class="order-thumb" src="${order.image || '/assets/roleplay.jpg'}" alt="${order.product_name}">
              <div class="order-meta">
                <h3>${order.product_name}</h3>
                <div style="font-size: 0.85rem; color: var(--text-dim);">
                  สั่งซื้อเมื่อ: ${new Date(order.created_at).toLocaleDateString('th-TH')} • รหัสคำสั่งซื้อ: <code>${order.order_code}</code>
                </div>
              </div>
            </div>

            <div>
              <a href="${order.file_url}" target="_blank" class="btn btn-primary">
                📥 ดาวน์โหลดไฟล์ (.ZIP)
              </a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-dim);">
        <h3>คุณยังไม่มีสคริปต์ในครอบครอง</h3>
        <p style="margin: 0.5rem 0 1rem;">เลือกดูสคริปต์และระบบ SA-MP ที่น่าสนใจได้ที่หน้าร้านค้า</p>
        <button class="btn btn-primary" onclick="switchView('store')">ไปยังหน้าร้านค้า</button>
      </div>
    `;
  }
}

// ----------------------------------------------------
// ADMIN SCRIPT MANAGEMENT (ADD, DELETE, MANAGE)
// ----------------------------------------------------
// Admin Products & Settings Handlers
// ----------------------------------------------------
async function loadAdminProducts() {
  if (!state.user || state.user.role !== 'admin') {
    const tbody = document.getElementById('adminProductsTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">เฉพาะแอดมินเท่านั้นที่สามารถเข้าถึงได้</td></tr>`;
    return;
  }

  const res = await api('/api/admin/products');
  const tbody = document.getElementById('adminProductsTbody');
  if (!tbody || !res.success) return;

  if (res.products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">ยังไม่มีสินค้าในระบบ</td></tr>`;
    return;
  }

  tbody.innerHTML = res.products.map(p => `
    <tr>
      <td><span style="font-family: var(--font-mono); color: var(--text-dim);">#${p.id}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <img src="${p.image}" style="width: 44px; height: 26px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-subtle);">
          <div>
            <b style="color: #fff;">${p.name}</b>
            <div style="font-size: 0.78rem; color: var(--text-dim);">${p.samp_version || '0.3.7'}</div>
          </div>
        </div>
      </td>
      <td><strong style="color: var(--accent-emerald); font-family: var(--font-mono);">฿${p.price.toLocaleString()}</strong></td>
      <td><span style="color: var(--text-dim);">${p.sold_count} ชิ้น</span></td>
      <td style="text-align: right;">
        <button class="btn btn-danger btn-sm" onclick="adminDeleteProduct(${p.id}, '${escapeHtml(p.name)}')">
          🗑️ ลบสคริปต์
        </button>
      </td>
    </tr>
  `).join('');
}

// Admin Delete Script Action
async function adminDeleteProduct(id, name) {
  if (!confirm(`คุณต้องการลบสคริปต์ "${name}" ออกจากร้าน Nexus หรือไม่?\n(การลบนี้จะนำสคริปต์ออกจากฐานข้อมูลทันที)`)) {
    return;
  }

  const res = await api(`/api/admin/products/${id}`, { method: 'DELETE' });
  if (res.success) {
    showToast(`ลบสคริปต์ "${name}" สำเร็จแล้ว`);
    loadAdminProducts();
    loadProducts();
  } else {
    showToast(res.message, 'error');
  }
}

// Compress and optimize image on client-side before upload
function optimizeImageFile(file, maxWidth = 1200, maxHeight = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return resolve(file);
    }
    // If small (< 300KB), keep as is
    if (file.size < 300 * 1024) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        const outputMime = isPng ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: outputMime }));
          } else {
            resolve(file);
          }
        }, outputMime, quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Open Add Product Modal
function openAddProductModal() {
  const form = document.getElementById('formAddProduct');
  if (form) form.reset();
  const previewWrap = document.getElementById('adminProdImagePreviewWrap');
  if (previewWrap) previewWrap.style.display = 'none';
  openModal('addProductModal');
}

// Setup Admin Form Listener
function setupAdminForm() {
  const prodFileInput = document.getElementById('adminProdImageFile');
  const prodPreviewWrap = document.getElementById('adminProdImagePreviewWrap');
  const prodPreview = document.getElementById('adminProdImagePreview');

  // Thumbnail preview when selecting file
  if (prodFileInput && prodPreviewWrap && prodPreview) {
    prodFileInput.addEventListener('change', () => {
      const file = prodFileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          prodPreview.src = e.target.result;
          prodPreviewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        prodPreviewWrap.style.display = 'none';
      }
    });
  }

  // Handle Form Submit
  const formAdd = document.getElementById('formAddProduct');
  if (formAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();

      let file = prodFileInput ? prodFileInput.files[0] : null;
      if (!file) {
        showToast('กรุณาแนบรูปภาพหน้าปกของสคริปต์ก่อนบันทึก', 'error');
        return;
      }

      const submitBtn = formAdd.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ กำลังประมวลผลรูปภาพและบันทึกข้อมูล...';

      file = await optimizeImageFile(file);

      const formData = new FormData();
      formData.append('name', document.getElementById('adminProdName').value.trim());
      formData.append('price', document.getElementById('adminProdPrice').value);
      formData.append('samp_version', document.getElementById('adminProdVersion').value.trim() || '0.3.7-R2');
      formData.append('file_url', document.getElementById('adminProdFileUrl').value.trim());
      formData.append('short_desc', document.getElementById('adminProdShortDesc').value.trim());
      formData.append('description', document.getElementById('adminProdDesc').value.trim());
      formData.append('imageFile', file, file.name);

      try {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.token}`
          },
          body: formData
        });

        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;

        if (data.success) {
          showToast('เพิ่มสคริปต์ใหม่ลงร้าน Nexus สำเร็จ!');
          closeModal('addProductModal');
          loadAdminProducts();
          loadProducts();
        } else {
          showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
      }
    });
  }

  // Load and save SlipOK settings
  loadSlipokSettings();
  const formSlipok = document.getElementById('formSlipokSettings');
  if (formSlipok) {
    formSlipok.addEventListener('submit', async (e) => {
      e.preventDefault();
      const branchId = document.getElementById('settingSlipokBranchId').value.trim();
      const apiKey = document.getElementById('settingSlipokApiKey').value.trim();

      const res = await api('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          settings: {
            slipok_branch_id: branchId,
            slipok_api_key: apiKey
          }
        })
      });

      if (res.success) {
        showToast('บันทึกการตั้งค่า SlipOK เรียบร้อยแล้ว!');
      } else {
        showToast(res.message, 'error');
      }
    });
  }
}

async function loadSlipokSettings() {
  const res = await api('/api/settings');
  if (res.success && res.settings) {
    const branchInput = document.getElementById('settingSlipokBranchId');
    const keyInput = document.getElementById('settingSlipokApiKey');
    if (branchInput && res.settings.slipok_branch_id) {
      branchInput.value = res.settings.slipok_branch_id;
    }
    if (keyInput && res.settings.slipok_api_key) {
      keyInput.value = res.settings.slipok_api_key;
    }
  }
}

// ----------------------------------------------------
// 🛡️ Admin Security Dashboard Handlers (Nexus Shield)
// ----------------------------------------------------
async function loadSecurityDashboard() {
  if (!state.user || state.user.role !== 'admin') return;

  const res = await api('/api/admin/security/stats');
  if (!res.success || !res.stats) return;

  const { totalBlocked, scannerCount, probeCount, rateLimitCount, modules, recentLogs } = res.stats;

  // Stats Counters
  const elTotal = document.getElementById('secTotalBlocked');
  const elScanners = document.getElementById('secScannersBlocked');
  const elProbes = document.getElementById('secProbesBlocked');
  const elRate = document.getElementById('secRateLimits');

  if (elTotal) elTotal.textContent = Number(totalBlocked || 0).toLocaleString();
  if (elScanners) elScanners.textContent = Number(scannerCount || 0).toLocaleString();
  if (elProbes) elProbes.textContent = Number(probeCount || 0).toLocaleString();
  if (elRate) elRate.textContent = Number(rateLimitCount || 0).toLocaleString();

  // Active Modules
  const modulesContainer = document.getElementById('secModulesList');
  if (modulesContainer && modules) {
    modulesContainer.innerHTML = modules.map(m => `
      <div style="background: var(--bg-input); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm); padding: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 700; color: #fff; font-size: 0.84rem;">${m.name}</div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">${m.desc}</div>
        </div>
        <span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3);">
          ${m.status}
        </span>
      </div>
    `).join('');
  }

  // Incident Logs Table
  const tbody = document.getElementById('secLogsTbody');
  if (tbody) {
    if (!recentLogs || recentLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">ยังไม่มีรายงานภัยคุกคาม ระบบปลอดภัย 100% (Nexus Shield เฝ้าระวังอยู่)</td></tr>`;
      return;
    }

    tbody.innerHTML = recentLogs.map(l => `
      <tr>
        <td style="color: var(--text-dim); font-size: 0.78rem; font-family: var(--font-mono);">${l.created_at || 'Recently'}</td>
        <td><code style="color: var(--accent-cyan); font-size: 0.8rem; background: rgba(6, 182, 212, 0.1); padding: 2px 6px; border-radius: 4px;">${escapeHtml(l.ip)}</code></td>
        <td>
          <span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); font-size: 0.74rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(244, 63, 94, 0.3);">
            ${escapeHtml(l.threat_type)}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.8rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.details)}">
          ${escapeHtml(l.endpoint)} ${l.details ? `— ${escapeHtml(l.details)}` : ''}
        </td>
        <td style="text-align: right;">
          <span style="color: var(--accent-emerald); font-weight: 700; font-size: 0.78rem;">🛡️ ${l.action_taken || 'BLOCKED'}</span>
        </td>
      </tr>
    `).join('');
  }
}

async function clearSecurityLogs() {
  if (!confirm('คุณต้องการล้างประวัติการสกัดกั้นการโจมตีทั้งหมดหรือไม่?')) return;

  const res = await api('/api/admin/security/clear-logs', { method: 'POST' });
  if (res.success) {
    showToast('ล้างประวัติการสกัดกั้นเรียบร้อยแล้ว');
    loadSecurityDashboard();
  } else {
    showToast(res.message, 'error');
  }
}

// Search and Filter Listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('storeSearchInput');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.searchQuery = e.target.value.trim();
        loadProducts();
      }, 250);
    });
  }

  const sortSelect = document.getElementById('storeSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      loadProducts();
    });
  }
});

// ----------------------------------------------------
// 🛒 CREATOR MARKETPLACE & SELLER WITHDRAWAL SYSTEM
// ----------------------------------------------------

function switchCreatorTab(tabName) {
  const tabs = ['my-scripts', 'submit', 'withdraw'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabCreator${t === 'my-scripts' ? 'MyScripts' : (t === 'submit' ? 'Submit' : 'Withdraw')}`);
    const content = document.getElementById(`creatorTab${t === 'my-scripts' ? 'MyScripts' : (t === 'submit' ? 'Submit' : 'Withdraw')}Content`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (content) content.style.display = t === tabName ? 'block' : 'none';
  });

  if (tabName === 'my-scripts' || tabName === 'withdraw') {
    loadCreatorDashboard();
  }
}

function setupCreatorMarketplace() {
  // Real-time Fee Preview (80% Creator / 20% Admin)
  const priceInput = document.getElementById('creatorProdPrice');
  const feePreview = document.getElementById('creatorFeePreview');
  if (priceInput && feePreview) {
    priceInput.addEventListener('input', () => {
      const p = Number(priceInput.value) || 0;
      const earnings = Math.round(p * 0.80);
      feePreview.innerHTML = `คุณจะได้รับ 80% = <b style="color: var(--accent-emerald);">฿${earnings.toLocaleString()} บาท</b> (แอดมินหักค่าธรรมเนียม 20% = ฿${(p - earnings).toLocaleString()} บาท)`;
    });
  }

  // Creator Image Preview
  const creatorFileInput = document.getElementById('creatorProdImageFile');
  const creatorPreviewWrap = document.getElementById('creatorProdImagePreviewWrap');
  const creatorPreview = document.getElementById('creatorProdImagePreview');
  if (creatorFileInput && creatorPreviewWrap && creatorPreview) {
    creatorFileInput.addEventListener('change', () => {
      const file = creatorFileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          creatorPreview.src = e.target.result;
          creatorPreviewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        creatorPreviewWrap.style.display = 'none';
      }
    });
  }

  // Handle Creator Product Submission
  const formSubmit = document.getElementById('formSubmitCreatorProduct');
  if (formSubmit) {
    formSubmit.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!state.user) {
        showToast('กรุณาเข้าสู่ระบบก่อนส่งสคริปต์ฝากขาย', 'error');
        openAuthModal('login');
        return;
      }

      const submitBtn = formSubmit.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ กำลังประมวลผลรูปภาพและส่งข้อมูล...';
      }

      let fileToUpload = creatorFileInput && creatorFileInput.files[0] ? creatorFileInput.files[0] : null;
      if (fileToUpload) {
        fileToUpload = await optimizeImageFile(fileToUpload);
      }

      const formData = new FormData();
      formData.append('name', document.getElementById('creatorProdName').value.trim());
      formData.append('category_slug', document.getElementById('creatorProdCategory').value);
      formData.append('price', document.getElementById('creatorProdPrice').value);
      formData.append('file_url', document.getElementById('creatorProdFileUrl').value.trim());
      formData.append('samp_version', document.getElementById('creatorProdSampVer').value.trim());
      formData.append('short_desc', document.getElementById('creatorProdShortDesc').value.trim());
      formData.append('description', document.getElementById('creatorProdDesc').value.trim());

      if (fileToUpload) {
        formData.append('imageFile', fileToUpload, fileToUpload.name);
      }

      try {
        const res = await fetch('/api/seller/products', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.token}`
          },
          body: formData
        });
        const data = await res.json();

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }

        if (data.success) {
          showToast(data.message);
          formSubmit.reset();
          if (creatorPreviewWrap) creatorPreviewWrap.style.display = 'none';
          switchCreatorTab('my-scripts');
          loadCreatorDashboard();
        } else {
          showToast(data.message, 'error');
        }
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message, 'error');
      }
    });
  }

  // Handle Withdrawal Request
  const formWithdraw = document.getElementById('formRequestWithdrawal');
  if (formWithdraw) {
    formWithdraw.addEventListener('submit', async (e) => {
      e.preventDefault();

      const amount = Number(document.getElementById('withdrawAmount').value);
      const bank_name = document.getElementById('withdrawBank').value;
      const account_number = document.getElementById('withdrawAccountNumber').value.trim();
      const account_name = document.getElementById('withdrawAccountName').value.trim();

      if (!amount || amount < 50) {
        showToast('ยอดถอนขั้นต่ำคือ 50 บาท', 'error');
        return;
      }

      const res = await api('/api/seller/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, bank_name, account_number, account_name })
      });

      if (res.success) {
        showToast(res.message);
        formWithdraw.reset();
        await checkAuth(); // update balance on nav
        loadCreatorDashboard();
      } else {
        showToast(res.message, 'error');
      }
    });
  }
}

async function loadCreatorDashboard() {
  if (!state.token) return;

  const res = await api('/api/seller/dashboard');
  if (!res.success || !res.seller) return;

  const s = res.seller;

  // Update Stat Cards
  const elBalance = document.getElementById('creatorSellerBalance');
  const elEarned = document.getElementById('creatorTotalEarned');
  const elOrders = document.getElementById('creatorTotalOrders');
  const elCount = document.getElementById('creatorProductsCount');
  const elAvail = document.getElementById('withdrawAvailable');

  if (elBalance) elBalance.textContent = `฿${Number(s.sellerBalance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  if (elEarned) elEarned.textContent = `฿${Number(s.totalEarned).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  if (elOrders) elOrders.textContent = `${Number(s.totalOrders).toLocaleString()} ชิ้น`;
  if (elCount) elCount.textContent = `${Number(s.productsCount).toLocaleString()} รายการ`;
  if (elAvail) elAvail.textContent = `฿${Number(s.sellerBalance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

  // Render My Scripts
  const tbodyScripts = document.getElementById('creatorMyScriptsTbody');
  if (tbodyScripts) {
    if (!s.myProducts || s.myProducts.length === 0) {
      tbodyScripts.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">คุณยังไม่เคยวางขายสคริปต์ กดปุ่ม "ส่งสคริปต์ฝากขายใหม่" เพื่อเริ่มต้นได้เลย!</td></tr>`;
    } else {
      tbodyScripts.innerHTML = s.myProducts.map(p => {
        let statusBadge = '';
        if (p.status === 'pending') {
          statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">🟡 รอแอดมินตรวจสอบ</span>`;
        } else if (p.status === 'approved') {
          statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">🟢 วางขายอยู่</span>`;
        } else {
          statusBadge = `<span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.3); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;" title="${escapeHtml(p.reject_reason || '')}">🔴 ปฏิเสธ: ${escapeHtml(p.reject_reason || 'ไม่ผ่านเกณฑ์')}</span>`;
        }

        const creatorShare = Math.round(p.price * 0.80);

        return `
          <tr>
            <td style="color: var(--text-dim); font-family: var(--font-mono);">${p.id}</td>
            <td>
              <div style="font-weight: 700; color: #fff;">${escapeHtml(p.name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.category_slug)} • SA-MP ${escapeHtml(p.samp_version)}</div>
            </td>
            <td style="font-family: var(--font-mono); font-weight: 700;">฿${Number(p.price).toLocaleString()}</td>
            <td style="font-family: var(--font-mono); color: var(--accent-emerald); font-weight: 700;">฿${creatorShare.toLocaleString()}</td>
            <td style="font-family: var(--font-mono);">${Number(p.sold_count || 0)} ชิ้น</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render Withdrawals History
  const tbodyWithdrawals = document.getElementById('creatorWithdrawalsTbody');
  if (tbodyWithdrawals) {
    if (!s.withdrawals || s.withdrawals.length === 0) {
      tbodyWithdrawals.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">ยังไม่มีประวัติการถอนเงิน</td></tr>`;
    } else {
      tbodyWithdrawals.innerHTML = s.withdrawals.map(w => {
        let badge = '';
        if (w.status === 'pending') {
          badge = `<span style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 2px 6px; border-radius: 4px; font-size: 0.74rem; font-weight: 700;">🟡 รอแอดมินโอนเงิน</span>`;
        } else if (w.status === 'completed') {
          badge = `<span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 2px 6px; border-radius: 4px; font-size: 0.74rem; font-weight: 700;">🟢 โอนเงินแล้ว</span>`;
        } else {
          badge = `<span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); padding: 2px 6px; border-radius: 4px; font-size: 0.74rem; font-weight: 700;">🔴 ปฏิเสธ (คืนเงิน)</span>`;
        }

        return `
          <tr>
            <td style="color: var(--text-dim); font-size: 0.78rem;">${(w.created_at || '').substring(0, 10)}</td>
            <td style="font-family: var(--font-mono); color: var(--accent-emerald); font-weight: 700;">฿${Number(w.amount).toLocaleString()}</td>
            <td style="font-size: 0.8rem;">
              <div>${escapeHtml(w.bank_name)}</div>
              <code style="color: var(--accent-cyan); font-size: 0.76rem;">${escapeHtml(w.account_number)}</code> (${escapeHtml(w.account_name)})
            </td>
            <td>${badge}</td>
            <td style="font-size: 0.76rem; color: var(--text-dim);">${escapeHtml(w.admin_note || '-')}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

// ----------------------------------------------------
// 👑 ADMIN MARKETPLACE REVIEW & WITHDRAWAL PAYOUT
// ----------------------------------------------------

async function loadAdminMarketplacePending() {
  const res = await api('/api/admin/marketplace/pending');
  if (!res.success) return;

  const countBadge = document.getElementById('badgePendingCount');
  if (countBadge) countBadge.textContent = res.products.length;

  const tbody = document.getElementById('adminPendingProductsTbody');
  if (!tbody) return;

  if (res.products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">ไม่มีสคริปต์รอตรวจสอบในขณะนี้ (ตรวจหมดแล้ว 100%)</td></tr>`;
    return;
  }

  tbody.innerHTML = res.products.map(p => `
    <tr>
      <td>
        <b style="color: var(--accent-cyan);">👤 ${escapeHtml(p.seller_name || 'Creator')}</b>
        <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.seller_email || '')}</div>
      </td>
      <td>
        <div style="font-weight: 700; color: #fff;">${escapeHtml(p.name)}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(p.short_desc || '')}</div>
      </td>
      <td style="font-family: var(--font-mono); font-weight: 700;">฿${Number(p.price).toLocaleString()}</td>
      <td>
        <a href="${escapeHtml(p.file_url)}" target="_blank" style="color: var(--accent-cyan); text-decoration: underline; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 4px;">
          🔗 ลิงก์ดาวน์โหลดเพื่อตรวจโค้ด
        </a>
      </td>
      <td style="text-align: right;">
        <button class="btn btn-sm" style="background: var(--accent-emerald); color: #000; font-weight: 700; margin-right: 4px;" onclick="reviewCreatorProduct(${p.id}, 'approve')">
          ✅ อนุมัติ
        </button>
        <button class="btn btn-sm" style="background: rgba(244, 63, 94, 0.2); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.4);" onclick="reviewCreatorProduct(${p.id}, 'reject')">
          ❌ ปฏิเสธ
        </button>
      </td>
    </tr>
  `).join('');
}

async function reviewCreatorProduct(id, action) {
  let reject_reason = '';
  if (action === 'reject') {
    reject_reason = prompt('กรุณาระบุเหตุผลการปฏิเสธ (เช่น สคริปต์มีบั๊ก, มีโค้ดอันตราย, ข้อมูลไม่ครบถ้วน):');
    if (!reject_reason) return;
  } else {
    if (!confirm('ยืนยันอนุมัติสคริปต์นี้ขึ้นวางจำหน่ายบนหน้าร้าน Nexus SAMP Store ทันทีหรือไม่?')) return;
  }

  const res = await api(`/api/admin/marketplace/review/${id}`, {
    method: 'POST',
    body: JSON.stringify({ action, reject_reason })
  });

  if (res.success) {
    showToast(res.message);
    loadAdminMarketplacePending();
    loadProducts(); // refresh catalog
  } else {
    showToast(res.message, 'error');
  }
}

async function loadAdminWithdrawals() {
  const res = await api('/api/admin/withdrawals');
  if (!res.success) return;

  const pendingCount = res.withdrawals.filter(w => w.status === 'pending').length;
  const countBadge = document.getElementById('badgeWithdrawalCount');
  if (countBadge) countBadge.textContent = pendingCount;

  const tbody = document.getElementById('adminWithdrawalsTbody');
  if (!tbody) return;

  if (res.withdrawals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">ไม่มีคำขอถอนเงินที่รอดำเนินการ</td></tr>`;
    return;
  }

  tbody.innerHTML = res.withdrawals.map(w => {
    let statusBadge = '';
    let actionBtns = '';

    if (w.status === 'pending') {
      statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">🟡 รอแอดมินโอน</span>`;
      actionBtns = `
        <button class="btn btn-sm" style="background: var(--accent-emerald); color: #000; font-weight: 700; margin-right: 4px;" onclick="actionWithdrawal(${w.id}, 'complete')">
          ✅ โอนเงินแล้ว
        </button>
        <button class="btn btn-sm" style="background: rgba(244, 63, 94, 0.2); color: var(--accent-rose); border: 1px solid rgba(244, 63, 94, 0.4);" onclick="actionWithdrawal(${w.id}, 'reject')">
          ❌ ปฏิเสธ (คืนเงิน)
        </button>
      `;
    } else if (w.status === 'completed') {
      statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">🟢 โอนเงินแล้ว</span>`;
      actionBtns = `<span style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(w.admin_note || 'เรียบร้อย')}</span>`;
    } else {
      statusBadge = `<span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">🔴 ปฏิเสธ</span>`;
      actionBtns = `<span style="font-size: 0.75rem; color: var(--accent-rose);">${escapeHtml(w.admin_note || 'ยกเลิก')}</span>`;
    }

    return `
      <tr>
        <td>
          <b style="color: #fff;">${escapeHtml(w.username)}</b>
          <div style="font-size: 0.74rem; color: var(--text-dim);">${escapeHtml(w.email)}</div>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 900; color: var(--accent-emerald); font-size: 1.05rem;">
          ฿${Number(w.amount).toLocaleString()}
        </td>
        <td style="font-size: 0.84rem;">${escapeHtml(w.bank_name)}</td>
        <td><code style="color: var(--accent-cyan); font-weight: 700;">${escapeHtml(w.account_number)}</code></td>
        <td style="font-weight: 700; color: #fff;">${escapeHtml(w.account_name)}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">${actionBtns}</td>
      </tr>
    `;
  }).join('');
}

async function actionWithdrawal(id, action) {
  let note = '';
  if (action === 'complete') {
    note = prompt('ระบุหมายเลขอ้างอิงสลิปโอนเงิน (หรือปล่อยว่างเพื่อยืนยัน):', 'โอนเงินเรียบร้อยผ่าน Mobile Banking');
    if (note === null) return;
  } else {
    note = prompt('ระบุเหตุผลการปฏิเสธ (ระบบจะคืนเงินเข้ากระเป๋าผู้ขายให้อัตโนมัติ):', 'ข้อมูลบัญชีไม่ถูกต้อง หรือไม่สามารถโอนได้');
    if (!note) return;
  }

  const res = await api(`/api/admin/withdrawals/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, admin_note: note })
  });

  if (res.success) {
    showToast(res.message);
    loadAdminWithdrawals();
  } else {
    showToast(res.message, 'error');
  }
}

