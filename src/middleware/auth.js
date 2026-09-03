function requireLogin(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ message: '請先登入' });
}

function requireAdmin(req, res, next) {
    if (req.session.user?.role !== 'admin') return res.status(403).json({ message: '權限不足' });
    next();
}

module.exports = { requireLogin, requireAdmin };
