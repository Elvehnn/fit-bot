const { validateInitData } = require('../admin/telegramWebAppAuth');
const { Trainer } = require('../models/associations');

function requireTrainerWebAppAuth({ botToken }) {
  return async (req, res, next) => {
    const initData =
      req.get('x-telegram-init-data') ||
      (typeof req.query?.initData === 'string' ? req.query.initData : '') ||
      (typeof req.body?.initData === 'string' ? req.body.initData : '');

    const result = validateInitData(initData, botToken);
    if (!result.ok) return res.status(401).json({ ok: false, error: result.reason });

    const telegramId = Number(result.user?.id);
    if (!Number.isFinite(telegramId)) return res.status(401).json({ ok: false, error: 'bad_user' });

    const trainer = await Trainer.findOne({ where: { telegramId } });
    if (!trainer) return res.status(403).json({ ok: false, error: 'trainer_not_found' });

    req.telegramWebApp = { initData, parsed: result.parsed, user: result.user };
    req.trainer = trainer;
    return next();
  };
}

module.exports = { requireTrainerWebAppAuth };

