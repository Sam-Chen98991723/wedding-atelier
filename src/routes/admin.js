const express = require('express');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { normalizeRegistrationPayload, normalizeChildSeats, normalizeMealCounts } = require('../validators');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

function decryptRegistrationRow(row) {
    const attendance = decrypt(row.attendance);
    const numbers = parseInt(decrypt(row.numbers), 10) || 0;
    const childSeats = parseInt(decrypt(row.child_seats ?? '0'), 10) || 0;
    const storedMeat = parseInt(decrypt(row.meat_count ?? '0'), 10) || 0;
    const storedVegetarian = parseInt(decrypt(row.vegetarian_count ?? '0'), 10) || 0;
    const meals = attendance === 'Y' ? normalizeMealCounts(storedMeat, storedVegetarian, numbers) : { meat: 0, vegetarian: 0 };

    return {
        id: row.id,
        name: decrypt(row.name),
        email: decrypt(row.email),
        attendance,
        numbers,
        childSeats: attendance === 'Y' ? normalizeChildSeats(childSeats, numbers) : 0,
        meatCount: meals.meat,
        vegetarianCount: meals.vegetarian,
        phone: decrypt(row.phone ?? ''),
        hotelNeeds: decrypt(row.hotel_needs ?? ''),
        inviteAddress: decrypt(row.invite_address ?? ''),
        blessing: decrypt(row.blessing ?? ''),
        createdAt: row.created_at || ''
    };
}

function encryptedRegistrationParams(payload) {
    return [
        encrypt(payload.name), encrypt(payload.email), encrypt(payload.attendance), encrypt(String(payload.numbers)),
        encrypt(String(payload.childSeats)), encrypt(String(payload.meatCount)), encrypt(String(payload.vegetarianCount)),
        encrypt(payload.phone), encrypt(payload.hotelNeeds), encrypt(payload.inviteAddress), encrypt(payload.blessing)
    ];
}

// 【賓客名單】
router.get('/api/admin/registrations', (req, res) => {
    db.all('SELECT * FROM registration ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: '讀取失敗' });
        res.json(rows.map(decryptRegistrationRow));
    });
});

router.post('/api/admin/registration', requireAdmin, (req, res) => {
    const payload = normalizeRegistrationPayload(req.body, { requireEmailOrAddress: false });
    if (!payload.isValid) {
        return res.status(400).json({ message: '請填寫完整的報名資料（姓名、電話為10碼數字），且人數至少為 1。' });
    }

    const sql = `INSERT INTO registration
        (name, email, attendance, numbers, child_seats, meat_count, vegetarian_count, phone, hotel_needs, invite_address, blessing)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, encryptedRegistrationParams(payload), function insertDone(err) {
        if (err) return res.status(500).json({ message: '新增失敗，請稍後再試。' });
        res.json({ success: true, message: '新增成功！', id: this.lastID });
    });
});

router.put('/api/admin/registration/:id', requireAdmin, (req, res) => {
    const payload = normalizeRegistrationPayload(req.body, { requireEmailOrAddress: false });
    if (!payload.isValid) {
        return res.status(400).json({ message: '請填寫完整的報名資料（姓名、電話為10碼數字），且人數至少為 1。' });
    }

    const sql = `UPDATE registration SET
        name = ?, email = ?, attendance = ?, numbers = ?, child_seats = ?, meat_count = ?,
        vegetarian_count = ?, phone = ?, hotel_needs = ?, invite_address = ?, blessing = ?
        WHERE id = ?`;
    db.run(sql, [...encryptedRegistrationParams(payload), req.params.id], function updateDone(err) {
        if (err) return res.status(500).json({ message: '更新失敗，請稍後再試。' });
        if (this.changes === 0) return res.status(404).json({ message: '找不到該筆資料。' });
        res.json({ success: true, message: '更新成功！' });
    });
});

router.delete('/api/admin/registration/:id', requireAdmin, (req, res) => {
    db.run('DELETE FROM registration WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: '刪除失敗' });
        res.json({ message: '已刪除該筆報名' });
    });
});

// 【Excel 匯出】
router.get('/api/admin/export-excel', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('賓客名單');
    sheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: '姓名', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: '出席', key: 'attendance', width: 12 },
        { header: '人數', key: 'numbers', width: 10 },
        { header: '兒童座椅', key: 'childSeats', width: 12 },
        { header: '葷食', key: 'meatCount', width: 10 },
        { header: '素食', key: 'vegetarianCount', width: 10 },
        { header: '電話', key: 'phone', width: 20 },
        { header: '地址', key: 'inviteAddress', width: 40 },
        { header: '祝福留言', key: 'blessing', width: 40 },
        { header: '飯店需求', key: 'hotelNeeds', width: 18 },
        { header: '報名時間', key: 'createdAt', width: 20 }
    ];

    db.all('SELECT * FROM registration ORDER BY id ASC', [], async (err, rows) => {
        if (err) return res.status(500).send('Excel Error');
        rows.map(decryptRegistrationRow).forEach((row) => sheet.addRow({
            ...row,
            attendance: row.attendance === 'Y' ? '出席' : '不出席'
        }));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="guest-list.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    });
});

// 【前台造訪次數】
router.get('/api/admin/page-views', (req, res) => {
    db.get('SELECT COUNT(*) AS count FROM page_views', [], (err, row) => {
        if (err) return res.status(500).json({ message: '讀取失敗' });
        res.json({ count: row.count });
    });
});

// 【系統帳號管理】(僅限 admin)
router.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all('SELECT id, username, role FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ message: '讀取失敗' });
        res.json(rows);
    });
});

router.post('/api/admin/create-user', requireAdmin, async (req, res) => {
    const { newUsername, newPassword, newRole } = req.body;
    if (!newUsername || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: '資料格式錯誤或密碼太短' });
    }

    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const role = ['admin', 'staff'].includes(newRole) ? newRole : 'staff';
        db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [newUsername, hashed, role], (err) => {
            if (err) return res.status(400).json({ message: '帳號已存在' });
            res.json({ message: '使用者建立成功！' });
        });
    } catch (err) {
        res.status(500).json({ message: '伺服器錯誤' });
    }
});

router.post('/api/admin/update-role', requireAdmin, (req, res) => {
    const { userId, newRole } = req.body;
    if (!userId || !['admin', 'staff'].includes(newRole)) {
        return res.status(400).json({ message: '請提供有效的使用者與權限' });
    }

    db.get('SELECT id, role FROM users WHERE id = ?', [userId], (err, user) => {
        if (!user) return res.status(404).json({ message: '找不到該使用者。' });
        if (user.role === newRole) return res.json({ success: true, message: '權限未變更。' });

        const applyUpdate = () => {
            db.run('UPDATE users SET role = ? WHERE id = ?', [newRole, userId], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: '更新失敗，請稍後再試。' });
                res.json({ success: true, message: '權限更新成功！' });
            });
        };

        if (user.role === 'admin' && newRole !== 'admin') {
            db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'", [], (countErr, row) => {
                if (row.count <= 1) {
                    return res.status(400).json({ message: '至少需保留一位管理員，無法變更此帳號權限。' });
                }
                applyUpdate();
            });
        } else {
            applyUpdate();
        }
    });
});

router.post('/api/admin/reset-password', requireAdmin, async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: '請選擇使用者，並輸入至少 6 位數的新密碼' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, userId], function resetDone(err) {
        if (err) return res.status(500).json({ message: '重設失敗，請稍後再試。' });
        if (this.changes === 0) return res.status(404).json({ message: '找不到該使用者。' });
        res.json({ success: true, message: '密碼重設成功！' });
    });
});

module.exports = router;
