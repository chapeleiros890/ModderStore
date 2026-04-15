const API = '/api';
let adminToken = localStorage.getItem('m21_admin_token');

// ── Auth ──────────────────────────────────────────────────
async function checkAuth() {
  if (!adminToken) { redirectToLogin(); return false; }
  try {
    const res = await fetch(`${API}/admin/me`, { headers: authHeaders() });
    if (!res.ok) { redirectToLogin(); return false; }
    return true;
  } catch { redirectToLogin(); return false; }
}

function redirectToLogin() {
  localStorage.removeItem('m21_admin_token');
  if (!window.location.pathname.includes('login')) {
    window.location.href = '/admin/login.html';
  }
}

function authHeaders() {
  return { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (res.status === 401 || res.status === 403) { redirectToLogin(); return null; }
  return res;
}

// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── Login page ────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('m21_admin_token', data.token);
        window.location.href = '/admin/';
      } else {
        document.getElementById('login-error').textContent = data.error || 'Login failed';
        document.getElementById('login-error').style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    } catch {
      document.getElementById('login-error').textContent = 'Network error';
      document.getElementById('login-error').style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });
}

// ── Dashboard ─────────────────────────────────────────────
async function loadDashboard() {
  const ok = await checkAuth();
  if (!ok) return;

  try {
    const res = await adminFetch('/orders/stats/summary');
    if (!res) return;
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.total_orders;
    document.getElementById('stat-pending').textContent = stats.pending_orders;
    document.getElementById('stat-delivered').textContent = stats.delivered_orders;
    document.getElementById('stat-revenue').textContent = `$${parseFloat(stats.total_revenue).toFixed(2)}`;

    const tbody = document.getElementById('recent-orders');
    if (stats.recent_orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No orders yet</td></tr>';
      return;
    }
    tbody.innerHTML = stats.recent_orders.map(o => `
      <tr>
        <td><code style="font-size:0.78rem;color:var(--accent)">#${o.id.slice(0,8).toUpperCase()}</code></td>
        <td>${escapeHtml(o.customer_name)}</td>
        <td>${o.discord_username ? escapeHtml(o.discord_username) : '—'}</td>
        <td><span class="status-pill status-${o.status}">${o.status}</span></td>
        <td style="color:var(--accent);font-family:'Orbitron',sans-serif">$${parseFloat(o.total).toFixed(2)}</td>
      </tr>`).join('');
  } catch (e) {
    console.error(e);
  }
}

// ── Orders management ─────────────────────────────────────
async function loadOrders(statusFilter = '') {
  const ok = await checkAuth();
  if (!ok) return;

  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px"><div class="spinner" style="margin:auto"></div></td></tr>';

  try {
    const url = statusFilter ? `/orders?status=${statusFilter}` : '/orders';
    const res = await adminFetch(url);
    if (!res) return;
    const orders = await res.json();

    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No orders found</td></tr>';
      return;
    }

    const PM_LABELS = { pix: 'PIX', credit_card: 'CC', stripe: 'Stripe', paypal: 'PayPal' };

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><code style="font-size:0.78rem;color:var(--accent)">#${o.id.slice(0,8).toUpperCase()}</code></td>
        <td>${escapeHtml(o.customer_name)}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(o.customer_email)}</td>
        <td>${o.discord_username ? escapeHtml(o.discord_username) : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td><span class="status-pill status-${o.status}">${o.status}</span></td>
        <td style="color:var(--accent);font-family:'Orbitron',sans-serif;white-space:nowrap">
          $${parseFloat(o.total).toFixed(2)}
          ${o.payment_method ? `<br><small style="font-family:'Inter',sans-serif;font-size:0.68rem;color:var(--text-dim)">${PM_LABELS[o.payment_method] || o.payment_method}</small>` : ''}
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="openOrderModal('${o.id}')">Manage</button>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px">Error loading orders</td></tr>`;
  }
}

async function openOrderModal(orderId) {
  const res = await adminFetch(`/orders/${orderId}/full`);
  if (!res) return;
  const order = await res.json();

  const PLAN_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', lifetime: 'Lifetime' };
  const PM_LABELS = { pix: 'PIX', credit_card: 'Credit Card', stripe: 'Stripe', paypal: 'PayPal' };

  const modal = document.getElementById('order-modal');
  document.getElementById('modal-order-id').textContent = `#${order.id.slice(0,8).toUpperCase()}`;
  document.getElementById('modal-customer').textContent = `${order.customer_name} — ${order.customer_email}`;
  document.getElementById('modal-discord').textContent = order.discord_username || 'Not provided';
  document.getElementById('modal-total').textContent = `$${parseFloat(order.total).toFixed(2)} via ${PM_LABELS[order.payment_method] || order.payment_method || 'N/A'}`;
  document.getElementById('modal-status').value = order.status;
  document.getElementById('modal-license').value = order.license_key || '';
  document.getElementById('modal-notes').value = order.notes || '';

  const itemsEl = document.getElementById('modal-items');
  itemsEl.innerHTML = order.items.map(i =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.85rem;border-bottom:1px solid var(--card-border)">
      <span>${escapeHtml(i.product_name)} <span class="plan-pill" style="font-size:0.68rem">${PLAN_LABELS[i.plan_type] || i.plan_type || ''}</span></span>
      <span style="color:var(--accent)">$${parseFloat(i.price).toFixed(2)}</span>
    </div>`
  ).join('');

  document.getElementById('modal-save').onclick = () => saveOrder(order.id);
  modal.style.display = 'flex';
}

async function saveOrder(orderId) {
  const status = document.getElementById('modal-status').value;
  const license_key = document.getElementById('modal-license').value.trim();
  const notes = document.getElementById('modal-notes').value.trim();

  const res = await adminFetch(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, license_key, notes })
  });

  if (res && res.ok) {
    showToast('Order updated!', 'success');
    closeModal();
    loadOrders();
  } else {
    showToast('Failed to update order', 'error');
  }
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

// ── Products management ───────────────────────────────────
async function loadAdminProducts() {
  const ok = await checkAuth();
  if (!ok) return;

  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px"><div class="spinner" style="margin:auto"></div></td></tr>';

  try {
    const res = await adminFetch('/products/admin/all');
    if (!res) return;
    const products = await res.json();

    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No products</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => {
      const minPlan = p.plans && p.plans.length ? p.plans.find(x => x.enabled) : null;
      const priceText = minPlan ? `from $${parseFloat(minPlan.price).toFixed(2)}` : '—';
      return `
      <tr>
        <td>${p.id}</td>
        <td>
          <strong style="color:#fff">${escapeHtml(p.name)}</strong>${p.badge ? ` <span class="badge badge-accent">${p.badge}</span>` : ''}
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">${p.category || ''}</div>
        </td>
        <td><span class="product-game-tag" style="font-size:0.68rem">${p.game}</span></td>
        <td style="color:var(--accent);font-family:'Orbitron',sans-serif;font-size:0.8rem">${priceText}</td>
        <td><span class="status-pill ${p.status === 'active' ? 'status-delivered' : 'status-cancelled'}">${p.status}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="openProductModal(${p.id})">Edit</button>
          <button class="btn btn-danger btn-sm" style="margin-left:6px" onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:24px">Error loading products</td></tr>`;
  }
}

// ── Dynamic gallery list ───────────────────────────────────
let galleryImages = [];

function renderGalleryList() {
  const list = document.getElementById('p-gallery-list');
  if (!list) return;
  list.innerHTML = galleryImages.map((url, i) => `
    <div style="display:flex;gap:8px;align-items:center">
      <img src="${url}" onerror="this.style.display='none'" style="width:40px;height:30px;object-fit:cover;border-radius:4px;border:1px solid var(--card-border)" />
      <span style="flex:1;font-size:0.75rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</span>
      <button type="button" class="btn btn-sm" style="padding:2px 8px;background:transparent;color:var(--danger);border:1px solid var(--danger)" onclick="removeGalleryImage(${i})">✕</button>
    </div>`).join('');
}

function addGalleryImage() {
  const inp = document.getElementById('p-gallery-input');
  const url = inp.value.trim();
  if (!url) return;
  galleryImages.push(url);
  inp.value = '';
  renderGalleryList();
}

function removeGalleryImage(i) {
  galleryImages.splice(i, 1);
  renderGalleryList();
}

// ── Dynamic plans list ─────────────────────────────────────
function renderPlanRows(plans = []) {
  const list = document.getElementById('dynamic-plans-list');
  list.innerHTML = '';
  plans.forEach(plan => addPlanRow(plan.plan_type, plan.price, !!plan.enabled));
}

function addPlanRow(plan_type = '', price = '', enabled = true) {
  const list = document.getElementById('dynamic-plans-list');
  const row = document.createElement('div');
  row.className = 'admin-plan-dynamic-row';
  row.innerHTML = `
    <input type="checkbox" class="plan-enabled-cb" ${enabled ? 'checked' : ''} title="Ativo" />
    <input class="form-input plan-type-inp" type="text" placeholder="Tipo (ex: monthly, 30dias, vitalicio)" value="${plan_type}" style="flex:1.2" />
    <input class="form-input plan-price-inp" type="number" step="0.01" min="0.01" placeholder="Preço R$" value="${price}" style="flex:0.8" />
    <button type="button" class="btn btn-sm" style="padding:4px 10px;background:transparent;color:var(--danger);border:1px solid var(--danger)" onclick="this.closest('.admin-plan-dynamic-row').remove()">✕</button>`;
  list.appendChild(row);
}

async function openProductModal(productId = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');

  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-status-row').style.display = 'none';
  document.getElementById('dynamic-plans-list').innerHTML = '';
  galleryImages = [];
  renderGalleryList();

  if (productId) {
    title.textContent = 'Editar Produto';
    document.getElementById('product-status-row').style.display = 'block';
    const res = await adminFetch(`/products/admin/all`);
    if (!res) return;
    const products = await res.json();
    const p = products.find(x => x.id === productId);
    if (p) {
      document.getElementById('product-id').value = p.id;
      document.getElementById('p-name').value = p.name;
      document.getElementById('p-game').value = p.game;
      document.getElementById('p-category').value = p.category || '';
      document.getElementById('p-type').value = p.type;
      document.getElementById('p-badge').value = p.badge || '';
      document.getElementById('p-image-url').value = p.image_url || '';
      document.getElementById('p-video-url').value = p.video_url || '';
      document.getElementById('p-tags').value = Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '');
      document.getElementById('p-status').value = p.status;
      document.getElementById('p-description').value = p.description || '';
      galleryImages = Array.isArray(p.gallery) ? [...p.gallery] : [];
      renderGalleryList();
      renderPlanRows(p.plans || []);
    }
  } else {
    title.textContent = 'Adicionar Produto';
    // Default empty plan row
    addPlanRow('monthly', '', true);
  }

  modal.style.display = 'flex';
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;

  // Collect dynamic plans
  const plans = [];
  document.querySelectorAll('.admin-plan-dynamic-row').forEach(row => {
    const enabled = row.querySelector('.plan-enabled-cb').checked;
    const plan_type = row.querySelector('.plan-type-inp').value.trim();
    const price = parseFloat(row.querySelector('.plan-price-inp').value);
    if (plan_type && price > 0) {
      plans.push({ plan_type, price, enabled: enabled ? 1 : 0 });
    }
  });

  if (!plans.length) { showToast('Adiciona pelo menos um plano com preço', 'error'); return; }

  const tagsRaw = document.getElementById('p-tags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const body = {
    name: document.getElementById('p-name').value,
    game: document.getElementById('p-game').value,
    category: document.getElementById('p-category').value || document.getElementById('p-game').value,
    type: document.getElementById('p-type').value,
    badge: document.getElementById('p-badge').value || null,
    image_url: document.getElementById('p-image-url').value || null,
    video_url: document.getElementById('p-video-url').value || null,
    gallery: galleryImages,
    tags, plans,
    description: document.getElementById('p-description').value
  };

  if (id) body.status = document.getElementById('p-status').value;

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/products/${id}` : '/products';

  const res = await adminFetch(url, { method, body: JSON.stringify(body) });
  if (res && res.ok) {
    showToast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
    document.getElementById('product-modal').style.display = 'none';
    loadAdminProducts();
  } else {
    const data = res ? await res.json() : {};
    showToast(data.error || 'Erro ao guardar produto', 'error');
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Arquivar produto "${name}"? Ficará escondido da loja.`)) return;
  const res = await adminFetch(`/products/${id}`, { method: 'DELETE' });
  if (res && res.ok) { showToast('Produto arquivado', 'info'); loadAdminProducts(); }
  else showToast('Erro ao arquivar produto', 'error');
}

// ── Keys management ───────────────────────────────────────
const PLAN_LABELS_ADMIN = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', lifetime: 'Vitalício' };

async function loadKeysSection() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadKeyStats(), loadKeys(), loadProductsForKeyFilter()]);
}

async function loadKeyStats() {
  const grid = document.getElementById('key-stats-grid');
  if (!grid) return;
  const res = await adminFetch('/keys/stats');
  if (!res) return;
  const stats = await res.json();

  if (!stats.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Nenhuma key adicionada ainda.</div>';
    return;
  }

  grid.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-label" style="font-size:0.65rem">${escapeHtml(s.product_name)} · ${PLAN_LABELS_ADMIN[s.plan_type] || s.plan_type}</div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <div><div style="font-size:1.4rem;font-family:'Orbitron',sans-serif;color:var(--success)">${s.available}</div><div style="font-size:0.65rem;color:var(--text-dim)">disponíveis</div></div>
        <div><div style="font-size:1.4rem;font-family:'Orbitron',sans-serif;color:var(--text-dim)">${s.used}</div><div style="font-size:0.65rem;color:var(--text-dim)">utilizadas</div></div>
      </div>
    </div>`).join('');
}

let _allAdminProducts = [];

async function loadProductsForKeyFilter() {
  const sel = document.getElementById('key-filter-product');
  const selModal = document.getElementById('km-product');
  if (!sel && !selModal) return;

  const res = await adminFetch('/products/admin/all');
  if (!res) return;
  _allAdminProducts = await res.json();
  const active = _allAdminProducts.filter(p => p.status === 'active');

  const opts = active.map(p =>
    `<option value="${p.id}" data-plans='${JSON.stringify((p.plans||[]).map(pl=>pl.plan_type))}'>${escapeHtml(p.name)} (${p.game})</option>`
  ).join('');

  if (sel) {
    sel.innerHTML = '<option value="">Todos os produtos</option>' + opts;
    sel.addEventListener('change', () => updatePlanFilterDropdown(sel, document.getElementById('key-filter-plan'), true));
    updatePlanFilterDropdown(sel, document.getElementById('key-filter-plan'), true);
  }
  if (selModal) {
    selModal.innerHTML = '<option value="">— seleciona um produto —</option>' + opts;
    selModal.addEventListener('change', () => updatePlanFilterDropdown(selModal, document.getElementById('km-plan'), false));
    updatePlanFilterDropdown(selModal, document.getElementById('km-plan'), false);
  }
}

function updatePlanFilterDropdown(productSel, planSel, includeAll) {
  if (!planSel) return;
  const selected = productSel.options[productSel.selectedIndex];
  let plans = [];
  try { plans = JSON.parse(selected?.dataset?.plans || '[]'); } catch {}

  if (includeAll) {
    planSel.innerHTML = '<option value="">Todos os planos</option>' +
      plans.map(pt => `<option value="${pt}">${PLAN_LABELS_ADMIN[pt] || pt}</option>`).join('');
  } else {
    planSel.innerHTML = plans.length
      ? plans.map((pt, i) => `<option value="${pt}" ${i===0?'selected':''}>${PLAN_LABELS_ADMIN[pt] || pt}</option>`).join('')
      : '<option value="">— seleciona produto primeiro —</option>';
  }
}

async function loadKeys() {
  const ok = await checkAuth();
  if (!ok) return;
  const tbody = document.getElementById('keys-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px"><div class="spinner" style="margin:auto"></div></td></tr>';

  const productId = document.getElementById('key-filter-product')?.value || '';
  const planType  = document.getElementById('key-filter-plan')?.value || '';
  const used      = document.getElementById('key-filter-used')?.value || '';

  let url = '/keys?';
  if (productId) url += `product_id=${productId}&`;
  if (planType)  url += `plan_type=${planType}&`;
  if (used !== '') url += `used=${used}`;

  const res = await adminFetch(url);
  if (!res) return;
  const keys = await res.json();

  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">Nenhuma key encontrada</td></tr>';
    return;
  }

  tbody.innerHTML = keys.map(k => `
    <tr>
      <td style="color:var(--text-dim)">${k.id}</td>
      <td><strong>${escapeHtml(k.product_name)}</strong><br><span style="font-size:0.68rem;color:var(--text-dim)">${k.game}</span></td>
      <td><span class="plan-pill">${PLAN_LABELS_ADMIN[k.plan_type] || k.plan_type}</span></td>
      <td><code style="font-size:0.75rem;color:var(--accent2);user-select:all">${escapeHtml(k.key_value)}</code></td>
      <td><span class="status-pill ${k.is_used ? 'status-delivered' : 'status-pending'}">${k.is_used ? 'Utilizada' : 'Disponível'}</span></td>
      <td style="font-size:0.75rem;color:var(--text-dim)">${k.order_id ? '#' + k.order_id.slice(0,8).toUpperCase() : '—'}</td>
      <td>
        ${!k.is_used ? `<button class="btn btn-danger btn-sm" onclick="deleteKey(${k.id})">Apagar</button>` : '—'}
      </td>
    </tr>`).join('');
}

function openAddKeyModal() {
  document.getElementById('km-keys').value = '';
  document.getElementById('km-instructions').value = '';
  document.getElementById('key-modal').style.display = 'flex';
}

function closeKeyModal() {
  document.getElementById('key-modal').style.display = 'none';
}

async function saveKeys() {
  const productId   = document.getElementById('km-product').value;
  const planType    = document.getElementById('km-plan').value;
  const keysRaw     = document.getElementById('km-keys').value.trim();
  const instructions = document.getElementById('km-instructions').value.trim();

  if (!productId || !planType || !keysRaw) {
    showToast('Preenche produto, plano e keys', 'error');
    return;
  }

  const keysList = keysRaw.split('\n').map(k => k.trim()).filter(Boolean);

  const res = await adminFetch('/keys/bulk', {
    method: 'POST',
    body: JSON.stringify({ product_id: parseInt(productId), plan_type: planType, keys: keysList, instructions: instructions || null })
  });

  if (res && res.ok) {
    const data = await res.json();
    showToast(`${data.added} key(s) adicionada(s)!`, 'success');
    closeKeyModal();
    loadKeysSection();
  } else {
    showToast('Erro ao guardar keys', 'error');
  }
}

async function deleteKey(id) {
  if (!confirm('Apagar esta key?')) return;
  const res = await adminFetch(`/keys/${id}`, { method: 'DELETE' });
  if (res && res.ok) { showToast('Key apagada', 'info'); loadKeys(); loadKeyStats(); }
  else showToast('Erro ao apagar key', 'error');
}

// ── Settings ──────────────────────────────────────────────
async function loadSettings() {
  const ok = await checkAuth();
  if (!ok) return;

  const res = await adminFetch('/admin/settings');
  if (!res) return;
  const settings = await res.json();

  const nameEl = document.getElementById('s-store-name');
  const webhookEl = document.getElementById('s-webhook');
  if (nameEl) nameEl.value = settings.store_name || '';
  if (webhookEl) webhookEl.value = settings.discord_webhook || '';
}

async function saveSettings(e) {
  e.preventDefault();
  const body = {
    store_name: document.getElementById('s-store-name').value,
    discord_webhook: document.getElementById('s-webhook').value
  };
  const res = await adminFetch('/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
  if (res && res.ok) showToast('Settings saved!', 'success');
  else showToast('Failed to save settings', 'error');
}

// ── Logout ────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('m21_admin_token');
  window.location.href = '/admin/login.html';
}

// ── Helpers ───────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) closeModal();
});
