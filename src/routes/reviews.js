const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// POST /api/reviews — submit a review after purchase
router.post('/', (req, res) => {
  const { order_id, product_id, rating, comment } = req.body;

  if (!order_id || !product_id || !rating) {
    return res.status(400).json({ error: 'order_id, product_id e rating são obrigatórios' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
  }

  // Verify the order exists and contains this product
  const orderItem = db.prepare(
    'SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.id = ? AND oi.product_id = ?'
  ).get(order_id, product_id);
  if (!orderItem) {
    return res.status(403).json({ error: 'Pedido ou produto não encontrado' });
  }

  try {
    db.prepare(
      'INSERT INTO reviews (order_id, product_id, rating, comment) VALUES (?, ?, ?, ?)'
    ).run(order_id, product_id, rating, comment?.trim() || null);
    res.status(201).json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Já avaliaste este produto neste pedido' });
    }
    res.status(500).json({ error: 'Erro ao guardar avaliação' });
  }
});

// GET /api/reviews?product_id=X — public reviews for a product
router.get('/', (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id é obrigatório' });

  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at,
           u.username AS reviewer
    FROM reviews r
    LEFT JOIN orders o ON o.id = r.order_id
    LEFT JOIN users u ON u.id = o.user_id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(product_id);

  const stats = db.prepare(`
    SELECT COUNT(*) as total, ROUND(AVG(rating), 1) as avg_rating
    FROM reviews WHERE product_id = ?
  `).get(product_id);

  res.json({ reviews, total: stats.total, avg_rating: stats.avg_rating });
});

// GET /api/reviews/all — admin: all reviews
router.get('/all', requireAdmin, (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, p.name AS product_name, o.customer_name
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN orders o ON o.id = r.order_id
    ORDER BY r.created_at DESC
  `).all();
  res.json(reviews);
});

// DELETE /api/reviews/:id — admin: remove a review
router.delete('/:id', requireAdmin, (req, res) => {
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Avaliação não encontrada' });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
