const PAYMENT_METHODS = [
  { id: 'pix',         label: 'PIX',         icon: '🟢', desc: 'Instantâneo · Apenas Brasil' },
  { id: 'credit_card', label: 'Cartão',       icon: '💳', desc: 'Visa / Mastercard' },
  { id: 'stripe',      label: 'Stripe',       icon: '⚡', desc: 'Pagamento online seguro' },
  { id: 'paypal',      label: 'PayPal',       icon: '🅿️', desc: 'Pagar com PayPal' },
];

const PLAN_LABELS = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', lifetime: 'Vitalício' };
const PM_LABELS   = { pix: 'PIX', credit_card: 'Cartão', stripe: 'Stripe', paypal: 'PayPal' };

let selectedPayment = 'pix';

document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
  renderCart();
  renderPaymentMethods();
  const form = document.getElementById('checkout-form');
  if (form) form.addEventListener('submit', handleCheckout);
});

function renderPaymentMethods() {
  const container = document.getElementById('payment-methods');
  if (!container) return;
  container.innerHTML = PAYMENT_METHODS.map(pm => `
    <div class="payment-card ${pm.id === selectedPayment ? 'selected' : ''}" data-pm="${pm.id}" onclick="selectPayment('${pm.id}')">
      <div class="payment-card-icon">${pm.icon}</div>
      <div class="payment-card-label">${pm.label}</div>
      <div class="payment-card-desc">${pm.desc}</div>
    </div>
  `).join('');
}

function selectPayment(id) {
  selectedPayment = id;
  document.querySelectorAll('.payment-card').forEach(c => c.classList.toggle('selected', c.dataset.pm === id));
}

function renderCart() {
  const items = Cart.get();
  const container   = document.getElementById('cart-items');
  const summaryItems = document.getElementById('summary-items');
  const totalEl     = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const itemCountEl = document.getElementById('item-count');

  if (itemCountEl) itemCountEl.textContent = items.length;

  const formWrap    = document.getElementById('checkout-form-wrap');
  const paymentWrap = document.getElementById('payment-wrap');

  if (!items.length) {
    if (container) container.innerHTML = `
      <div class="cart-empty">
        <div style="font-size:3rem;margin-bottom:16px">🛒</div>
        <h3>O teu carrinho está vazio</h3>
        <p style="margin-bottom:24px;font-size:0.88rem">Navega pelos produtos e adiciona algo!</p>
        <a href="/products.html" class="btn btn-primary">Ver Produtos</a>
      </div>`;
    if (summaryItems) summaryItems.innerHTML = '';
    if (totalEl) totalEl.textContent = 'R$ 0,00';
    if (checkoutBtn) checkoutBtn.disabled = true;
    if (formWrap) formWrap.style.display = 'none';
    if (paymentWrap) paymentWrap.style.display = 'none';
    return;
  }

  if (formWrap) formWrap.style.display = 'block';
  if (paymentWrap) paymentWrap.style.display = 'block';

  if (container) {
    container.innerHTML = items.map(item => `
      <div class="cart-item" data-key="${item.cartKey}">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-game">${item.game} · <span class="plan-pill">${PLAN_LABELS[item.plan_type] || item.plan_type}</span></div>
        </div>
        <div class="cart-item-price">${fmt(item.price)}</div>
        <button class="cart-item-remove" data-key="${item.cartKey}" title="Remover">✕</button>
      </div>
    `).join('');
    container.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => { Cart.remove(btn.dataset.key); renderCart(); showToast('Item removido', 'info'); });
    });
  }

  if (summaryItems) {
    summaryItems.innerHTML = items.map(item => `
      <div class="summary-row">
        <span>${item.name} <small style="color:var(--text-dim)">(${PLAN_LABELS[item.plan_type] || item.plan_type})</small></span>
        <span>${fmt(item.price)}</span>
      </div>
    `).join('');
  }

  if (totalEl) totalEl.textContent = fmt(Cart.total());
  if (checkoutBtn) checkoutBtn.disabled = false;
}

let checkoutInProgress = false;

async function handleCheckout(e) {
  e.preventDefault();
  if (checkoutInProgress) return;
  const btn = document.getElementById('checkout-btn');
  const name    = document.getElementById('customer-name').value.trim();
  const email   = document.getElementById('customer-email').value.trim();
  const discord = document.getElementById('discord-username').value.trim();
  const items   = Cart.get();

  if (!items.length) { showToast('O teu carrinho está vazio', 'error'); return; }

  checkoutInProgress = true;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> A processar...';
  document.querySelectorAll('#checkout-form input, #checkout-form select').forEach(el => el.disabled = true);

  // Build headers — include user token if logged in
  const headers = { 'Content-Type': 'application/json' };
  if (typeof UserAuth !== 'undefined' && UserAuth.isLoggedIn()) {
    headers['Authorization'] = `Bearer ${UserAuth.getToken()}`;
  }

  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_name: name,
        customer_email: email,
        discord_username: discord,
        payment_method: selectedPayment,
        items: items.map(i => ({ product_id: i.product_id, plan_type: i.plan_type, quantity: 1 }))
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Erro ao processar pedido', 'error');
      btn.disabled = false; btn.innerHTML = 'Fazer Pedido';
      document.querySelectorAll('#checkout-form input, #checkout-form select').forEach(el => el.disabled = false);
      checkoutInProgress = false;
      return;
    }

    Cart.clear();
    showOrderSuccess(data);

  } catch {
    showToast('Erro de rede. Tenta novamente.', 'error');
    btn.disabled = false; btn.innerHTML = 'Fazer Pedido';
    document.querySelectorAll('#checkout-form input, #checkout-form select').forEach(el => el.disabled = false);
    checkoutInProgress = false;
  }
}

function showOrderSuccess(data) {
  const cartSection = document.getElementById('cart-section');
  if (!cartSection) return;

  cartSection.innerHTML = `
    <div class="container">
      <div class="order-success fade-in visible" id="order-success-box">
        <div class="check-icon">${data.instantly_delivered ? '🎉' : '✅'}</div>
        <h2>${data.instantly_delivered ? 'Entrega Instantânea!' : 'Pedido Recebido!'}</h2>
        <div class="order-id-box">PEDIDO #${data.order_id.slice(0,8).toUpperCase()}</div>
        <div style="color:var(--text-muted);font-size:0.83rem;margin-bottom:16px">
          ${PM_LABELS[data.payment_method] || data.payment_method} · ${fmt(data.total)}
        </div>
        <div id="keys-section"></div>
        <div id="review-section"></div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px">
          <a href="/products.html" class="btn btn-outline">Ver Mais Produtos</a>
          <a href="/account.html" class="btn btn-primary">Minha Conta</a>
        </div>
      </div>
    </div>`;

  Cart.updateBadge();

  // Render keys
  const keysSection = document.getElementById('keys-section');
  if (data.instantly_delivered && data.items && data.items.some(i => i.key)) {
    keysSection.innerHTML = `
      <div class="keys-delivery-box">
        <div class="keys-delivery-title">🔑 As tuas keys</div>
        <div id="key-items-list"></div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:12px">Guarda estas keys. Também estão disponíveis na tua <a href="/account.html">conta</a>.</div>
      </div>`;
    const keyList = document.getElementById('key-items-list');
    data.items.filter(i => i.key).forEach(item => {
      const div = document.createElement('div');
      div.className = 'key-item';
      div.innerHTML = `
        <div class="key-item-header">
          <span class="key-product-name">${item.product_name}</span>
          <span class="plan-pill">${PLAN_LABELS[item.plan_type] || item.plan_type}</span>
        </div>
        <div class="key-value-box">
          <code class="key-code"></code>
          <button class="btn-copy" title="Copiar">📋</button>
        </div>
        ${item.instructions ? `<div class="key-instructions">${item.instructions}</div>` : ''}`;
      div.querySelector('.key-code').textContent = item.key;
      div.querySelector('.btn-copy').addEventListener('click', function() { copyKey(item.key, this); });
      keyList.appendChild(div);
    });
  } else {
    keysSection.innerHTML = `
      <div class="disclaimer-box" style="margin:16px 0">
        <div style="display:flex;gap:10px;align-items:flex-start;font-size:0.82rem;color:var(--text-muted)">
          <span style="color:var(--warn)">⏳</span>
          <span>Sem stock disponível. Entraremos em contacto via Discord nas próximas <strong>48 horas</strong>.</span>
        </div>
      </div>`;
  }

  // Render review prompt (one review per product purchased)
  renderReviewPrompt(data);
}

function renderReviewPrompt(data) {
  const section = document.getElementById('review-section');
  if (!section || !data.items || !data.items.length) return;

  // One review prompt per unique product
  const products = [];
  const seen = new Set();
  for (const item of data.items) {
    if (!seen.has(item.product_id)) {
      seen.add(item.product_id);
      products.push(item);
    }
  }

  section.innerHTML = `
    <div class="review-prompt-box">
      <div class="review-prompt-title">⭐ Avalia a tua compra</div>
      <p style="font-size:0.8rem;color:var(--text-dim);margin:0 0 14px">A tua opinião ajuda outros utilizadores!</p>
      <div id="review-products"></div>
    </div>`;

  const container = document.getElementById('review-products');
  products.forEach(item => {
    const wrap = document.createElement('div');
    wrap.className = 'review-product-item';
    wrap.dataset.productId = item.product_id;
    wrap.dataset.orderId = data.order_id;
    wrap.innerHTML = `
      <div class="review-product-name">${item.product_name}</div>
      <div class="star-picker" data-product-id="${item.product_id}">
        ${[1,2,3,4,5].map(n => `<button class="star-btn" data-val="${n}" aria-label="${n} estrela${n>1?'s':''}">★</button>`).join('')}
      </div>
      <textarea class="review-comment" placeholder="Comentário opcional..." maxlength="300" rows="2"></textarea>
      <button class="btn btn-sm btn-primary review-submit-btn" style="margin-top:6px">Enviar Avaliação</button>
      <div class="review-sent" style="display:none;color:var(--success);font-size:0.8rem;margin-top:6px">✅ Avaliação enviada!</div>`;
    container.appendChild(wrap);

    let selectedRating = 0;
    const stars = wrap.querySelectorAll('.star-btn');
    stars.forEach(btn => {
      btn.addEventListener('mouseenter', () => highlightStars(stars, +btn.dataset.val));
      btn.addEventListener('mouseleave', () => highlightStars(stars, selectedRating));
      btn.addEventListener('click', () => {
        selectedRating = +btn.dataset.val;
        highlightStars(stars, selectedRating);
      });
    });

    wrap.querySelector('.review-submit-btn').addEventListener('click', async () => {
      if (!selectedRating) { showToast('Seleciona uma avaliação de 1 a 5 estrelas', 'error'); return; }
      const comment = wrap.querySelector('.review-comment').value.trim();
      try {
        const res = await fetch(`${API}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: data.order_id, product_id: item.product_id, rating: selectedRating, comment })
        });
        if (res.ok) {
          wrap.querySelector('.review-submit-btn').style.display = 'none';
          wrap.querySelector('.review-sent').style.display = 'block';
          wrap.querySelector('.review-comment').style.display = 'none';
        } else {
          const d = await res.json();
          showToast(d.error || 'Erro ao enviar avaliação', 'error');
        }
      } catch { showToast('Erro de rede', 'error'); }
    });
  });
}

function highlightStars(stars, val) {
  stars.forEach(s => s.classList.toggle('active', +s.dataset.val <= val));
}

function copyKey(key, btn) {
  navigator.clipboard.writeText(key).then(() => {
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = '📋', 2000);
  });
}
