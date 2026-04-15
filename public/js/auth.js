// ── User auth state ───────────────────────────────────────
const UserAuth = {
  _token: localStorage.getItem('m21_user_token'),
  _user: null,

  getToken() { return this._token; },
  isLoggedIn() { return !!this._token; },
  getUser() { return this._user; },

  setSession(token, user) {
    this._token = token;
    this._user = user;
    localStorage.setItem('m21_user_token', token);
  },

  clearSession() {
    this._token = null;
    this._user = null;
    localStorage.removeItem('m21_user_token');
  },

  authHeaders() {
    return this._token
      ? { 'Authorization': `Bearer ${this._token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  },

  async loadUser() {
    if (!this._token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: this.authHeaders() });
      if (!res.ok) { this.clearSession(); return null; }
      this._user = await res.json();
      return this._user;
    } catch { return null; }
  }
};

// ── Auth modal ────────────────────────────────────────────
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  switchAuthTab(tab);
  modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  clearAuthErrors();
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('login-form-wrap').style.display  = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form-wrap').style.display = tab === 'register' ? 'block' : 'none';
}

function clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}

// Login form submit
async function submitLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const errEl = document.getElementById('login-error');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  btn.disabled = true; btn.textContent = 'A entrar...';
  clearAuthErrors();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Erro ao entrar';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Entrar';
      return;
    }
    UserAuth.setSession(data.token, data.user);
    closeAuthModal();
    updateNavAuth();
    showToast(`Bem-vindo, ${data.user.username}!`, 'success');
  } catch {
    errEl.textContent = 'Erro de rede';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

// Register form submit
async function submitRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const errEl = document.getElementById('register-error');
  const username = document.getElementById('auth-reg-username').value.trim();
  const email = document.getElementById('auth-reg-email').value.trim();
  const password = document.getElementById('auth-reg-password').value;

  btn.disabled = true; btn.textContent = 'A criar conta...';
  clearAuthErrors();

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Erro ao registar';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Criar Conta';
      return;
    }
    UserAuth.setSession(data.token, data.user);
    closeAuthModal();
    updateNavAuth();
    showToast(`Conta criada! Bem-vindo, ${data.user.username}!`, 'success');
  } catch {
    errEl.textContent = 'Erro de rede';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Criar Conta';
  }
}

// Update navbar based on auth state
function updateNavAuth() {
  const loginBtn  = document.getElementById('nav-login-btn');
  const userMenu  = document.getElementById('nav-user-menu');
  const userLabel = document.getElementById('nav-username');

  if (!loginBtn) return;

  if (UserAuth.isLoggedIn() && UserAuth.getUser()) {
    loginBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    if (userLabel) userLabel.textContent = UserAuth.getUser().username;
  } else {
    loginBtn.style.display = 'inline-flex';
    if (userMenu) userMenu.style.display = 'none';
  }
}

function logout() {
  UserAuth.clearSession();
  updateNavAuth();
  showToast('Sessão terminada', 'info');
  if (window.location.pathname.includes('account')) window.location.href = '/';
}

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  if (UserAuth.isLoggedIn()) await UserAuth.loadUser();
  updateNavAuth();

  // Bind modal forms
  const loginForm = document.getElementById('auth-login-form');
  if (loginForm) loginForm.addEventListener('submit', submitLogin);

  const regForm = document.getElementById('auth-register-form');
  if (regForm) regForm.addEventListener('submit', submitRegister);

  // Close on overlay click
  const modal = document.getElementById('auth-modal');
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
});
