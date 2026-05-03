const crypto = require('crypto');

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const obj = {};
  for (const [key, value] of params.entries()) {
    obj[key] = value;
  }
  return obj;
}

function buildDataCheckString(initDataObj) {
  const pairs = Object.entries(initDataObj)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return pairs.join('\n');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'missing_init_data' };
  if (!botToken) return { ok: false, reason: 'missing_bot_token' };

  const parsed = parseInitData(initData);
  const receivedHash = parsed.hash;
  if (!receivedHash) return { ok: false, reason: 'missing_hash' };

  const dataCheckString = buildDataCheckString(parsed);
  const secretKey = hmacSha256('WebAppData', botToken);
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const ok = crypto.timingSafeEqual(Buffer.from(calculatedHash, 'utf8'), Buffer.from(receivedHash, 'utf8'));
  if (!ok) return { ok: false, reason: 'bad_hash' };

  let user = null;
  try {
    if (parsed.user) user = JSON.parse(parsed.user);
  } catch (e) {
    return { ok: false, reason: 'bad_user_json' };
  }

  return { ok: true, parsed, user };
}

function requireTelegramWebAppAuth({ botToken, adminIds = [] }) {
  const adminSet = new Set((adminIds || []).map((x) => Number(x)).filter((x) => Number.isFinite(x)));

  return (req, res, next) => {
    const initData =
      req.get('x-telegram-init-data') ||
      (typeof req.query?.initData === 'string' ? req.query.initData : '') ||
      (typeof req.body?.initData === 'string' ? req.body.initData : '');

    const result = validateInitData(initData, botToken);
    if (!result.ok) return res.status(401).json({ ok: false, error: result.reason });

    const userId = Number(result.user?.id);
    if (!Number.isFinite(userId) || !adminSet.has(userId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    req.telegramWebApp = { initData, parsed: result.parsed, user: result.user };
    return next();
  };
}

module.exports = {
  validateInitData,
  requireTelegramWebAppAuth,
};

