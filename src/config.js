require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('請在 .env 檔案設定 ENCRYPTION_KEY，且長度必須剛好 32 個字元（參考 .env.example）');
}

if (!SESSION_SECRET) {
    throw new Error('請在 .env 檔案設定 SESSION_SECRET（參考 .env.example）');
}

function resolveTrustProxy() {
    if (process.env.TRUST_PROXY === undefined) return undefined;
    const raw = process.env.TRUST_PROXY;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw;
}

module.exports = {
    PORT: process.env.PORT || 3000,
    ENCRYPTION_KEY,
    SESSION_SECRET,
    COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
    DEFAULT_ADMIN_USERNAME: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || '123456',
    DB_PATH: process.env.DB_PATH || './atelier.db',
    TRUST_PROXY: resolveTrustProxy()
};
