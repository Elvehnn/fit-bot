const path = require('path');
const express = require('express');
const { User, UserQuestionnaire } = require('../models/associations');
const { requireTelegramWebAppAuth } = require('./telegramWebAppAuth');
const config = require('../config');
const { requireTrainerWebAppAuth } = require('../trainer/trainerWebAppAuth');
const { createTrainerApi } = require('../trainer/trainerApi');

function isLocalRequest(req) {
  const ip = String(req.ip || '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('::ffff:127.0.0.1')) return true;
  return false;
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

  const trainerAuthStrict = requireTrainerWebAppAuth({ botToken });
  const trainerAuth = (req, res, next) => {
    if (devBypassEnabled && isLocalRequest(req)) {
      // В dev можно подложить trainer из БД по telegramId=0, иначе 403.
      req.telegramWebApp = { initData: '', parsed: null, user: { id: 0, username: 'local-dev' } };
      return trainerAuthStrict(req, res, next);
    }
    return trainerAuthStrict(req, res, next);
  };

  // HTML мини‑приложения (запросы к API идут с initData в заголовке)
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('/admin/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.js'));
  });

  // Trainer API (WebApp админки тренера)
  app.use(
    '/api/trainer',
    createTrainerApi({
      auth: trainerAuth,
      botToken,
      botUsername: config.bot.username,
    })
  );

  // API: список пользователей + анкеты + фильтр по заполненности
  app.get('/api/admin/users', auth, async (req, res) => {
    const raw = typeof req.query.hasQuestionnaire === 'string' ? req.query.hasQuestionnaire : 'any';
    const normalized = raw.trim().toLowerCase();
    let where = {};
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') where = { hasQuestionnaire: true };
    if (normalized === 'false' || normalized === '0' || normalized === 'no') where = { hasQuestionnaire: false };

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

