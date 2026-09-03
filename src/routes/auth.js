const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });

        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.json({ success: true, role: user.role });
    });
});

router.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('atelier_sid');
        res.redirect('/login.html');
    });
});

router.post('/api/user/change-password', requireLogin, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: '新密碼長度至少需 6 位數' });
    }

    db.get('SELECT password FROM users WHERE id = ?', [req.session.user.id], async (err, user) => {
        if (!user || !oldPassword || !(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(401).json({ success: false, message: '舊密碼錯誤' });
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.session.user.id], (updateErr) => {
            if (updateErr) return res.status(500).json({ message: '更新失敗，請稍後再試。' });
            res.json({ success: true, message: '密碼修改成功！' });
        });
    });
});

module.exports = router;
