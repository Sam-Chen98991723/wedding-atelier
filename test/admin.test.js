const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BASE_URL, ADMIN_PASSWORD, startServer, stopServer, login } = require('./helpers');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

test('rejects login with wrong password', async () => {
    const { res, body } = await login('admin', 'wrong-password');
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
});

test('logs in with the seeded default admin', async () => {
    const { res, cookie, body } = await login();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.role, 'admin');
    assert.ok(cookie);
});

test('/api/login carries rate-limit headers', async () => {
    const res = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' })
    });
    assert.ok(res.headers.get('ratelimit-limit') || res.headers.get('x-ratelimit-limit'));
});

test('unauthenticated requests to admin API are rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/registrations`);
    assert.equal(res.status, 401);
});

test('logout destroys the session', async () => {
    const { cookie } = await login();
    const logoutRes = await fetch(`${BASE_URL}/api/logout`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(logoutRes.status, 302);

    const afterLogout = await fetch(`${BASE_URL}/api/admin/registrations`, { headers: { Cookie: cookie } });
    assert.equal(afterLogout.status, 401);
});

test('create-user without a password returns 400 instead of crashing the server', async () => {
    const { cookie } = await login();
    const res = await fetch(`${BASE_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ newUsername: 'nopassword' })
    });
    assert.equal(res.status, 400);

    // 伺服器仍應正常運作（沒有因未捕捉例外而整個行程當機）
    const stillAlive = await fetch(`${BASE_URL}/`);
    assert.equal(stillAlive.status, 200);
});

test('staff accounts cannot manage users or registrations, but can view the guest list', async () => {
    const { cookie: adminCookie } = await login();

    const createRes = await fetch(`${BASE_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ newUsername: 'staffer', newPassword: 'staffer-pass', newRole: 'staff' })
    });
    assert.equal(createRes.status, 200);

    const { cookie: staffCookie } = await login('staffer', 'staffer-pass');

    const usersRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: { Cookie: staffCookie } });
    assert.equal(usersRes.status, 403);

    const deleteRes = await fetch(`${BASE_URL}/api/admin/registration/999`, { method: 'DELETE', headers: { Cookie: staffCookie } });
    assert.equal(deleteRes.status, 403);

    const listRes = await fetch(`${BASE_URL}/api/admin/registrations`, { headers: { Cookie: staffCookie } });
    assert.equal(listRes.status, 200);
});

test('registration CRUD round-trip returns raw (unescaped) field values', async () => {
    const { cookie } = await login();

    const createRes = await fetch(`${BASE_URL}/api/admin/registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
            name: '<script>alert(1)</script>', phone: '0987654321', attendance: 'Y', numbers: 2,
            meatCount: 2, vegetarianCount: 0, blessing: "O'Brien & <b>bold</b>"
        })
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.ok(created.id);

    const listRes = await fetch(`${BASE_URL}/api/admin/registrations`, { headers: { Cookie: cookie } });
    const rows = await listRes.json();
    const row = rows.find((r) => r.id === created.id);
    assert.ok(row);
    // API 刻意回傳未跳脫的原始值：跳脫是前端渲染（DOM textContent）的責任，不是後端的責任
    assert.equal(row.name, '<script>alert(1)</script>');
    assert.equal(row.blessing, "O'Brien & <b>bold</b>");

    const updateRes = await fetch(`${BASE_URL}/api/admin/registration/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ name: 'Updated Name', phone: '0987654321', attendance: 'N' })
    });
    assert.equal(updateRes.status, 200);

    const deleteRes = await fetch(`${BASE_URL}/api/admin/registration/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(deleteRes.status, 200);
});

test('page-view counter increases when the public homepage is loaded', async () => {
    const { cookie } = await login();
    const before = await (await fetch(`${BASE_URL}/api/admin/page-views`, { headers: { Cookie: cookie } })).json();
    await fetch(`${BASE_URL}/`);
    await fetch(`${BASE_URL}/`);
    const after = await (await fetch(`${BASE_URL}/api/admin/page-views`, { headers: { Cookie: cookie } })).json();
    assert.equal(after.count, before.count + 2);
});

test('admin can reset another user\'s password without knowing the old one', async () => {
    const { cookie } = await login();
    await fetch(`${BASE_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ newUsername: 'resettable', newPassword: 'original-pass', newRole: 'staff' })
    });

    const usersRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: { Cookie: cookie } });
    const users = await usersRes.json();
    const target = users.find((u) => u.username === 'resettable');

    const resetRes = await fetch(`${BASE_URL}/api/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ userId: target.id, newPassword: 'brand-new-pass' })
    });
    assert.equal(resetRes.status, 200);

    const { res: loginRes } = await login('resettable', 'brand-new-pass');
    assert.equal(loginRes.status, 200);
});

test('the last remaining admin cannot be demoted', async () => {
    const { cookie } = await login();
    const usersRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: { Cookie: cookie } });
    const users = await usersRes.json();
    const admins = users.filter((u) => u.role === 'admin');
    assert.equal(admins.length, 1, 'expected exactly one admin at this point in the test run');

    const res = await fetch(`${BASE_URL}/api/admin/update-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ userId: admins[0].id, newRole: 'staff' })
    });
    assert.equal(res.status, 400);
});

test('change-password rejects a wrong old password', async () => {
    const { cookie } = await login();
    const res = await fetch(`${BASE_URL}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ oldPassword: 'not-the-real-password', newPassword: 'whatever-new' })
    });
    assert.equal(res.status, 401);
});

test('admin.html renders guest data through the DOM instead of string-built innerHTML (XSS regression)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
    // 賓客資料改用 createElement + textContent 組表格，天生不會有 stored XSS，
    // 因此不應該再出現「把使用者輸入串進 innerHTML 字串樣板」的寫法
    assert.doesNotMatch(html, /innerHTML\s*=\s*`[^`]*\$\{row\./);
    assert.doesNotMatch(html, /innerHTML\s*\+=/);
});

test('admin.html has no inline onclick handlers carrying user-controlled data', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.doesNotMatch(html, /onclick=/);
});
