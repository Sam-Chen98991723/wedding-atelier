const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const TEST_PORT = process.env.TEST_PORT || 3556;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'test-admin-pass-123';
const ENCRYPTION_KEY = 'atelier0123456789abcdef012345678'.slice(0, 32);

let serverProcess = null;
let dbPath = null;

async function waitForServer(timeoutMs = 8000) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${BASE_URL}/`);
            if (res.ok) return;
        } catch (err) {
            lastError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not start in time: ${lastError?.message || 'unknown error'}`);
}

async function waitForDefaultAdmin(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
        });
        if (res.ok) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('Default admin user was not ready in time');
}

function startServer() {
    return new Promise((resolvePromise, rejectPromise) => {
        dbPath = path.join(__dirname, `.test-${process.pid}-${Date.now()}.db`);
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT: String(TEST_PORT),
                DB_PATH: dbPath,
                ENCRYPTION_KEY,
                SESSION_SECRET: 'test-session-secret',
                COOKIE_SECURE: 'false',
                DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
                DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let settled = false;
        const stderrChunks = [];
        serverProcess.stderr.on('data', (chunk) => stderrChunks.push(chunk));
        serverProcess.on('error', (err) => {
            if (!settled) { settled = true; rejectPromise(err); }
        });
        serverProcess.on('exit', (code) => {
            if (!settled && code !== 0) {
                settled = true;
                rejectPromise(new Error(`server exited early with code ${code}: ${Buffer.concat(stderrChunks).toString()}`));
            }
        });

        waitForServer()
            .then(() => waitForDefaultAdmin())
            .then(() => { settled = true; resolvePromise(); })
            .catch((err) => { settled = true; rejectPromise(err); });
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (!serverProcess) return resolve();
        serverProcess.once('exit', () => resolve());
        serverProcess.kill('SIGKILL');
        setTimeout(resolve, 1000);
    }).then(() => {
        if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        serverProcess = null;
    });
}

async function login(username = ADMIN_USERNAME, password = ADMIN_PASSWORD) {
    const res = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const setCookie = res.headers.get('set-cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : null;
    const body = await res.json();
    return { res, cookie, body };
}

module.exports = { BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, startServer, stopServer, login };
