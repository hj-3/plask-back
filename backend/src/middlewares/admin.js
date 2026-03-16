function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = adminMiddleware;
