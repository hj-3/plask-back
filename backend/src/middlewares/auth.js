const jwt = require('jsonwebtoken');
const { sessionRedis } = require('../redis');

const JWT_SECRET = process.env.JWT_SECRET || 'plask-super-secret-key';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Check session exists in Redis
    const sessionKey = `session:${payload.userId}`;
    const session = await sessionRedis.get(sessionKey);
    if (!session) {
      return res.status(401).json({ success: false, message: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
    }

    const sessionData = JSON.parse(session);
    req.user = {
      userId: payload.userId,
      email: sessionData.email,
      name: sessionData.name,
      isAdmin: sessionData.isAdmin,
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }
}

module.exports = authMiddleware;
