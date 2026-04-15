require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDB } = require('./src/db/database');
const productsRouter = require('./src/routes/products');
const ordersRouter = require('./src/routes/orders');
const adminRouter = require('./src/routes/admin');
const authRouter = require('./src/routes/auth');
const keysRouter = require('./src/routes/keys');
const reviewsRouter = require('./src/routes/reviews');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// No-cache for JS/CSS/HTML so changes are always reflected immediately
app.use((req, res, next) => {
  if (/\.(js|css|html)$/.test(req.path)) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/keys', keysRouter);
app.use('/api/reviews', reviewsRouter);

// Catch-all: serve index.html for unknown routes (SPA-style)
app.get('*', (req, res) => {
  // Only for non-API routes
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Initialize DB then start server
initDB();
app.listen(PORT, () => {
  console.log(`\n  ┌────────────────────────────────────────┐`);
  console.log(`  │   MODDER21 STORE — Server Running      │`);
  console.log(`  │   http://localhost:${PORT}                │`);
  console.log(`  │   Admin: http://localhost:${PORT}/admin   │`);
  console.log(`  └────────────────────────────────────────┘\n`);
});
