import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/app/data/queue.db' 
  : './queue.db';
const verboseSqlite = sqlite3.verbose();
const db = new verboseSqlite.Database(dbPath);

// Helper to run database queries with Promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Transaction helper
async function transaction(fn) {
  await run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

// Initialize database schema
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      token_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      called_at TEXT,
      completed_at TEXT,
      created_date TEXT NOT NULL,
      source TEXT NOT NULL
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_tokens_date ON tokens (created_date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens (status)`);

  const defaultSettings = [
    { key: 'clinic_name', value: process.env.CLINIC_NAME || 'Oakridge Family Clinic' },
    { key: 'doctor_name', value: process.env.DOCTOR_NAME || 'Dr. Evelyn Stone' },
    { key: 'doctor_status', value: 'Free' },
    { key: 'current_doctor_token_id', value: null },
    { key: 'current_date', value: new Date().toISOString().split('T')[0] },
    { key: 'trial_start_date', value: new Date().toISOString().split('T')[0] },
    { key: 'subscription_status', value: 'trial' },
    { key: 'subscription_key', value: null }
  ];

  for (const s of defaultSettings) {
    await run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [s.key, s.value === null ? null : String(s.value)]);
  }
}

// Check for day rollover and execute resets if necessary
async function checkDayRollover() {
  const todayStr = new Date().toISOString().split('T')[0];
  const storedDateRow = await get(`SELECT value FROM settings WHERE key = 'current_date'`);
  const storedDate = storedDateRow ? storedDateRow.value : todayStr;

  if (storedDate !== todayStr) {
    console.log(`Day rollover detected! Resetting queue from ${storedDate} to ${todayStr}`);
    await transaction(async () => {
      await run(
        `UPDATE tokens 
         SET status = 'cancelled', completed_at = ? 
         WHERE created_date = ? AND status IN ('waiting', 'in_progress')`,
        [new Date().toISOString(), storedDate]
      );

      await run(`UPDATE settings SET value = 'Free' WHERE key = 'doctor_status'`);
      await run(`UPDATE settings SET value = NULL WHERE key = 'current_doctor_token_id'`);
      await run(`UPDATE settings SET value = ? WHERE key = 'current_date'`, [todayStr]);
    });
  }
}

async function getSettings() {
  await checkDayRollover();
  const rows = await all(`SELECT key, value FROM settings`);
  const settingsObj = {};
  rows.forEach(r => {
    settingsObj[r.key] = r.value === 'null' || r.value === 'NULL' ? null : r.value;
  });

  // Calculate billing info
  const trialStartStr = settingsObj.trial_start_date || new Date().toISOString().split('T')[0];
  const subStatus = settingsObj.subscription_status || 'trial';
  
  const today = new Date();
  const start = new Date(trialStartStr);
  today.setHours(0,0,0,0);
  start.setHours(0,0,0,0);
  
  const diffTime = today - start;
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  settingsObj.days_remaining = Math.max(0, 30 - daysElapsed);
  settingsObj.is_expired = subStatus !== 'active' && daysElapsed > 30;

  return settingsObj;
}

async function updateSetting(key, value) {
  await run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value === null ? null : String(value)]);
}

async function getQueue(date) {
  await checkDayRollover();
  return all(`
    SELECT * FROM tokens 
    WHERE created_date = ? 
    ORDER BY token_number ASC
  `, [date]);
}

async function getToken(id) {
  await checkDayRollover();
  return get(`SELECT * FROM tokens WHERE id = ?`, [id]);
}

async function findActiveTokenByPhone(phone, date) {
  if (!phone) return null;
  return get(`
    SELECT * FROM tokens 
    WHERE phone = ? AND created_date = ? AND status IN ('waiting', 'in_progress')
    LIMIT 1
  `, [phone, date]);
}

async function addToken({ id, name, phone, source }) {
  await checkDayRollover();
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  return transaction(async () => {
    if (phone) {
      const existing = await findActiveTokenByPhone(phone, todayStr);
      if (existing) {
        return existing;
      }
    }

    await run(`
      INSERT INTO tokens (id, token_number, name, phone, status, joined_at, created_date, source)
      VALUES (
        ?,
        (SELECT COALESCE(MAX(token_number), 1000) + 1 FROM tokens WHERE created_date = ?),
        ?,
        ?,
        'waiting',
        ?,
        ?,
        ?
      )
    `, [id, todayStr, name, phone, now, todayStr, source]);

    return get(`SELECT * FROM tokens WHERE id = ?`, [id]);
  });
}

async function callNext() {
  await checkDayRollover();
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  return transaction(async () => {
    const nextPatient = await get(`
      SELECT * FROM tokens 
      WHERE created_date = ? AND status = 'waiting' 
      ORDER BY token_number ASC 
      LIMIT 1
    `, [todayStr]);

    if (!nextPatient) {
      return null;
    }

    await run(`
      UPDATE tokens 
      SET status = 'in_progress', called_at = ? 
      WHERE id = ?
    `, [now, nextPatient.id]);

    await run(`UPDATE settings SET value = 'With patient' WHERE key = 'doctor_status'`);
    await run(`UPDATE settings SET value = ? WHERE key = 'current_doctor_token_id'`, [nextPatient.id]);

    return get(`SELECT * FROM tokens WHERE id = ?`, [nextPatient.id]);
  });
}

async function completeToken(id) {
  await checkDayRollover();
  const now = new Date().toISOString();

  return transaction(async () => {
    const token = await get(`SELECT * FROM tokens WHERE id = ?`, [id]);
    if (!token) return null;

    await run(`
      UPDATE tokens 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `, [now, id]);

    const settings = await getSettings();
    if (settings.current_doctor_token_id === id) {
      await run(`UPDATE settings SET value = 'Free' WHERE key = 'doctor_status'`);
      await run(`UPDATE settings SET value = NULL WHERE key = 'current_doctor_token_id'`);
    }

    return get(`SELECT * FROM tokens WHERE id = ?`, [id]);
  });
}

async function markNoShow(id) {
  await checkDayRollover();
  const now = new Date().toISOString();

  return transaction(async () => {
    const token = await get(`SELECT * FROM tokens WHERE id = ?`, [id]);
    if (!token) return null;

    await run(`
      UPDATE tokens 
      SET status = 'no_show', completed_at = ? 
      WHERE id = ?
    `, [now, id]);

    const settings = await getSettings();
    if (settings.current_doctor_token_id === id) {
      await run(`UPDATE settings SET value = 'Free' WHERE key = 'doctor_status'`);
      await run(`UPDATE settings SET value = NULL WHERE key = 'current_doctor_token_id'`);
    }

    return get(`SELECT * FROM tokens WHERE id = ?`, [id]);
  });
}

async function cancelToken(id) {
  await checkDayRollover();
  const now = new Date().toISOString();

  return transaction(async () => {
    const token = await get(`SELECT * FROM tokens WHERE id = ?`, [id]);
    if (!token) return null;

    await run(`
      UPDATE tokens 
      SET status = 'cancelled', completed_at = ? 
      WHERE id = ?
    `, [now, id]);

    const settings = await getSettings();
    if (settings.current_doctor_token_id === id) {
      await run(`UPDATE settings SET value = 'Free' WHERE key = 'doctor_status'`);
      await run(`UPDATE settings SET value = NULL WHERE key = 'current_doctor_token_id'`);
    }

    return get(`SELECT * FROM tokens WHERE id = ?`, [id]);
  });
}

async function getStats(date) {
  await checkDayRollover();

  const counts = await get(`
    SELECT 
      COUNT(*) AS total_joined,
      SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting_now,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_today
    FROM tokens 
    WHERE created_date = ?
  `, [date]);

  const serviceTimesRow = await get(`
    SELECT 
      AVG((strftime('%s', completed_at) - strftime('%s', called_at))) AS avg_duration_seconds
    FROM tokens 
    WHERE created_date = ? AND status = 'completed' AND called_at IS NOT NULL AND completed_at IS NOT NULL
  `, [date]);

  const avgDuration = serviceTimesRow && serviceTimesRow.avg_duration_seconds 
    ? Math.round(serviceTimesRow.avg_duration_seconds)
    : 300; 

  return {
    total_joined: counts.total_joined || 0,
    waiting_now: counts.waiting_now || 0,
    completed_today: counts.completed_today || 0,
    avg_service_time_seconds: avgDuration
  };
}

export {
  initDb,
  getSettings,
  updateSetting,
  getQueue,
  getToken,
  addToken,
  callNext,
  completeToken,
  markNoShow,
  cancelToken,
  getStats,
  dbPath
};
