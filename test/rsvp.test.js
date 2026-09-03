const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, startServer, stopServer } = require('./helpers');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

function submit(body) {
    return fetch(`${BASE_URL}/submit-rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        redirect: 'manual'
    });
}

test('rejects missing name', async () => {
    const res = await submit({ phone: '0912345678', attendance: 'N' });
    assert.equal(res.status, 400);
});

test('rejects phone that is not exactly 10 digits', async () => {
    const res = await submit({ name: 'Alice', phone: '091234567', attendance: 'N' });
    assert.equal(res.status, 400);
});

test('rejects letters in phone field', async () => {
    const res = await submit({ name: 'Alice', phone: '09123abcde', attendance: 'N' });
    assert.equal(res.status, 400);
});

test('accepts non-attending guest with just name + phone', async () => {
    const res = await submit({ name: 'Bob', phone: '0912345678', attendance: 'N' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /success\.html/);
});

test('attending guest requires numbers >= 1', async () => {
    const res = await submit({ name: 'Cara', phone: '0912345678', attendance: 'Y', numbers: '0' });
    assert.equal(res.status, 400);
});

test('attending guest choosing email delivery requires an email address', async () => {
    const res = await submit({
        name: 'Dana', phone: '0912345678', attendance: 'Y', numbers: '1',
        invitationDelivery: 'email', email: ''
    });
    assert.equal(res.status, 400);
});

test('attending guest choosing paper delivery requires an address', async () => {
    const res = await submit({
        name: 'Eden', phone: '0912345678', attendance: 'Y', numbers: '1',
        invitationDelivery: 'paper', inviteAddress: ''
    });
    assert.equal(res.status, 400);
});

test('attending guest choosing "none" delivery does not require email or address', async () => {
    const res = await submit({
        name: 'Farid', phone: '0912345678', attendance: 'Y', numbers: '2',
        invitationDelivery: 'none', meatCount: '2', vegetarianCount: '0'
    });
    assert.equal(res.status, 302);
});

test('child seats are capped at numbers - 1', async () => {
    const res = await submit({
        name: 'Grace', phone: '0912345678', attendance: 'Y', numbers: '2', childSeats: '99',
        invitationDelivery: 'none', meatCount: '2', vegetarianCount: '0'
    });
    assert.equal(res.status, 302);
});

test('meal counts are auto-balanced to match attendee numbers', async () => {
    // meat + vegetarian (5) 超過 numbers (3)，伺服器應自動平衡而不是直接 400
    const res = await submit({
        name: 'Hana', phone: '0912345678', attendance: 'Y', numbers: '3',
        meatCount: '5', vegetarianCount: '0', invitationDelivery: 'none'
    });
    assert.equal(res.status, 302);
});
