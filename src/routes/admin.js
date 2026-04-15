const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { requireAdmin, signAdminToken } = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'modder21admin';

  if (username !== expectedUser) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = password === expectedPass;
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signAdminToken();
  res.json({ token, message: 'Login successful' });
});

// GET /api/admin/me — verify token
router.get('/me', requireAdmin, (req, res) => {
  res.json({ role: 'admin', authenticated: true });
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// PUT /api/admin/settings
router.put('/settings', requireAdmin, (req, res) => {
  const allowed = ['store_name', 'discord_webhook', 'maintenance_mode'];
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  const updateAll = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) {
        upsert.run(key, String(value));
      }
    }
  });

  updateAll();
  res.json({ success: true });
});

module.exports = router;
