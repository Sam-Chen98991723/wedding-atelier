const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { DB_PATH, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD } = require('./config');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error(err.message);
});

// schema migration：新增欄位時，這裡跟 CREATE TABLE 語句要同步加，
// 才能同時涵蓋全新資料庫（走 CREATE TABLE）與既有資料庫（走 ALTER TABLE）
const REQUIRED_REGISTRATION_COLUMNS = [
    { name: 'child_seats', type: 'INTEGER DEFAULT 0' },
    { name: 'meat_count', type: 'INTEGER DEFAULT 0' },
    { name: 'vegetarian_count', type: 'INTEGER DEFAULT 0' },
    { name: 'phone', type: "TEXT DEFAULT ''" },
    { name: 'hotel_needs', type: "TEXT DEFAULT ''" },
    { name: 'invite_address', type: "TEXT DEFAULT ''" },
    { name: 'blessing', type: "TEXT DEFAULT ''" }
];

function migrateRegistrationTable() {
    return new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(registration)', [], (err, columns) => {
            if (err) return reject(err);
            const existing = new Set(columns.map((col) => col.name));
            const missing = REQUIRED_REGISTRATION_COLUMNS.filter((col) => !existing.has(col.name));
            if (missing.length === 0) return resolve();

            let remaining = missing.length;
            missing.forEach((col) => {
                db.run(`ALTER TABLE registration ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
                    if (alterErr) return reject(alterErr);
                    remaining -= 1;
                    if (remaining === 0) resolve();
                });
            });
        });
    });
}

function init() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS registration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                attendance TEXT,
                numbers INTEGER,
                child_seats INTEGER DEFAULT 0,
                meat_count INTEGER DEFAULT 0,
                vegetarian_count INTEGER DEFAULT 0,
                phone TEXT DEFAULT '',
                hotel_needs TEXT DEFAULT '',
                invite_address TEXT DEFAULT '',
                blessing TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'staff'
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, async (err) => {
                if (err) return reject(err);
                try {
                    await migrateRegistrationTable();
                    const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
                    db.run(
                        'INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)',
                        [DEFAULT_ADMIN_USERNAME, hashed, 'admin'],
                        (seedErr) => (seedErr ? reject(seedErr) : resolve())
                    );
                } catch (migrateErr) {
                    reject(migrateErr);
                }
            });
        });
    });
}

module.exports = { db, init };
