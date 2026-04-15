const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'store.db');
const db = new DatabaseSync(DB_PATH);

function initDB() {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      game        TEXT NOT NULL,
      type        TEXT DEFAULT 'software',
      description TEXT,
      status      TEXT DEFAULT 'active',
      badge       TEXT,
      image_url   TEXT,
      tags        TEXT DEFAULT '[]',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      plan_type   TEXT NOT NULL,
      price       REAL NOT NULL,
      enabled     INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id               TEXT PRIMARY KEY,
      customer_name    TEXT NOT NULL,
      customer_email   TEXT NOT NULL,
      discord_username TEXT,
      total            REAL NOT NULL,
      status           TEXT DEFAULT 'pending',
      payment_method   TEXT DEFAULT 'pix',
      license_key      TEXT,
      notes            TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at     DATETIME
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id     TEXT NOT NULL,
      product_id   INTEGER,
      product_name TEXT NOT NULL,
      plan_type    TEXT DEFAULT 'monthly',
      quantity     INTEGER DEFAULT 1,
      price        REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT UNIQUE NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      discord_username TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_keys (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id   INTEGER NOT NULL,
      plan_type    TEXT NOT NULL,
      key_value    TEXT NOT NULL,
      instructions TEXT,
      is_used      INTEGER DEFAULT 0,
      used_at      DATETIME,
      order_id     TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_id, product_id)
    );
  `);

  // Migrations: add columns to existing tables if not present
  try { db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER'); } catch {}
  try { db.exec('ALTER TABLE order_items ADD COLUMN key_id INTEGER'); } catch {}
  try { db.exec('ALTER TABLE order_items ADD COLUMN key_value TEXT'); } catch {}
  try { db.exec('ALTER TABLE products ADD COLUMN instructions TEXT'); } catch {}
  try { db.exec("ALTER TABLE products ADD COLUMN video_url TEXT"); } catch {}
  try { db.exec("ALTER TABLE products ADD COLUMN gallery TEXT DEFAULT '[]'"); } catch {}

  seedProducts();
  seedSettings();
  console.log('  ✓ Database initialized');
}

// ── Real products from Modder21 Store Discord ─────────────
const SEED_PRODUCTS = [
  // ── CS2 SOFTWARES ──────────────────────────────────────
  {
    name: 'Baimless CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: 'Hot', tags: '["aimbot","esp","undetected"]',
    description: 'One of the most trusted CS2 external cheats. Features include aimbot, ESP, wallhack, and triggerbot. Frequently updated after patches.',
    plans: [
      { plan_type: 'weekly',   price: 44.44,  enabled: 1 },
      { plan_type: 'monthly',  price: 85.99,  enabled: 1 },
      { plan_type: 'lifetime', price: 397.00, enabled: 1 },
    ]
  },
  {
    name: 'Tadala CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: 'Hot', tags: '["aimbot","esp","rage"]',
    description: 'Powerful CS2 software with rage and legit modes, advanced aimbot configuration, full ESP suite and built-in skin changer.',
    plans: [
      { plan_type: 'daily',   price: 12.99, enabled: 1 },
      { plan_type: '3dias',   price: 19.99, enabled: 1 },
      { plan_type: 'weekly',  price: 34.99, enabled: 1 },
      { plan_type: 'monthly', price: 64.99, enabled: 1 },
    ]
  },
  {
    name: 'Tadala GC CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["aimbot","esp","gc"]',
    description: 'Tadala GC para CS2 — versão avançada com recursos extras de game capture e configuração premium.',
    plans: [
      { plan_type: 'monthly', price: 379.99, enabled: 1 },
    ]
  },
  {
    name: 'Codeinware CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: 'Hot', tags: '["internal","aimbot","esp"]',
    description: 'Internal CS2 software with advanced aimbot, full ESP, radar hack and anti-screenshot protection. Highly configurable.',
    plans: [
      { plan_type: 'daily',    price: 9.90,   enabled: 1 },
      { plan_type: 'weekly',   price: 29.99,  enabled: 1 },
      { plan_type: 'monthly',  price: 45.50,  enabled: 1 },
      { plan_type: 'lifetime', price: 397.00, enabled: 1 },
    ]
  },
  {
    name: 'Predator CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["aimbot","esp","legit"]',
    description: 'Predator CS2 software com aimbot suave, ESP configurável e opções para jogo legit e competitivo.',
    plans: [
      { plan_type: 'daily',   price: 10.50, enabled: 1 },
      { plan_type: 'weekly',  price: 20.99, enabled: 1 },
      { plan_type: 'monthly', price: 34.99, enabled: 1 },
      { plan_type: '90dias',  price: 87.99, enabled: 1 },
    ]
  },
  {
    name: 'Eruption CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: 'New', tags: '["esp","aimbot","new"]',
    description: 'Brand new CS2 cheat with modern UI, clean aimbot, box/bone ESP, radar and smooth bezier curves for natural movement.',
    plans: [
      { plan_type: 'daily',   price: 3.00,  enabled: 1 },
      { plan_type: '3dias',   price: 6.99,  enabled: 1 },
      { plan_type: 'weekly',  price: 11.00, enabled: 1 },
      { plan_type: 'monthly', price: 27.00, enabled: 1 },
    ]
  },
  {
    name: 'Synapse CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["external","esp"]',
    description: 'External CS2 cheat with player ESP, aimbot, and no-flash. Lightweight and easy to configure.',
    plans: [
      { plan_type: 'daily',    price: 8.99,   enabled: 1 },
      { plan_type: 'weekly',   price: 19.99,  enabled: 1 },
      { plan_type: 'monthly',  price: 26.99,  enabled: 1 },
      { plan_type: 'lifetime', price: 147.99, enabled: 1 },
    ]
  },
  {
    name: 'Xone CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["internal","legit"]',
    description: 'Xone CS2 interno — aimbot suave, ESP configurável e modo legit para jogo competitivo.',
    plans: [
      { plan_type: 'daily',   price: 10.60,  enabled: 1 },
      { plan_type: '15dias',  price: 20.60,  enabled: 1 },
      { plan_type: 'monthly', price: 35.60,  enabled: 1 },
      { plan_type: '180dias', price: 187.00, enabled: 1 },
    ]
  },
  {
    name: 'Distort CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["external","internal","esp","aimbot"]',
    description: 'Distort CS2 disponível em versão externa e interna. ESP, aimbot multi-modo e radar overlay.',
    plans: [
      { plan_type: 'external', price: 59.99, enabled: 1 },
      { plan_type: 'internal', price: 79.99, enabled: 1 },
    ]
  },
  {
    name: 'Xanax666 CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["hvh","rage"]',
    description: 'HvH-oriented CS2 software with powerful resolver, anti-aim and rage aimbot settings for competitive HvH lobbies.',
    plans: [
      { plan_type: 'daily',    price: 9.99,   enabled: 1 },
      { plan_type: 'weekly',   price: 27.99,  enabled: 1 },
      { plan_type: 'monthly',  price: 49.99,  enabled: 1 },
      { plan_type: 'lifetime', price: 297.00, enabled: 1 },
    ]
  },
  {
    name: 'Impact CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["hvh","internal"]',
    description: 'Internal CS2 cheat with top-tier HvH performance, advanced anti-aim and fast update cycle.',
    plans: [
      { plan_type: '3dias',    price: 12.99,  enabled: 1 },
      { plan_type: 'monthly',  price: 37.99,  enabled: 1 },
      { plan_type: 'lifetime', price: 197.00, enabled: 1 },
    ]
  },
  {
    name: 'Midnight CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["external","legit"]',
    description: 'Midnight is a clean legit CS2 external with smooth aimbot, customizable FOV, and minimal performance impact.',
    plans: [
      { plan_type: 'monthly', price: 40.50, enabled: 1 },
    ]
  },
  {
    name: 'Nixware CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["hvh","internal"]',
    description: 'Nixware is a well-known CS2 internal with powerful HvH features, fast loader and active community.',
    plans: [
      { plan_type: 'monthly', price: 29.99, enabled: 1 },
    ]
  },
  {
    name: 'Memesense CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["hvh","internal"]',
    description: 'CS2 internal cheat with strong HvH capabilities, advanced resolver and smooth UI configuration menu.',
    plans: [
      { plan_type: 'weekly',   price: 12.99, enabled: 1 },
      { plan_type: 'monthly',  price: 19.99, enabled: 1 },
      { plan_type: 'lifetime', price: 49.99, enabled: 1 },
    ]
  },
  {
    name: 'Neverlose CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["hvh","scripting","premium"]',
    description: 'Premium CS2 internal with Lua scripting support, advanced HvH resolver, full ESP and visuals customization.',
    plans: [
      { plan_type: 'monthly', price: 235.00, enabled: 1 },
    ]
  },
  {
    name: 'Plague CS2', category: 'CS2 Softwares', game: 'CS2', type: 'software',
    badge: null, tags: '["external","aimbot"]',
    description: 'Plague is a CS2 external cheat with clean aimbot, box ESP, health bar and radar. Great for beginners.',
    plans: [
      { plan_type: 'monthly', price: 94.90, enabled: 1 },
    ]
  },

  // ── CS2 CONFIGS ────────────────────────────────────────
  {
    name: 'PACK 35 Configs Nixware', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","nixware","pack"]',
    description: 'Pack com 35 configs Nixware para CS2. Presets legit e HvH incluídos. Fácil de importar e personalizar.',
    plans: [
      { plan_type: 'lifetime', price: 25.99, enabled: 1 },
    ]
  },
  {
    name: 'Configs Midnight CS2', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","midnight"]',
    description: 'Configs privadas Midnight CS2 com configurações suaves de aimbot legit, ESP ajustado e visuais limpos.',
    plans: [
      { plan_type: 'lifetime', price: 25.99, enabled: 1 },
    ]
  },
  {
    name: 'Configs Privadas Memesense', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","memesense"]',
    description: 'Configs privadas Memesense com configurações HvH testadas, anti-aim e rage aimbot seguro.',
    plans: [
      { plan_type: 'lifetime', price: 25.99, enabled: 1 },
    ]
  },
  {
    name: 'PACK 5 Configs Plague', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","plague","pack"]',
    description: 'Pack com 5 configs Plague CS2 com aimbot silencioso e configurações ESP limpas. Pronto a usar.',
    plans: [
      { plan_type: 'lifetime', price: 29.99, enabled: 1 },
    ]
  },
  {
    name: 'Configs Predator CS2', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","predator"]',
    description: 'Configs Predator CS2 criadas para partidas competitivas. Aimbot legit equilibrado e ESP sutil.',
    plans: [
      { plan_type: 'lifetime', price: 15.99, enabled: 1 },
    ]
  },
  {
    name: 'PACK 5 Configs Iniuria', category: 'CS2 Configs', game: 'CS2', type: 'config',
    badge: null, tags: '["config","iniuria","pack"]',
    description: 'Pack com 5 configs Iniuria com preset completo para modos legit e rage. Inclui autostrafe e backtrack.',
    plans: [
      { plan_type: 'lifetime', price: 30.30, enabled: 1 },
    ]
  },

  // ── CS2 SERVICES ───────────────────────────────────────
  {
    name: 'Contas CS2', category: 'CS2 Services', game: 'CS2', type: 'service',
    badge: null, tags: '["account","prime"]',
    description: 'Ready-to-use CS2 accounts. Prime status available. Various ranks. Instant delivery after purchase.',
    plans: [
      { plan_type: 'lifetime', price: 14.99, enabled: 1 },
    ]
  },
  {
    name: 'Elogios CS2', category: 'CS2 Services', game: 'CS2', type: 'service',
    badge: null, tags: '["commends","boost"]',
    description: 'CS2 commend boost service. Fast delivery via bot. Choose the quantity of commends per order.',
    plans: [
      { plan_type: '50',   price: 15.99, enabled: 1 },
      { plan_type: '100',  price: 25.99, enabled: 1 },
      { plan_type: '200',  price: 32.99, enabled: 1 },
      { plan_type: '500',  price: 59.99, enabled: 1 },
      { plan_type: '1000', price: 99.99, enabled: 1 },
    ]
  },
  {
    name: 'Otimização PC', category: 'CS2 Services', game: 'CS2', type: 'service',
    badge: null, tags: '["fps","optimization","pc"]',
    description: 'Otimização completa para PC — todos os jogos. FPS boost, launch options e tweaks Windows para performance máxima.',
    plans: [
      { plan_type: 'lifetime', price: 59.99, enabled: 1 },
    ]
  },

  // ── GTA ONLINE / FIVEM ─────────────────────────────────
  {
    name: 'Nexoria GTA Enhanced', category: 'GTA Online', game: 'GTA Online', type: 'software',
    badge: null, tags: '["mod-menu","money","gta","enhanced"]',
    description: 'Nexoria é um poderoso mod menu para GTA Online com money drop, spawner de veículos, godmode e opções de jogador.',
    plans: [
      { plan_type: 'weekly',   price: 40.00,  enabled: 1 },
      { plan_type: 'monthly',  price: 60.00,  enabled: 1 },
      { plan_type: 'lifetime', price: 145.00, enabled: 1 },
    ]
  },
  {
    name: 'Creekside Menu GTA', category: 'GTA Online', game: 'GTA Online', type: 'software',
    badge: null, tags: '["mod-menu","gta","protection","legacy","enhanced"]',
    description: 'Creekside GTA Online menu com suite completa de proteção, opções de dinheiro, unlock all e mods visuais.',
    plans: [
      { plan_type: 'legacy',   price: 135.99, enabled: 1 },
      { plan_type: 'enhanced', price: 149.99, enabled: 1 },
    ]
  },
  {
    name: 'Valores PC', category: 'GTA Online', game: 'GTA Online', type: 'service',
    badge: null, tags: '["money","drop","service"]',
    description: 'GTA Online money drop service. Safe and fast. Choose your amount and we handle the rest.',
    plans: [
      { plan_type: 'lifetime', price: 12.99, enabled: 1 },
    ]
  },
  {
    name: 'Shark Menu FiveM', category: 'FiveM', game: 'FiveM', type: 'software',
    badge: null, tags: '["fivem","esp","menu"]',
    description: 'Shark Menu para FiveM com ESP de jogadores, godmode, opções de veículos e bypass de servidor.',
    plans: [
      { plan_type: 'weekly',   price: 40.00, enabled: 1 },
      { plan_type: 'monthly',  price: 70.00, enabled: 1 },
    ]
  },
  {
    name: 'Elysium External FiveM', category: 'FiveM', game: 'FiveM', type: 'software',
    badge: null, tags: '["fivem","esp","aimbot","external"]',
    description: 'Elysium External para FiveM com aimbot, ESP, noclip e ferramentas avançadas de interação com servidor.',
    plans: [
      { plan_type: 'monthly',  price: 33.50, enabled: 1 },
      { plan_type: 'lifetime', price: 79.99, enabled: 1 },
    ]
  },
  {
    name: 'Spoof3r Baimless', category: 'FiveM', game: 'FiveM', type: 'software',
    badge: null, tags: '["spoofer","fivem","ban-bypass"]',
    description: 'Spoofer de hardware para FiveM usando a plataforma Baimless. Bypass de bans de hardware permanente.',
    plans: [
      { plan_type: 'lifetime', price: 70.70, enabled: 1 },
    ]
  },

  // ── OUTROS ─────────────────────────────────────────────
  {
    name: 'Baimless Valorant', category: 'Outros', game: 'Valorant', type: 'software',
    badge: null, tags: '["valorant","esp","aimbot"]',
    description: 'Baimless para Valorant — ESP externo, aimbot com predição suave e trigger bot. Seguro a nível de kernel.',
    plans: [
      { plan_type: 'weekly',   price: 95.90,  enabled: 1 },
      { plan_type: 'monthly',  price: 157.90, enabled: 1 },
    ]
  },
  {
    name: 'Baimless Fortnite', category: 'Outros', game: 'Fortnite', type: 'software',
    badge: null, tags: '["fortnite","aimbot","esp"]',
    description: 'Baimless para Fortnite com aimbot suave, ESP completo, assistência de construção e radar. Atualização automática.',
    plans: [
      { plan_type: 'monthly',  price: 119.99, enabled: 1 },
    ]
  },
  {
    name: 'Elysium DayZ', category: 'Outros', game: 'DayZ', type: 'software',
    badge: null, tags: '["dayz","esp","loot"]',
    description: 'Elysium para DayZ com ESP completo: jogadores, loot, zombies, veículos. Filtros de distância configuráveis.',
    plans: [
      { plan_type: 'monthly',  price: 97.99, enabled: 1 },
    ]
  },
  {
    name: 'Elysium Roblox', category: 'Outros', game: 'Roblox', type: 'software',
    badge: null, tags: '["roblox","executor","scripts"]',
    description: 'Elysium executor para Roblox com suporte LuaU, hub de scripts e anti-detecção. Funciona nos jogos mais populares.',
    plans: [
      { plan_type: 'monthly',  price: 59.99, enabled: 1 },
    ]
  },
  {
    name: 'Elysium Farlight 84', category: 'Outros', game: 'Farlight 84', type: 'software',
    badge: null, tags: '["farlight","esp","aimbot"]',
    description: 'Elysium para Farlight 84 — aimbot, ESP, radar e speed hack. Atualizado regularmente após patches.',
    plans: [
      { plan_type: 'monthly',  price: 57.99, enabled: 1 },
    ]
  },

  // ── IPTV ───────────────────────────────────────────────
  {
    name: 'IPTV Series & Filmes', category: 'IPTV', game: 'IPTV', type: 'service',
    badge: null, tags: '["iptv","streaming","series","filmes"]',
    description: 'Acesso completo a canais IPTV, séries e filmes. Compatível com Smart TV, Android, iOS e PC. Suporte incluído.',
    plans: [
      { plan_type: 'monthly',   price: 34.99,  enabled: 1 },
      { plan_type: 'quarterly', price: 97.99,  enabled: 1 },
      { plan_type: 'biannual',  price: 167.99, enabled: 1 },
      { plan_type: 'yearly',    price: 315.00, enabled: 1 },
    ]
  },
];

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (count > 0) return;

  db.exec('BEGIN');
  try {
    const insertProduct = db.prepare(
      'INSERT INTO products (name, category, game, type, description, badge, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertPlan = db.prepare(
      'INSERT INTO product_plans (product_id, plan_type, price, enabled) VALUES (?, ?, ?, ?)'
    );

    for (const p of SEED_PRODUCTS) {
      const result = insertProduct.run(p.name, p.category, p.game, p.type, p.description, p.badge, p.tags);
      const productId = result.lastInsertRowid;
      for (const plan of p.plans) {
        insertPlan.run(productId, plan.plan_type, plan.price, plan.enabled);
      }
    }

    db.exec('COMMIT');
    console.log(`  ✓ ${SEED_PRODUCTS.length} products seeded`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function seedSettings() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insert.run('store_name', process.env.STORE_NAME || 'Modder21 Store');
  insert.run('discord_webhook', process.env.DISCORD_WEBHOOK_URL || '');
  insert.run('discord_invite', 'https://discord.gg/PTQDVVvJg3');
  insert.run('maintenance_mode', 'false');
}

module.exports = { db, initDB };
