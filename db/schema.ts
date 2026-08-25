import type { D1Database } from '@cloudflare/workers-types';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS purchase_requests (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL,
    category TEXT NOT NULL, total_units INTEGER, usage_frequency TEXT, expiry_date TEXT,
    product_url TEXT, similar_item TEXT, decision_note TEXT, status TEXT NOT NULL DEFAULT 'REVIEWING',
    review_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, reviewer_name TEXT NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('BUY_NOW','SAVE_FIRST','WAIT')),
    comment TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    last_used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, usage_type TEXT NOT NULL,
    amount REAL, note TEXT, client_event_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS device_states (
    id TEXT PRIMARY KEY, mode TEXT NOT NULL, health INTEGER NOT NULL, progress REAL NOT NULL DEFAULT 0,
    message TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_status ON purchase_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_request_id ON reviews(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_review_invites_request_id ON review_invites(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_asset_id ON usage_records(asset_id)`,
];

const seedStatements = [
  `INSERT OR IGNORE INTO purchase_requests (id,name,price,reason,category,total_units,usage_frequency,status,review_token,created_at) VALUES ('request-iceland','去冰岛看极光',18600,'二十七岁以前，想认真地去一次很远的地方。不是逃离，是奖励自己终于学会独自出发。','旅行体验',7,'一次完整旅行','REVIEWING','iceland-demo-2026','2026-08-21T10:00:00Z')`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at) VALUES ('r1','request-iceland','桃子','SAVE_FIRST','这件事你念叨很久了，值得去。慢一点准备，会更安心。','2026-08-22T10:00:00Z')`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at) VALUES ('r2','request-iceland','晴晴','BUY_NOW','支持出发，但别忘了把冬季装备和保险算进预算。','2026-08-22T11:00:00Z')`,
  `INSERT OR IGNORE INTO reviews (id,request_id,reviewer_name,choice,comment,created_at) VALUES ('r3','request-iceland','安安','SAVE_FIRST','先存到八成就开始订票，期待也会变成旅程的一部分。','2026-08-22T12:00:00Z')`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-1','request-iceland','iceland-a7f3k2','朋友 1','桃子','2026-08-22T10:00:00Z')`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-2','request-iceland','iceland-b9m4q7','朋友 2','晴晴','2026-08-22T11:00:00Z')`,
  `INSERT OR IGNORE INTO review_invites (id,request_id,token,label,used_by,used_at) VALUES ('invite-iceland-3','request-iceland','iceland-c2x8n5','朋友 3','安安','2026-08-22T12:00:00Z')`,
  `INSERT OR IGNORE INTO saving_goals (id,request_id,name,target,current,weekly_plan,created_at) VALUES ('saving-camera',NULL,'一台陪我看世界的相机',7000,4480,500,'2026-05-12T08:00:00Z')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,expiry_date,last_used_at) VALUES ('asset-dance','十二节现代舞年卡','COURSE',1680,12,9,9,'2026-11-20','2026-08-22')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,expiry_date,last_used_at) VALUES ('asset-pottery','六次陶艺体验课','COURSE',980,6,3,3,'2026-09-10','2026-08-11')`,
  `INSERT OR IGNORE INTO assets (id,name,type,purchase_price,total_units,used_units,usage_count,last_used_at) VALUES ('asset-headphones','降噪耳机','ITEM',2499,NULL,0,32,'2026-08-23')`,
  `INSERT OR IGNORE INTO device_states (id,mode,health,progress,message) VALUES ('flower-01','HEALTHY',82,0.64,'今天也在好好生活')`,
];

export async function ensureSchema(db: D1Database) {
  await db.batch(schemaStatements.map(sql => db.prepare(sql)));
  const requestColumns = await db.prepare(`PRAGMA table_info(purchase_requests)`).all<{ name: string }>();
  if (!requestColumns.results.some(column => column.name === 'decision_note')) {
    await db.prepare(`ALTER TABLE purchase_requests ADD COLUMN decision_note TEXT`).run();
  }
  await db.batch(seedStatements.map(sql => db.prepare(sql)));
}
