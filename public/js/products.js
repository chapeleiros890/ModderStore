let allProducts = [];
let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  await loadFilters();
  Cart.updateBadge();
});

async function loadProducts(game = 'all') {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = `<div class="loading-screen" style="grid-column:1/-1"><div class="spinner"></div><span>Loading products...</span></div>`;

  try {
    const url = game === 'all' ? `${API}/products` : `${API}/products?game=${encodeURIComponent(game)}`;
    const res = await fetch(url);
    allProducts = await res.json();
    renderProducts(allProducts);
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:60px 0">Failed to load products. Is the server running?</p>`;
  }
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (!products.length) {
    grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:60px 0">No products found for this filter.</p>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const color = gameColor(p.game);
    const badgeHtml = p.badge ? `<span class="badge badge-accent">${p.badge}</span>` : '';
    const minPlan = p.plans && p.plans.length ? p.plans[0] : null;
    const priceDisplay = minPlan ? `a partir de ${fmt(minPlan.price)}` : 'N/A';
    const plansCount = p.plans ? p.plans.length : 0;
    const plansLabel = plansCount > 1 ? `${plansCount} planos` : (plansCount === 1 ? '1 plano' : 'Sem planos');
    const tagsHtml = (p.tags || []).slice(0, 3).map(t => `<span class="tag-chip">${t}</span>`).join('');
    const imgHtml = p.image_url
      ? `<div class="product-card-img"><img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>`
      : '';
    const starsHtml = p.avg_rating
      ? `<div class="product-stars" title="${p.avg_rating} estrelas (${p.review_count} avaliações)">
           ${renderStars(p.avg_rating)}
           <span class="star-count">${p.avg_rating} <span style="color:var(--text-dim)">(${p.review_count})</span></span>
         </div>`
      : '';

    return `
      <div class="product-card fade-in" data-id="${p.id}">
        ${imgHtml}
        <div class="product-card-header">
          <span class="product-game-tag" style="background:${color}22;color:${color};border-color:${color}44">${p.game}</span>
          ${badgeHtml}
        </div>
        <div class="product-name">${p.name}</div>
        <div class="product-category-label">${p.category || p.game}</div>
        ${starsHtml}
        <div class="product-desc">${p.description || ''}</div>
        ${tagsHtml ? `<div class="product-tags">${tagsHtml}</div>` : ''}
        <div class="product-footer">
          <div>
            <span class="product-price">${priceDisplay}</span>
            <span class="plans-hint">${plansLabel}</span>
          </div>
          <button class="btn btn-primary btn-sm open-plans-btn" data-id="${p.id}">Selecionar Plano</button>
        </div>
      </div>`;
  }).join('');

  // Bind product cards — click anywhere except the button opens detail modal
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.open-plans-btn')) return;
      const product = allProducts.find(p => p.id == card.dataset.id);
      if (product) openDetailModal(product);
    });
    card.style.cursor = 'pointer';
  });

  // Bind "Select Plan" buttons — open plan modal directly
  grid.querySelectorAll('.open-plans-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const product = allProducts.find(p => p.id == btn.dataset.id);
      if (product) openPlanModal(product);
    });
  });

  // Animate
  requestAnimationFrame(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.05 });
    grid.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
  });
}

// ── Plan selector modal ───────────────────────────────────

const PLAN_LABELS = {
  daily: '1 Dia', weekly: '7 Dias', monthly: '30 Dias', lifetime: 'Vitalício',
  '3dias': '3 Dias', '15dias': '15 Dias', '90dias': '90 Dias', '180dias': '180 Dias',
  quarterly: '3 Meses', biannual: '6 Meses', yearly: '1 Ano',
  external: '30 Dias (Externo)', internal: '30 Dias (Interno)',
  legacy: 'GTA5 Legacy', enhanced: 'GTA5 Enhanced',
  '50': '50 Elogios', '100': '100 Elogios', '200': '200 Elogios',
  '500': '500 Elogios', '1000': '1000 Elogios',
};
const PLAN_ICONS  = {
  daily: '☀️', weekly: '📅', monthly: '📆', lifetime: '♾️',
  '3dias': '📅', '15dias': '📅', '90dias': '📆', '180dias': '🗓️',
  quarterly: '📆', biannual: '📆', yearly: '🗓️',
  external: '🖥️', internal: '⚙️',
  legacy: '🎮', enhanced: '🎮',
  '50': '💬', '100': '💬', '200': '💬', '500': '💬', '1000': '💬',
};

function openPlanModal(product) {
  const modal = document.getElementById('plan-modal');
  document.getElementById('plan-modal-name').textContent = product.name;
  document.getElementById('plan-modal-game').textContent = product.game + (product.category ? ' · ' + product.category : '');
  document.getElementById('plan-modal-desc').textContent = product.description || '';

  const plansContainer = document.getElementById('plan-cards');
  if (!product.plans || !product.plans.length) {
    plansContainer.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px">No plans available for this product.</p>`;
  } else {
    plansContainer.innerHTML = product.plans.map(plan => `
      <div class="plan-card" data-plan="${plan.plan_type}" data-price="${plan.price}" onclick="selectPlan(this)">
        <div class="plan-card-icon">${PLAN_ICONS[plan.plan_type] || '📦'}</div>
        <div class="plan-card-type">${PLAN_LABELS[plan.plan_type] || plan.plan_type}</div>
        <div class="plan-card-price">${fmt(plan.price)}</div>
      </div>
    `).join('');
  }

  // Reset add button
  const addBtn = document.getElementById('plan-add-btn');
  addBtn.disabled = true;
  addBtn.textContent = 'Select a plan';
  addBtn.onclick = null;

  modal.style.display = 'flex';
  modal._product = product;
}

function selectPlan(card) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  const plan_type = card.dataset.plan;
  const price = parseFloat(card.dataset.price);
  const product = document.getElementById('plan-modal')._product;

  const addBtn = document.getElementById('plan-add-btn');
  addBtn.disabled = false;
  addBtn.textContent = `Adicionar ao Carrinho — ${fmt(price)}`;
  addBtn.onclick = () => {
    Cart.add(product, plan_type, price);
    closePlanModal();
  };
}

function closePlanModal() {
  document.getElementById('plan-modal').style.display = 'none';
}

async function loadFilters() {
  const bar = document.getElementById('filter-bar');
  try {
    const res = await fetch(`${API}/products/games/list`);
    const games = await res.json();

    const buttons = ['all', ...games].map(game => {
      const label = game === 'all' ? 'All Games' : game;
      return `<button class="filter-btn ${game === 'all' ? 'active' : ''}" data-game="${game}">${label}</button>`;
    }).join('');
    bar.innerHTML = buttons;

    bar.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.game;
        loadProducts(activeFilter);
      });
    });
  } catch {}
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'plan-modal') closePlanModal();
});

function renderStars(avg) {
  return [1,2,3,4,5].map(n => {
    if (avg >= n) return '<span class="star filled">★</span>';
    if (avg >= n - 0.5) return '<span class="star half">★</span>';
    return '<span class="star empty">☆</span>';
  }).join('');
}

// ── Product Detail Modal ──────────────────────────────────

async function openDetailModal(product) {
  const modal = document.getElementById('detail-modal');
  const color = gameColor(product.game);

  // Media (video or hero image)
  const mediaEl = document.getElementById('detail-media');
  mediaEl.innerHTML = '';
  if (product.video_url) {
    const embedUrl = getYouTubeEmbed(product.video_url);
    if (embedUrl) {
      mediaEl.innerHTML = `<iframe class="detail-video" src="${embedUrl}" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
    } else {
      mediaEl.innerHTML = `<video class="detail-video" src="${product.video_url}" controls></video>`;
    }
    mediaEl.style.display = 'block';
  } else if (product.image_url) {
    mediaEl.innerHTML = `<img class="detail-hero-img" src="${product.image_url}" alt="${product.name}" />`;
    mediaEl.style.display = 'block';
  } else {
    mediaEl.style.display = 'none';
  }

  // Gallery
  const galleryEl = document.getElementById('detail-gallery');
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  if (gallery.length) {
    galleryEl.innerHTML = gallery.map(url =>
      `<img class="gallery-thumb" src="${url}" alt="gallery" onclick="setDetailHero('${url}')" />`
    ).join('');
    galleryEl.style.display = 'flex';
  } else {
    galleryEl.style.display = 'none';
  }

  // Info
  const gameTag = document.getElementById('detail-game-tag');
  gameTag.textContent = product.game;
  gameTag.style.cssText = `background:${color}22;color:${color};border-color:${color}44`;

  const badgeEl = document.getElementById('detail-badge');
  if (product.badge) { badgeEl.textContent = product.badge; badgeEl.style.display = ''; }
  else badgeEl.style.display = 'none';

  document.getElementById('detail-name').textContent = product.name;
  document.getElementById('detail-desc').textContent = product.description || '';

  // Stars
  const starsEl = document.getElementById('detail-stars');
  starsEl.innerHTML = product.avg_rating
    ? `${renderStars(product.avg_rating)} <span class="star-count">${product.avg_rating} (${product.review_count} avaliações)</span>`
    : '';

  // Tags
  const tagsEl = document.getElementById('detail-tags');
  tagsEl.innerHTML = (product.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join('');

  // Plans
  const plansContainer = document.getElementById('detail-plan-cards');
  plansContainer.innerHTML = (product.plans || []).map(plan => `
    <div class="plan-card" data-plan="${plan.plan_type}" data-price="${plan.price}" onclick="selectDetailPlan(this)">
      <div class="plan-card-icon">${PLAN_ICONS[plan.plan_type] || '📦'}</div>
      <div class="plan-card-type">${PLAN_LABELS[plan.plan_type] || plan.plan_type}</div>
      <div class="plan-card-price">${fmt(plan.price)}</div>
    </div>`).join('');

  const addBtn = document.getElementById('detail-add-btn');
  addBtn.disabled = true;
  addBtn.textContent = 'Adicionar ao Carrinho';
  addBtn.onclick = null;
  modal._product = product;

  // Load reviews async
  loadDetailReviews(product.id);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
  document.body.style.overflow = '';
  // Stop any video
  const iframe = document.querySelector('#detail-media iframe');
  if (iframe) iframe.src = iframe.src;
}

function selectDetailPlan(card) {
  document.querySelectorAll('#detail-plan-cards .plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  const plan_type = card.dataset.plan;
  const price = parseFloat(card.dataset.price);
  const product = document.getElementById('detail-modal')._product;
  const addBtn = document.getElementById('detail-add-btn');
  addBtn.disabled = false;
  addBtn.textContent = `Adicionar ao Carrinho — ${fmt(price)}`;
  addBtn.onclick = () => {
    Cart.add(product, plan_type, price);
    closeDetailModal();
    showToast(`${product.name} adicionado ao carrinho!`, 'success');
  };
}

function setDetailHero(url) {
  const mediaEl = document.getElementById('detail-media');
  mediaEl.innerHTML = `<img class="detail-hero-img" src="${url}" alt="gallery" />`;
  mediaEl.style.display = 'block';
}

function getYouTubeEmbed(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;
  if (url.includes('youtube.com/embed/')) return url;
  return null;
}

async function loadDetailReviews(productId) {
  const list = document.getElementById('detail-reviews-list');
  if (!list) return;
  try {
    const res = await fetch(`${API}/reviews?product_id=${productId}`);
    const data = await res.json();
    if (!data.reviews || !data.reviews.length) {
      list.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem">Ainda não há avaliações para este produto.</span>';
      return;
    }
    list.innerHTML = data.reviews.map(r => `
      <div class="detail-review-item">
        <div class="detail-review-header">
          <span class="detail-review-stars">${renderStars(r.rating)}</span>
          <span class="detail-review-author">${r.reviewer || 'Utilizador'}</span>
          <span class="detail-review-date">${new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        ${r.comment ? `<p class="detail-review-comment">${r.comment}</p>` : ''}
      </div>`).join('');
  } catch {
    list.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem">Erro ao carregar avaliações.</span>';
  }
}
