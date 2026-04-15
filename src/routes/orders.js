const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { requireAdmin, optionalUser } = require('../middleware/auth');
const fetch = require('node-fetch');

const VALID_PAYMENT_METHODS = ['pix', 'credit_card', 'stripe', 'paypal'];

// POST /api/orders — place a new order
router.post('/', optionalUser, async (req, res) => {
  const { customer_name, customer_email, discord_username, payment_method, items } = req.body;

  if (!customer_name || !customer_email || !items || !items.length) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta' });
  }

  const pm = VALID_PAYMENT_METHODS.includes(payment_method) ? payment_method : 'pix';
  const userId = req.user ? req.user.id : null;

  // Validate items and get prices
  let total = 0;
  const resolvedItems = [];

  for (const item of items) {
    const product = db.prepare(
      "SELECT * FROM products WHERE id = ? AND status = 'active'"
    ).get(item.product_id);
    if (!product) return res.status(400).json({ error: `Produto ${item.product_id} não encontrado` });

    const planType = item.plan_type;
    if (!planType) return res.status(400).json({ error: 'plan_type em falta num dos itens' });
    const plan = db.prepare(
      "SELECT * FROM product_plans WHERE product_id = ? AND plan_type = ? AND enabled = 1"
    ).get(product.id, planType);
    if (!plan) return res.status(400).json({ error: `Plano "${planType}" não disponível para "${product.name}"` });

    // Check for available key — try exact plan match first, then 'any'
    const availableKey = db.prepare(
      "SELECT * FROM product_keys WHERE product_id = ? AND plan_type = ? AND is_used = 0 ORDER BY id LIMIT 1"
    ).get(product.id, planType);

    total += plan.price;
    resolvedItems.push({ product, planType, price: plan.price, availableKey });
  }

  const orderId = uuidv4();
  const allKeysAvailable = resolvedItems.every(i => i.availableKey);
  const orderStatus = allKeysAvailable ? 'delivered' : 'pending';
  const deliveredAt = allKeysAvailable ? new Date().toISOString() : null;

  // Insert order + items + assign keys atomically
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO orders (id, customer_name, customer_email, discord_username, total, payment_method, user_id, status, delivered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, customer_name, customer_email, discord_username || null, total, pm, userId, orderStatus, deliveredAt);

    for (const { product, planType, price, availableKey } of resolvedItems) {
      let keyId = null;
      let keyValue = null;

      if (availableKey) {
        db.prepare(
          "UPDATE product_keys SET is_used = 1, order_id = ?, used_at = ? WHERE id = ?"
        ).run(orderId, new Date().toISOString(), availableKey.id);
        keyId = availableKey.id;
        keyValue = availableKey.key_value;
      }

      db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, plan_type, quantity, price, key_id, key_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, product.id, product.name, planType, 1, price, keyId, keyValue);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Order error:', err);
    return res.status(500).json({ error: 'Erro ao processar pedido' });
  }

  // Build response items with key info
  const responseItems = resolvedItems.map(({ product, planType, price, availableKey }) => {
    const item = {
      product_id: product.id,
      product_name: product.name,
      plan_type: planType,
      price
    };
    if (availableKey) {
      item.key = availableKey.key_value;
      item.instructions = availableKey.instructions || product.instructions || null;
    }
    return item;
  });

  await notifyDiscord(orderId, customer_name, discord_username, resolvedItems, total, pm, orderStatus);

  res.status(201).json({
    order_id: orderId,
    total,
    status: orderStatus,
    payment_method: pm,
    instantly_delivered: allKeysAvailable,
    items: responseItems,
    message: allKeysAvailable
      ? 'Pedido entregue! A tua key está abaixo.'
      : 'Pedido recebido. Entraremos em contacto via Discord nas próximas 48 horas.'
  });
});

// GET /api/orders/stats/summary — dashboard stats (must be before /:id)
router.get('/stats/summary', requireAdmin, (req, res) => {
  const stats = {
    total_orders: db.prepare("SELECT COUNT(*) as c FROM orders").get().c,
    pending_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c,
    delivered_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c,
    total_revenue: db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status != 'cancelled'").get().s,
    recent_orders: db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5").all()
  };
  res.json(stats);
});

// GET /api/orders — list all orders (admin)
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*,
           GROUP_CONCAT(oi.product_name || ' (' || oi.plan_type || ')', ', ') AS product_names
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
  `;
  const params = [];
  if (status) { sql += ' WHERE o.status = ?'; params.push(status); }
  sql += ' GROUP BY o.id ORDER BY o.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/orders/:id/full — full order detail (admin)
router.get('/:id/full', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

// GET /api/orders/:id — public order lookup
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const safeOrder = { ...order };
  if (order.status !== 'delivered') delete safeOrder.license_key;
  res.json({ ...safeOrder, items });
});

// PATCH /api/orders/:id — update status / license key (admin)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { status, license_key, notes } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const updates = {};
  if (status) updates.status = status;
  if (license_key !== undefined) updates.license_key = license_key;
  if (notes !== undefined) updates.notes = notes;
  if (status === 'delivered') updates.delivered_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

  if (status === 'delivered') await notifyDiscordDelivery(order, license_key);

  res.json(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id));
});

// DELETE /api/orders/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Discord notifications ──────────────────────────────────
const PM_LABELS = { pix: 'PIX', credit_card: 'Cartão', stripe: 'Stripe', paypal: 'PayPal' };
const PLAN_LABELS = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', lifetime: 'Vitalício' };

async function notifyDiscord(orderId, customerName, discordUser, items, total, pm, status) {
  const webhookUrl = db.prepare("SELECT value FROM settings WHERE key = 'discord_webhook'").get()?.value;
  if (!webhookUrl) return;

  const productList = items.map(i =>
    `• ${i.product.name} [${PLAN_LABELS[i.planType] || i.planType}] — R$ ${i.price.toFixed(2).replace('.', ',')}`
  ).join('\n');

  const payload = {
    embeds: [{
      title: status === 'delivered' ? '✅ Pedido Entregue Automaticamente' : '🛒 Novo Pedido',
      color: status === 'delivered' ? 0x22c55e : 0x4f9cf9,
      fields: [
        { name: 'Pedido', value: `\`${orderId.slice(0,8).toUpperCase()}\``, inline: true },
        { name: 'Cliente', value: customerName, inline: true },
        { name: 'Discord', value: discordUser || 'Não fornecido', inline: true },
        { name: 'Produtos', value: productList },
        { name: 'Total', value: `**R$ ${total.toFixed(2).replace('.', ',')}**`, inline: true },
        { name: 'Pagamento', value: PM_LABELS[pm] || pm, inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Modder21 Store' }
    }]
  };

  try { await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch (e) { console.error('Discord webhook error:', e.message); }
}

async function notifyDiscordDelivery(order, licenseKey) {
  const webhookUrl = db.prepare("SELECT value FROM settings WHERE key = 'discord_webhook'").get()?.value;
  if (!webhookUrl) return;
  const payload = {
    embeds: [{
      title: '✅ Pedido Entregue (Manual)',
      color: 0x22c55e,
      fields: [
        { name: 'Pedido', value: `\`${order.id.slice(0,8).toUpperCase()}\``, inline: true },
        { name: 'Cliente', value: order.customer_name, inline: true },
        { name: 'Discord', value: order.discord_username || 'N/A', inline: true },
        { name: 'Key', value: licenseKey ? `\`${licenseKey}\`` : 'N/A' }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Modder21 Store' }
    }]
  };
  try { await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch (e) { console.error('Discord webhook error:', e.message); }
}

module.exports = router;
