const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Attach plans + ratings to products using JOIN queries
function attachPlans(products, includeDisabled = false) {
  if (!products.length) return [];

  const ids = products.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const enabledClause = includeDisabled ? '' : 'AND pp.enabled = 1';

  const rows = db.prepare(`
    SELECT pp.product_id, pp.plan_type, pp.price, pp.enabled
    FROM product_plans pp
    WHERE pp.product_id IN (${placeholders}) ${enabledClause}
    ORDER BY pp.product_id, pp.id
  `).all(...ids);

  const ratingRows = db.prepare(`
    SELECT product_id, COUNT(*) as review_count, ROUND(AVG(rating), 1) as avg_rating
    FROM reviews WHERE product_id IN (${placeholders})
    GROUP BY product_id
  `).all(...ids);

  // Group plans and ratings by product_id
  const planMap = {};
  for (const row of rows) {
    if (!planMap[row.product_id]) planMap[row.product_id] = [];
    planMap[row.product_id].push({ plan_type: row.plan_type, price: row.price, enabled: row.enabled });
  }
  const ratingMap = {};
  for (const row of ratingRows) {
    ratingMap[row.product_id] = { avg_rating: row.avg_rating, review_count: row.review_count };
  }

  return products.map(p => {
    const plans = planMap[p.id] || [];
    const basePrice = plans.length ? plans[0].price : 0;
    let tags = [];
    try { tags = JSON.parse(p.tags || '[]'); } catch {}
    let gallery = [];
    try { gallery = JSON.parse(p.gallery || '[]'); } catch {}
    const { avg_rating = null, review_count = 0 } = ratingMap[p.id] || {};
    return { ...p, tags, gallery, plans, price: basePrice, avg_rating, review_count };
  });
}

// GET /api/products — public, list all active products
router.get('/', (req, res) => {
  const { game, category } = req.query;

  let sql = 'SELECT * FROM products WHERE status = ?';
  const params = ['active'];

  if (game && game !== 'all') {
    sql += ' AND game = ?';
    params.push(game);
  }
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY created_at DESC';

  const products = db.prepare(sql).all(...params);
  res.json(attachPlans(products));
});

// GET /api/products/games/list — public
router.get('/games/list', (req, res) => {
  const games = db.prepare(
    "SELECT DISTINCT game FROM products WHERE status = 'active' ORDER BY game"
  ).all().map(r => r.game);
  res.json(games);
});

// GET /api/products/categories/list — public
router.get('/categories/list', (req, res) => {
  const categories = db.prepare(
    "SELECT DISTINCT category FROM products WHERE status = 'active' ORDER BY category"
  ).all().map(r => r.category);
  res.json(categories);
});

// GET /api/products/admin/all — admin only
router.get('/admin/all', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(attachPlans(products, true)); // include disabled plans
});

// GET /api/products/:id — public single product
router.get('/:id', (req, res) => {
  const product = db.prepare(
    'SELECT * FROM products WHERE id = ? AND status = ?'
  ).get(req.params.id, 'active');

  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(attachPlans([product])[0]);
});

// POST /api/products — create
router.post('/', requireAdmin, (req, res) => {
  const { name, game, category, type, description, badge, image_url, video_url, gallery, tags, plans, status } = req.body;

  if (!name || !game) {
    return res.status(400).json({ error: 'name and game are required' });
  }
  if (!plans || !plans.length) {
    return res.status(400).json({ error: 'At least one plan is required' });
  }

  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
  const galleryJson = JSON.stringify(Array.isArray(gallery) ? gallery : []);

  const result = db.prepare(`
    INSERT INTO products (name, game, category, type, description, badge, image_url, video_url, gallery, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, game, category || game, type || 'software',
    description || '', badge || null,
    image_url || null, video_url || null, galleryJson, tagsJson,
    status || 'active'
  );

  const productId = result.lastInsertRowid;

  // Insert plans
  const insertPlan = db.prepare(
    'INSERT INTO product_plans (product_id, plan_type, price, enabled) VALUES (?, ?, ?, ?)'
  );
  for (const plan of plans) {
    if (plan.price > 0) {
      insertPlan.run(productId, plan.plan_type, parseFloat(plan.price), plan.enabled ? 1 : 0);
    }
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.status(201).json(attachPlans([product])[0]);
});

// PUT /api/products/:id — update
router.put('/:id', requireAdmin, (req, res) => {
  const { name, game, category, type, description, status, badge, image_url, video_url, gallery, tags, plans } = req.body;

  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const tagsJson = tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags : []) : undefined;
  const galleryJson = gallery !== undefined ? JSON.stringify(Array.isArray(gallery) ? gallery : []) : undefined;

  // Build SET clause dynamically to only update provided fields
  const fields = { name, game, type, description, status, badge, image_url, video_url };
  if (category !== undefined) fields.category = category;
  if (tagsJson !== undefined) fields.tags = tagsJson;
  if (galleryJson !== undefined) fields.gallery = galleryJson;

  const setClauses = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => `${k} = ?`).join(', ');
  const values = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([, v]) => v);

  if (setClauses) {
    db.prepare(`UPDATE products SET ${setClauses} WHERE id = ?`).run(...values, req.params.id);
  }

  // Update plans if provided
  if (plans && plans.length) {
    db.prepare('DELETE FROM product_plans WHERE product_id = ?').run(req.params.id);
    const insertPlan = db.prepare(
      'INSERT INTO product_plans (product_id, plan_type, price, enabled) VALUES (?, ?, ?, ?)'
    );
    for (const plan of plans) {
      if (plan.price > 0) {
        insertPlan.run(req.params.id, plan.plan_type, parseFloat(plan.price), plan.enabled ? 1 : 0);
      }
    }
  }

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(attachPlans([updated])[0]);
});

// DELETE /api/products/:id — soft delete
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  db.prepare("UPDATE products SET status = 'inactive' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
