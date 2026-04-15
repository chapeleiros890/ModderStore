const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/keys — all keys with product info (admin)
router.get('/', requireAdmin, (req, res) => {
  const { product_id, plan_type, used } = req.query;

  let sql = `
    SELECT pk.*, p.name AS product_name, p.game
    FROM product_keys pk
    LEFT JOIN products p ON p.id = pk.product_id
  `;
  const params = [];
  const where = [];

  if (product_id) { where.push('pk.product_id = ?'); params.push(product_id); }
  if (plan_type)  { where.push('pk.plan_type = ?');  params.push(plan_type); }
  if (used !== undefined) { where.push('pk.is_used = ?'); params.push(used === 'true' ? 1 : 0); }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY pk.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/keys/stats — available key count per product/plan (admin)
router.get('/stats', requireAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT pk.product_id, p.name AS product_name, p.game, pk.plan_type,
           SUM(CASE WHEN pk.is_used = 0 THEN 1 ELSE 0 END) AS available,
           SUM(CASE WHEN pk.is_used = 1 THEN 1 ELSE 0 END) AS used,
           COUNT(*) AS total
    FROM product_keys pk
    LEFT JOIN products p ON p.id = pk.product_id
    GROUP BY pk.product_id, pk.plan_type
    ORDER BY p.name, pk.plan_type
  `).all();
  res.json(stats);
});

// POST /api/keys — add a single key (admin)
router.post('/', requireAdmin, (req, res) => {
  const { product_id, plan_type, key_value, instructions } = req.body;

  if (!product_id || !plan_type || !key_value) {
    return res.status(400).json({ error: 'product_id, plan_type e key_value são obrigatórios' });
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  const result = db.prepare(
    'INSERT INTO product_keys (product_id, plan_type, key_value, instructions) VALUES (?, ?, ?, ?)'
  ).run(product_id, plan_type, key_value.trim(), instructions || null);

  res.status(201).json(db.prepare('SELECT * FROM product_keys WHERE id = ?').get(result.lastInsertRowid));
});

// POST /api/keys/bulk — add multiple keys at once (admin)
router.post('/bulk', requireAdmin, (req, res) => {
  const { product_id, plan_type, keys, instructions } = req.body;

  if (!product_id || !plan_type || !keys || !keys.length) {
    return res.status(400).json({ error: 'product_id, plan_type e keys são obrigatórios' });
  }

  const insert = db.prepare(
    'INSERT INTO product_keys (product_id, plan_type, key_value, instructions) VALUES (?, ?, ?, ?)'
  );

  let added = 0;
  db.exec('BEGIN');
  try {
    for (const k of keys) {
      const kv = typeof k === 'string' ? k.trim() : String(k).trim();
      if (kv) { insert.run(product_id, plan_type, kv, instructions || null); added++; }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Erro ao inserir keys' });
  }

  res.status(201).json({ added });
});

// PUT /api/keys/:id — update key instructions (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const { instructions, key_value } = req.body;
  const key = db.prepare('SELECT * FROM product_keys WHERE id = ?').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key não encontrada' });
  if (key.is_used) return res.status(400).json({ error: 'Não é possível editar uma key já utilizada' });

  const updates = {};
  if (instructions !== undefined) updates.instructions = instructions;
  if (key_value) updates.key_value = key_value.trim();

  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE product_keys SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  }

  res.json(db.prepare('SELECT * FROM product_keys WHERE id = ?').get(req.params.id));
});

// DELETE /api/keys/:id — delete unused key (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const key = db.prepare('SELECT * FROM product_keys WHERE id = ?').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key não encontrada' });
  if (key.is_used) return res.status(400).json({ error: 'Não é possível apagar uma key já utilizada' });

  db.prepare('DELETE FROM product_keys WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
