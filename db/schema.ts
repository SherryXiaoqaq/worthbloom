import type { D1Database } from '@cloudflare/workers-types';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS purchase_requests (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL,
    category TEXT, total_units INTEGER, usage_frequency TEXT, expiry_date TEXT,
    product_url TEXT, similar_item TEXT, decision_note TEXT, status TEXT NOT NULL DEFAULT 'REVIEWING',
    review_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revision INTEGER NOT NULL DEFAULT 1,
    source_type TEXT, type TEXT, concern TEXT, brand TEXT, sku_label TEXT, details TEXT,
    source_platform TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, reviewer_name TEXT NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('BUY_NOW','SAVE_FIRST','WAIT')),
    comment TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewer_role TEXT, stamp TEXT, reasons TEXT, note TEXT,
    request_revision INTEGER, wish_snapshot TEXT, legacy_context INTEGER NOT NULL DEFAULT 0,
    claimed_by TEXT, claimed_at TEXT,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS review_invites (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL, used_by TEXT, used_at TEXT, revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS final_decisions (
    request_id TEXT PRIMARY KEY, decision TEXT NOT NULL, decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS saving_goals (
    id TEXT PRIMARY KEY, request_id TEXT UNIQUE, name TEXT NOT NULL, target REAL NOT NULL,
    current REAL NOT NULL DEFAULT 0, weekly_plan REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, request_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
    purchase_price REAL NOT NULL, total_units INTEGER, used_units INTEGER NOT NULL DEFAULT 0,
    current_balance REAL, expiry_date TEXT, usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, usage_type TEXT NOT NULL,
    amount REAL, note TEXT, client_event_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS asset_reflections (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, asset_name TEXT NOT NULL, asset_type TEXT NOT NULL,
    feeling TEXT, rating INTEGER, would_buy_again TEXT NOT NULL, note TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'MANUAL', usage_count INTEGER NOT NULL DEFAULT 0,
    cost_per_use REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS device_states (
    id TEXT PRIMARY KEY, mode TEXT NOT NULL, health INTEGER NOT NULL, progress REAL NOT NULL DEFAULT 0,
    message TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wish_images (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, request_revision INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', question_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
    question_id TEXT, skipped INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS agent_reports (
    session_id TEXT PRIMARY KEY, report_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS growth_accounts (
    user_id TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS growth_ledger_entries (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, points INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES growth_accounts(user_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS claim_tokens (
    token_digest TEXT PRIMARY KEY, review_id TEXT NOT NULL, expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_status ON purchase_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_request_id ON reviews(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_review_invites_request_id ON review_invites(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_asset_id ON usage_records(asset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_asset_reflections_asset_id ON asset_reflections(asset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wish_images_request_id ON wish_images(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_sessions_request_id ON agent_sessions(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_growth_ledger_user ON growth_ledger_entries(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_claim_tokens_review_id ON claim_tokens(review_id)`,
];

const seedStatements = [
  `INSERT OR IGNORE INTO purchase_requests (id,name,price,reason,category,total_units,usage_frequency,status,review_token,created_at,type,concern,revision,updated_at) VALUES ('request-iceland','去冰岛看极光',18600,'二十七岁以前，想认真地去一次很远的地方。不是逃离，是奖励自己终于学会独自出发。','一次性体验/消耗品',1,'一次完整旅行','REVIEWING','iceland-demo-2026','2026-08-21T10:00:00Z','SINGLE_USE','',1,'2026-08-21T10:00:00Z')`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at,request_revision,legacy_context) VALUES ('r1','request-iceland','桃子','SAVE_FIRST','这件事你念叨很久了，值得去。慢一点准备，会更安心。','2026-08-22T10:00:00Z',1,1)`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at,request_revision,legacy_context) VALUES ('r2','request-iceland','晴晴','BUY_NOW','支持出发，但别忘了把冬季装备和保险算进预算。','2026-08-22T11:00:00Z',1,1)`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at,request_revision,legacy_context) VALUES ('r3','request-iceland','安安','SAVE_FIRST','先存到八成就开始订票，期待也会变成旅程的一部分。','2026-08-22T12:00:00Z',1,1)`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-1','request-iceland','iceland-a7f3k2','朋友 1','桃子','2026-08-22T10:00:00Z')`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-2','request-iceland','iceland-b9m4q7','朋友 2','晴晴','2026-08-22T11:00:00Z')`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-3','request-iceland','iceland-c2x8n5','朋友 3','安安','2026-08-22T12:00:00Z')`,
  `INSERT OR IGNORE INTO saving_goals (id,request_id,name,target,current,weekly_plan,created_at) VALUES ('saving-camera',NULL,'一台陪我看世界的相机',7000,4480,500,'2026-05-12T08:00:00Z')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,expiry_date,last_used_at) VALUES ('asset-dance','十二节现代舞年卡','COURSE',1680,12,9,9,'2026-11-20','2026-08-22')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,expiry_date,last_used_at) VALUES ('asset-pottery','六次陶艺体验课','COURSE',980,6,3,3,'2026-09-10','2026-08-11')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,last_used_at) VALUES ('asset-headphones','降噪耳机','ITEM',2499,NULL,0,32,'2026-08-23')`,
  `INSERT OR IGNORE INTO device_states (id,mode,health,progress,message) VALUES ('flower-01','HEALTHY',82,0.64,'今天也在好好生活')`,
];

// Columns added to existing tables by the spec v1 migration. ensureSchema
// ALTERs them in for installs that pre-date the new CREATE TABLE definitions.
const purchaseRequestMigrations: Array<[string, string]> = [
  ['decision_note', 'ALTER TABLE purchase_requests ADD COLUMN decision_note TEXT'],
  ['revision', 'ALTER TABLE purchase_requests ADD COLUMN revision INTEGER NOT NULL DEFAULT 1'],
  ['source_type', 'ALTER TABLE purchase_requests ADD COLUMN source_type TEXT'],
  ['type', 'ALTER TABLE purchase_requests ADD COLUMN type TEXT'],
  ['concern', 'ALTER TABLE purchase_requests ADD COLUMN concern TEXT'],
  ['brand', 'ALTER TABLE purchase_requests ADD COLUMN brand TEXT'],
  ['sku_label', 'ALTER TABLE purchase_requests ADD COLUMN sku_label TEXT'],
  ['details', 'ALTER TABLE purchase_requests ADD COLUMN details TEXT'],
  ['source_platform', 'ALTER TABLE purchase_requests ADD COLUMN source_platform TEXT'],
  ['updated_at', 'ALTER TABLE purchase_requests ADD COLUMN updated_at TEXT'],
];

const reviewMigrations: Array<[string, string]> = [
  ['reviewer_role', 'ALTER TABLE reviews ADD COLUMN reviewer_role TEXT'],
  ['stamp', 'ALTER TABLE reviews ADD COLUMN stamp TEXT'],
  ['reasons', 'ALTER TABLE reviews ADD COLUMN reasons TEXT'],
  ['note', 'ALTER TABLE reviews ADD COLUMN note TEXT'],
  ['request_revision', 'ALTER TABLE reviews ADD COLUMN request_revision INTEGER'],
  ['wish_snapshot', 'ALTER TABLE reviews ADD COLUMN wish_snapshot TEXT'],
  ['legacy_context', 'ALTER TABLE reviews ADD COLUMN legacy_context INTEGER NOT NULL DEFAULT 0'],
  ['claimed_by', 'ALTER TABLE reviews ADD COLUMN claimed_by TEXT'],
  ['claimed_at', 'ALTER TABLE reviews ADD COLUMN claimed_at TEXT'],
];

const assetMigrations: Array<[string, string]> = [
  ['archived_at', 'ALTER TABLE assets ADD COLUMN archived_at TEXT'],
];

const legacyFeelingSql = `CASE
  WHEN rating >= 5 THEN 'BECAME_PART_OF_LIFE'
  WHEN rating >= 3 THEN 'SOMETIMES_USEFUL'
  WHEN rating >= 2 THEN 'BARELY_USED'
  ELSE 'NOT_FOR_ME'
END`;

async function ensureAssetReflectionSchema(db:D1Database) {
  let columns = await db.prepare(`PRAGMA table_info(asset_reflections)`).all<{ name:string; notnull:number }>();
  let have = new Set(columns.results.map(column => column.name));
  if(!have.has('feeling')) {
    await db.prepare(`ALTER TABLE asset_reflections ADD COLUMN feeling TEXT`).run();
    columns = await db.prepare(`PRAGMA table_info(asset_reflections)`).all<{ name:string; notnull:number }>();
    have = new Set(columns.results.map(column => column.name));
  }

  const ratingColumn = columns.results.find(column => column.name==='rating');
  if(ratingColumn?.notnull) {
    await db.batch([
      db.prepare(`DROP TABLE IF EXISTS asset_reflections_v2`),
      db.prepare(`CREATE TABLE asset_reflections_v2 (
        id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, asset_name TEXT NOT NULL, asset_type TEXT NOT NULL,
        feeling TEXT, rating INTEGER, would_buy_again TEXT NOT NULL, note TEXT NOT NULL,
        trigger TEXT NOT NULL DEFAULT 'MANUAL', usage_count INTEGER NOT NULL DEFAULT 0,
        cost_per_use REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`INSERT INTO asset_reflections_v2 (id,asset_id,asset_name,asset_type,feeling,rating,would_buy_again,note,trigger,usage_count,cost_per_use,created_at)
        SELECT id,asset_id,asset_name,asset_type,COALESCE(feeling,${legacyFeelingSql}),rating,would_buy_again,note,trigger,usage_count,cost_per_use,created_at
        FROM asset_reflections`),
      db.prepare(`DROP TABLE asset_reflections`),
      db.prepare(`ALTER TABLE asset_reflections_v2 RENAME TO asset_reflections`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_asset_reflections_asset_id ON asset_reflections(asset_id)`),
    ]);
    return;
  }

  if(have.has('feeling')) {
    await db.prepare(`UPDATE asset_reflections SET feeling = ${legacyFeelingSql} WHERE feeling IS NULL OR feeling = ''`).run();
  }
}

export async function ensureSchema(db: D1Database) {
  await db.batch(schemaStatements.map(sql => db.prepare(sql)));
  const requestColumns = await db.prepare(`PRAGMA table_info(purchase_requests)`).all<{ name: string }>();
  const requestHave = new Set(requestColumns.results.map(c => c.name));
  for (const [col, sql] of purchaseRequestMigrations) {
    if (!requestHave.has(col)) await db.prepare(sql).run();
  }
  const reviewColumns = await db.prepare(`PRAGMA table_info(reviews)`).all<{ name: string }>();
  const reviewHave = new Set(reviewColumns.results.map(c => c.name));
  for (const [col, sql] of reviewMigrations) {
    if (!reviewHave.has(col)) await db.prepare(sql).run();
  }
  const assetColumns = await db.prepare(`PRAGMA table_info(assets)`).all<{ name:string }>();
  const assetHave = new Set(assetColumns.results.map(column => column.name));
  for(const [column,sql] of assetMigrations) {
    if(!assetHave.has(column))await db.prepare(sql).run();
  }
  await ensureAssetReflectionSchema(db);
  await db.batch(seedStatements.map(sql => db.prepare(sql)));
}
