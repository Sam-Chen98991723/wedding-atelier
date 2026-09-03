const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const { db, init } = require('./src/db');

const rsvpRoutes = require('./src/routes/rsvp');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');

const app = express();

if (config.TRUST_PROXY !== undefined) {
    app.set('trust proxy', config.TRUST_PROXY);
}

app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 記錄前台首頁瀏覽次數（不去重，單純累計每一次載入）
app.get('/', (req, res, next) => {
    db.run('INSERT INTO page_views DEFAULT VALUES', (err) => {
        if (err) console.error('記錄瀏覽次數失敗:', err.message);
    });
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    name: 'atelier_sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 3600000,
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: 'lax'
    }
}));

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: '請求過於頻繁，請稍後再試。'
});

app.use(['/submit-rsvp', '/api/login'], strictLimiter);

app.use(rsvpRoutes);
app.use(authRoutes);
app.use(adminRoutes);

init()
    .then(() => {
        app.listen(config.PORT, () => {
            console.log('====================================');
            console.log('婚禮系統啟動中（AES-256 欄位加密已啟用）');
            console.log(`網址: http://localhost:${config.PORT}`);
            console.log('====================================');
        });
    })
    .catch((err) => {
        console.error('資料庫初始化失敗:', err);
        process.exit(1);
    });

module.exports = app;
