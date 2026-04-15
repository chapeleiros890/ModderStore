const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { requireUser, signUserToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password, discord_username } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email e password são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) return res.status(409).json({ error: 'Email ou username já em uso' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, discord_username) VALUES (?, ?, ?, ?)'
  ).run(username, email.toLowerCase(), hash, discord_username || null);

  const user = db.prepare('SELECT id, username, email, discord_username, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signUserToken(user);
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password são obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = signUserToken(user);
  const safe = { id: user.id, username: user.username, email: user.email, discord_username: user.discord_username, created_at: user.created_at };
  res.json({ token, user: safe });
});

// GET /api/auth/me
router.get('/me', requireUser, (req, res) => {
  const user = db.prepare('SELECT id, username, email, discord_username, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(user);
});

// GET /api/auth/orders — user's own orders with keys (single JOIN query)
router.get('/orders', requireUser, (req, res) => {
  const rows = db.prepare(`
    SELECT o.id, o.customer_name, o.customer_email, o.discord_username, o.total,
           o.status, o.payment_method, o.notes, o.created_at, o.delivered_at,
           o.license_key,
           oi.id AS item_id, oi.product_id, oi.product_name, oi.plan_type,
           oi.quantity, oi.price AS item_price, oi.key_value
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);

  // Group rows by order id
  const orderMap = new Map();
  for (const row of rows) {
    if (!orderMap.has(row.id)) {
      const order = {
        id: row.id, customer_name: row.customer_name, customer_email: row.customer_email,
        discord_username: row.discord_username, total: row.total, status: row.status,
        payment_method: row.payment_method, notes: row.notes, created_at: row.created_at,
        delivered_at: row.delivered_at, items: []
      };
      if (row.status === 'delivered') order.license_key = row.license_key;
      orderMap.set(row.id, order);
    }
    if (row.item_id) {
      orderMap.get(row.id).items.push({
        id: row.item_id, product_id: row.product_id, product_name: row.product_name,
        plan_type: row.plan_type, quantity: row.quantity, price: row.item_price,
        key_value: row.key_value
      });
    }
  }

  res.json([...orderMap.values()]);
});

module.exports = router;
