const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BASE_URL, startServer, stopServer } = require('./helpers');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

test('homepage and its linked static assets all load', async () => {
    const paths = [
        '/', '/style.css', '/main.js', '/audio-consent.js',
        '/login.html', '/admin.html', '/admin.css', '/admin.js', '/success.html',
        '/assets/scene-hero.jpg', '/assets/scene-divider.jpg',
        '/assets/traffic.jpg', '/assets/parking.jpg', '/assets/ambience.mp3'
    ];
    for (const relPath of paths) {
        const res = await fetch(`${BASE_URL}${relPath}`);
        assert.equal(res.status, 200, `expected 200 for ${relPath}`);
    }
});

test('every background-image asset referenced in style.css exists on disk', () => {
    const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
    const matches = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(matches.length > 0, 'expected at least one url() reference in style.css');
    matches.forEach((relPath) => {
        const filePath = path.join(PUBLIC_DIR, relPath);
        assert.ok(fs.existsSync(filePath), `missing asset referenced by style.css: ${relPath}`);
    });
});

test('audio-consent.js only treats click/touchstart/keydown as a valid autoplay-unlock gesture', () => {
    const js = fs.readFileSync(path.join(PUBLIC_DIR, 'audio-consent.js'), 'utf8');
    // 只檢查實際程式碼（去掉文件註解），避免說明歷史 bug 的註解文字誤觸這條迴歸測試
    const codeOnly = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(codeOnly, /wheel/);
    assert.doesNotMatch(codeOnly, /['"]scroll['"]/);
    assert.doesNotMatch(codeOnly, /pointerdown/);
    assert.match(codeOnly, /'click'/);
    assert.match(codeOnly, /'touchstart'/);
    assert.match(codeOnly, /'keydown'/);
});

test('index.html, login.html and admin.html all load the shared audio-consent module', () => {
    ['index.html', 'login.html', 'admin.html'].forEach((file) => {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
        assert.match(html, /src="audio-consent\.js"/, `${file} should load the shared audio-consent module`);
    });
});

test('RSVP form field names match what the server expects', () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    ['name', 'phone', 'attendance', 'numbers', 'childSeats', 'meatCount', 'vegetarianCount', 'invitationDelivery', 'email', 'inviteAddress', 'blessing']
        .forEach((fieldName) => {
            assert.match(html, new RegExp(`name="${fieldName}"`), `missing form field: ${fieldName}`);
        });
});
