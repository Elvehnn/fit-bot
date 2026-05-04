const path = require('path');
const express = require('express');
const { User, UserQuestionnaire, Trainer } = require('../models/associations');
const { requireTelegramWebAppAuth } = require('./telegramWebAppAuth');
const config = require('../config');
const { createTrainerApi } = require('../trainer/trainerApi');

function isLocalRequest(req) {
  const ip = String(req.ip || '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('::ffff:127.0.0.1')) return true;
  return false;
}

/** Telegram user id used to resolve Trainer row when ADMIN_DEV_BYPASS + local request. */
function resolveDevTrainerTelegramId() {
  const raw = process.env.ADMIN_DEV_TRAINER_TELEGRAM_ID;
  if (raw !== undefined && String(raw).trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const ids = config.trainer.telegramIds;
  if (ids && ids.length > 0 && Number.isFinite(ids[0])) return ids[0];
  return 0;
}

function createAdminApp({ botToken, adminIds }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  const authStrict = requireTelegramWebAppAuth({ botToken, adminIds });
  const devBypassEnabled =
    String(process.env.NODE_ENV || '').toLowerCase() === 'development' &&
    String(process.env.ADMIN_DEV_BYPASS || '').toLowerCase() === 'true';

  const auth = (req, res, next) => {
    if (devBypassEnabled && isLocalRequest(req)) {
      req.telegramWebApp = { initData: '', parsed: null, user: { id: 0, username: 'local-dev' } };
      return next();
    }
    return authStrict(req, res, next);
  };

  /** После админской авторизации: те же Telegram ID, что и у записи Trainer (кабинет тренера внутри админки). */
  const attachTrainerForAdmin = (req, res, next) => {
    let telegramId = Number(req.telegramWebApp?.user?.id);
    if (devBypassEnabled && isLocalRequest(req) && (!Number.isFinite(telegramId) || telegramId === 0)) {
      telegramId = resolveDevTrainerTelegramId();
    }
    if (!Number.isFinite(telegramId) || telegramId < 0) {
      return res.status(403).json({ ok: false, error: 'trainer_not_found' });
    }
    Trainer.findOne({ where: { telegramId } })
      .then((trainer) => {
        if (!trainer) return res.status(403).json({ ok: false, error: 'trainer_not_found' });
        req.trainer = trainer;
        next();
      })
      .catch(next);
  };

  const adminTrainerAuth = (req, res, next) => {
    auth(req, res, () => attachTrainerForAdmin(req, res, next));
  };

  // HTML мини‑приложения (запросы к API идут с initData в заголовке)
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('/admin/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.js'));
  });

  // API кабинета тренера (тот же WebApp URL и админская подпись; нужна строка в trainers по telegram_id)
  app.use(
    '/api/trainer',
    createTrainerApi({
      auth: adminTrainerAuth,
      botToken,
      botUsername: config.bot.username,
    })
  );

  // Только клиенты текущего тренера (тот же Telegram, что в trainers; чужих клиентов другой админ не увидит)
  app.get('/api/admin/users', adminTrainerAuth, async (req, res) => {
    const raw = typeof req.query.hasQuestionnaire === 'string' ? req.query.hasQuestionnaire : 'any';
    const normalized = raw.trim().toLowerCase();
    let where = { trainerId: req.trainer.id };
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') where = { ...where, hasQuestionnaire: true };
    if (normalized === 'false' || normalized === '0' || normalized === 'no') where = { ...where, hasQuestionnaire: false };

    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ model: UserQuestionnaire, as: 'questionnaire', required: false }],
    });

    const sort = typeof req.query.sort === 'string' ? req.query.sort.trim().toLowerCase() : 'questionnairedate';
    const order = typeof req.query.order === 'string' ? req.query.order.trim().toLowerCase() : 'desc';

    const payload = users.map((u) => ({
      id: u.id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      hasQuestionnaire: u.hasQuestionnaire,
      questionnaireUpdatedAt: u.questionnaireUpdatedAt,
      questionnaireSortDate:
        u.questionnaireUpdatedAt ||
        u.questionnaire?.updatedAt ||
        u.questionnaire?.createdAt ||
        null,
      questionnaire: u.questionnaire
        ? {
            age: u.questionnaire.age,
            gender: u.questionnaire.gender,
            weight: u.questionnaire.weight,
            height: u.questionnaire.height,
            goal: u.questionnaire.goal,
            lifestyle: u.questionnaire.lifestyle,
            restrictions: u.questionnaire.restrictions,
            problems: u.questionnaire.problems,
            comment: u.questionnaire.comment,
            createdAt: u.questionnaire.createdAt,
            updatedAt: u.questionnaire.updatedAt,
          }
        : null,
    }));

    if (sort === 'questionnairedate') {
      payload.sort((a, b) => {
        const da = a.questionnaireSortDate ? new Date(a.questionnaireSortDate).getTime() : 0;
        const db = b.questionnaireSortDate ? new Date(b.questionnaireSortDate).getTime() : 0;
        return order === 'asc' ? da - db : db - da;
      });
    }

    res.json({ ok: true, users: payload });
  });

  // Статика (на будущее, если появятся файлы)
  app.use('/admin/static', express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createAdminApp };

