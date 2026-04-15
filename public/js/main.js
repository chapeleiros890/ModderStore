// ── Shared utilities ──────────────────────────────────────
const API = '/api';

// ── Price formatter (BRL) ─────────────────────────────────
function fmt(price) {
  return 'R$ ' + parseFloat(price).toFixed(2).replace('.', ',');
}

// ── Game color map ────────────────────────────────────────
const GAME_COLORS = {
  'CS2':         '#4f9cf9',
  'FiveM':       '#22c55e',
  'GTA Online':  '#f59e0b',
  'Valorant':    '#ff4655',
  'Fortnite':    '#00d4ff',
  'DayZ':        '#f97316',
  'Roblox':      '#ff6b6b',
  'IPTV':        '#a855f7',
  'Farlight 84': '#ec4899',
};
function gameColor(game) { return GAME_COLORS[game] || '#7d8fa8'; }

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

// ── Cart (localStorage) ───────────────────────────────────
// Cart items: { cartKey, product_id, name, game, type, plan_type, price }
// cartKey = `${product_id}_${plan_type}` — unique per product+plan combo
const Cart = {
  get() {
    try {
      const items = JSON.parse(localStorage.getItem('m21_cart') || '[]');
      // Drop old-format items that don't have product_id or plan_type
      return items.filter(i => i.product_id && i.plan_type);
    } catch { return []; }
  },
  save(items) { localStorage.setItem('m21_cart', JSON.stringify(items)); Cart.updateBadge(); },
  add(product, plan_type, price) {
    const items = Cart.get();
    const cartKey = `${product.id}_${plan_type}`;
    if (items.find(i => i.cartKey === cartKey)) {
      showToast('Already in cart', 'info');
      return;
    }
    items.push({
      cartKey,
      product_id: product.id,
      name: product.name,
      game: product.game,
      type: product.type,
      plan_type,
      price
    });
    Cart.save(items);
    showToast(`${product.name} (${plan_type}) added to cart!`, 'success');
    Cart.updateBadge();
  },
  remove(cartKey) {
    Cart.save(Cart.get().filter(i => i.cartKey !== cartKey));
  },
  clear() { localStorage.removeItem('m21_cart'); Cart.updateBadge(); },
  count() { return Cart.get().length; },
  total() { return Cart.get().reduce((sum, i) => sum + i.price, 0); },
  updateBadge() {
    document.querySelectorAll('.cart-count').forEach(el => {
      const c = Cart.count();
      el.textContent = c;
      el.style.display = c > 0 ? 'flex' : 'none';
    });
  }
};

// ── Navbar ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Scroll effect
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', open);
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
      });
    });
  }

  // Cart badge
  Cart.updateBadge();

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // Featured products on homepage
  loadFeaturedProducts();
});

async function loadFeaturedProducts() {
  const grid = document.getElementById('featured-products');
  if (!grid) return;

  try {
    const res = await fetch(`${API}/products`);
    const products = await res.json();
    const featured = products.slice(0, 3);

    if (!featured.length) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = featured.map(p => {
      const badgeHtml = p.badge ? `<span class="badge badge-accent">${p.badge}</span>` : '';
      const minPlan = p.plans && p.plans.length ? p.plans[0] : null;
      const priceHtml = minPlan
        ? `<span class="product-price">from $${parseFloat(minPlan.price).toFixed(2)}</span>`
        : '';
      return `
        <div class="product-card fade-in">
          <div class="product-card-header">
            <span class="product-game-tag">${p.game}</span>
            ${badgeHtml}
          </div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description ? p.description.slice(0, 80) + '...' : ''}</div>
          <div class="product-footer">
            ${priceHtml}
            <a href="/products.html" class="btn btn-primary btn-sm">View Plans</a>
          </div>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
      }, { threshold: 0.05 });
      grid.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
    });
  } catch {}
}
