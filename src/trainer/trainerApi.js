const crypto = require('crypto');
const axios = require('axios');
const { User, UserQuestionnaire, TrainerInvite } = require('../models/associations');

function computeLastActivity(user) {
  const d = user.questionnaireUpdatedAt || user.questionnaire?.updatedAt || user.questionnaire?.createdAt || null;
  return d ? new Date(d).toISOString() : null;
}

async function getTelegramPhotoUrl({ botToken, telegramUserId }) {
  if (!botToken) return null;
  if (!telegramUserId) return null;

  try {
    const photos = await axios.get(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`, {
      params: { user_id: telegramUserId, limit: 1 },
      timeout: 8000,
    });
    const list = photos?.data?.result?.photos;
    const fileId = Array.isArray(list) && list[0] && list[0][0] ? list[0][0].file_id : null;
    if (!fileId) return null;

    const file = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
      params: { file_id: fileId },
      timeout: 8000,
    });
    const filePath = file?.data?.result?.file_path;
    if (!filePath) return null;
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  } catch (e) {
    return null;
  }
}

/** Код после префикса invite_ в deep link (лимит ~57 символов без «invite_»). */
function makeInviteCodeForTrainer(trainerId) {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `trainer${trainerId}_${suffix}`;
}

async function createTrainerInvite(trainerId) {
  for (let i = 0; i < 12; i += 1) {
    const code = makeInviteCodeForTrainer(trainerId);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await TrainerInvite.create({ trainerId, code });
    } catch (e) {
      if (e?.name === 'SequelizeUniqueConstraintError') continue;
      throw e;
    }
  }
  throw new Error('invite_code_collision');
}

function buildInviteLink({ botUsername, code }) {
  const username = String(botUsername || '').replace(/^@/, '').trim();
  if (!username) return null;
  return `https://t.me/${username}?start=invite_${code}`;
}

function createTrainerApi({ auth, botToken, botUsername }) {
  // eslint-disable-next-line global-require
  const express = require('express');
  const router = express.Router();

  router.get('/clients', auth, async (req, res) => {
    const trainerId = req.trainer.id;
    const raw = typeof req.query.hasQuestionnaire === 'string' ? req.query.hasQuestionnaire : 'any';
    const normalized = raw.trim().toLowerCase();
    let where = { trainerId };
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') where = { ...where, hasQuestionnaire: true };
    if (normalized === 'false' || normalized === '0' || normalized === 'no') where = { ...where, hasQuestionnaire: false };

    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ model: UserQuestionnaire, as: 'questionnaire', required: false }],
    });

    const sortMode = typeof req.query.sort === 'string' ? req.query.sort.trim().toLowerCase() : 'activity';
    const orderDir = typeof req.query.order === 'string' ? req.query.order.trim().toLowerCase() : 'desc';

    const payload = await Promise.all(
      users.map(async (u) => {
        const photoUrl = await getTelegramPhotoUrl({ botToken, telegramUserId: u.telegramId });
        const questionnaireSortDate =
          u.questionnaireUpdatedAt || u.questionnaire?.updatedAt || u.questionnaire?.createdAt || null;
        return {
          id: u.id,
          telegramId: u.telegramId,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          hasQuestionnaire: u.hasQuestionnaire,
          questionnaireUpdatedAt: u.questionnaireUpdatedAt,
          questionnaireSortDate,
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
          photoUrl,
          lastActivityAt: computeLastActivity(u),
          adherence7d: null, // заглушка
        };
      })
    );

    const missed = (c) => {
      const now = Date.now();
      if (!c.lastActivityAt) return true;
      const t = new Date(c.lastActivityAt).getTime();
      if (!Number.isFinite(t)) return true;
      return now - t >= 1000 * 60 * 60 * 24 * 2;
    };

    if (sortMode === 'questionnairedate') {
      payload.sort((a, b) => {
        const da = a.questionnaireSortDate ? new Date(a.questionnaireSortDate).getTime() : 0;
        const db = b.questionnaireSortDate ? new Date(b.questionnaireSortDate).getTime() : 0;
        return orderDir === 'asc' ? da - db : db - da;
      });
    } else {
      payload.sort((a, b) => {
        const ma = missed(a) ? 1 : 0;
        const mb = missed(b) ? 1 : 0;
        if (ma !== mb) return mb - ma;
        const da = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const db = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return orderDir === 'asc' ? da - db : db - da;
      });
    }

    res.json({ ok: true, clients: payload });
  });

  router.get('/client/:clientId', auth, async (req, res) => {
    const trainerId = req.trainer.id;
    const clientId = Number(req.params.clientId);
    if (!Number.isFinite(clientId)) return res.status(400).json({ ok: false, error: 'bad_client_id' });

    const user = await User.findOne({
      where: { id: clientId, trainerId },
      include: [{ model: UserQuestionnaire, as: 'questionnaire', required: false }],
    });
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' });

    const photoUrl = await getTelegramPhotoUrl({ botToken, telegramUserId: user.telegramId });
    const lastActivityAt = computeLastActivity(user);

    res.json({
      ok: true,
      client: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl,
        lastActivityAt,
        questionnaireUpdatedAt: user.questionnaireUpdatedAt,
        questionnaire: user.questionnaire ? user.questionnaire.toJSON?.() || user.questionnaire : null,
        current: {
          weight: user.questionnaire?.weight ?? null,
          calories: null, // заглушка
        },
      },
    });
  });

  router.post('/invite', auth, async (req, res) => {
    const trainerId = req.trainer.id;

    const invite = await createTrainerInvite(trainerId);

    res.json({
      ok: true,
      invite: {
        id: invite.id,
        code: invite.code,
        link: buildInviteLink({ botUsername, code: invite.code }),
        createdAt: invite.createdAt,
      },
    });
  });

  router.get('/invites', auth, async (req, res) => {
    const trainerId = req.trainer.id;
    const invites = await TrainerInvite.findAll({
      where: { trainerId },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    res.json({
      ok: true,
      invites: invites.map((i) => ({
        id: i.id,
        code: i.code,
        link: buildInviteLink({ botUsername, code: i.code }),
        usedAt: i.usedAt,
        usedByUserId: i.usedByUserId,
        createdAt: i.createdAt,
      })),
    });
  });

  router.put('/settings', auth, async (req, res) => {
    const v = req.body?.notifyOnMissedDays;
    const notifyOnMissedDays = typeof v === 'boolean' ? v : null;
    if (notifyOnMissedDays === null) return res.status(400).json({ ok: false, error: 'bad_body' });

    await req.trainer.update({ notifyOnMissedDays });
    res.json({ ok: true, settings: { notifyOnMissedDays: req.trainer.notifyOnMissedDays } });
  });

  router.get('/settings', auth, async (req, res) => {
    res.json({ ok: true, settings: { notifyOnMissedDays: req.trainer.notifyOnMissedDays } });
  });

  return router;
}

module.exports = { createTrainerApi, buildInviteLink };

