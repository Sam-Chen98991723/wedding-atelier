const express = require('express');
const { db } = require('../db');
const { encrypt } = require('../crypto');
const { normalizeRegistrationPayload } = require('../validators');

const router = express.Router();

router.post('/submit-rsvp', (req, res) => {
    const payload = normalizeRegistrationPayload(req.body, { requireEmailOrAddress: true });

    if (!payload.isValid) {
        return res.status(400).send('請填寫正確的姓名、聯絡電話（10碼數字），並確認出席人數與喜帖寄送資訊。');
    }

    const sql = `INSERT INTO registration
        (name, email, attendance, numbers, child_seats, meat_count, vegetarian_count, phone, hotel_needs, invite_address, blessing)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        encrypt(payload.name), encrypt(payload.email), encrypt(payload.attendance), encrypt(String(payload.numbers)),
        encrypt(String(payload.childSeats)), encrypt(String(payload.meatCount)), encrypt(String(payload.vegetarianCount)),
        encrypt(payload.phone), encrypt(payload.hotelNeeds), encrypt(payload.inviteAddress), encrypt(payload.blessing)
    ];

    db.run(sql, params, (err) => {
        if (err) return res.status(500).send('系統錯誤，請稍後再試。');
        res.redirect('/success.html');
    });
});

module.exports = router;
