const crypto = require('crypto');
const axios = require('axios');
const { Op } = require('sequelize');

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

function makeInviteCode() {
  return crypto.randomBytes(16).toString('hex');
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
    const users = await User.findAll({
      where: { trainerId },
      include: [{ model: UserQuestionnaire, as: 'questionnaire', required: false }],
    });

    const payload = await Promise.all(
      users.map(async (u) => {
        const photoUrl = await getTelegramPhotoUrl({ botToken, telegramUserId: u.telegramId });
        return {
          id: u.id,
          telegramId: u.telegramId,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          photoUrl,
          lastActivityAt: computeLastActivity(u),
          adherence7d: null, // заглушка
        };
      })
    );

    payload.sort((a, b) => {
      const da = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const db = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return db - da;
    });

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

    // (опционально) чистка старых неиспользованных кодов
    const olderThan = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    await TrainerInvite.destroy({
      where: { trainerId, usedAt: { [Op.is]: null }, createdAt: { [Op.lt]: olderThan } },
    }).catch(() => {});

    const code = makeInviteCode();
    const invite = await TrainerInvite.create({ trainerId, code });

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

